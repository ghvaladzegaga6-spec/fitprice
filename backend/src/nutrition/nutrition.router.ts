import { Router, Request, Response } from 'express';
import axios from 'axios';
import Joi from 'joi';
import { authenticate, optionalAuth } from '../middleware/auth';
import { db } from '../db';
import OpenAI from 'openai';

export const nutritionRouter = Router();

const PYTHON_URL = process.env.PYTHON_SERVICE_URL || 'http://localhost:8000';
const INTERNAL_TOKEN = process.env.INTERNAL_TOKEN!;
const pyHeaders = { 'X-Internal-Token': INTERNAL_TOKEN };

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

const nutritionSchema = Joi.object({
  gender: Joi.string().valid('male', 'female').required(),
  age: Joi.number().integer().min(10).max(100).required(),
  height: Joi.number().min(100).max(250).required(),
  weight: Joi.number().min(30).max(300).required(),
  activity: Joi.string().valid('sedentary','light','moderate','active','very_active').required(),
  goal: Joi.string().valid('lose','gain','maintain').required(),
  target_weight: Joi.number().min(30).max(300),
});

nutritionRouter.post('/calculate', optionalAuth, async (req: any, res: Response) => {
  const { error, value } = nutritionSchema.validate(req.body);
  if (error) return res.status(400).json({ error: error.details[0].message });

  try {
    const response = await axios.post(`${PYTHON_URL}/api/nutrition/calculate`, value, {
      headers: pyHeaders, timeout: 10000,
    });
    const result = response.data;

    // Save to DB if logged in
    if (req.userId) {
      await db.query(`
        INSERT INTO nutrition_results (user_id, bmr, tdee, adjusted_calories, protein, fat, carbs, water_ml, bmi, weekly_rate_kg, timeline)
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)`,
        [req.userId, result.bmr, result.tdee, result.adjusted_calories,
         result.macros.protein, result.macros.fat, result.macros.carbs,
         result.water_ml, result.bmi, result.weekly_rate_kg, result.timeline]
      );

      await db.query(`
        INSERT INTO user_profiles (user_id, gender, age, height, weight, activity, goal, target_weight)
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
        ON CONFLICT (user_id) DO UPDATE SET
          gender=$2, age=$3, height=$4, weight=$5, activity=$6, goal=$7, target_weight=$8, updated_at=NOW()`,
        [req.userId, value.gender, value.age, value.height, value.weight, value.activity, value.goal, value.target_weight || null]
      );
    }

    return res.json(result);
  } catch (err: any) {
    if (err.response) return res.status(err.response.status).json(err.response.data);
    return res.status(503).json({ error: 'სერვისი მიუწვდომელია.' });
  }
});

nutritionRouter.post('/recipe', optionalAuth, async (req: any, res: Response) => {
  const schema = Joi.object({
    basket: Joi.array().items(Joi.object()).min(1).max(50).required(),
    meal_name: Joi.string().max(100),
    calories_target: Joi.number().min(100).max(5000),
  });
  const { error, value } = schema.validate(req.body);
  if (error) return res.status(400).json({ error: error.details[0].message });

  const productList = value.basket
    .map((p: any) => `${p.product} (${p.grams}გ)`)
    .join(', ');

  const prompt = `შენ ხარ პროფესიონალი ქართველი მზარეული. მომაწოდე კონკრეტული, გემრიელი რეცეპტი შემდეგი პროდუქტების გამოყენებით:

პროდუქტები: ${productList}
${value.meal_name ? `კერძის სახელი: ${value.meal_name}` : ''}
${value.calories_target ? `კალორიები: ~${value.calories_target} კკალ` : ''}

მომაწოდე:
1. კერძის სახელი (ქართულად)
2. მოკლე აღწერა (1-2 წინადადება)
3. მომზადების ნაბიჯები (5-8 ნაბიჯი)
4. მომზადების დრო
5. კვებითი ღირებულება (დაახლოებით)

პასუხი მხოლოდ ქართულ ენაზე. სტილი: მეგობრული, პრაქტიკული.`;

  try {
    const completion = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [{ role: 'user', content: prompt }],
      max_tokens: 800,
      temperature: 0.7,
    });

    return res.json({ recipe: completion.choices[0].message.content });
  } catch (err: any) {
    return res.status(503).json({ error: 'AI სერვისი მიუწვდომელია. სცადეთ მოგვიანებით.' });
  }
});

nutritionRouter.get('/history', authenticate, async (req: any, res: Response) => {
  const rows = await db.query(
    'SELECT * FROM nutrition_results WHERE user_id = $1 ORDER BY calculated_at DESC LIMIT 10',
    [req.userId]
  );
  return res.json({ history: rows.rows });
});

nutritionRouter.get('/profile', authenticate, async (req: any, res: Response) => {
  const row = await db.query('SELECT * FROM user_profiles WHERE user_id = $1', [req.userId]);
  return res.json({ profile: row.rows[0] || null });
});
