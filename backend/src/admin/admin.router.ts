import { Router, Response } from 'express';
import { authenticate, requireAdmin } from '../middleware/auth';
import { db } from '../db';
import bcrypt from 'bcryptjs';
import Joi from 'joi';

export const adminRouter = Router();

// ─── PUBLIC ───────────────────────────────────────────────────────────────────
adminRouter.get('/gyms/public', async (_req, res: Response) => {
  const { rows } = await db.query(
    'SELECT id, name, address, logo_url, photo_url, description FROM gyms WHERE is_active=TRUE ORDER BY name'
  );
  return res.json({ gyms: rows });
});

// ─── GYMS ─────────────────────────────────────────────────────────────────────
adminRouter.get('/gyms', authenticate, requireAdmin, async (req: any, res: Response) => {
  if (req.userRole === 'gym_admin') {
    const { rows } = await db.query('SELECT * FROM gyms WHERE id=$1', [req.userGymId]);
    return res.json({ gyms: rows });
  }
  const { rows } = await db.query('SELECT * FROM gyms ORDER BY created_at DESC');
  return res.json({ gyms: rows });
});

adminRouter.post('/gyms', authenticate, requireAdmin, async (req: any, res: Response) => {
  if (req.userRole !== 'super_admin') return res.status(403).json({ error: 'Forbidden' });
  const schema = Joi.object({
    name: Joi.string().max(200).required(),
    address: Joi.string().max(300).allow('').default(''),
    logo_url: Joi.string().allow('').default(''),
    photo_url: Joi.string().allow('').default(''),
    description: Joi.string().max(500).allow('').default(''),
    admin_email: Joi.string().email().required(),
    admin_password: Joi.string().min(6).required(),
    admin_name: Joi.string().min(2).required(),
  });
  const { error, value } = schema.validate(req.body);
  if (error) return res.status(400).json({ error: error.details[0].message });

  const emailCheck = await db.query('SELECT id FROM users WHERE email=$1', [value.admin_email.toLowerCase()]);
  if (emailCheck.rows.length > 0) return res.status(409).json({ error: 'ეს ელ-ფოსტა უკვე გამოყენებულია' });

  const { rows: gymRows } = await db.query(
    'INSERT INTO gyms (name, address, logo_url, photo_url, description, admin_email, admin_name) VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING *',
    [value.name, value.address, value.logo_url, value.photo_url, value.description, value.admin_email, value.admin_name]
  );
  const gym = gymRows[0];
  const hash = await bcrypt.hash(value.admin_password, 12);
  await db.query(
    'INSERT INTO users (email, password_hash, plain_password, name, role, gym_id) VALUES ($1,$2,$3,$4,$5,$6)',
    [value.admin_email.toLowerCase(), hash, value.admin_password, value.admin_name, 'gym_admin', gym.id]
  );
  return res.status(201).json({ gym });
});

adminRouter.patch('/gyms/:id', authenticate, requireAdmin, async (req: any, res: Response) => {
  if (req.userRole !== 'super_admin') return res.status(403).json({ error: 'Forbidden' });
  const schema = Joi.object({ is_active: Joi.boolean() });
  const { error, value } = schema.validate(req.body);
  if (error) return res.status(400).json({ error: error.details[0].message });
  const { rows } = await db.query('UPDATE gyms SET is_active=$1 WHERE id=$2 RETURNING *', [value.is_active, req.params.id]);
  return res.json({ gym: rows[0] });
});

adminRouter.delete('/gyms/:id', authenticate, requireAdmin, async (req: any, res: Response) => {
  if (req.userRole !== 'super_admin') return res.status(403).json({ error: 'Forbidden' });
  await db.query('DELETE FROM gyms WHERE id=$1', [req.params.id]);
  return res.json({ success: true });
});

adminRouter.get('/gyms/:id/admin-credentials', authenticate, requireAdmin, async (req: any, res: Response) => {
  if (req.userRole !== 'super_admin') return res.status(403).json({ error: 'Forbidden' });
  const { rows } = await db.query(
    `SELECT u.id, u.email, u.plain_password, u.name FROM users u
     JOIN gyms g ON g.id=u.gym_id WHERE g.id=$1 AND u.role='gym_admin'`,
    [req.params.id]
  );
  return res.json({ admins: rows });
});

