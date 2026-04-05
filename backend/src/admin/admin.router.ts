import { Router, Response } from 'express';
import { authenticate, requireAdmin } from '../middleware/auth';
import { db } from '../db';
import bcrypt from 'bcryptjs';
import Joi from 'joi';

export const adminRouter = Router();

// ══════════════════════════════════════════════════════════
// Public — დარბაზების სია (auth არ სჭირდება)
// ══════════════════════════════════════════════════════════
adminRouter.get('/gyms/public', async (_req, res: Response) => {
  const { rows } = await db.query(
    'SELECT id, name, address, logo_url, photo_url, description FROM gyms WHERE is_active=TRUE ORDER BY name'
  );
  return res.json({ gyms: rows });
});

// ══════════════════════════════════════════════════════════
// დარბაზების მართვა (მხოლოდ super_admin)
// ══════════════════════════════════════════════════════════
adminRouter.get('/gyms', authenticate, requireAdmin, async (req: any, res: Response) => {
  // gym_admin მხოლოდ საკუთარ დარბაზს ხედავს
  if (req.userRole === 'gym_admin') {
    const { rows } = await db.query('SELECT * FROM gyms WHERE id = $1', [req.userGymId]);
    return res.json({ gyms: rows });
  }
  const { rows } = await db.query('SELECT * FROM gyms ORDER BY created_at DESC');
  return res.json({ gyms: rows });
});

// ახალი დარბაზი + gym_admin აქაუნთი (მხოლოდ super_admin)
adminRouter.post('/gyms', authenticate, requireAdmin, async (req: any, res: Response) => {
  if (req.userRole !== 'super_admin') {
    return res.status(403).json({ error: 'Only super admin can add gyms' });
  }

  const schema = Joi.object({
    name: Joi.string().max(200).required(),
    address: Joi.string().max(300).allow(''),
    logo_url: Joi.string().allow(''),
    photo_url: Joi.string().allow(''),
    description: Joi.string().max(500).allow(''),
    admin_email: Joi.string().email().required(),
    admin_password: Joi.string().min(6).required(),
    admin_name: Joi.string().min(2).required(),
  });

  const { error, value } = schema.validate(req.body);
  if (error) return res.status(400).json({ error: error.details[0].message });

  // ჯერ დარბაზი შევქმნათ
  const { rows: gymRows } = await db.query(
    'INSERT INTO gyms (name, address, logo_url, photo_url, description, admin_email, admin_name) VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING *',
    [value.name, value.address || '', value.logo_url || '', value.photo_url || '', value.description || '', value.admin_email, value.admin_name]
  );
  const gym = gymRows[0];

  // შემდეგ gym_admin აქაუნთი
  const existing = await db.query('SELECT id FROM users WHERE email=$1', [value.admin_email.toLowerCase()]);
  if (existing.rows.length === 0) {
    const hash = await bcrypt.hash(value.admin_password, 12);
    await db.query(
      'INSERT INTO users (email, password_hash, name, role, gym_id) VALUES ($1,$2,$3,$4,$5)',
      [value.admin_email.toLowerCase(), hash, value.admin_name, 'gym_admin', gym.id]
    );
  }

  return res.status(201).json({ gym });
});

adminRouter.patch('/gyms/:id', authenticate, requireAdmin, async (req: any, res: Response) => {
  if (req.userRole !== 'super_admin') return res.status(403).json({ error: 'Forbidden' });
  const { rows } = await db.query(
    'UPDATE gyms SET is_active=$1, name=$2, address=$3, logo_url=$4, photo_url=$5, description=$6 WHERE id=$7 RETURNING *',
    [req.body.is_active ?? true, req.body.name, req.body.address, req.body.logo_url, req.body.photo_url, req.body.description, req.params.id]
  );
  return res.json({ gym: rows[0] });
});

adminRouter.delete('/gyms/:id', authenticate, requireAdmin, async (req: any, res: Response) => {
  if (req.userRole !== 'super_admin') return res.status(403).json({ error: 'Forbidden' });
  await db.query('DELETE FROM gyms WHERE id=$1', [req.params.id]);
  return res.json({ success: true });
});

