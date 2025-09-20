import { Router } from 'express';
import { MigrationController } from '../controllers/migrationController';
import { MigrationService } from '../services/migrationService';
import asyncHandler from 'express-async-handler';

const router = Router();

// Initialize migration service and controller
const migrationService = new MigrationService(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  process.env.QUESTDB_HTTP
);
const migrationController = new MigrationController(migrationService);

/**
 * GET /api/admin/migration/status
 * Check migration readiness
 */
router.get('/status', asyncHandler(migrationController.checkMigrationStatus.bind(migrationController)));

/**
 * POST /api/admin/migration/run
 * Execute migration from Supabase to QuestDB
 */
router.post('/run', asyncHandler(migrationController.runMigration.bind(migrationController)));

/**
 * GET /api/admin/migration/questdb-status
 * QuestDB connection status (admin endpoint)
 */
router.get('/questdb-status', asyncHandler(migrationController.getQuestDBStatus.bind(migrationController)));

export default router;