// ─── USERS ────────────────────────────────────────────────────────────────────
adminRouter.get('/users', authenticate, requireAdmin, async (req: any, res: Response) => {
  let query = `
    SELECT u.id, u.email, u.name, u.role, u.is_active, u.is_suspended, u.created_at,
           u.plain_password, u.nfc_order, u.nfc_status,
           g.name as gym_name, g.id as gym_id,
           up.weight_kg, up.goal, up.quiz_completed
    FROM users u
    LEFT JOIN gyms g ON g.id = u.gym_id
    LEFT JOIN user_profiles up ON up.user_id = u.id
  `;
  if (req.userRole === 'gym_admin') {
    query += ` WHERE u.gym_id = ${Number(req.userGymId)} AND u.role = 'user'`;
  } else {
    query += ` WHERE u.role != 'super_admin'`;
  }
  query += ' ORDER BY u.created_at DESC';
  const { rows } = await db.query(query);
  return res.json({ users: rows });
});

// NFC მომხმარებლების სია (super_admin only)
adminRouter.get('/users/nfc', authenticate, requireAdmin, async (req: any, res: Response) => {
  if (req.userRole !== 'super_admin') return res.status(403).json({ error: 'Forbidden' });
  const gymFilter = req.query.gym_id ? `AND u.gym_id = ${Number(req.query.gym_id)}` : '';
  const { rows } = await db.query(`
    SELECT u.id, u.email, u.name, u.nfc_order, u.nfc_status, u.created_at,
           g.name as gym_name, g.id as gym_id
    FROM users u
    LEFT JOIN gyms g ON g.id = u.gym_id
    WHERE u.nfc_order = true AND u.role = 'user' ${gymFilter}
    ORDER BY
      CASE WHEN u.nfc_status = 'pending' THEN 0 ELSE 1 END,
      u.created_at DESC
  `);
  return res.json({ users: rows });
});

// NFC დადასტურება (super_admin only)
adminRouter.patch('/users/:id/nfc-confirm', authenticate, requireAdmin, async (req: any, res: Response) => {
  if (req.userRole !== 'super_admin') return res.status(403).json({ error: 'Forbidden' });
  const { rows } = await db.query(
    `UPDATE users SET nfc_status='confirmed' WHERE id=$1 RETURNING id, email, name, nfc_status`,
    [req.params.id]
  );
  return res.json({ user: rows[0] });
});

// მომხმარებლის რეგისტრაცია
adminRouter.post('/users/register', authenticate, requireAdmin, async (req: any, res: Response) => {
  const schema = Joi.object({
    email: Joi.string().email().required(),
    password: Joi.string().min(6).required(),
    name: Joi.string().min(2).required(),
    gym_id: Joi.number().integer().required(),
    nfc_order: Joi.boolean().default(false),
  });
  const { error, value } = schema.validate(req.body);
  if (error) return res.status(400).json({ error: error.details[0].message });

  if (req.userRole === 'gym_admin' && value.gym_id !== req.userGymId) {
    return res.status(403).json({ error: 'მხოლოდ საკუთარი დარბაზის მომხმარებლის დამატება შეგიძლიათ' });
  }

  const existing = await db.query('SELECT id FROM users WHERE email=$1', [value.email.toLowerCase()]);
  if (existing.rows.length > 0) return res.status(409).json({ error: 'ელ-ფოსტა უკვე გამოყენებულია' });

  const hash = await bcrypt.hash(value.password, 12);
  const { rows } = await db.query(
    `INSERT INTO users (email, password_hash, plain_password, name, role, gym_id, nfc_order, nfc_status)
     VALUES ($1,$2,$3,$4,'user',$5,$6,$7)
     RETURNING id, email, name, role, gym_id, nfc_order, nfc_status`,
    [value.email.toLowerCase(), hash, value.password, value.name, value.gym_id,
     value.nfc_order, value.nfc_order ? 'pending' : 'none']
  );
  return res.status(201).json({ user: rows[0] });
});

