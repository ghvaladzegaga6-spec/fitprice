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
const ACCESS_TOKEN_TTL = '15m';
const REFRESH_TOKEN_TTL = 7 * 24 * 60 * 60 * 1000;

const loginSchema = Joi.object({
  email: Joi.string().email().required(),
  password: Joi.string().required(),
});

function generateTokens(userId: string, role: string = 'user', gymId?: number) {
  const accessToken = jwt.sign(
    { sub: userId, type: 'access', role, gym_id: gymId || null },
    JWT_SECRET,
    { expiresIn: ACCESS_TOKEN_TTL }
  );
  const refreshToken = uuidv4() + crypto.randomBytes(16).toString('hex');
  return { accessToken, refreshToken };
}

authRouter.post('/login', async (req: Request, res: Response) => {
  const { error, value } = loginSchema.validate(req.body);
  if (error) return res.status(400).json({ error: 'Invalid credentials.' });

  const { email, password } = value;
  const result = await db.query(
    'SELECT * FROM users WHERE email = $1 AND is_active = true',
    [email.toLowerCase()]
  );
  if (result.rows.length === 0) {
    return res.status(401).json({ error: 'Invalid email or password.' });
  }

  const user = result.rows[0];

  // შეჩერებული მომხმარებელი
  if (user.is_suspended) {
    return res.status(403).json({ error: 'suspended', message: 'Your access is suspended. Please renew your gym membership.' });
  }

  const valid = await bcrypt.compare(password, user.password_hash);
  if (!valid) {
    return res.status(401).json({ error: 'Invalid email or password.' });
  }

  const { accessToken, refreshToken } = generateTokens(user.id, user.role, user.gym_id);
  const tokenHash = crypto.createHash('sha256').update(refreshToken).digest('hex');
  await db.query(
    'INSERT INTO refresh_tokens (user_id, token_hash, expires_at) VALUES ($1, $2, $3)',
    [user.id, tokenHash, new Date(Date.now() + REFRESH_TOKEN_TTL)]
  );

  res.cookie('refresh_token', refreshToken, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'strict',
    maxAge: REFRESH_TOKEN_TTL,
  });

  return res.json({
    user: { id: user.id, email: user.email, name: user.name, role: user.role, gym_id: user.gym_id },
    accessToken,
  });
});

authRouter.post('/refresh', async (req: Request, res: Response) => {
  const refreshToken = req.cookies?.refresh_token;
  if (!refreshToken) return res.status(401).json({ error: 'Unauthorized' });

  const tokenHash = crypto.createHash('sha256').update(refreshToken).digest('hex');
  const stored = await db.query(
    'SELECT rt.*, u.is_active, u.role, u.gym_id FROM refresh_tokens rt JOIN users u ON u.id = rt.user_id WHERE rt.token_hash = $1 AND rt.expires_at > NOW()',
    [tokenHash]
  );

  if (stored.rows.length === 0) {
    res.clearCookie('refresh_token');
    return res.status(401).json({ error: 'Session expired' });
  }

  const { user_id, role, gym_id } = stored.rows[0];
  await db.query('DELETE FROM refresh_tokens WHERE token_hash = $1', [tokenHash]);
  const { accessToken, refreshToken: newRefresh } = generateTokens(user_id, role, gym_id);
  const newHash = crypto.createHash('sha256').update(newRefresh).digest('hex');
  await db.query(
    'INSERT INTO refresh_tokens (user_id, token_hash, expires_at) VALUES ($1, $2, $3)',
    [user_id, newHash, new Date(Date.now() + REFRESH_TOKEN_TTL)]
  );

  res.cookie('refresh_token', newRefresh, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'strict',
    maxAge: REFRESH_TOKEN_TTL,
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
  return res.json({ message: 'Logged out.' });
});

authRouter.get('/me', authenticate, async (req: any, res: Response) => {
  const user = await db.query(
    'SELECT id, email, name, role, is_suspended, gym_id, created_at FROM users WHERE id = $1',
    [req.userId]
  );
  if (user.rows.length === 0) return res.status(404).json({ error: 'Not found' });
  return res.json({ user: user.rows[0] });
});
