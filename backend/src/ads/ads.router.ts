import { Router, Response } from 'express';
import { authenticate, requireAdmin } from '../middleware/auth';
import { db } from '../db';
import { v2 as cloudinary } from 'cloudinary';
import Joi from 'joi';

cloudinary.config({
  cloud_name:  process.env.CLOUDINARY_CLOUD_NAME,
  api_key:     process.env.CLOUDINARY_API_KEY,
  api_secret:  process.env.CLOUDINARY_API_SECRET,
});

export const adsRouter = Router();

// Public — აქტიური ბანერები
adsRouter.get('/', async (_req, res: Response) => {
  const { rows } = await db.query(
    'SELECT * FROM ads WHERE is_active=true ORDER BY display_order ASC, created_at DESC'
  );
  return res.json({ ads: rows });
});

// Admin — ყველა ბანერი
adsRouter.get('/admin/all', authenticate, requireAdmin, async (req: any, res: Response) => {
  if (req.userRole !== 'super_admin') return res.status(403).json({ error: 'Forbidden' });
  const { rows } = await db.query('SELECT * FROM ads ORDER BY display_order ASC, created_at DESC');
  return res.json({ ads: rows });
});

// სურათის ატვირთვა Cloudinary-ზე
adsRouter.post('/upload', authenticate, requireAdmin, async (req: any, res: Response) => {
  if (req.userRole !== 'super_admin') return res.status(403).json({ error: 'Forbidden' });
  const { image_data } = req.body;
  if (!image_data) return res.status(400).json({ error: 'სურათი სავალდებულოა' });
  try {
    const result = await cloudinary.uploader.upload(image_data, {
      folder: 'fitprice-banners',
      transformation: [
        { width: 1200, height: 300, crop: 'fill', quality: 'auto' }
      ],
    });
    return res.json({ url: result.secure_url });
  } catch (err: any) {
    return res.status(500).json({ error: 'ატვირთვა ვერ მოხდა: ' + err.message });
  }
});

// ბანერის დამატება
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

// ბანერის ჩართვა/გამორთვა
adsRouter.patch('/:id', authenticate, requireAdmin, async (req: any, res: Response) => {
  if (req.userRole !== 'super_admin') return res.status(403).json({ error: 'Forbidden' });
  const { rows } = await db.query(
    'UPDATE ads SET is_active=$1 WHERE id=$2 RETURNING *',
    [req.body.is_active, req.params.id]
  );
  return res.json({ ad: rows[0] });
});

// ბანერის წაშლა
adsRouter.delete('/:id', authenticate, requireAdmin, async (req: any, res: Response) => {
  if (req.userRole !== 'super_admin') return res.status(403).json({ error: 'Forbidden' });
  await db.query('DELETE FROM ads WHERE id=$1', [req.params.id]);
  return res.json({ success: true });
});
