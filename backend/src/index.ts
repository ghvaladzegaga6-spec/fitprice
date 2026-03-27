import 'express-async-errors';
import express from 'express';
// Validate env vars at startup
const REQUIRED = ['DATABASE_URL','JWT_SECRET','JWT_REFRESH_SECRET','INTERNAL_TOKEN'];
for (const k of REQUIRED) { if (!process.env[k]) { console.error(`❌ Missing env: ${k}`); process.exit(1); } }
import cors from 'cors';
import helmet from 'helmet';
import compression from 'compression';
import cookieParser from 'cookie-parser';
import hpp from 'hpp';
import rateLimit from 'express-rate-limit';
import { db, runMigrations } from './db';
import { authRouter } from './auth/auth.router';
import { basketRouter } from './basket/basket.router';
import { nutritionRouter } from './nutrition/nutrition.router';
import { adsRouter } from './ads/ads.router';
import { usersRouter } from './users/users.router';
import { errorHandler } from './middleware/errorHandler';
import { logger } from './utils/logger';
import dotenv from 'dotenv';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 4000;

// --- Security Middleware ---
app.set('trust proxy', 1);
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'"],
      imgSrc: ["'self'", "data:", "https:"],
    }
  },
  hsts: { maxAge: 31536000, includeSubDomains: true, preload: true },
}));
app.use(hpp());
app.use(compression());
app.use(cookieParser());

// CORS
const allowedOrigins = (process.env.ALLOWED_ORIGINS || 'http://localhost:3000').split(',');
app.use(cors({
  origin: (origin, callback) => {
    if (!origin || allowedOrigins.includes(origin)) {
      callback(null, true);
    } else {
      callback(new Error('Not allowed by CORS'));
    }
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH'],
  allowedHeaders: ['Content-Type', 'Authorization'],
}));

// Rate limiting
const globalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 200,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'ძალიან ბევრი მოთხოვნა. სცადეთ 15 წუთში.' },
});
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  message: { error: 'ძალიან ბევრი მოცდილობა. სცადეთ მოგვიანებით.' },
});

app.use(globalLimiter);
app.use(express.json({ limit: '10kb' }));
app.use(express.urlencoded({ extended: true, limit: '10kb' }));

// --- Routes ---
app.use('/api/auth', authLimiter, authRouter);
app.use('/api/basket', basketRouter);
app.use('/api/nutrition', nutritionRouter);
app.use('/api/ads', adsRouter);
app.use('/api/users', usersRouter);

app.get('/health', (_, res) => res.json({ status: 'ok', time: new Date().toISOString() }));

// 404
app.use((req, res) => {
  res.status(404).json({ error: 'Not found' });
});

// Error handler
app.use(errorHandler);

// Start
async function bootstrap() {
  try {
    await db.query('SELECT 1');
    logger.info('✅ Database connected');
    await runMigrations();
    logger.info('✅ Migrations done');
    app.listen(PORT, () => {
      logger.info(`FITPRICE Backend running on port ${PORT}`);
    });
  } catch (err) {
    logger.error('Failed to start:', err);
    process.exit(1);
  }
}

bootstrap();

export default app;
