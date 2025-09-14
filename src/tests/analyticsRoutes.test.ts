import request from 'supertest';
import { app } from '../server';

// Mock the external analytics service
jest.mock('../services/externalAnalyticsService', () => {
  return {
    ExternalAnalyticsService: jest.fn().mockImplementation(() => ({
      checkHealth: jest.fn(),
      checkQuestDbStatus: jest.fn(),
      checkTrafficAnalyticsStatus: jest.fn(),
      runTrafficAnalytics: jest.fn(),
      getRouteTrafficSummary: jest.fn(),
      getRouteAnalyticsSummary: jest.fn(),
      getRoutePredictions: jest.fn(),
      executeCustomQuery: jest.fn(),
      ingestTrafficData: jest.fn(),
      getTrafficData: jest.fn(),
      processWeeklyAnalytics: jest.fn(),
      getSystemMetrics: jest.fn(),
      getServiceHealth: jest.fn(),
    })),
  };
});

describe('Analytics Routes', () => {
  let mockExternalAnalyticsService: any;

  beforeEach(() => {
    const { ExternalAnalyticsService } = require('../services/externalAnalyticsService');
    mockExternalAnalyticsService = new ExternalAnalyticsService();
    jest.clearAllMocks();
  });

  describe('GET /api/analytics/health', () => {
    it('should return health status', async () => {
      const mockHealth = {
        status: 'ok',
        timestamp: '2025-01-14T10:30:00Z',
        service: 'pasada-analytics-v2',
        version: '1.0.0',
      };

      mockExternalAnalyticsService.checkHealth.mockResolvedValue(mockHealth);

      const response = await request(app)
        .get('/api/analytics/health')
        .expect(200);

      expect(response.body).toEqual(mockHealth);
    });

    it('should handle health check failure', async () => {
      mockExternalAnalyticsService.checkHealth.mockRejectedValue(new Error('Service down'));

      const response = await request(app)
        .get('/api/analytics/health')
        .expect(503);

      expect(response.body.status).toBe('error');
      expect(response.body.message).toBe('Analytics service unavailable');
    });
  });

  describe('GET /api/analytics/status/questdb', () => {
    it('should return QuestDB status', async () => {
      const mockStatus = {
        status: 'connected',
        timestamp: '2025-01-14T10:30:00Z',
      };

      mockExternalAnalyticsService.checkQuestDbStatus.mockResolvedValue(mockStatus);

      const response = await request(app)
        .get('/api/analytics/status/questdb')
        .expect(200);

      expect(response.body).toEqual(mockStatus);
    });

    it('should handle QuestDB status check failure', async () => {
      mockExternalAnalyticsService.checkQuestDbStatus.mockRejectedValue(new Error('QuestDB unavailable'));

      const response = await request(app)
        .get('/api/analytics/status/questdb')
        .expect(503);

      expect(response.body.status).toBe('error');
      expect(response.body.message).toBe('QuestDB unavailable');
    });
  });

  describe('GET /api/analytics/traffic/status', () => {
    it('should return traffic analytics status', async () => {
      const mockStatus = {
        success: true,
        available: true,
        services: {
          supabase: true,
          googleMaps: true,
          questdb: true,
        },
        message: 'Traffic analytics service is ready',
      };

      mockExternalAnalyticsService.checkTrafficAnalyticsStatus.mockResolvedValue(mockStatus);

      const response = await request(app)
        .get('/api/analytics/traffic/status')
        .expect(200);

      expect(response.body).toEqual(mockStatus);
    });

    it('should handle traffic status check failure', async () => {
      mockExternalAnalyticsService.checkTrafficAnalyticsStatus.mockRejectedValue(new Error('Service unavailable'));

      const response = await request(app)
        .get('/api/analytics/traffic/status')
        .expect(503);

      expect(response.body.success).toBe(false);
      expect(response.body.available).toBe(false);
    });
  });

  describe('POST /api/analytics/traffic/run', () => {
    it('should run traffic analytics with default parameters', async () => {
      const mockResponse = {
        success: true,
        data: {
          success: true,
          routesAnalyzed: 15,
          forecastsGenerated: 12,
          message: 'Traffic analytics completed in 4523ms',
        },
        timestamp: '2025-01-14T10:30:00Z',
      };

      mockExternalAnalyticsService.runTrafficAnalytics.mockResolvedValue(mockResponse);

      const response = await request(app)
        .post('/api/analytics/traffic/run')
        .send({})
        .expect(200);

      expect(response.body).toEqual(mockResponse);
      expect(mockExternalAnalyticsService.runTrafficAnalytics).toHaveBeenCalledWith({
        routeIds: undefined,
        includeHistoricalAnalysis: true,
        generateForecasts: true,
      });
    });

    it('should run traffic analytics with custom parameters', async () => {
      const requestData = {
        routeIds: [1, 2, 3],
        includeHistoricalAnalysis: false,
        generateForecasts: true,
      };

      const mockResponse = {
        success: true,
        data: {
          success: true,
          routesAnalyzed: 3,
          forecastsGenerated: 3,
          message: 'Traffic analytics completed in 2000ms',
        },
        timestamp: '2025-01-14T10:30:00Z',
      };

      mockExternalAnalyticsService.runTrafficAnalytics.mockResolvedValue(mockResponse);

      const response = await request(app)
        .post('/api/analytics/traffic/run')
        .send(requestData)
        .expect(200);

      expect(response.body).toEqual(mockResponse);
      expect(mockExternalAnalyticsService.runTrafficAnalytics).toHaveBeenCalledWith(requestData);
    });
  });

  describe('GET /api/analytics/traffic/route/:routeId/summary', () => {
    it('should get route traffic summary with default days', async () => {
      const routeId = 123;
      const mockSummary = {
        success: true,
        data: {
          route_id: 123,
          route_name: 'Test Route',
          avg_traffic_density: 0.45,
          peak_traffic_density: 0.89,
          low_traffic_density: 0.12,
          avg_speed_kmh: 25.4,
          total_samples: 168,
        },
        metadata: {
          routeId: 123,
          days: 7,
          generatedAt: '2025-01-14T10:30:00Z',
        },
      };

      mockExternalAnalyticsService.getRouteTrafficSummary.mockResolvedValue(mockSummary);

      const response = await request(app)
        .get(`/api/analytics/traffic/route/${routeId}/summary`)
        .expect(200);

      expect(response.body).toEqual(mockSummary);
      expect(mockExternalAnalyticsService.getRouteTrafficSummary).toHaveBeenCalledWith(routeId, 7);
    });

    it('should get route traffic summary with custom days', async () => {
      const routeId = 123;
      const days = 30;

      const mockSummary = {
        success: true,
        data: {
          route_id: 123,
          route_name: 'Test Route',
          avg_traffic_density: 0.45,
          peak_traffic_density: 0.89,
          low_traffic_density: 0.12,
          avg_speed_kmh: 25.4,
          total_samples: 720,
        },
        metadata: {
          routeId: 123,
          days: 30,
          generatedAt: '2025-01-14T10:30:00Z',
        },
      };

      mockExternalAnalyticsService.getRouteTrafficSummary.mockResolvedValue(mockSummary);

      const response = await request(app)
        .get(`/api/analytics/traffic/route/${routeId}/summary?days=${days}`)
        .expect(200);

      expect(response.body).toEqual(mockSummary);
      expect(mockExternalAnalyticsService.getRouteTrafficSummary).toHaveBeenCalledWith(routeId, days);
    });

    it('should handle invalid route ID', async () => {
      const response = await request(app)
        .get('/api/analytics/traffic/route/invalid/summary')
        .expect(400);

      expect(response.body.success).toBe(false);
      expect(response.body.error).toBe('Invalid route ID');
    });
  });

  describe('GET /api/analytics/route/:routeId/summary', () => {
    it('should get general route analytics summary', async () => {
      const routeId = 123;
      const days = 30;

      const mockSummary = {
        success: true,
        data: {
          route_id: 123,
          overall_avg_density: 0.45,
          peak_density: 0.89,
          lowest_density: 0.12,
          avg_speed: 25.4,
          total_samples: 720,
        },
        metadata: {
          routeId: 123,
          days: 30,
          generatedAt: '2025-01-14T10:30:00Z',
        },
      };

      mockExternalAnalyticsService.getRouteAnalyticsSummary.mockResolvedValue(mockSummary);

      const response = await request(app)
        .get(`/api/analytics/route/${routeId}/summary?days=${days}`)
        .expect(200);

      expect(response.body).toEqual(mockSummary);
      expect(mockExternalAnalyticsService.getRouteAnalyticsSummary).toHaveBeenCalledWith(routeId, days);
    });
  });

  describe('GET /api/analytics/route/:routeId/predictions', () => {
    it('should get route predictions', async () => {
      const routeId = 123;

      const mockPredictions = {
        success: true,
        data: [
          {
            date: '2025-01-15T08:00:00Z',
            predictedDensity: 0.7,
            confidence: 0.85,
            timeOfDay: '08:00',
          },
          {
            date: '2025-01-15T17:00:00Z',
            predictedDensity: 0.9,
            confidence: 0.92,
            timeOfDay: '17:00',
          },
        ],
        metadata: {
          routeId: 123,
          predictionDays: 7,
          generatedAt: '2025-01-14T10:30:00Z',
        },
      };

      mockExternalAnalyticsService.getRoutePredictions.mockResolvedValue(mockPredictions);

      const response = await request(app)
        .get(`/api/analytics/route/${routeId}/predictions`)
        .expect(200);

      expect(response.body).toEqual(mockPredictions);
      expect(mockExternalAnalyticsService.getRoutePredictions).toHaveBeenCalledWith(routeId);
    });
  });

  describe('POST /api/analytics/query', () => {
    it('should execute custom query', async () => {
      const queryRequest = {
        query: 'SELECT route_id, avg(traffic_density) FROM route_traffic_analysis WHERE timestamp > ? GROUP BY route_id',
        params: { timestamp: '2025-01-01' },
      };

      const mockResponse = {
        success: true,
        data: [
          ['1', '0.45'],
          ['2', '0.52'],
        ],
        metadata: {
          executionTime: 156,
          rowCount: 2,
          generatedAt: '2025-01-14T10:30:00Z',
        },
      };

      mockExternalAnalyticsService.executeCustomQuery.mockResolvedValue(mockResponse);

      const response = await request(app)
        .post('/api/analytics/query')
        .send(queryRequest)
        .expect(200);

      expect(response.body).toEqual(mockResponse);
      expect(mockExternalAnalyticsService.executeCustomQuery).toHaveBeenCalledWith(queryRequest);
    });

    it('should handle missing query', async () => {
      const response = await request(app)
        .post('/api/analytics/query')
        .send({ params: {} })
        .expect(400);

      expect(response.body.success).toBe(false);
      expect(response.body.error).toBe('Query is required');
    });
  });

  describe('POST /api/analytics/data/traffic', () => {
    it('should ingest traffic data', async () => {
      const trafficData = [
        {
          timestamp: '2025-01-14T10:30:00Z',
          routeId: 123,
          trafficDensity: 0.75,
          duration: 600,
          durationInTraffic: 900,
          distance: 5000,
          status: 'active',
        },
      ];

      const mockResponse = {
        success: true,
        message: 'Successfully ingested 1 traffic records',
        timestamp: '2025-01-14T10:30:00Z',
      };

      mockExternalAnalyticsService.ingestTrafficData.mockResolvedValue(mockResponse);

      const response = await request(app)
        .post('/api/analytics/data/traffic')
        .send({ trafficData })
        .expect(200);

      expect(response.body).toEqual(mockResponse);
      expect(mockExternalAnalyticsService.ingestTrafficData).toHaveBeenCalledWith(trafficData);
    });

    it('should handle invalid traffic data', async () => {
      const response = await request(app)
        .post('/api/analytics/data/traffic')
        .send({ trafficData: 'invalid' })
        .expect(400);

      expect(response.body.success).toBe(false);
      expect(response.body.error).toBe('trafficData array is required');
    });
  });

  describe('GET /api/analytics/data/traffic', () => {
    it('should get traffic data with default parameters', async () => {
      const mockResponse = {
        success: true,
        data: [
          {
            timestamp: '2025-01-14T10:30:00Z',
            routeId: 123,
            trafficDensity: 0.75,
            duration: 600,
            durationInTraffic: 900,
            distance: 5000,
            status: 'active',
          },
        ],
        metadata: {
          limit: 100,
          offset: 0,
          total: 1500,
          generatedAt: '2025-01-14T10:30:00Z',
        },
      };

      mockExternalAnalyticsService.getTrafficData.mockResolvedValue(mockResponse);

      const response = await request(app)
        .get('/api/analytics/data/traffic')
        .expect(200);

      expect(response.body).toEqual(mockResponse);
      expect(mockExternalAnalyticsService.getTrafficData).toHaveBeenCalledWith(100, 0);
    });

    it('should get traffic data with custom parameters', async () => {
      const limit = 50;
      const offset = 100;

      const mockResponse = {
        success: true,
        data: [],
        metadata: {
          limit: 50,
          offset: 100,
          total: 1500,
          generatedAt: '2025-01-14T10:30:00Z',
        },
      };

      mockExternalAnalyticsService.getTrafficData.mockResolvedValue(mockResponse);

      const response = await request(app)
        .get(`/api/analytics/data/traffic?limit=${limit}&offset=${offset}`)
        .expect(200);

      expect(response.body).toEqual(mockResponse);
      expect(mockExternalAnalyticsService.getTrafficData).toHaveBeenCalledWith(limit, offset);
    });
  });

  describe('POST /api/analytics/admin/process-weekly', () => {
    it('should process weekly analytics without week offset', async () => {
      const mockResponse = {
        success: true,
        message: 'Weekly analytics processing completed',
        data: {
          weekOffset: 0,
          rowsProcessed: 250,
        },
        timestamp: '2025-01-14T10:30:00Z',
      };

      mockExternalAnalyticsService.processWeeklyAnalytics.mockResolvedValue(mockResponse);

      const response = await request(app)
        .post('/api/analytics/admin/process-weekly')
        .expect(200);

      expect(response.body).toEqual(mockResponse);
      expect(mockExternalAnalyticsService.processWeeklyAnalytics).toHaveBeenCalledWith(undefined);
    });

    it('should process weekly analytics with week offset', async () => {
      const weekOffset = 1;
      const mockResponse = {
        success: true,
        message: 'Weekly analytics processing completed',
        data: {
          weekOffset: 1,
          rowsProcessed: 250,
        },
        timestamp: '2025-01-14T10:30:00Z',
      };

      mockExternalAnalyticsService.processWeeklyAnalytics.mockResolvedValue(mockResponse);

      const response = await request(app)
        .post(`/api/analytics/admin/process-weekly/${weekOffset}`)
        .expect(200);

      expect(response.body).toEqual(mockResponse);
      expect(mockExternalAnalyticsService.processWeeklyAnalytics).toHaveBeenCalledWith(weekOffset);
    });

    it('should handle invalid week offset', async () => {
      const response = await request(app)
        .post('/api/analytics/admin/process-weekly/invalid')
        .expect(400);

      expect(response.body.success).toBe(false);
      expect(response.body.error).toBe('Invalid week offset');
    });
  });

  describe('GET /api/analytics/admin/metrics', () => {
    it('should get system metrics', async () => {
      const mockMetrics = {
        success: true,
        data: {
          totalRequests: 15430,
          avgResponseTime: 245,
          totalRoutes: 25,
          activeAnalytics: true,
          lastAnalyticsRun: '2025-01-14T10:00:00Z',
        },
        timestamp: '2025-01-14T10:30:00Z',
      };

      mockExternalAnalyticsService.getSystemMetrics.mockResolvedValue(mockMetrics);

      const response = await request(app)
        .get('/api/analytics/admin/metrics')
        .expect(200);

      expect(response.body).toEqual(mockMetrics);
    });
  });

  describe('GET /api/analytics/health/overview', () => {
    it('should get service health overview', async () => {
      const mockHealth = {
        healthy: true,
        services: {
          analytics: true,
          questdb: true,
          traffic: true,
        },
      };

      mockExternalAnalyticsService.getServiceHealth.mockResolvedValue(mockHealth);

      const response = await request(app)
        .get('/api/analytics/health/overview')
        .expect(200);

      expect(response.body).toEqual(mockHealth);
    });

    it('should handle health overview failure', async () => {
      mockExternalAnalyticsService.getServiceHealth.mockRejectedValue(new Error('Health check failed'));

      const response = await request(app)
        .get('/api/analytics/health/overview')
        .expect(503);

      expect(response.body.healthy).toBe(false);
      expect(response.body.error).toBe('Service health check failed');
    });
  });
});