// ══════════════════════════════════════════════════════════
// მომხმარებლების მართვა
// ══════════════════════════════════════════════════════════
adminRouter.get('/users', authenticate, requireAdmin, async (req: any, res: Response) => {
  let query = `
    SELECT u.id, u.email, u.name, u.role, u.is_active, u.is_suspended, u.created_at,
           g.name as gym_name, g.id as gym_id,
           up.weight_kg, up.goal, up.quiz_completed, up.last_checkin_at
    FROM users u
    LEFT JOIN gyms g ON g.id = u.gym_id
    LEFT JOIN user_profiles up ON up.user_id = u.id
  `;

  // gym_admin მხოლოდ საკუთარი დარბაზის მომხმარებლებს ხედავს
  if (req.userRole === 'gym_admin') {
    query += ` WHERE u.gym_id = ${req.userGymId} AND u.role = 'user'`;
  } else {
    query += ` WHERE u.role != 'super_admin'`;
  }

  query += ' ORDER BY u.created_at DESC';

  const { rows } = await db.query(query);
  return res.json({ users: rows });
});

// მომხმარებლის დამატება
adminRouter.post('/users/register', authenticate, requireAdmin, async (req: any, res: Response) => {
  const schema = Joi.object({
    email: Joi.string().email().required(),
    password: Joi.string().min(6).required(),
    name: Joi.string().min(2).required(),
    gym_id: Joi.number().integer().required(),
  });
  const { error, value } = schema.validate(req.body);
  if (error) return res.status(400).json({ error: error.details[0].message });

  // gym_admin მხოლოდ საკუთარ დარბაზში ამატებს
  if (req.userRole === 'gym_admin' && value.gym_id !== req.userGymId) {
    return res.status(403).json({ error: 'You can only add users to your own gym' });
  }

  const existing = await db.query('SELECT id FROM users WHERE email=$1', [value.email.toLowerCase()]);
  if (existing.rows.length > 0) return res.status(409).json({ error: 'Email already exists' });

  const hash = await bcrypt.hash(value.password, 12);
  const { rows } = await db.query(
    'INSERT INTO users (email, password_hash, name, role, gym_id) VALUES ($1,$2,$3,$4,$5) RETURNING id, email, name, role, gym_id',
    [value.email.toLowerCase(), hash, value.name, 'user', value.gym_id]
  );
  return res.status(201).json({ user: rows[0] });
});

// მომხმარებლის რედაქტირება
adminRouter.patch('/users/:id', authenticate, requireAdmin, async (req: any, res: Response) => {
  const schema = Joi.object({
    name: Joi.string().min(2).max(100),
    email: Joi.string().email(),
    gym_id: Joi.number().integer(),
    password: Joi.string().min(6),
  });
  const { error, value } = schema.validate(req.body);
  if (error) return res.status(400).json({ error: error.details[0].message });

  const updates: string[] = [];
  const params: any[] = [];
  let i = 1;

  if (value.name) { updates.push(`name=$${i++}`); params.push(value.name); }
  if (value.email) { updates.push(`email=$${i++}`); params.push(value.email.toLowerCase()); }
  if (value.gym_id) { updates.push(`gym_id=$${i++}`); params.push(value.gym_id); }
  if (value.password) {
    const hash = await bcrypt.hash(value.password, 12);
    updates.push(`password_hash=$${i++}`);
    params.push(hash);
  }

  if (updates.length === 0) return res.status(400).json({ error: 'Nothing to update' });

  params.push(req.params.id);
  const { rows } = await db.query(
    `UPDATE users SET ${updates.join(',')} WHERE id=$${i} RETURNING id, email, name, role, gym_id`,
    params
  );
  return res.json({ user: rows[0] });
});

// პაუზა/განახლება
adminRouter.patch('/users/:id/suspend', authenticate, requireAdmin, async (req: any, res: Response) => {
  const { rows } = await db.query(
    'UPDATE users SET is_suspended=$1 WHERE id=$2 RETURNING id, email, name, is_suspended',
    [req.body.is_suspended, req.params.id]
  );
  // პაუზის მოხსნისას quiz_completed=false — ხელახლა უნდა შეავსოს კითხვარი
  if (!req.body.is_suspended) {
    await db.query(
      'UPDATE user_profiles SET quiz_completed=FALSE WHERE user_id=$1',
      [req.params.id]
    );
  }
  return res.json({ user: rows[0] });
});

// მომხმარებლის წაშლა
adminRouter.delete('/users/:id', authenticate, requireAdmin, async (req: any, res: Response) => {
  await db.query('DELETE FROM users WHERE id=$1', [req.params.id]);
  return res.json({ success: true });
});
