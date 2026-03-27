import { Router, Request, Response } from 'express';
import axios from 'axios';
import Joi from 'joi';
import { optionalAuth } from '../middleware/auth';

export const basketRouter = Router();

const PYTHON_URL = process.env.PYTHON_SERVICE_URL || 'http://localhost:8000';
const INTERNAL_TOKEN = process.env.INTERNAL_TOKEN!;

const pyHeaders = { 'X-Internal-Token': INTERNAL_TOKEN };

const optimizeSchema = Joi.object({
  calories: Joi.number().min(500).max(10000),
  protein: Joi.number().min(0).max(500),
  fat: Joi.number().min(0).max(500),
  carbs: Joi.number().min(0).max(1000),
  excluded_categories: Joi.array().items(Joi.string().max(100)).max(50),
  included_categories: Joi.array().items(Joi.string().max(100)).max(50),
  force_promo: Joi.array().items(Joi.number().integer()).max(20),
  mode: Joi.string().valid('calories', 'macros').required(),
  calorie_ratio: Joi.object({
    protein: Joi.number().min(0.1).max(0.9),
    fat: Joi.number().min(0.1).max(0.9),
    carbs: Joi.number().min(0.1).max(0.9),
  }),
});

basketRouter.post('/optimize', optionalAuth, async (req: any, res: Response) => {
  const { error, value } = optimizeSchema.validate(req.body);
  if (error) return res.status(400).json({ error: error.details[0].message });

  try {
    const response = await axios.post(`${PYTHON_URL}/api/basket/optimize`, value, {
      headers: pyHeaders, timeout: 30000,
    });
    return res.json(response.data);
  } catch (err: any) {
    if (err.response) {
      return res.status(err.response.status).json(err.response.data);
    }
    return res.status(503).json({ error: 'ოპტიმიზაციის სერვისი მიუწვდომელია.' });
  }
});

basketRouter.post('/replace', optionalAuth, async (req: any, res: Response) => {
  const schema = Joi.object({
    product_id: Joi.number().integer().required(),
    excluded_ids: Joi.array().items(Joi.number().integer()).max(200),
  });
  const { error, value } = schema.validate(req.body);
  if (error) return res.status(400).json({ error: error.details[0].message });

  try {
    const response = await axios.post(`${PYTHON_URL}/api/basket/replace`, value, {
      headers: pyHeaders, timeout: 10000,
    });
    return res.json(response.data);
  } catch (err: any) {
    if (err.response) return res.status(err.response.status).json(err.response.data);
    return res.status(503).json({ error: 'სერვისი მიუწვდომელია.' });
  }
});

basketRouter.get('/categories', async (_req, res: Response) => {
  try {
    const response = await axios.get(`${PYTHON_URL}/api/data/categories`, {
      headers: pyHeaders, timeout: 5000,
    });
    return res.json(response.data);
  } catch {
    return res.status(503).json({ error: 'სერვისი მიუწვდომელია.' });
  }
});

basketRouter.get('/promos', async (_req, res: Response) => {
  try {
    const response = await axios.get(`${PYTHON_URL}/api/data/promos`, {
      headers: pyHeaders, timeout: 5000,
    });
    return res.json(response.data);
  } catch {
    return res.status(503).json({ error: 'სერვისი მიუწვდომელია.' });
  }
});

basketRouter.get('/products', async (_req, res: Response) => {
  try {
    const response = await axios.get(`${PYTHON_URL}/api/data/products`, {
      headers: pyHeaders, timeout: 10000,
    });
    return res.json(response.data);
  } catch {
    return res.status(503).json({ error: 'სერვისი მიუწვდომელია.' });
  }
});
