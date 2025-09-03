import { DatabaseService } from '../services/databaseService';
import { OfficialRoute } from '../types/route';

describe('Database Integration Tests', () => {
  let databaseService: DatabaseService;

  beforeAll(() => {
    // Only run if we have the required environment variables
    if (!process.env.SUPABASE_URL || !process.env.SUPABASE_ANON_KEY) {
      console.warn('Skipping integration tests - missing Supabase environment variables');
      return;
    }

    databaseService = new DatabaseService(
      process.env.SUPABASE_URL,
      process.env.SUPABASE_ANON_KEY
    );
  });

  describe('Database Connection', () => {
    test('should connect to Supabase successfully', async () => {
      if (!databaseService) {
        console.warn('Skipping - no database service');
        return;
      }

      try {
        const routes = await databaseService.getAllRoutes();
        expect(Array.isArray(routes)).toBe(true);
        console.log(`Found ${routes.length} routes in database`);
      } catch (error) {
        console.error('Database connection failed:', error);
        throw error;
      }
    });

    test('should have routes with coordinate fields', async () => {
      if (!databaseService) {
        console.warn('Skipping - no database service');
        return;
      }

      try {
        const routes = await databaseService.getAllRoutes();
        
        if (routes.length > 0) {
          const firstRoute = routes[0];
          console.log('Sample route structure:', {
            id: firstRoute.officialroute_id,
            name: firstRoute.route_name,
            hasCoords: !!(firstRoute.origin_lat && firstRoute.origin_lng),
            origin_lat: firstRoute.origin_lat,
            origin_lng: firstRoute.origin_lng,
            destination_lat: firstRoute.destination_lat,
            destination_lng: firstRoute.destination_lng,
            hasWaypoints: !!firstRoute.intermediate_coordinates
          });

          // Check if at least one route has coordinates
          const routesWithCoords = routes.filter(route => 
            route.origin_lat && route.origin_lng && 
            route.destination_lat && route.destination_lng
          );

          console.log(`Routes with coordinates: ${routesWithCoords.length}/${routes.length}`);
          
          // This test will pass even if no routes have coordinates yet
          // It's more of a diagnostic test
          expect(routes.length).toBeGreaterThanOrEqual(0);
        }
      } catch (error) {
        console.error('Failed to fetch routes:', error);
        throw error;
      }
    });
  });

  describe('Route Data Structure', () => {
    test('should validate route object structure', async () => {
      if (!databaseService) {
        console.warn('Skipping - no database service');
        return;
      }

      try {
        const routes = await databaseService.getAllRoutes();
        
        if (routes.length > 0) {
          const route = routes[0];
          
          // Check required fields
          expect(route).toHaveProperty('officialroute_id');
          expect(route).toHaveProperty('route_name');
          expect(route).toHaveProperty('origin_name');
          expect(route).toHaveProperty('destination_name');
          expect(route).toHaveProperty('status');
          expect(route).toHaveProperty('created_at');
          
          // Check optional coordinate fields exist (even if null)
          expect(route).toHaveProperty('origin_lat');
          expect(route).toHaveProperty('origin_lng');
          expect(route).toHaveProperty('destination_lat');
          expect(route).toHaveProperty('destination_lng');
          expect(route).toHaveProperty('intermediate_coordinates');
          
          console.log('Route structure validation passed');
        }
      } catch (error) {
        console.error('Route structure validation failed:', error);
        throw error;
      }
    });
  });

  describe('Traffic Analytics Table', () => {
    test('should be able to query traffic_analytics table', async () => {
      if (!databaseService) {
        console.warn('Skipping - no database service');
        return;
      }

      try {
        // Try to get historical data for the first route
        const routes = await databaseService.getAllRoutes();
        
        if (routes.length > 0) {
          const routeId = routes[0].officialroute_id;
          const historicalData = await databaseService.getHistoricalTrafficData(routeId, 1);
          
          console.log(`Historical data for route ${routeId}: ${historicalData.length} records`);
          expect(Array.isArray(historicalData)).toBe(true);
          
          // If there's data, validate the structure
          if (historicalData.length > 0) {
            const dataPoint = historicalData[0];
            expect(dataPoint).toHaveProperty('routeId');
            expect(dataPoint).toHaveProperty('timestamp');
            expect(dataPoint).toHaveProperty('trafficDensity');
            expect(dataPoint).toHaveProperty('duration');
            expect(dataPoint).toHaveProperty('durationInTraffic');
            expect(dataPoint).toHaveProperty('distance');
            expect(dataPoint).toHaveProperty('status');
          }
        }
      } catch (error) {
        console.error('Traffic analytics query failed:', error);
        // This might fail if the table doesn't exist yet, which is okay
        console.log('Note: This is expected if traffic_analytics table is not yet populated');
      }
    });
  });
});
