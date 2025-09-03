import express from 'express';
import { AnalyticsService } from '../services/analyticsService';

export class AnalyticsController {
    constructor(private analyticsService: AnalyticsService) {}
    
    // get analytics for a specific route
    async getRouteAnalytics(req: express.Request, res: express.Response): Promise<void> {
        try {
          const routeId = parseInt(req.params.routeId);
          
          if (isNaN(routeId)) {
            res.status(400).json({ error: 'Invalid route ID' });
            return;
          }
    
          const analytics = await this.analyticsService.generateRouteAnalytics(routeId);
          res.json(analytics);
        } catch (error) {
          console.error('Error in getRouteAnalytics:', error);
          res.status(500).json({ 
            error: 'Failed to generate route analytics',
            message: error instanceof Error ? error.message : 'Unknown error'
          });
        }
      }
    
      // Get analytics for all routes
      async getAllRoutesAnalytics(req: express.Request, res: express.Response): Promise<void> {
        try {
          const analytics = await this.analyticsService.getAllRoutesAnalytics();
          res.json(analytics);
        } catch (error) {
          console.error('Error in getAllRoutesAnalytics:', error);
          res.status(500).json({ 
            error: 'Failed to generate analytics for all routes',
            message: error instanceof Error ? error.message : 'Unknown error'
          });
        }
      }
    
      // Refresh traffic data for all routes
      async refreshTrafficData(req: express.Request, res: express.Response): Promise<void> {
        try {
          // This would trigger a fresh data collection
          const routes = await this.analyticsService.getAllRoutesAnalytics();
          res.json({ 
            message: 'Traffic data refreshed successfully',
            routesUpdated: routes.length
          });
        } catch (error) {
          console.error('Error in refreshTrafficData:', error);
          res.status(500).json({ 
            error: 'Failed to refresh traffic data',
            message: error instanceof Error ? error.message : 'Unknown error'
          });
        }
      }

      // Get concise summaries for all routes
      async getConciseSummaries(req: express.Request, res: express.Response): Promise<void> {
        try {
          const summaries = await this.analyticsService.getConciseSummaries();
          res.json(summaries);
        } catch (error) {
          console.error('Error in getConciseSummaries:', error);
          res.status(500).json({ 
            error: 'Failed to generate concise summaries',
            message: error instanceof Error ? error.message : 'Unknown error'
          });
        }
      }
}