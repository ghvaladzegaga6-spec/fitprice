import { Router, Request, Response } from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { v4 as uuidv4 } from 'uuid';
import crypto from 'crypto';
import Joi from 'joi';
import { db } from '../db';
import { authenticate } from '../middleware/auth';

export const authRouter = Router();

const JWT_SECRET = process.env.JWT_SECRET!;
const JWT_REFRESH_SECRET = process.env.JWT_REFRESH_SECRET!;
const ACCESS_TOKEN_TTL = '15m';
const REFRESH_TOKEN_TTL = 7 * 24 * 60 * 60 * 1000; // 7 days ms

const registerSchema = Joi.object({
  email: Joi.string().email().max(255).required(),
  password: Joi.string().min(8).max(72).required(),
  name: Joi.string().min(2).max(100).required(),
});

const loginSchema = Joi.object({
  email: Joi.string().email().required(),
  password: Joi.string().required(),
});

function generateTokens(userId: string) {
  const accessToken = jwt.sign({ sub: userId, type: 'access' }, JWT_SECRET, { expiresIn: ACCESS_TOKEN_TTL });
  const refreshToken = uuidv4() + crypto.randomBytes(16).toString('hex');
  return { accessToken, refreshToken };
}

authRouter.post('/register', async (req: Request, res: Response) => {
  const { error, value } = registerSchema.validate(req.body);
  if (error) return res.status(400).json({ error: error.details[0].message });

  const { email, password, name } = value;

  const existing = await db.query('SELECT id FROM users WHERE email = $1', [email.toLowerCase()]);
  if (existing.rows.length > 0) {
    return res.status(409).json({ error: 'ეს ელ-ფოსტა უკვე გამოყენებულია.' });
  }

  const hash = await bcrypt.hash(password, 12);
  const user = await db.query(
    'INSERT INTO users (email, password_hash, name) VALUES ($1, $2, $3) RETURNING id, email, name, role',
    [email.toLowerCase(), hash, name]
  );

  const { accessToken, refreshToken } = generateTokens(user.rows[0].id);
  const tokenHash = crypto.createHash('sha256').update(refreshToken).digest('hex');
  await db.query(
    'INSERT INTO refresh_tokens (user_id, token_hash, expires_at) VALUES ($1, $2, $3)',
    [user.rows[0].id, tokenHash, new Date(Date.now() + REFRESH_TOKEN_TTL)]
  );

  res.cookie('refresh_token', refreshToken, {
    httpOnly: true, secure: process.env.NODE_ENV === 'production',
    sameSite: 'strict', maxAge: REFRESH_TOKEN_TTL,
  });

  return res.status(201).json({
    user: { id: user.rows[0].id, email: user.rows[0].email, name: user.rows[0].name, role: user.rows[0].role },
    accessToken,
  });
});

authRouter.post('/login', async (req: Request, res: Response) => {
  const { error, value } = loginSchema.validate(req.body);
  if (error) return res.status(400).json({ error: 'არასწორი მონაცემები.' });

  const { email, password } = value;
  const result = await db.query('SELECT * FROM users WHERE email = $1 AND is_active = true', [email.toLowerCase()]);
  if (result.rows.length === 0) {
    return res.status(401).json({ error: 'არასწორი ელ-ფოსტა ან პაროლი.' });
  }

  const user = result.rows[0];
  const valid = await bcrypt.compare(password, user.password_hash);
  if (!valid) {
    return res.status(401).json({ error: 'არასწორი ელ-ფოსტა ან პაროლი.' });
  }

  const { accessToken, refreshToken } = generateTokens(user.id);
  const tokenHash = crypto.createHash('sha256').update(refreshToken).digest('hex');
  await db.query(
    'INSERT INTO refresh_tokens (user_id, token_hash, expires_at) VALUES ($1, $2, $3)',
    [user.id, tokenHash, new Date(Date.now() + REFRESH_TOKEN_TTL)]
  );

  res.cookie('refresh_token', refreshToken, {
    httpOnly: true, secure: process.env.NODE_ENV === 'production',
    sameSite: 'strict', maxAge: REFRESH_TOKEN_TTL,
  });

  return res.json({
    user: { id: user.id, email: user.email, name: user.name, role: user.role },
    accessToken,
  });
});

authRouter.post('/refresh', async (req: Request, res: Response) => {
  const refreshToken = req.cookies?.refresh_token;
  if (!refreshToken) return res.status(401).json({ error: 'Unauthorized' });

  const tokenHash = crypto.createHash('sha256').update(refreshToken).digest('hex');
  const stored = await db.query(
    'SELECT rt.*, u.is_active FROM refresh_tokens rt JOIN users u ON u.id = rt.user_id WHERE rt.token_hash = $1 AND rt.expires_at > NOW()',
    [tokenHash]
  );

  if (stored.rows.length === 0) {
    res.clearCookie('refresh_token');
    return res.status(401).json({ error: 'Session expired' });
  }

  const { user_id } = stored.rows[0];
  // Rotate refresh token
  await db.query('DELETE FROM refresh_tokens WHERE token_hash = $1', [tokenHash]);
  const { accessToken, refreshToken: newRefresh } = generateTokens(user_id);
  const newHash = crypto.createHash('sha256').update(newRefresh).digest('hex');
  await db.query(
    'INSERT INTO refresh_tokens (user_id, token_hash, expires_at) VALUES ($1, $2, $3)',
    [user_id, newHash, new Date(Date.now() + REFRESH_TOKEN_TTL)]
  );

  res.cookie('refresh_token', newRefresh, {
    httpOnly: true, secure: process.env.NODE_ENV === 'production',
    sameSite: 'strict', maxAge: REFRESH_TOKEN_TTL,
  });

  return res.json({ accessToken });
});

authRouter.post('/logout', authenticate, async (req: any, res: Response) => {
  const refreshToken = req.cookies?.refresh_token;
  if (refreshToken) {
    const tokenHash = crypto.createHash('sha256').update(refreshToken).digest('hex');
    await db.query('DELETE FROM refresh_tokens WHERE token_hash = $1', [tokenHash]);
  }
  res.clearCookie('refresh_token');
  return res.json({ message: 'გამოხვედით სისტემიდან.' });
});

authRouter.get('/me', authenticate, async (req: any, res: Response) => {
  const user = await db.query('SELECT id, email, name, role, created_at FROM users WHERE id = $1', [req.userId]);
  if (user.rows.length === 0) return res.status(404).json({ error: 'Not found' });
  return res.json({ user: user.rows[0] });
});
