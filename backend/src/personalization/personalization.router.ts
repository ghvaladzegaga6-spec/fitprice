import { Router, Response } from 'express';
import axios from 'axios';
import { authenticate } from '../middleware/auth';
import { db } from '../db';

export const personalizationRouter = Router();

const PYTHON_URL = process.env.PYTHON_SERVICE_URL || 'http://localhost:8000';
const INTERNAL_TOKEN = process.env.INTERNAL_TOKEN!;
const pyHeaders = { 'X-Internal-Token': INTERNAL_TOKEN };

personalizationRouter.post('/calculate', authenticate, async (req: any, res: Response) => {
  try {
    const userId = req.userId;
    const { data: result } = await axios.post(
      `${PYTHON_URL}/api/personalization/calculate`,
      req.body,
      { headers: pyHeaders, timeout: 10000 }
    );
    await db.query(`
      INSERT INTO user_profiles (
        user_id, gender, age, weight_kg, height_cm,
        activity_level, goal, target_weight_kg,
        eating_window, carb_sensitivity, hunger_peak,
        bmr, tdee, target_calories, protein_g, fat_g, carbs_g,
        meals_per_day, water_ml, calorie_multiplier, profile_code, vegan_mode, updated_at
      ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,NOW())
      ON CONFLICT (user_id) DO UPDATE SET
        gender=$2, age=$3, weight_kg=$4, height_cm=$5,
        activity_level=$6, goal=$7, target_weight_kg=$8,
        eating_window=$9, carb_sensitivity=$10, hunger_peak=$11,
        bmr=$12, tdee=$13, target_calories=$14, protein_g=$15, fat_g=$16, carbs_g=$17,
        meals_per_day=$18, water_ml=$19, profile_code=$21, vegan_mode=$22, updated_at=NOW()
    `, [
      userId,
      req.body.gender, req.body.age, req.body.weight_kg, req.body.height_cm,
      req.body.activity_level, req.body.goal, req.body.target_weight_kg || null,
      req.body.eating_window, req.body.carb_sensitivity, req.body.hunger_peak,
      result.bmr, result.tdee, result.adjusted_calories,
      result.macros.protein, result.macros.fat, result.macros.carbs,
      result.meals_per_day, result.water_ml,
      req.body.calorie_multiplier || 1.0,
      result.profile_code,
      req.body.vegan_mode || false,
    ]);
    return res.json(result);
  } catch (err: any) {
    if (err.response) return res.status(err.response.status).json(err.response.data);
    return res.status(500).json({ error: 'შეცდომა გათვლაში' });
  }
});

personalizationRouter.get('/profile', authenticate, async (req: any, res: Response) => {
  try {
    const { rows } = await db.query('SELECT * FROM user_profiles WHERE user_id = $1', [req.userId]);
    return res.json({ profile: rows[0] || null });
  } catch {
    return res.status(500).json({ error: 'შეცდომა' });
  }
});

personalizationRouter.get('/daily-plan', authenticate, async (req: any, res: Response) => {
  try {
    const userId = req.userId;
    const today = new Date().toISOString().split('T')[0];
    const { rows: existing } = await db.query(
      'SELECT * FROM daily_plans WHERE user_id=$1 AND plan_date=$2', [userId, today]
    );
    if (existing.length > 0) return res.json({ plan: existing[0], exists: true });
    const { rows: profiles } = await db.query('SELECT * FROM user_profiles WHERE user_id=$1', [userId]);
    if (profiles.length === 0) return res.json({ plan: null, exists: false, message: 'გთხოვთ შეავსოთ პროფილი' });
    const profile = profiles[0];
    const { data: result } = await axios.post(
      `${PYTHON_URL}/api/personalization/calculate`,
      {
        gender: profile.gender, age: profile.age,
        weight_kg: parseFloat(profile.weight_kg), height_cm: parseFloat(profile.height_cm),
        activity_level: profile.activity_level, goal: profile.goal,
        eating_window: profile.eating_window, carb_sensitivity: profile.carb_sensitivity,
        hunger_peak: profile.hunger_peak,
        calorie_multiplier: parseFloat(profile.calorie_multiplier),
        vegan_mode: profile.vegan_mode,
      },
      { headers: pyHeaders, timeout: 10000 }
    );
    const { rows: plan } = await db.query(`
      INSERT INTO daily_plans (user_id, plan_date, total_calories, total_protein, total_fat, total_carbs, meals)
      VALUES ($1,$2,$3,$4,$5,$6,$7)
      ON CONFLICT (user_id, plan_date) DO UPDATE SET
        total_calories=$3, total_protein=$4, total_fat=$5, total_carbs=$6, meals=$7
      RETURNING *
    `, [userId, today, result.adjusted_calories, result.macros.protein, result.macros.fat, result.macros.carbs, JSON.stringify(result.meal_plan)]);
    return res.json({ plan: plan[0], exists: false, profile_data: result });
  } catch (err: any) {
    if (err.response) return res.status(err.response.status).json(err.response.data);
    return res.status(500).json({ error: 'შეცდომა' });
  }
});

