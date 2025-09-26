import express, { Express, Request, Response } from "express";
import driverRoutes from "./routes/driverRoutes";
import tripRoutes from "./routes/tripRoutes";
import cors from "cors";
import dotenv from "dotenv";
import axios from "axios"; 
import rateLimit from "express-rate-limit";
import helmet from "helmet";
import { setupRealtimeSubscriptions } from "./utils/realtimeSubscriptions";
import { createClient } from "@supabase/supabase-js";
import asyncHandler from "express-async-handler";
import { authenticate, passengerMiddleware, driverMiddleware } from "./middleware/authMiddleware";
import { requestTrip, getTripDetails, getDriverDetails } from "./controllers/tripController";
import { updateDriverAvailability, updateDriverLocation } from "./controllers/driverController";
import { getRouteTraffic } from "./controllers/routeController";
import { DatabaseService } from "./services/databaseService";
import { GoogleMapsService } from "./services/googleMapsService";
import { GeminiService } from "./services/geminiService";
import { AnalyticsService } from "./services/analyticsService";
import { ExternalAnalyticsService } from "./services/externalAnalyticsService";
import { BookingsAnalyticsService } from "./services/bookingsAnalyticsService";
import { MigrationService } from "./services/migrationService";
import { AnalyticsController } from "./controllers/analyticsController";
import { BookingsAnalyticsController } from "./controllers/bookingsAnalyticsController";
import { analyticsTrackingMiddleware, routeTrafficAnalyticsMiddleware, analyticsErrorHandler } from "./middleware/analyticsMiddleware";
import analyticsRoutes from "./routes/analyticsRoutes";
import migrationRoutes from "./routes/migrationRoutes";

dotenv.config();

console.log("This is the Pasada Backend Server");
const app: Express = express();
const portEnv = process.env.PORT;
const port = portEnv ? parseInt(portEnv, 10) : 8080;
const GOOGLE_MAPS_API_KEY = process.env.GOOGLE_MAPS_API_KEY;
if (!GOOGLE_MAPS_API_KEY) {
  console.error('Missing GOOGLE_MAPS_API_KEY environment variable');
  process.exit(1);
}

// Check if port is a valid number
if (isNaN(port)) {
  console.error(`Invalid PORT environment variable: ${portEnv}`);
  process.exit(1);
}

// Set up Supabase Realtime subscriptions
setupRealtimeSubscriptions();

// Middleware
app.use(helmet());
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Rate Limiting
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 100,
  message: "Too many requests, please try again later.",
});
app.use(limiter);

// Analytics tracking middleware - must be before routes
app.use(analyticsTrackingMiddleware);

// REST endpoints
app.use("/api/drivers", driverRoutes);
app.use("/api/trips", tripRoutes);
app.use("/api/analytics", analyticsRoutes);
app.use("/api/admin/migration", migrationRoutes);

// Initialize services
const databaseService = new DatabaseService(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_ANON_KEY!
);
const googleMapsService = new GoogleMapsService(GOOGLE_MAPS_API_KEY);
const geminiService = new GeminiService(process.env.GEMINI_API_KEY!, databaseService);
const analyticsService = new AnalyticsService(databaseService, geminiService, googleMapsService);
const externalAnalyticsService = new ExternalAnalyticsService(process.env.ANALYTICS_API_URL);
const bookingsAnalyticsService = new BookingsAnalyticsService(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  process.env.QUESTDB_HTTP
);
const analyticsController = new AnalyticsController(analyticsService, externalAnalyticsService);
const bookingsAnalyticsController = new BookingsAnalyticsController(bookingsAnalyticsService, geminiService);

// Analytics endpoints
app.get('/api/analytics/routes/:routeId', asyncHandler(analyticsController.getRouteAnalytics.bind(analyticsController)));
app.get('/api/analytics/routes', asyncHandler(analyticsController.getAllRoutesAnalytics.bind(analyticsController)));
app.get('/api/analytics/summaries', asyncHandler(analyticsController.getConciseSummaries.bind(analyticsController)));
app.post('/api/analytics/refresh', asyncHandler(analyticsController.refreshTrafficData.bind(analyticsController)));

