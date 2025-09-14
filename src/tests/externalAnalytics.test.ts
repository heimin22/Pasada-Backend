import request from 'supertest';
import { app } from '../server';

// Mock the external analytics service
jest.mock('../services/externalAnalyticsService', () => {
  return {
    ExternalAnalyticsService: jest.fn().mockImplementation(() => ({
      getServiceHealth: jest.fn(),
      checkTrafficAnalyticsStatus: jest.fn(),
      runTrafficAnalytics: jest.fn(),
      getRouteTrafficSummary: jest.fn(),
      getRoutePredictions: jest.fn(),
      isServiceAvailable: jest.fn(),
      ingestTrafficData: jest.fn(),
      getSystemMetrics: jest.fn(),
    })),
  };
});

describe('External Analytics Integration', () => {
  let mockExternalAnalyticsService: any;

  beforeEach(() => {
    const { ExternalAnalyticsService } = require('../services/externalAnalyticsService');
    mockExternalAnalyticsService = new ExternalAnalyticsService();
    jest.clearAllMocks();
  });

  describe('Health Endpoints', () => {
    it('should check external analytics health', async () => {
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
        .get('/api/analytics/external/health')
        .expect(200);

      expect(response.body).toEqual(mockHealth);
    });

    it('should handle external analytics health check failure', async () => {
      mockExternalAnalyticsService.getServiceHealth.mockRejectedValue(new Error('Service unavailable'));

      const response = await request(app)
        .get('/api/analytics/external/health')
        .expect(503);

      expect(response.body.healthy).toBe(false);
      expect(response.body.error).toBe('External analytics service unavailable');
    });

    it('should check traffic analytics status', async () => {
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
        .get('/api/analytics/external/traffic/status')
        .expect(200);

      expect(response.body).toEqual(mockStatus);
    });
  });

  describe('Traffic Analytics Endpoints', () => {
    it('should run traffic analytics', async () => {
      const mockRequest = {
        routeIds: [1, 2, 3],
        includeHistoricalAnalysis: true,
        generateForecasts: true,
      };

      const mockResponse = {
        success: true,
        data: {
          success: true,
          routesAnalyzed: 3,
          forecastsGenerated: 3,
          message: 'Traffic analytics completed in 4523ms',
        },
        timestamp: '2025-01-14T10:30:00Z',
      };

      mockExternalAnalyticsService.runTrafficAnalytics.mockResolvedValue(mockResponse);

      const response = await request(app)
        .post('/api/analytics/external/traffic/run')
        .send(mockRequest)
        .expect(200);

      expect(response.body).toEqual(mockResponse);
      expect(mockExternalAnalyticsService.runTrafficAnalytics).toHaveBeenCalledWith(mockRequest);
    });

    it('should get route traffic summary', async () => {
      const routeId = 123;
      const days = 7;

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
        .get(`/api/analytics/external/route/${routeId}/traffic-summary?days=${days}`)
        .expect(200);

      expect(response.body).toEqual(mockSummary);
      expect(mockExternalAnalyticsService.getRouteTrafficSummary).toHaveBeenCalledWith(routeId, days);
    });

    it('should handle invalid route ID', async () => {
      const response = await request(app)
        .get('/api/analytics/external/route/invalid/traffic-summary')
        .expect(400);

      expect(response.body.success).toBe(false);
      expect(response.body.error).toBe('Invalid route ID');
    });

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
        ],
        metadata: {
          routeId: 123,
          predictionDays: 7,
          generatedAt: '2025-01-14T10:30:00Z',
        },
      };

      mockExternalAnalyticsService.getRoutePredictions.mockResolvedValue(mockPredictions);

      const response = await request(app)
        .get(`/api/analytics/external/route/${routeId}/predictions`)
        .expect(200);

      expect(response.body).toEqual(mockPredictions);
      expect(mockExternalAnalyticsService.getRoutePredictions).toHaveBeenCalledWith(routeId);
    });
  });

  describe('Data Ingestion Endpoints', () => {
    it('should ingest traffic data', async () => {
      const mockTrafficData = [
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
        .post('/api/analytics/external/data/traffic')
        .send({ trafficData: mockTrafficData })
        .expect(200);

      expect(response.body).toEqual(mockResponse);
      expect(mockExternalAnalyticsService.ingestTrafficData).toHaveBeenCalledWith(mockTrafficData);
    });

    it('should handle invalid traffic data', async () => {
      const response = await request(app)
        .post('/api/analytics/external/data/traffic')
        .send({ trafficData: 'invalid' })
        .expect(400);

      expect(response.body.success).toBe(false);
      expect(response.body.error).toBe('trafficData array is required');
    });
  });

  describe('Admin Endpoints', () => {
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
        .get('/api/analytics/external/admin/metrics')
        .expect(200);

      expect(response.body).toEqual(mockMetrics);
    });
  });

  describe('Hybrid Analytics', () => {
    it('should return hybrid analytics when external service is available', async () => {
      const routeId = 123;

      // Mock external service availability
      mockExternalAnalyticsService.isServiceAvailable.mockResolvedValue(true);

      // Mock external service responses
      const mockExternalSummary = {
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

      const mockExternalPredictions = {
        success: true,
        data: [
          {
            date: '2025-01-15T08:00:00Z',
            predictedDensity: 0.7,
            confidence: 0.85,
            timeOfDay: '08:00',
          },
        ],
        metadata: {
          routeId: 123,
          predictionDays: 7,
          generatedAt: '2025-01-14T10:30:00Z',
        },
      };

      mockExternalAnalyticsService.getRouteTrafficSummary.mockResolvedValue(mockExternalSummary);
      mockExternalAnalyticsService.getRoutePredictions.mockResolvedValue(mockExternalPredictions);

      const response = await request(app)
        .get(`/api/analytics/hybrid/route/${routeId}`)
        .expect(200);

      expect(response.body.source).toBe('hybrid');
      expect(response.body.external).toBeDefined();
      expect(response.body.local).toBeDefined();
      expect(response.body.metadata.externalAvailable).toBe(true);
    });

    it('should fallback to local analytics when external service is unavailable', async () => {
      const routeId = 123;

      // Mock external service unavailability
      mockExternalAnalyticsService.isServiceAvailable.mockResolvedValue(false);

      const response = await request(app)
        .get(`/api/analytics/hybrid/route/${routeId}`)
        .expect(200);

      expect(response.body.source).toBe('local');
      expect(response.body.data).toBeDefined();
      expect(response.body.metadata.externalAvailable).toBe(false);
    });

    it('should handle external service errors gracefully', async () => {
      const routeId = 123;

      // Mock external service availability but then error
      mockExternalAnalyticsService.isServiceAvailable.mockResolvedValue(true);
      mockExternalAnalyticsService.getRouteTrafficSummary.mockRejectedValue(new Error('External service error'));

      const response = await request(app)
        .get(`/api/analytics/hybrid/route/${routeId}`)
        .expect(200);

      expect(response.body.source).toBe('local');
      expect(response.body.metadata.externalAvailable).toBe(false);
      expect(response.body.metadata.fallbackReason).toBe('External service error');
    });
  });

  describe('Error Handling', () => {
    it('should handle service unavailable errors', async () => {
      mockExternalAnalyticsService.checkTrafficAnalyticsStatus.mockRejectedValue(new Error('Service unavailable'));

      const response = await request(app)
        .get('/api/analytics/external/traffic/status')
        .expect(503);

      expect(response.body.success).toBe(false);
      expect(response.body.available).toBe(false);
    });

    it('should handle network timeouts', async () => {
      mockExternalAnalyticsService.runTrafficAnalytics.mockRejectedValue(new Error('Request timeout'));

      const response = await request(app)
        .post('/api/analytics/external/traffic/run')
        .send({ routeIds: [1, 2, 3] })
        .expect(500);

      expect(response.body.success).toBe(false);
      expect(response.body.error).toBe('Failed to run traffic analytics');
    });
  });
});