personalizationRouter.post('/checkin', authenticate, async (req: any, res: Response) => {
  try {
    const userId = req.userId;
    const { rows: profiles } = await db.query('SELECT * FROM user_profiles WHERE user_id=$1', [userId]);
    if (profiles.length === 0) return res.status(404).json({ error: 'პროფილი არ მოიძებნა' });
    const profile = profiles[0];
    const now = new Date();
    const weekNumber = getWeekNumber(now);
    const year = now.getFullYear();
    const { data: result } = await axios.post(
      `${PYTHON_URL}/api/personalization/checkin`,
      {
        current_weight_kg: req.body.current_weight_kg,
        initial_weight_kg: parseFloat(profile.weight_kg),
        target_calories: parseFloat(profile.target_calories),
        goal: profile.goal, week_number: weekNumber,
        energy_level: req.body.energy_level, hunger_level: req.body.hunger_level,
        carb_sensitivity: profile.carb_sensitivity,
        calorie_multiplier: parseFloat(profile.calorie_multiplier),
      },
      { headers: pyHeaders, timeout: 10000 }
    );
    await db.query(`
      INSERT INTO weekly_checkins (user_id, week_number, year, current_weight_kg, energy_level, hunger_level, progress_status, old_calories, new_calories, adjustment_reason, refeed_recommended)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
      ON CONFLICT (user_id, week_number, year) DO UPDATE SET
        current_weight_kg=$4, energy_level=$5, hunger_level=$6, progress_status=$7, new_calories=$9, adjustment_reason=$10, refeed_recommended=$11
    `, [userId, weekNumber, year, req.body.current_weight_kg, req.body.energy_level, req.body.hunger_level, result.status, parseFloat(profile.target_calories), result.new_calories, result.adjustment_reason, result.refeed_recommended]);
    await db.query(`UPDATE user_profiles SET target_calories=$1, calorie_multiplier=$2, weight_kg=$3, updated_at=NOW() WHERE user_id=$4`,
      [result.new_calories, result.new_multiplier, req.body.current_weight_kg, userId]);
    return res.json(result);
  } catch (err: any) {
    if (err.response) return res.status(err.response.status).json(err.response.data);
    return res.status(500).json({ error: 'შეცდომა' });
  }
});

personalizationRouter.get('/checkin/needed', authenticate, async (req: any, res: Response) => {
  try {
    const userId = req.userId;
    const now = new Date();
    const weekNumber = getWeekNumber(now);
    const year = now.getFullYear();
    const { rows } = await db.query('SELECT * FROM weekly_checkins WHERE user_id=$1 AND week_number=$2 AND year=$3', [userId, weekNumber, year]);
    const { rows: profiles } = await db.query('SELECT created_at FROM user_profiles WHERE user_id=$1', [userId]);
    if (profiles.length > 0) {
      const daysSince = (now.getTime() - new Date(profiles[0].created_at).getTime()) / (1000 * 60 * 60 * 24);
      if (daysSince < 7) return res.json({ needed: false, days_until: Math.ceil(7 - daysSince) });
    }
    return res.json({ needed: rows.length === 0, week: weekNumber, year });
  } catch {
    return res.status(500).json({ error: 'შეცდომა' });
  }
});

personalizationRouter.post('/push/subscribe', authenticate, async (req: any, res: Response) => {
  try {
    const { endpoint, p256dh, auth } = req.body;
    await db.query(`
      INSERT INTO push_subscriptions (user_id, endpoint, p256dh, auth)
      VALUES ($1,$2,$3,$4)
      ON CONFLICT (user_id, endpoint) DO UPDATE SET p256dh=$3, auth=$4, is_active=TRUE
    `, [req.userId, endpoint, p256dh, auth]);
    return res.json({ success: true });
  } catch {
    return res.status(500).json({ error: 'Push subscription შეცდომა' });
  }
});

function getWeekNumber(date: Date): number {
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  const dayNum = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  return Math.ceil((((d.getTime() - yearStart.getTime()) / 86400000) + 1) / 7);
}
