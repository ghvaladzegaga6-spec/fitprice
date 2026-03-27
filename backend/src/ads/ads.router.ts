import { Router, Response } from 'express';
import Joi from 'joi';
import { db } from '../db';
import { authenticate, requireAdmin } from '../middleware/auth';

export const adsRouter = Router();

adsRouter.get('/', async (_req, res: Response) => {
  const rows = await db.query(
    'SELECT id, title, image_url, link_url, display_order FROM ads WHERE is_active = true ORDER BY display_order ASC LIMIT 10'
  );
  return res.json({ ads: rows.rows });
});

const adSchema = Joi.object({
  title: Joi.string().max(200).required(),
  image_url: Joi.string().uri().max(500).required(),
  link_url: Joi.string().uri().max(500),
  display_order: Joi.number().integer().min(0),
});

adsRouter.post('/', authenticate, requireAdmin, async (req: any, res: Response) => {
  const { error, value } = adSchema.validate(req.body);
  if (error) return res.status(400).json({ error: error.details[0].message });

  const row = await db.query(
    'INSERT INTO ads (title, image_url, link_url, display_order) VALUES ($1,$2,$3,$4) RETURNING *',
    [value.title, value.image_url, value.link_url || null, value.display_order || 0]
  );
  return res.status(201).json({ ad: row.rows[0] });
});

adsRouter.delete('/:id', authenticate, requireAdmin, async (req: any, res: Response) => {
  await db.query('UPDATE ads SET is_active = false WHERE id = $1', [req.params.id]);
  return res.json({ message: 'წაიშალა' });
});
