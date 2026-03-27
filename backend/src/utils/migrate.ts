import { db, runMigrations } from '../db';
import { logger } from '../utils/logger';

// Call this in index.ts bootstrap()
export async function initDatabase() {
  try {
    await runMigrations();
    logger.info('✅ Database migrations complete');
  } catch (err) {
    logger.error('❌ Migration failed:', err);
    throw err;
  }
}
