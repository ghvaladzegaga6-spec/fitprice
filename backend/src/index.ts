import 'express-async-errors';
import express from 'express';
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
import { personalizationRouter } from './personalization/personalization.router';
import { adminRouter } from './admin/admin.router';
import { errorHandler } from './middleware/errorHandler';
import { logger } from './utils/logger';
import dotenv from 'dotenv';

dotenv.config();

const REQUIRED_ENV = ['DATABASE_URL', 'JWT_SECRET', 'JWT_REFRESH_SECRET', 'INTERNAL_TOKEN'];
for (const key of REQUIRED_ENV) {
  if (!process.env[key]) {
    console.error(`❌ Missing required env var: ${key}`);
    process.exit(1);
  }
}

const app = express();
const PORT = process.env.PORT || 4000;

app.set('trust proxy', 1);

app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc:  ["'self'"],
      styleSrc:   ["'self'", "'unsafe-inline'"],
      imgSrc:     ["'self'", "data:", "https:"],
    }
  },
  hsts: { maxAge: 31536000, includeSubDomains: true, preload: true },
}));
app.use(hpp());
app.use(compression());
app.use(cookieParser());

app.use(cors({
  origin: true,
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
}));

app.options('*', cors());

const globalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 300,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'ძალიან ბევრი მოთხოვნა. სცადეთ 15 წუთში.' },
});
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 50,
  message: { error: 'ძალიან ბევრი მოცდილობა. სცადეთ მოგვიანებით.' },
});

app.use(globalLimiter);

app.use('/api/ads/upload', express.json({ limit: '20mb' }));
app.use('/api/ads/upload', express.urlencoded({ extended: true, limit: '20mb' }));
app.use(express.json({ limit: '20mb' }));
app.use(express.urlencoded({ extended: true, limit: '20mb' }));

// Routes
app.use('/api/auth',            authLimiter, authRouter);
app.use('/api/basket',          basketRouter);
app.use('/api/nutrition',       nutritionRouter);
app.use('/api/ads',             adsRouter);
app.use('/api/users',           usersRouter);
app.use('/api/personalization', personalizationRouter);
app.use('/api/admin',           adminRouter);

app.get('/health', (_req, res) => res.json({ status: 'ok', ts: new Date().toISOString() }));
app.use((_req, res) => res.status(404).json({ error: 'Not found' }));
app.use(errorHandler);

async function bootstrap() {
  try {
    await db.query('SELECT 1');
    logger.info('✅ Database connected');
    await runMigrations();
    logger.info('✅ Migrations complete');
    app.listen(PORT, () => {
      logger.info(`🚀 FITPRICE Backend running on port ${PORT}`);
    });
  } catch (err) {
    logger.error('❌ Startup failed:', err);
    process.exit(1);
  }
}

bootstrap();
export default app;
