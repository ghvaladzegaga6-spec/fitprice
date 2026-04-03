import { Router, Response } from 'express';
import axios from 'axios';
import { optionalAuth } from '../middleware/auth';

export const basketRouter = Router();

const PYTHON_URL = process.env.PYTHON_SERVICE_URL || 'http://localhost:8000';
const INTERNAL_TOKEN = process.env.INTERNAL_TOKEN!;
const pyHeaders = { 'X-Internal-Token': INTERNAL_TOKEN };

basketRouter.post('/optimize', optionalAuth, async (req: any, res: Response) => {
  try {
    const response = await axios.post(`${PYTHON_URL}/api/basket/optimize`, req.body, {
      headers: pyHeaders, timeout: 30000,
    });
    return res.json(response.data);
  } catch (err: any) {
    if (err.response) return res.status(err.response.status).json(err.response.data);
    return res.status(503).json({ error: 'ოპტიმიზაციის სერვისი მიუწვდომელია.' });
  }
});

basketRouter.post('/replace', optionalAuth, async (req: any, res: Response) => {
  try {
    const response = await axios.post(`${PYTHON_URL}/api/basket/replace`, req.body, {
      headers: pyHeaders, timeout: 10000,
    });
    return res.json(response.data);
  } catch (err: any) {
    if (err.response) return res.status(err.response.status).json(err.response.data);
    return res.status(503).json({ error: 'სერვისი მიუწვდომელია.' });
  }
});

basketRouter.post('/rebalance', optionalAuth, async (req: any, res: Response) => {
  try {
    const response = await axios.post(`${PYTHON_URL}/api/basket/rebalance`, req.body, {
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

basketRouter.get('/vegan_categories', async (_req, res: Response) => {
  try {
    const response = await axios.get(`${PYTHON_URL}/api/data/vegan_categories`, {
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
