import { Router, Response } from 'express';
import { authenticate } from '../middleware/auth';
import { db } from '../db';
import axios from 'axios';
import Joi from 'joi';

export const checkinRouter = Router();

const PYTHON_URL = process.env.PYTHON_SERVICE_URL || 'http://localhost:8000';
const INTERNAL_TOKEN = process.env.INTERNAL_TOKEN || 'change-me-in-production';

const headers = () => ({ 'X-Internal-Token': INTERNAL_TOKEN, 'Content-Type': 'application/json' });

checkinRouter.post('/', authenticate, async (req: any, res: Response) => {
  const schema = Joi.object({
    week:           Joi.number().integer().min(0).required(),
    weight_kg:      Joi.number().min(20).max(300).required(),
    calories:       Joi.number().integer().min(500).max(10000).required(),
    exercise_min:   Joi.number().integer().min(0).max(900).required(),
    sleep_h:        Joi.number().min(2).max(14).required(),
    steps:          Joi.number().integer().min(0).max(80000).required(),
    stress:         Joi.number().integer().min(1).max(40).required(),
    hydration_l:    Joi.number().min(0.5).max(10).required(),
    goal:           Joi.string().valid('loss','gain','maintain','recomp').required(),
    aggressiveness: Joi.string().valid('conservative','moderate','aggressive').required(),
  });
  const { error, value } = schema.validate(req.body);
  if (error) return res.status(400).json({ error: error.details[0].message });

  const userId = req.userId;

  const profileRow = await db.query(
    'SELECT sex, age, height_cm FROM user_profiles WHERE user_id=$1',
    [userId]
  );
  if (profileRow.rows.length === 0) {
    return res.status(400).json({ error: 'პროფილი არ მოიძებნა. ჯერ პერსონალიზაცია გაიარე.' });
  }
  const profile = profileRow.rows[0];

  await db.query(`
    INSERT INTO model_checkins (user_id, week, weight_kg, calories, exercise_min, sleep_h, steps, stress, hydration_l)
    VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
    ON CONFLICT (user_id, week) DO UPDATE SET
      weight_kg=EXCLUDED.weight_kg, calories=EXCLUDED.calories,
      exercise_min=EXCLUDED.exercise_min, sleep_h=EXCLUDED.sleep_h,
      steps=EXCLUDED.steps, stress=EXCLUDED.stress,
      hydration_l=EXCLUDED.hydration_l, recorded_at=NOW()
  `, [userId, value.week, value.weight_kg, value.calories,
      value.exercise_min, value.sleep_h, value.steps, value.stress, value.hydration_l]);

  const allCheckins = await db.query(
    'SELECT * FROM model_checkins WHERE user_id=$1 ORDER BY week ASC', [userId]
  );

  try {
    const payload = allCheckins.rows.map((c: any) => ({
      person_id: userId, week: c.week,
      weight_kg: parseFloat(c.weight_kg), calories: parseInt(c.calories),
      exercise_min: parseInt(c.exercise_min), sleep_h: parseFloat(c.sleep_h),
      steps: parseInt(c.steps), stress: parseInt(c.stress),
      hydration_l: parseFloat(c.hydration_l),
      sex: parseInt(profile.sex) || 1, age: parseInt(profile.age) || 25,
      height_cm: parseFloat(profile.height_cm) || 170,
      goal: value.goal, aggressiveness: value.aggressiveness,
    }));

    if (payload.length >= 4) {
      await axios.post(`${PYTHON_URL}/model/fit`, { checkins: payload },
        { headers: headers(), timeout: 120000 }).catch(() => {});
    }

    const predictRes = await axios.post(`${PYTHON_URL}/model/predict`, {
      person_id: userId, week: value.week,
      weight_kg: value.weight_kg, calories: value.calories,
      exercise_min: value.exercise_min, sleep_h: value.sleep_h,
      steps: value.steps, stress: value.stress, hydration_l: value.hydration_l,
      sex: parseInt(profile.sex) || 1, age: parseInt(profile.age) || 25,
      height_cm: parseFloat(profile.height_cm) || 170,
      goal: value.goal, aggressiveness: value.aggressiveness,
    }, { headers: headers(), timeout: 60000 });

    const result = predictRes.data;

    await db.query(`
      INSERT INTO model_results
        (user_id, week, phase, tdee_kcal, fat_rec, mus_rec, reg_rec,
         adaptation_factor, lambda_i, plateau_detected, balance_dw_kg, adapted_dw_kg,
         expected_dm_fat_kg, expected_dm_mus_kg, expected_dm_reg_kg, diet_break_suggested)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16)
      ON CONFLICT (user_id, week) DO UPDATE SET
        phase=EXCLUDED.phase, tdee_kcal=EXCLUDED.tdee_kcal,
        fat_rec=EXCLUDED.fat_rec, mus_rec=EXCLUDED.mus_rec, reg_rec=EXCLUDED.reg_rec,
        adaptation_factor=EXCLUDED.adaptation_factor, lambda_i=EXCLUDED.lambda_i,
        plateau_detected=EXCLUDED.plateau_detected,
        balance_dw_kg=EXCLUDED.balance_dw_kg, adapted_dw_kg=EXCLUDED.adapted_dw_kg,
        expected_dm_fat_kg=EXCLUDED.expected_dm_fat_kg,
        expected_dm_mus_kg=EXCLUDED.expected_dm_mus_kg,
        expected_dm_reg_kg=EXCLUDED.expected_dm_reg_kg,
        diet_break_suggested=EXCLUDED.diet_break_suggested,
        calculated_at=NOW()
    `, [userId, value.week, result.phase, result.tdee_kcal,
        result.fat_rec, result.mus_rec, result.reg_rec,
        result.adaptation_factor, result.lambda_i, result.plateau_detected,
        result.balance_dw_kg, result.adapted_dw_kg,
        result.expected_dm_fat_kg, result.expected_dm_mus_kg, result.expected_dm_reg_kg,
        result.diet_break_suggested]);

    return res.json({ result, total_checkins: allCheckins.rows.length });

  } catch (err: any) {
    return res.json({
      result: null, total_checkins: allCheckins.rows.length,
      error: 'მოდელის გამოთვლა ვერ მოხდა. Check-in შენახულია.'
    });
  }
});

checkinRouter.get('/history', authenticate, async (req: any, res: Response) => {
  const { rows: checkins } = await db.query(
    'SELECT * FROM model_checkins WHERE user_id=$1 ORDER BY week DESC', [req.userId]);
  const { rows: results } = await db.query(
    'SELECT * FROM model_results WHERE user_id=$1 ORDER BY week DESC', [req.userId]);
  return res.json({ checkins, results });
});

checkinRouter.get('/latest', authenticate, async (req: any, res: Response) => {
  const { rows } = await db.query(
    'SELECT * FROM model_results WHERE user_id=$1 ORDER BY week DESC LIMIT 1', [req.userId]);
  const { rows: cnt } = await db.query(
    'SELECT COUNT(*) as count FROM model_checkins WHERE user_id=$1', [req.userId]);
  return res.json({ result: rows[0] || null, total_checkins: parseInt(cnt[0].count) });
});