// External Analytics Integration Endpoints
app.get('/api/analytics/external/health', asyncHandler(analyticsController.getExternalAnalyticsHealth.bind(analyticsController)));
app.get('/api/analytics/external/traffic/status', asyncHandler(analyticsController.getTrafficAnalyticsStatus.bind(analyticsController)));
app.post('/api/analytics/external/traffic/run', asyncHandler(analyticsController.runTrafficAnalytics.bind(analyticsController)));
app.get('/api/analytics/external/route/:routeId/traffic-summary', asyncHandler(analyticsController.getExternalRouteTrafficSummary.bind(analyticsController)));
app.get('/api/analytics/external/route/:routeId/predictions', asyncHandler(analyticsController.getExternalRoutePredictions.bind(analyticsController)));
app.get('/api/analytics/hybrid/route/:routeId', asyncHandler(analyticsController.getHybridRouteAnalytics.bind(analyticsController)));
app.post('/api/analytics/external/data/traffic', asyncHandler(analyticsController.ingestTrafficData.bind(analyticsController)));
app.get('/api/analytics/external/admin/metrics', asyncHandler(analyticsController.getExternalSystemMetrics.bind(analyticsController)));

// Booking Frequency Analytics Endpoints
app.get('/api/analytics/bookings/frequency', asyncHandler(bookingsAnalyticsController.getBookingFrequency.bind(bookingsAnalyticsController)));
app.post('/api/analytics/bookings/frequency/persist/daily', asyncHandler(bookingsAnalyticsController.persistDailyCounts.bind(bookingsAnalyticsController)));
app.post('/api/analytics/bookings/frequency/persist/forecast', asyncHandler(bookingsAnalyticsController.persistForecast.bind(bookingsAnalyticsController)));
app.get('/api/analytics/bookings/frequency/daily', asyncHandler(bookingsAnalyticsController.getDailyCounts.bind(bookingsAnalyticsController)));
app.get('/api/analytics/bookings/frequency/forecast/latest', asyncHandler(bookingsAnalyticsController.getLatestForecast.bind(bookingsAnalyticsController)));

app.post(
  "/api/bookings/assign-driver",
  asyncHandler(authenticate as express.RequestHandler),
  asyncHandler(passengerMiddleware as express.RequestHandler),
  asyncHandler(requestTrip)
);

app.post(
  "/api/drivers/update-availability",
  asyncHandler(authenticate as express.RequestHandler),
  asyncHandler(driverMiddleware as express.RequestHandler),
  asyncHandler(updateDriverAvailability)
);

app.post(
  "/api/drivers/update-driver-location",
  asyncHandler(authenticate as express.RequestHandler),
  asyncHandler(driverMiddleware as express.RequestHandler),
  asyncHandler(updateDriverLocation)
);

app.post(
  '/api/route-traffic',
  routeTrafficAnalyticsMiddleware,
  asyncHandler(getRouteTraffic)
);

// Analytics error handling middleware
app.use(analyticsErrorHandler);

// Error handling middleware
app.use(
  (err: Error, _req: Request, res: Response, _next: express.NextFunction) => {
    console.error(err.stack);
    res.status(500).send("Something broke!");
  }
);

app.get("/", (_req: Request, res: Response) => {
  res.send("Pasada Backend API is running");
});

app.get("/api/test", (_req: Request, res: Response) => {
  res.json({ 
    message: "Connection successful!", 
    timestamp: new Date().toISOString() 
  });
});

app.get("/api/health", (_req: Request, res: Response) => {
  res.status(200).json({ status: "healthy", timestamp: new Date().toISOString() });
});

// Public status endpoints for frontend
app.get("/api/status/questdb", asyncHandler(async (req: Request, res: Response) => {
  try {
    const migrationService = new MigrationService(
      process.env.SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
      process.env.QUESTDB_HTTP
    );
    
    const status = await migrationService.getQuestDBStatus();
    
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
}));

app.get("/api/test/trips", (_req: Request, res: Response) => {
  res.json({ 
    message: "This is a test endpoint that doesn't require authentication",
    timestamp: new Date().toISOString() 
  });
});

app.get("/api/test-endpoint", (_req: Request, res: Response) => {
  res.json({ message: "Test endpoint is working" });
});

app.get("/api/bookings/test", (_req: Request, res: Response) => {
  res.json({ message: "Bookings path is accessible" });
});

app.get(
  "/api/bookings/:tripId",
  asyncHandler(authenticate as express.RequestHandler),
  asyncHandler(getTripDetails)
);

app.get(
  "/api/drivers/:driverId",
  asyncHandler(authenticate as express.RequestHandler),
  asyncHandler(getDriverDetails)
);

// Listen on all network interfaces
app.listen(port, '0.0.0.0', () => {
  console.log(`Server listening on 0.0.0.0:${port}`);
});

export { app };


