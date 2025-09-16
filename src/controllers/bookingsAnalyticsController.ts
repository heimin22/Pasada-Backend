import { Request, Response } from 'express';
import { BookingsAnalyticsService } from '../services/bookingsAnalyticsService';

export class BookingsAnalyticsController {
  private bookingsAnalyticsService: BookingsAnalyticsService;

  constructor(bookingsAnalyticsService: BookingsAnalyticsService) {
    this.bookingsAnalyticsService = bookingsAnalyticsService;
  }

  /**
   * GET /api/analytics/bookings/frequency?days=<n>
   * Returns live booking frequency analytics from Supabase
   */
  async getBookingFrequency(req: Request, res: Response): Promise<void> {
    try {
      const days = parseInt(req.query.days as string) || 14;
      
      if (days < 1 || days > 365) {
        res.status(400).json({
          success: false,
          error: 'Days parameter must be between 1 and 365'
        });
        return;
      }

      const result = await this.bookingsAnalyticsService.getBookingFrequency(days);
      
      res.json({
        success: true,
        data: result,
        metadata: {
          days,
          generatedAt: new Date().toISOString()
        }
      });
    } catch (error: any) {
      console.error('Error getting booking frequency:', error);
      res.status(500).json({
        success: false,
        error: error.message || 'Failed to get booking frequency analytics'
      });
    }
  }

  /**
   * POST /api/analytics/bookings/frequency/persist/daily?days=<n>
   * Persist daily booking counts to QuestDB
   */
  async persistDailyCounts(req: Request, res: Response): Promise<void> {
    try {
      const days = parseInt(req.query.days as string) || 14;
      
      if (days < 1 || days > 365) {
        res.status(400).json({
          success: false,
          error: 'Days parameter must be between 1 and 365'
        });
        return;
      }

      await this.bookingsAnalyticsService.persistDailyCounts(days);
      
      res.json({
        success: true,
        message: `Successfully persisted ${days} days of booking counts to QuestDB`,
        metadata: {
          days,
          persistedAt: new Date().toISOString()
        }
      });
    } catch (error: any) {
      console.error('Error persisting daily counts:', error);
      res.status(500).json({
        success: false,
        error: error.message || 'Failed to persist daily booking counts'
      });
    }
  }

  /**
   * POST /api/analytics/bookings/frequency/persist/forecast?days=<n>
   * Persist forecast to QuestDB
   */
  async persistForecast(req: Request, res: Response): Promise<void> {
    try {
      const days = parseInt(req.query.days as string) || 14;
      
      if (days < 1 || days > 365) {
        res.status(400).json({
          success: false,
          error: 'Days parameter must be between 1 and 365'
        });
        return;
      }

      await this.bookingsAnalyticsService.persistForecast(days);
      
      res.json({
        success: true,
        message: 'Successfully persisted booking forecast to QuestDB',
        metadata: {
          days,
          persistedAt: new Date().toISOString()
        }
      });
    } catch (error: any) {
      console.error('Error persisting forecast:', error);
      res.status(500).json({
        success: false,
        error: error.message || 'Failed to persist booking forecast'
      });
    }
  }

  /**
   * GET /api/analytics/bookings/frequency/daily?days=<n>
   * Read daily booking counts from QuestDB
   */
  async getDailyCounts(req: Request, res: Response): Promise<void> {
    try {
      const days = parseInt(req.query.days as string) || 14;
      
      if (days < 1 || days > 365) {
        res.status(400).json({
          success: false,
          error: 'Days parameter must be between 1 and 365'
        });
        return;
      }

      const result = await this.bookingsAnalyticsService.getDailyCountsFromQuestDB(days);
      
      res.json({
        success: true,
        data: result,
        metadata: {
          days,
          recordCount: result.length,
          generatedAt: new Date().toISOString()
        }
      });
    } catch (error: any) {
      console.error('Error getting daily counts from QuestDB:', error);
      res.status(500).json({
        success: false,
        error: error.message || 'Failed to get daily booking counts from QuestDB'
      });
    }
  }

  /**
   * GET /api/analytics/bookings/frequency/forecast/latest
   * Read latest forecast from QuestDB
   */
  async getLatestForecast(req: Request, res: Response): Promise<void> {
    try {
      const result = await this.bookingsAnalyticsService.getLatestForecastFromQuestDB();
      
      res.json({
        success: true,
        data: result,
        metadata: {
          recordCount: result.length,
          generatedAt: new Date().toISOString()
        }
      });
    } catch (error: any) {
      console.error('Error getting latest forecast from QuestDB:', error);
      res.status(500).json({
        success: false,
        error: error.message || 'Failed to get latest booking forecast from QuestDB'
      });
    }
  }
}
