import request from 'supertest';
import { app } from '../server';

describe('Analytics Integration Tests', () => {
  describe('Health Endpoints', () => {
    it('should respond to health check endpoints', async () => {
      // Test that the endpoints exist and respond (even if they fail due to external service)
      const healthResponse = await request(app)
        .get('/api/analytics/health')
        .expect(200);

      expect(healthResponse.body).toBeDefined();
    });

    it('should respond to external health check', async () => {
      const response = await request(app)
        .get('/api/analytics/external/health')
        .expect(200);

      expect(response.body).toBeDefined();
    });

    it('should respond to traffic status check', async () => {
      const response = await request(app)
        .get('/api/analytics/external/traffic/status')
        .expect(200);

      expect(response.body).toBeDefined();
    });
  });

  describe('Route Analytics Endpoints', () => {
    it('should handle route traffic summary requests', async () => {
      const response = await request(app)
        .get('/api/analytics/external/route/1/traffic-summary?days=7')
        .expect(200);

      expect(response.body).toBeDefined();
    });

    it('should handle route predictions requests', async () => {
      const response = await request(app)
        .get('/api/analytics/external/route/1/predictions')
        .expect(200);

      expect(response.body).toBeDefined();
    });

    it('should handle hybrid analytics requests', async () => {
      const response = await request(app)
        .get('/api/analytics/hybrid/route/1')
        .expect(200);

      expect(response.body).toBeDefined();
    });
  });

  describe('Data Ingestion Endpoints', () => {
    it('should handle traffic data ingestion', async () => {
      const trafficData = [
        {
          timestamp: new Date().toISOString(),
          routeId: 1,
          trafficDensity: 0.75,
          duration: 600,
          durationInTraffic: 900,
          distance: 5000,
          status: 'active'
        }
      ];

      const response = await request(app)
        .post('/api/analytics/external/data/traffic')
        .send({ trafficData })
        .expect(200);

      expect(response.body).toBeDefined();
    });
  });

  describe('Admin Endpoints', () => {
    it('should handle system metrics requests', async () => {
      const response = await request(app)
        .get('/api/analytics/external/admin/metrics')
        .expect(200);

      expect(response.body).toBeDefined();
    });
  });

  describe('Error Handling', () => {
    it('should handle invalid route IDs gracefully', async () => {
      const response = await request(app)
        .get('/api/analytics/external/route/invalid/traffic-summary')
        .expect(400);

      expect(response.body.success).toBe(false);
      expect(response.body.error).toBe('Invalid route ID');
    });

    it('should handle missing traffic data gracefully', async () => {
      const response = await request(app)
        .post('/api/analytics/external/data/traffic')
        .send({ trafficData: 'invalid' })
        .expect(400);

      expect(response.body.success).toBe(false);
      expect(response.body.error).toBe('trafficData array is required');
    });
  });

  describe('Existing Analytics Endpoints', () => {
    it('should still work with existing analytics endpoints', async () => {
      const response = await request(app)
        .get('/api/analytics/routes')
        .expect(200);

      expect(response.body).toBeDefined();
    });

    it('should handle route analytics requests', async () => {
      const response = await request(app)
        .get('/api/analytics/routes/1')
        .expect(200);

      expect(response.body).toBeDefined();
    });
  });
});