// მომხმარებლის რედაქტირება
adminRouter.patch('/users/:id', authenticate, requireAdmin, async (req: any, res: Response) => {
  const targetUser = await db.query('SELECT * FROM users WHERE id=$1', [req.params.id]);
  if (targetUser.rows.length === 0) return res.status(404).json({ error: 'User not found' });
  const target = targetUser.rows[0];

  if (req.userRole === 'gym_admin') {
    if (target.gym_id !== req.userGymId || target.role !== 'user') {
      return res.status(403).json({ error: 'Forbidden' });
    }
  }
  if (target.role === 'super_admin' && req.userRole !== 'super_admin') {
    return res.status(403).json({ error: 'Forbidden' });
  }

  const schema = Joi.object({
    name: Joi.string().min(2).max(100),
    email: Joi.string().email(),
    gym_id: Joi.number().integer(),
    password: Joi.string().min(6),
    nfc_order: Joi.boolean(),
  });
  const { error, value } = schema.validate(req.body);
  if (error) return res.status(400).json({ error: error.details[0].message });

  const updates: string[] = [];
  const params: any[] = [];
  let i = 1;

  if (value.name)   { updates.push(`name=$${i++}`);  params.push(value.name); }
  if (value.email)  { updates.push(`email=$${i++}`); params.push(value.email.toLowerCase()); }
  if (value.gym_id && req.userRole === 'super_admin') { updates.push(`gym_id=$${i++}`); params.push(value.gym_id); }
  if (value.password) {
    const hash = await bcrypt.hash(value.password, 12);
    updates.push(`password_hash=$${i++}`); params.push(hash);
    updates.push(`plain_password=$${i++}`); params.push(value.password);
  }
  if (value.nfc_order !== undefined) {
    updates.push(`nfc_order=$${i++}`); params.push(value.nfc_order);
    updates.push(`nfc_status=$${i++}`); params.push(value.nfc_order ? 'pending' : 'none');
  }

  if (updates.length === 0) return res.status(400).json({ error: 'Nothing to update' });
  params.push(req.params.id);
  const { rows } = await db.query(
    `UPDATE users SET ${updates.join(',')} WHERE id=$${i} RETURNING id, email, name, role, gym_id, nfc_order, nfc_status`,
    params
  );
  return res.json({ user: rows[0] });
});

// პაუზა/გაგრძელება
adminRouter.patch('/users/:id/suspend', authenticate, requireAdmin, async (req: any, res: Response) => {
  const targetUser = await db.query('SELECT * FROM users WHERE id=$1', [req.params.id]);
  if (targetUser.rows.length === 0) return res.status(404).json({ error: 'User not found' });
  const target = targetUser.rows[0];
  if (target.role === 'super_admin') return res.status(403).json({ error: 'Cannot suspend super_admin' });
  if (req.userRole === 'gym_admin') {
    if (target.gym_id !== req.userGymId || target.role !== 'user') return res.status(403).json({ error: 'Forbidden' });
  }
  const { rows } = await db.query(
    'UPDATE users SET is_suspended=$1 WHERE id=$2 RETURNING id, email, name, is_suspended',
    [req.body.is_suspended, req.params.id]
  );
  return res.json({ user: rows[0] });
});

// წაშლა
adminRouter.delete('/users/:id', authenticate, requireAdmin, async (req: any, res: Response) => {
  if (req.userRole === 'gym_admin') return res.status(403).json({ error: 'დარბაზის ადმინს არ აქვს წაშლის უფლება' });
  const targetUser = await db.query('SELECT role FROM users WHERE id=$1', [req.params.id]);
  if (targetUser.rows.length === 0) return res.status(404).json({ error: 'User not found' });
  if (targetUser.rows[0].role === 'super_admin') return res.status(403).json({ error: 'Cannot delete super_admin' });
  await db.query('DELETE FROM users WHERE id=$1', [req.params.id]);
  return res.json({ success: true });
});

// სუპერ ადმინის პაროლის შეცვლა
adminRouter.patch('/super/password', authenticate, async (req: any, res: Response) => {
  if (req.userRole !== 'super_admin') return res.status(403).json({ error: 'Forbidden' });
  const schema = Joi.object({ current_password: Joi.string().required(), new_password: Joi.string().min(8).required() });
  const { error, value } = schema.validate(req.body);
  if (error) return res.status(400).json({ error: error.details[0].message });
  const userRow = await db.query('SELECT * FROM users WHERE id=$1', [req.userId]);
  const valid = await bcrypt.compare(value.current_password, userRow.rows[0].password_hash);
  if (!valid) return res.status(401).json({ error: 'მიმდინარე პაროლი არასწორია' });
  const hash = await bcrypt.hash(value.new_password, 12);
  await db.query('UPDATE users SET password_hash=$1, plain_password=$2 WHERE id=$3', [hash, value.new_password, req.userId]);
  return res.json({ success: true });
});
