import express, { Express, Request, Response } from "express";
import driverRoutes from "./routes/driverRoutes";
import tripRoutes from "./routes/tripRoutes";
import cors from "cors";
import dotenv from "dotenv";
import axios from "axios"; 
import { setupRealtimeSubscriptions } from "./utils/realtimeSubscriptions";
import { createClient } from "@supabase/supabase-js";
import asyncHandler from "express-async-handler";
import { authenticate, passengerMiddleware, driverMiddleware } from "./middleware/authMiddleware";
import { requestTrip, getTripDetails, getDriverDetails } from "./controllers/tripController";
import { updateDriverAvailability, updateDriverLocation } from "./controllers/driverController";

dotenv.config();

console.log("This is the Pasada Backend Server");
const app: Express = express();
const portEnv = process.env.PORT;
const port = portEnv ? parseInt(portEnv, 10) : 8080;
const supabase = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_ANON_KEY!);
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

app.post('/api/route-traffic', async (req, res) => {
  try {
    const { routeId } = req.body;
    const { data: routeData, error } = await supabase
      .from('official_routes')
      .select('origin_lat, origin_lng, destination_lat, destination_lng, intermediate_coordinates')
      .eq('officialroute_id', routeId)
      .single();


    if (error || !routeData) {
      res.status(404).json({ error: 'Route not found or incomplete coordinates' });
      return;
    }

    const {
      origin_lat,
      origin_lng,
      destination_lat,
      destination_lng,
      intermediate_coordinates
    } = routeData;

    let waypoints = '';
    if (Array.isArray(intermediate_coordinates) && intermediate_coordinates.length) {
      waypoints = intermediate_coordinates
        .map((coord: { lat: number; lng: number }) => `via:${coord.lat},${coord.lng}`)
        .join('|');
    }

    const params = new URLSearchParams({
      origin: `${origin_lat},${origin_lng}`,
      destination: `${destination_lat},${destination_lng}`,
      departure_time: 'now',
      traffic_model: 'best_guess',
      key: GOOGLE_MAPS_API_KEY!
    });

    if (waypoints) {
      params.append('waypoints', waypoints);
    }

    const url = `https://maps.googleapis.com/maps/api/directions/json?${params.toString()}`;
    const apiRes = await axios.get(url);

    if (apiRes.data.status !== 'OK') {
      const msg = apiRes.data.error_message || apiRes.data.status;
      console.error('Google Directions error:', msg);
      res.status(500).json({ error: 'Failed to fetch route traffic' });
      return;
    }

    const leg = apiRes.data.routes[0].legs[0];
    const duration = leg.duration.text;
    const durationInTraffic = leg.duration_in_traffic?.text || duration;

    // Return simplified traffic info
    res.json({ routeId, duration, durationInTraffic });
  } catch (err: any) { 
    console.error('Error fetching route traffic:', err);
    res.status(500).json({ error: err.message || err.toString() });
  }
});

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


