import express, { Express, Request, Response } from "express";
import driverRoutes from "./routes/driverRoutes";
import tripRoutes from "./routes/tripRoutes";
import cors from "cors";
import dotenv from "dotenv";
import { setupRealtimeSubscriptions } from "./utils/realtimeSubscriptions";
import asyncHandler from "express-async-handler";
import { authenticate, passengerMiddleware, driverMiddleware } from "./middleware/authMiddleware";
import { requestTrip, getTripDetails, getDriverDetails } from "./controllers/tripController";
import { updateDriverAvailability, updateDriverLocation } from "./controllers/driverController";

dotenv.config();
console.log("This is the Pasada Backend Server");
const app: Express = express();
const portEnv = process.env.PORT;
const port = portEnv ? parseInt(portEnv, 10) : 8080;

// Check if port is a valid number
if (isNaN(port)) {
  console.error(`Invalid PORT environment variable: ${portEnv}`);
  process.exit(1);
}

// Set up Supabase Realtime subscriptions
setupRealtimeSubscriptions();

app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// REST endpoints
app.use("/api/drivers", driverRoutes);
app.use("/api/trips", tripRoutes);

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

// Driver details endpoint for Flutter client
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
