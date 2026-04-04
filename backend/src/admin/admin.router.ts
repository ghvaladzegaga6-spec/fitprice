import { Router, Response } from 'express';
import { authenticate, requireAdmin } from '../middleware/auth';
import { db } from '../db';
import bcrypt from 'bcryptjs';
import Joi from 'joi';

export const adminRouter = Router();

// ══════════════════════════════════════════════════════════
// დარბაზების მართვა
// ══════════════════════════════════════════════════════════

// ყველა დარბაზი
adminRouter.get('/gyms', authenticate, requireAdmin, async (_req, res: Response) => {
  const { rows } = await db.query('SELECT * FROM gyms ORDER BY created_at DESC');
  return res.json({ gyms: rows });
});

// დარბაზის დამატება
adminRouter.post('/gyms', authenticate, requireAdmin, async (req: any, res: Response) => {
  const schema = Joi.object({
    name: Joi.string().max(200).required(),
    address: Joi.string().max(300).allow(''),
    logo_url: Joi.string().uri().allow(''),
    photo_url: Joi.string().uri().allow(''),
    description: Joi.string().max(500).allow(''),
  });
  const { error, value } = schema.validate(req.body);
  if (error) return res.status(400).json({ error: error.details[0].message });

  const { rows } = await db.query(
    'INSERT INTO gyms (name, address, logo_url, photo_url, description) VALUES ($1,$2,$3,$4,$5) RETURNING *',
    [value.name, value.address || '', value.logo_url || '', value.photo_url || '', value.description || '']
  );
  return res.status(201).json({ gym: rows[0] });
});

// დარბაზის წაშლა/გამორთვა
adminRouter.patch('/gyms/:id', authenticate, requireAdmin, async (req: any, res: Response) => {
  const { rows } = await db.query(
    'UPDATE gyms SET is_active=$1 WHERE id=$2 RETURNING *',
    [req.body.is_active, req.params.id]
  );
  return res.json({ gym: rows[0] });
});

adminRouter.delete('/gyms/:id', authenticate, requireAdmin, async (req: any, res: Response) => {
  await db.query('DELETE FROM gyms WHERE id=$1', [req.params.id]);
  return res.json({ success: true });
});

// ══════════════════════════════════════════════════════════
// მომხმარებლების მართვა
// ══════════════════════════════════════════════════════════

// ყველა მომხმარებელი
adminRouter.get('/users', authenticate, requireAdmin, async (_req, res: Response) => {
  const { rows } = await db.query(`
    SELECT u.id, u.email, u.name, u.role, u.is_active, u.is_suspended, u.created_at,
           g.name as gym_name, g.id as gym_id
    FROM users u
    LEFT JOIN gyms g ON g.id = u.gym_id
    ORDER BY u.created_at DESC
  `);
  return res.json({ users: rows });
});

// მომხმარებლის რეგისტრაცია (მხოლოდ admin-ისგან)
adminRouter.post('/users/register', authenticate, requireAdmin, async (req: any, res: Response) => {
  const schema = Joi.object({
    email: Joi.string().email().required(),
    password: Joi.string().min(6).required(),
    name: Joi.string().min(2).required(),
    gym_id: Joi.number().integer().required(),
  });
  const { error, value } = schema.validate(req.body);
  if (error) return res.status(400).json({ error: error.details[0].message });

  const existing = await db.query('SELECT id FROM users WHERE email=$1', [value.email.toLowerCase()]);
  if (existing.rows.length > 0) return res.status(409).json({ error: 'ეს ელ-ფოსტა უკვე გამოყენებულია' });

  const hash = await bcrypt.hash(value.password, 12);
  const { rows } = await db.query(
    'INSERT INTO users (email, password_hash, name, role, gym_id) VALUES ($1,$2,$3,$4,$5) RETURNING id, email, name, role, gym_id',
    [value.email.toLowerCase(), hash, value.name, 'user', value.gym_id]
  );
  return res.status(201).json({ user: rows[0] });
});

// მომხმარებლის პაუზა/განახლება
adminRouter.patch('/users/:id/suspend', authenticate, requireAdmin, async (req: any, res: Response) => {
  const { rows } = await db.query(
    'UPDATE users SET is_suspended=$1 WHERE id=$2 RETURNING id, email, name, is_suspended',
    [req.body.is_suspended, req.params.id]
  );
  return res.json({ user: rows[0] });
});

// მომხმარებლის წაშლა
adminRouter.delete('/users/:id', authenticate, requireAdmin, async (req: any, res: Response) => {
  await db.query('DELETE FROM users WHERE id=$1', [req.params.id]);
  return res.json({ success: true });
});

// Public: დარბაზების სია (არ საჭიროებს auth)
adminRouter.get('/gyms/public', async (_req, res: Response) => {
  const { rows } = await db.query(
    'SELECT id, name, address, logo_url, photo_url, description FROM gyms WHERE is_active=TRUE ORDER BY name'
  );
  return res.json({ gyms: rows });
});
