import express from 'express';
import { AnalyticsService } from '../services/analyticsService';
import { ExternalAnalyticsService } from '../services/externalAnalyticsService';

export class AnalyticsController {
    constructor(
        private analyticsService: AnalyticsService,
        private externalAnalyticsService: ExternalAnalyticsService
    ) {}
    
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
          // This will generate realistic traffic data for all routes
          const result = await this.analyticsService.refreshAllTrafficData();
          res.json({ 
            message: result.message,
            routesUpdated: result.routesUpdated
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

      // External Analytics Integration Methods
      
      // Check external analytics service health
      async getExternalAnalyticsHealth(req: express.Request, res: express.Response): Promise<void> {
        try {
          const health = await this.externalAnalyticsService.getServiceHealth();
          res.json(health);
        } catch (error) {
          console.error('Error checking external analytics health:', error);
          res.status(503).json({
            healthy: false,
            services: {
              analytics: false,
              questdb: false,
              traffic: false
            },
            error: 'External analytics service unavailable'
          });
        }
      }

      // Get traffic analytics status
      async getTrafficAnalyticsStatus(req: express.Request, res: express.Response): Promise<void> {
        try {
          const status = await this.externalAnalyticsService.checkTrafficAnalyticsStatus();
          res.json(status);
        } catch (error) {
          console.error('Error getting traffic analytics status:', error);
          res.status(503).json({
            success: false,
            available: false,
            services: {
              supabase: false,
              googleMaps: false,
              questdb: false
            },
            message: 'Traffic analytics service unavailable'
          });
        }
      }

      // Run traffic analytics
      async runTrafficAnalytics(req: express.Request, res: express.Response): Promise<void> {
        try {
          const { routeIds, includeHistoricalAnalysis, generateForecasts } = req.body;
          
          const request = {
            routeIds,
            includeHistoricalAnalysis: includeHistoricalAnalysis ?? true,
            generateForecasts: generateForecasts ?? true
          };

          const result = await this.externalAnalyticsService.runTrafficAnalytics(request);
          res.json(result);
        } catch (error) {
          console.error('Error running traffic analytics:', error);
          res.status(500).json({
            success: false,
            error: 'Failed to run traffic analytics',
            message: error instanceof Error ? error.message : 'Unknown error'
          });
        }
      }

      // Get route traffic summary from external service
      async getExternalRouteTrafficSummary(req: express.Request, res: express.Response): Promise<void> {
        try {
          const routeId = parseInt(req.params.routeId);
          const days = parseInt(req.query.days as string) || 7;

          if (isNaN(routeId)) {
            res.status(400).json({
              success: false,
              error: 'Invalid route ID'
            });
            return;
          }

          const summary = await this.externalAnalyticsService.getRouteTrafficSummary(routeId, days);
          res.json(summary);
        } catch (error) {
          console.error('Error getting external route traffic summary:', error);
          res.status(500).json({
            success: false,
            error: 'Failed to get route traffic summary',
            message: error instanceof Error ? error.message : 'Unknown error'
          });
        }
      }

      // Get route predictions from external service
      async getExternalRoutePredictions(req: express.Request, res: express.Response): Promise<void> {
        try {
          const routeId = parseInt(req.params.routeId);

          if (isNaN(routeId)) {
            res.status(400).json({
              success: false,
              error: 'Invalid route ID'
            });
            return;
          }

          const predictions = await this.externalAnalyticsService.getRoutePredictions(routeId);
          res.json(predictions);
        } catch (error) {
          console.error('Error getting external route predictions:', error);
          res.status(500).json({
            success: false,
            error: 'Failed to get route predictions',
            message: error instanceof Error ? error.message : 'Unknown error'
          });
        }
      }

      // Hybrid analytics - combine local and external data
      async getHybridRouteAnalytics(req: express.Request, res: express.Response): Promise<void> {
        try {
          const routeId = parseInt(req.params.routeId);
          
          if (isNaN(routeId)) {
            res.status(400).json({ error: 'Invalid route ID' });
            return;
          }

          // Check if external service is available
          const isExternalAvailable = await this.externalAnalyticsService.isServiceAvailable();
          
          if (isExternalAvailable) {
            try {
              // Try to get data from external service first
              const [localAnalytics, externalSummary, externalPredictions] = await Promise.all([
                this.analyticsService.generateRouteAnalytics(routeId),
                this.externalAnalyticsService.getRouteTrafficSummary(routeId, 7),
                this.externalAnalyticsService.getRoutePredictions(routeId)
              ]);

              res.json({
                source: 'hybrid',
                local: localAnalytics,
                external: {
                  summary: externalSummary.data,
                  predictions: externalPredictions.data
                },
                metadata: {
                  externalAvailable: true,
                  generatedAt: new Date().toISOString()
                }
              });
            } catch (externalError) {
              console.warn('External analytics failed, falling back to local:', externalError);
              // Fallback to local analytics
              const localAnalytics = await this.analyticsService.generateRouteAnalytics(routeId);
              res.json({
                source: 'local',
                data: localAnalytics,
                metadata: {
                  externalAvailable: false,
                  fallbackReason: 'External service error',
                  generatedAt: new Date().toISOString()
                }
              });
            }
          } else {
            // Use local analytics only
            const localAnalytics = await this.analyticsService.generateRouteAnalytics(routeId);
            res.json({
              source: 'local',
              data: localAnalytics,
              metadata: {
                externalAvailable: false,
                generatedAt: new Date().toISOString()
              }
            });
          }
        } catch (error) {
          console.error('Error in getHybridRouteAnalytics:', error);
          res.status(500).json({ 
            error: 'Failed to generate hybrid route analytics',
            message: error instanceof Error ? error.message : 'Unknown error'
          });
        }
      }

      // Ingest traffic data to external service
      async ingestTrafficData(req: express.Request, res: express.Response): Promise<void> {
        try {
          const { trafficData } = req.body;

          if (!trafficData || !Array.isArray(trafficData)) {
            res.status(400).json({
              success: false,
              error: 'trafficData array is required'
            });
            return;
          }

          const result = await this.externalAnalyticsService.ingestTrafficData(trafficData);
          res.json(result);
        } catch (error) {
          console.error('Error ingesting traffic data:', error);
          res.status(500).json({
            success: false,
            error: 'Failed to ingest traffic data',
            message: error instanceof Error ? error.message : 'Unknown error'
          });
        }
      }

      // Get system metrics from external service
      async getExternalSystemMetrics(req: express.Request, res: express.Response): Promise<void> {
        try {
          const metrics = await this.externalAnalyticsService.getSystemMetrics();
          res.json(metrics);
        } catch (error) {
          console.error('Error getting external system metrics:', error);
          res.status(500).json({
            success: false,
            error: 'Failed to get system metrics',
            message: error instanceof Error ? error.message : 'Unknown error'
          });
        }
      }
}