import { Request, Response, NextFunction } from "express";
import { RealTimeAnalyticsService } from "../services/realTimeAnalyticsService";
import { DatabaseService } from "../services/databaseService";
import { GoogleMapsService } from "../services/googleMapsService";

// Initialize analytics services for middleware
const databaseService = new DatabaseService(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_ANON_KEY!
);
const googleMapsService = new GoogleMapsService(process.env.GOOGLE_MAPS_API_KEY!);
const realTimeAnalyticsService = new RealTimeAnalyticsService(databaseService, googleMapsService);

// Extend Request interface to include start time for response time calculation
declare global {
  namespace Express {
    interface Request {
      startTime?: number;
    }
  }
}

/**
 * Middleware to track route usage and API analytics
 * Logs route-related API calls with timing and user information
 */
export const analyticsTrackingMiddleware = (
  req: Request,
  res: Response,
  next: NextFunction
): void => {
  // Start timing for response time calculation
  req.startTime = Date.now();

  // Extract route ID from various possible locations
  const routeId = extractRouteId(req);
  
  // Only track route-related endpoints
  if (!routeId || !isRouteRelatedEndpoint(req.path)) {
    return next();
  }

  // Get user information from auth middleware
  const userId = req.user?.id;
  const userType = determineUserType(req.path);

  // Override res.end to capture response data
  const originalEnd = res.end;
  
  // Override with proper typing using type assertion
  res.end = (function(chunk?: any, encoding?: any, cb?: any): Response {
    const responseTime = req.startTime ? Date.now() - req.startTime : 0;
    
    // Asynchronously log analytics data (don't wait for it)
    setImmediate(async () => {
      try {
        await realTimeAnalyticsService.processRouteUsage(
          routeId,
          req.path,
          req.method,
          userId,
          userType,
          responseTime,
          res.statusCode
        );
      } catch (error) {
        console.error('Error logging route usage analytics:', error);
      }
    });

    // Call the original end method
    return originalEnd.call(res, chunk, encoding, cb);
  } as any);

  next();
};

/**
 * Extract route ID from request parameters, body, or query
 */
function extractRouteId(req: Request): number | null {
  // Check URL parameters first
  if (req.params.routeId) {
    const routeId = parseInt(req.params.routeId, 10);
    if (!isNaN(routeId)) return routeId;
  }

  // Check request body
  if (req.body?.routeId) {
    const routeId = parseInt(req.body.routeId, 10);
    if (!isNaN(routeId)) return routeId;
  }

  if (req.body?.route_trip) {
    const routeId = parseInt(req.body.route_trip, 10);
    if (!isNaN(routeId)) return routeId;
  }

  if (req.body?.route_id) {
    const routeId = parseInt(req.body.route_id, 10);
    if (!isNaN(routeId)) return routeId;
  }

  // Check query parameters
  if (req.query.routeId) {
    const routeId = parseInt(req.query.routeId as string, 10);
    if (!isNaN(routeId)) return routeId;
  }

  return null;
}

/**
 * Determine if the endpoint is route-related
 */
function isRouteRelatedEndpoint(path: string): boolean {
  const routeEndpoints = [
    '/api/analytics/routes',
    '/api/trips',
    '/api/routes',
    '/api/route-traffic'
  ];

  return routeEndpoints.some(endpoint => path.startsWith(endpoint));
}

/**
 * Determine user type based on endpoint
 */
function determineUserType(path: string): 'passenger' | 'driver' | 'admin' | undefined {
  if (path.includes('/analytics')) return 'admin';
  if (path.includes('/driver')) return 'driver';
  if (path.includes('/trips')) return 'passenger'; // Could be either, but passengers initiate trips
  return undefined;
}

/**
 * Middleware specifically for route traffic analytics
 * Tracks when route traffic data is requested
 */
export const routeTrafficAnalyticsMiddleware = (
  req: Request,
  res: Response,
  next: NextFunction
): void => {
  const startTime = Date.now();
  
  // Override res.json to capture when route traffic data is sent
  const originalJson = res.json;
  res.json = function(body: any) {
    const responseTime = Date.now() - startTime;
    
    // If this is a successful route traffic response, log it
    if (res.statusCode === 200 && body.routeId) {
      setImmediate(async () => {
        try {
          await realTimeAnalyticsService.processRouteUsage(
            body.routeId,
            '/api/route-traffic',
            req.method,
            req.user?.id,
            'passenger', // Traffic requests typically come from passengers
            responseTime,
            res.statusCode
          );
        } catch (error) {
          console.error('Error logging route traffic analytics:', error);
        }
      });
    }

    return originalJson.call(this, body);
  };

  next();
};

/**
 * Express error handler for analytics middleware
 * Ensures analytics errors don't break the main application
 */
export const analyticsErrorHandler = (
  error: Error,
  req: Request,
  res: Response,
  next: NextFunction
): void => {
  console.error('Analytics middleware error:', error);
  // Continue with the request even if analytics fails
  next();
};
