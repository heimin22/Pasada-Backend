import express from 'express';
import { ExternalAnalyticsService } from '../services/externalAnalyticsService';
import { WeeklyAnalyticsService } from '../services/weeklyAnalyticsService';
import { DailyTrafficCollectionService } from '../services/dailyTrafficCollectionService';
import { DatabaseService } from '../services/databaseService';
import { AnalyticsService } from '../services/analyticsService';
import { GoogleMapsService } from '../services/googleMapsService';
import { GeminiService } from '../services/geminiService';
import asyncHandler from 'express-async-handler';

const router = express.Router();
const externalAnalyticsService = new ExternalAnalyticsService();

// Initialize local services for weekly analytics
const databaseService = new DatabaseService(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_ANON_KEY!
);
const googleMapsService = new GoogleMapsService(process.env.GOOGLE_MAPS_API_KEY || '');
const geminiService = new GeminiService(process.env.GEMINI_API_KEY || '', databaseService);
const analyticsService = new AnalyticsService(databaseService, geminiService, googleMapsService);
const weeklyAnalyticsService = new WeeklyAnalyticsService(databaseService, analyticsService, googleMapsService);
const dailyTrafficCollectionService = new DailyTrafficCollectionService(databaseService, googleMapsService);

// Health & Status Endpoints
router.get('/health', asyncHandler(async (req, res) => {
  try {
    const health = await externalAnalyticsService.checkHealth();
    res.json(health);
  } catch (error) {
    console.error('Health check failed:', error);
    res.status(503).json({
      status: 'error',
      message: 'Analytics service unavailable',
      timestamp: new Date().toISOString()
    });
  }
}));

router.get('/status/questdb', asyncHandler(async (req, res) => {
  try {
    const status = await externalAnalyticsService.checkQuestDbStatus();
    res.json(status);
  } catch (error) {
    console.error('QuestDB status check failed:', error);
    res.status(503).json({
      status: 'error',
      message: 'QuestDB unavailable',
      timestamp: new Date().toISOString()
    });
  }
}));

router.get('/traffic/status', asyncHandler(async (req, res) => {
  try {
    const status = await externalAnalyticsService.checkTrafficAnalyticsStatus();
    res.json(status);
  } catch (error) {
    console.error('Traffic analytics status check failed:', error);
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
}));

// Traffic Analytics Endpoints
router.post('/traffic/run', asyncHandler(async (req, res) => {
  try {
    const { routeIds, includeHistoricalAnalysis, generateForecasts } = req.body;
    
    const request = {
      routeIds,
      includeHistoricalAnalysis: includeHistoricalAnalysis ?? true,
      generateForecasts: generateForecasts ?? true
    };

    const result = await externalAnalyticsService.runTrafficAnalytics(request);
    res.json(result);
  } catch (error) {
    console.error('Traffic analytics run failed:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to run traffic analytics',
      message: error instanceof Error ? error.message : 'Unknown error',
      timestamp: new Date().toISOString()
    });
  }
}));

router.get('/traffic/route/:routeId/summary', asyncHandler(async (req, res) => {
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

    const summary = await externalAnalyticsService.getRouteTrafficSummary(routeId, days);
    res.json(summary);
  } catch (error) {
    console.error('Route traffic summary failed:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to get route traffic summary',
      message: error instanceof Error ? error.message : 'Unknown error'
    });
  }
}));

// General Analytics Endpoints
router.get('/route/:routeId/summary', asyncHandler(async (req, res) => {
  try {
    const routeId = parseInt(req.params.routeId);
    const days = parseInt(req.query.days as string) || 30;

    if (isNaN(routeId)) {
      res.status(400).json({
        success: false,
        error: 'Invalid route ID'
      });
      return;
    }

    const summary = await externalAnalyticsService.getRouteAnalyticsSummary(routeId, days);
    res.json(summary);
  } catch (error) {
    console.error('Route analytics summary failed:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to get route analytics summary',
      message: error instanceof Error ? error.message : 'Unknown error'
    });
  }
}));

router.get('/route/:routeId/predictions', asyncHandler(async (req, res) => {
  try {
    const routeId = parseInt(req.params.routeId);

    if (isNaN(routeId)) {
      res.status(400).json({
        success: false,
        error: 'Invalid route ID'
      });
      return;
    }

    const predictions = await externalAnalyticsService.getRoutePredictions(routeId);
    res.json(predictions);
  } catch (error) {
    console.error('Route predictions failed:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to get route predictions',
      message: error instanceof Error ? error.message : 'Unknown error'
    });
  }
}));

router.post('/query', asyncHandler(async (req, res) => {
  try {
    const { query, params } = req.body;

    if (!query) {
      res.status(400).json({
        success: false,
        error: 'Query is required'
      });
      return;
    }

    const result = await externalAnalyticsService.executeCustomQuery({ query, params: params || {} });
    res.json(result);
  } catch (error) {
    console.error('Custom query failed:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to execute custom query',
      message: error instanceof Error ? error.message : 'Unknown error'
    });
  }
}));

// Data Ingestion Endpoints
router.post('/data/traffic', asyncHandler(async (req, res) => {
  try {
    const { trafficData } = req.body;

    if (!trafficData || !Array.isArray(trafficData)) {
      res.status(400).json({
        success: false,
        error: 'trafficData array is required'
      });
      return;
    }

    const result = await externalAnalyticsService.ingestTrafficData(trafficData);
    res.json(result);
  } catch (error) {
    console.error('Traffic data ingestion failed:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to ingest traffic data',
      message: error instanceof Error ? error.message : 'Unknown error'
    });
  }
}));

