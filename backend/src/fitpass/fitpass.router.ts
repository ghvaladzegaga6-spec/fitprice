import { Router, Response } from 'express';
import { authenticate, requireAdmin } from '../middleware/auth';
import { db } from '../db';
import Joi from 'joi';

export const fitpassRouter = Router();

// ─── დამხმარე: დარჩენილი დღეები ────────────────────────────────────────────
const daysLeft = (end: string) => {
  const diff = new Date(end).getTime() - Date.now();
  return Math.ceil(diff / (1000 * 60 * 60 * 24));
};

// ─── სია ─────────────────────────────────────────────────────────────────────
fitpassRouter.get('/', authenticate, requireAdmin, async (req: any, res: Response) => {
  let where = '';
  if (req.userRole === 'gym_admin') where = `WHERE fm.gym_id = ${Number(req.userGymId)}`;
  else if (req.query.gym_id) where = `WHERE fm.gym_id = ${Number(req.query.gym_id)}`;

  const { rows } = await db.query(`
    SELECT fm.*, g.name as gym_name,
      EXTRACT(EPOCH FROM (fm.service_end - NOW()))/86400 as days_remaining
    FROM fitpass_members fm
    LEFT JOIN gyms g ON g.id = fm.gym_id
    ${where}
    ORDER BY fm.is_active DESC, fm.service_end ASC
  `);
  return res.json({ members: rows });
});

// ─── სტატისტიკა (super_admin) ────────────────────────────────────────────────
fitpassRouter.get('/stats', authenticate, requireAdmin, async (req: any, res: Response) => {
  if (req.userRole !== 'super_admin') return res.status(403).json({ error: 'Forbidden' });
  const { rows } = await db.query(`
    SELECT
      COUNT(*) FILTER (WHERE is_active = true) as active_count,
      COUNT(*) FILTER (WHERE is_active = false) as inactive_count,
      COUNT(*) as total_count,
      SUM(renewal_count) as total_renewals
    FROM fitpass_members
  `);
  return res.json({ stats: rows[0] });
});

// ─── ახალი მომხმარებელი ──────────────────────────────────────────────────────
fitpassRouter.post('/', authenticate, requireAdmin, async (req: any, res: Response) => {
  const schema = Joi.object({
    name: Joi.string().min(2).max(200).required(),
    phone: Joi.string().max(50).allow('').default(''),
    personal_id: Joi.string().max(50).allow('').default(''),
    gym_id: Joi.number().integer(),
  });
  const { error, value } = schema.validate(req.body);
  if (error) return res.status(400).json({ error: error.details[0].message });

  const gymId = req.userRole === 'gym_admin' ? req.userGymId : value.gym_id;
  if (!gymId) return res.status(400).json({ error: 'დარბაზი სავალდებულოა' });

  const { rows } = await db.query(`
    INSERT INTO fitpass_members (gym_id, name, phone, personal_id, service_start, service_end, is_active, renewal_count)
    VALUES ($1, $2, $3, $4, NOW(), NOW() + INTERVAL '30 days', true, 0)
    RETURNING *
  `, [gymId, value.name, value.phone, value.personal_id]);

  return res.status(201).json({ member: rows[0] });
});

// ─── განახლება (30 დღის დამატება) ────────────────────────────────────────────
fitpassRouter.post('/:id/renew', authenticate, requireAdmin, async (req: any, res: Response) => {
  const member = await db.query('SELECT * FROM fitpass_members WHERE id=$1', [req.params.id]);
  if (member.rows.length === 0) return res.status(404).json({ error: 'არ მოიძებნა' });

  if (req.userRole === 'gym_admin' && member.rows[0].gym_id !== req.userGymId) {
    return res.status(403).json({ error: 'Forbidden' });
  }

  const prevEnd = member.rows[0].service_end;
  const newEnd = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);

  const { rows } = await db.query(`
    UPDATE fitpass_members
    SET service_start = NOW(),
        service_end = $1,
        is_active = true,
        renewal_count = renewal_count + 1
    WHERE id = $2
    RETURNING *
  `, [newEnd, req.params.id]);

  await db.query(`
    INSERT INTO fitpass_renewals (member_id, renewed_by, previous_end_date, new_end_date)
    VALUES ($1, $2, $3, $4)
  `, [req.params.id, req.userId, prevEnd, newEnd]);

  return res.json({ member: rows[0] });
});

// ─── სერვისის გაუქმება ───────────────────────────────────────────────────────
fitpassRouter.patch('/:id/deactivate', authenticate, requireAdmin, async (req: any, res: Response) => {
  if (req.userRole !== 'super_admin') return res.status(403).json({ error: 'Forbidden' });
  const { rows } = await db.query(
    'UPDATE fitpass_members SET is_active=false WHERE id=$1 RETURNING *',
    [req.params.id]
  );
  return res.json({ member: rows[0] });
});

// ─── რედაქტირება ─────────────────────────────────────────────────────────────
fitpassRouter.patch('/:id', authenticate, requireAdmin, async (req: any, res: Response) => {
  const schema = Joi.object({
    name: Joi.string().min(2).max(200),
    phone: Joi.string().max(50).allow(''),
    personal_id: Joi.string().max(50).allow(''),
    is_active: Joi.boolean(),
  });
  const { error, value } = schema.validate(req.body);
  if (error) return res.status(400).json({ error: error.details[0].message });

  const updates: string[] = [];
  const params: any[] = [];
  let i = 1;

  if (value.name !== undefined)        { updates.push(`name=$${i++}`);        params.push(value.name); }
  if (value.phone !== undefined)       { updates.push(`phone=$${i++}`);       params.push(value.phone); }
  if (value.personal_id !== undefined) { updates.push(`personal_id=$${i++}`); params.push(value.personal_id); }
  if (value.is_active !== undefined)   { updates.push(`is_active=$${i++}`);   params.push(value.is_active); }

  if (updates.length === 0) return res.status(400).json({ error: 'Nothing to update' });
  params.push(req.params.id);
  const { rows } = await db.query(
    `UPDATE fitpass_members SET ${updates.join(',')} WHERE id=$${i} RETURNING *`,
    params
  );
  return res.json({ member: rows[0] });
});

// ─── ავტო-დეაქტივაცია (cron-style endpoint) ─────────────────────────────────
fitpassRouter.post('/auto-deactivate', async (_req, res: Response) => {
  const { rowCount } = await db.query(`
    UPDATE fitpass_members
    SET is_active = false
    WHERE is_active = true AND service_end < NOW()
  `);
  return res.json({ deactivated: rowCount });
});
