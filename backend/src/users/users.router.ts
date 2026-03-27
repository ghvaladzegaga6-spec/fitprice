import { Router, Response } from 'express';
import { authenticate } from '../middleware/auth';
import { db } from '../db';
import Joi from 'joi';

export const usersRouter = Router();

usersRouter.get('/me', authenticate, async (req: any, res: Response) => {
  const row = await db.query(
    'SELECT id, email, name, role, created_at FROM users WHERE id = $1',
    [req.userId]
  );
  if (!row.rows[0]) return res.status(404).json({ error: 'Not found' });
  return res.json({ user: row.rows[0] });
});

usersRouter.patch('/me', authenticate, async (req: any, res: Response) => {
  const schema = Joi.object({ name: Joi.string().min(2).max(100) });
  const { error, value } = schema.validate(req.body);
  if (error) return res.status(400).json({ error: error.details[0].message });

  const row = await db.query(
    'UPDATE users SET name = $1, updated_at = NOW() WHERE id = $2 RETURNING id, email, name',
    [value.name, req.userId]
  );
  return res.json({ user: row.rows[0] });
});
