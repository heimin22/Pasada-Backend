import { Request, Response } from 'express';
import { MigrationService, MigrationStatus, MigrationResult } from '../services/migrationService';

export class MigrationController {
  private migrationService: MigrationService;

  constructor(migrationService: MigrationService) {
    this.migrationService = migrationService;
  }

  /**
   * GET /api/admin/migration/status - Check migration readiness
   */
  async checkMigrationStatus(req: Request, res: Response): Promise<void> {
    try {
      console.log('Checking migration status...');
      
      const status = await this.migrationService.checkMigrationStatus();
      
      const response = {
        success: true,
        data: status,
        timestamp: new Date().toISOString()
      };

      if (status.isReady) {
        res.status(200).json(response);
      } else {
        res.status(503).json({
          ...response,
          message: 'Migration service is not ready',
          details: status.errors
        });
      }
    } catch (error: any) {
      console.error('Error checking migration status:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to check migration status',
        message: error.message,
        timestamp: new Date().toISOString()
      });
    }
  }

  /**
   * POST /api/admin/migration/run - Execute migration
   */
  async runMigration(req: Request, res: Response): Promise<void> {
    try {
      console.log('Starting migration process...');
      
      // First check if migration is ready
      const status = await this.migrationService.checkMigrationStatus();
      if (!status.isReady) {
        res.status(400).json({
          success: false,
          error: 'Migration service is not ready',
          details: status.errors,
          timestamp: new Date().toISOString()
        });
        return;
      }

      // Start migration
      const result = await this.migrationService.runMigration();
      
      const response = {
        success: result.success,
        data: {
          totalRecords: result.totalRecords,
          processedRecords: result.processedRecords,
          batchesProcessed: result.batchesProcessed,
          duration: result.duration,
          durationFormatted: this.formatDuration(result.duration),
          errors: result.errors
        },
        timestamp: new Date().toISOString()
      };

      if (result.success) {
        console.log(`Migration completed successfully: ${result.processedRecords}/${result.totalRecords} records processed`);
        res.status(200).json(response);
      } else {
        console.log(`Migration completed with errors: ${result.processedRecords}/${result.totalRecords} records processed`);
        res.status(207).json({ // 207 Multi-Status for partial success
          ...response,
          message: 'Migration completed with some errors'
        });
      }
    } catch (error: any) {
      console.error('Error running migration:', error);
      res.status(500).json({
        success: false,
        error: 'Migration failed',
        message: error.message,
        timestamp: new Date().toISOString()
      });
    }
  }

  /**
   * GET /api/status/questdb - QuestDB connection status
   */
  async getQuestDBStatus(req: Request, res: Response): Promise<void> {
    try {
      console.log('Checking QuestDB status...');
      
      const status = await this.migrationService.getQuestDBStatus();
      
      const response = {
        success: true,
        data: status,
        timestamp: new Date().toISOString()
      };

      if (status.isAvailable && status.testQuery) {
        res.status(200).json(response);
      } else {
        res.status(503).json({
          ...response,
          message: 'QuestDB is not available or not responding properly',
          details: status.error
        });
      }
    } catch (error: any) {
      console.error('Error checking QuestDB status:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to check QuestDB status',
        message: error.message,
        timestamp: new Date().toISOString()
      });
    }
  }

  /**
   * Format duration in milliseconds to human readable format
   */
  private formatDuration(milliseconds: number): string {
    const seconds = Math.floor(milliseconds / 1000);
    const minutes = Math.floor(seconds / 60);
    const hours = Math.floor(minutes / 60);

    if (hours > 0) {
      return `${hours}h ${minutes % 60}m ${seconds % 60}s`;
    } else if (minutes > 0) {
      return `${minutes}m ${seconds % 60}s`;
    } else {
      return `${seconds}s`;
    }
  }
}
