import { Router, Response, Request } from 'express';
import { authenticate, requireAdmin } from '../middleware/auth';
import { db } from '../db';
import Joi from 'joi';

export const adsRouter = Router();

// Public — list active ads
adsRouter.get('/', async (_req, res: Response) => {
  const { rows } = await db.query(
    'SELECT * FROM ads WHERE is_active=true ORDER BY display_order ASC, created_at DESC'
  );
  return res.json({ ads: rows });
});

// Admin — list all ads
adsRouter.get('/admin/all', authenticate, requireAdmin, async (req: any, res: Response) => {
  if (req.userRole !== 'super_admin') return res.status(403).json({ error: 'Forbidden' });
  const { rows } = await db.query('SELECT * FROM ads ORDER BY display_order ASC, created_at DESC');
  return res.json({ ads: rows });
});

// Admin — create ad (image_url = uploaded URL or base64)
adsRouter.post('/', authenticate, requireAdmin, async (req: any, res: Response) => {
  if (req.userRole !== 'super_admin') return res.status(403).json({ error: 'Forbidden' });
  const schema = Joi.object({
    title:         Joi.string().max(200).allow('').default(''),
    image_url:     Joi.string().required(),
    link_url:      Joi.string().allow('').default(''),
    display_order: Joi.number().integer().default(0),
  });
  const { error, value } = schema.validate(req.body);
  if (error) return res.status(400).json({ error: error.details[0].message });

  const { rows } = await db.query(
    'INSERT INTO ads (title, image_url, link_url, is_active, display_order) VALUES ($1,$2,$3,true,$4) RETURNING *',
    [value.title, value.image_url, value.link_url, value.display_order]
  );
  return res.status(201).json({ ad: rows[0] });
});

// Admin — toggle active
adsRouter.patch('/:id', authenticate, requireAdmin, async (req: any, res: Response) => {
  if (req.userRole !== 'super_admin') return res.status(403).json({ error: 'Forbidden' });
  const { rows } = await db.query(
    'UPDATE ads SET is_active=$1 WHERE id=$2 RETURNING *',
    [req.body.is_active, req.params.id]
  );
  return res.json({ ad: rows[0] });
});

// Admin — delete ad
adsRouter.delete('/:id', authenticate, requireAdmin, async (req: any, res: Response) => {
  if (req.userRole !== 'super_admin') return res.status(403).json({ error: 'Forbidden' });
  await db.query('DELETE FROM ads WHERE id=$1', [req.params.id]);
  return res.json({ success: true });
});