router.get('/data/traffic', asyncHandler(async (req, res) => {
  try {
    const limit = parseInt(req.query.limit as string) || 100;
    const offset = parseInt(req.query.offset as string) || 0;

    const result = await externalAnalyticsService.getTrafficData(limit, offset);
    res.json(result);
  } catch (error) {
    console.error('Get traffic data failed:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to get traffic data',
      message: error instanceof Error ? error.message : 'Unknown error'
    });
  }
}));

// Daily Traffic Collection Endpoints
router.post('/admin/collect-daily-traffic', asyncHandler(async (req, res) => {
  try {
    const result = await dailyTrafficCollectionService.collectDailyTrafficData();
    res.json(result);
  } catch (error) {
    console.error('Daily traffic collection failed:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to collect daily traffic data',
      message: error instanceof Error ? error.message : 'Unknown error'
    });
  }
}));

router.get('/admin/collection-status', asyncHandler(async (req, res) => {
  try {
    const result = await dailyTrafficCollectionService.getCollectionStatus();
    res.json(result);
  } catch (error) {
    console.error('Failed to get collection status:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to get collection status',
      message: error instanceof Error ? error.message : 'Unknown error'
    });
  }
}));

// Admin Endpoints
router.post('/admin/process-weekly', asyncHandler(async (req, res) => {
  try {
    const weekOffset = 0; // Default to current week

    const result = await weeklyAnalyticsService.processWeeklyAnalytics(weekOffset);
    res.json(result);
  } catch (error) {
    console.error('Weekly processing failed:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to process weekly analytics',
      message: error instanceof Error ? error.message : 'Unknown error'
    });
  }
}));

router.post('/admin/process-weekly/:weekOffset', asyncHandler(async (req, res) => {
  try {
    const weekOffset = parseInt(req.params.weekOffset);

    if (isNaN(weekOffset)) {
      res.status(400).json({
        success: false,
        error: 'Invalid week offset'
      });
      return;
    }

    const result = await weeklyAnalyticsService.processWeeklyAnalytics(weekOffset);
    res.json(result);
  } catch (error) {
    console.error('Weekly processing failed:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to process weekly analytics',
      message: error instanceof Error ? error.message : 'Unknown error'
    });
  }
}));

router.get('/admin/metrics', asyncHandler(async (req, res) => {
  try {
    const metrics = await externalAnalyticsService.getSystemMetrics();
    res.json(metrics);
  } catch (error) {
    console.error('Get system metrics failed:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to get system metrics',
      message: error instanceof Error ? error.message : 'Unknown error'
    });
  }
}));

// Service Health Check
router.get('/health/overview', asyncHandler(async (req, res) => {
  try {
    const health = await externalAnalyticsService.getServiceHealth();
    res.json(health);
  } catch (error) {
    console.error('Health overview failed:', error);
    res.status(503).json({
      healthy: false,
      services: {
        analytics: false,
        questdb: false,
        traffic: false
      },
      error: 'Service health check failed'
    });
  }
}));

// Database-based Gemini Analysis Endpoint
router.get('/database-analysis/route/:routeId', asyncHandler(async (req, res) => {
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

    // Get AI insights directly from database
    const geminiInsights = await geminiService.analyzeTrafficDataFromDatabase(routeId, days);
    
    res.json({
      success: true,
      data: {
        routeId,
        days,
        geminiInsights,
        analysisType: 'database-based',
        generatedAt: new Date().toISOString()
      }
    });
  } catch (error) {
    console.error('Database-based analysis failed:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to analyze traffic data from database',
      message: error instanceof Error ? error.message : 'Unknown error'
    });
  }
}));

// Database-based Gemini Overview Endpoint
router.get('/database-analysis/overview', asyncHandler(async (req, res) => {
  try {
    const days = parseInt(req.query.days as string) || 7;

    const geminiInsights = await geminiService.analyzeOverviewFromDatabase(days);

    res.json({
      success: true,
      data: {
        days,
        geminiInsights,
        analysisType: 'database-overview',
        generatedAt: new Date().toISOString()
      }
    });
  } catch (error) {
    console.error('Database-based overview analysis failed:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to generate overview analytics from database',
      message: error instanceof Error ? error.message : 'Unknown error'
    });
  }
}));

// Free-form Manong Q&A Endpoint (grounded to database)
router.post('/ai/ask', asyncHandler(async (req, res) => {
  try {
    const { question, routeId, days } = req.body || {};

    if (!question || typeof question !== 'string' || question.trim().length < 3) {
      res.status(400).json({ success: false, error: 'A valid question is required' });
      return;
    }

    // Soft scope enforcement: refuse obviously out-of-domain topics client-side
    const lower = question.toLowerCase();
    const inScope = ['pasada', 'route', 'traffic', 'jeepney', 'fleet', 'driver', 'booking', 'malinta', 'novaliches', 'adrian', 'caloocan', 'monumento', 'sangandaan']
      .some(k => lower.includes(k));

    if (!inScope) {
      res.json({
        success: true,
        data: {
          geminiInsights: 'I can only help with Pasada analytics, fleet, routes, ride-hailing, or traffic advisory. Please ask about those topics.',
          analysisType: 'qa-refusal',
          generatedAt: new Date().toISOString()
        }
      });
      return;
    }

    const answer = await geminiService.answerQuestion({ question, routeId, days });

    res.json({
      success: true,
      data: {
        question,
        routeId: routeId ?? null,
        days: days ?? 7,
        geminiInsights: answer,
        analysisType: 'manong-qa',
        generatedAt: new Date().toISOString()
      }
    });
  } catch (error) {
    console.error('AI Q&A failed:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to answer question',
      message: error instanceof Error ? error.message : 'Unknown error'
    });
  }
}));

export default router;
