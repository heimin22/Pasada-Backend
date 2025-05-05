import express, { Express, Request, Response } from "express";
import driverRoutes from "./routes/driverRoutes";
import tripRoutes from "./routes/tripRoutes";
import cors from "cors";
import dotenv from "dotenv";
import { setupRealtimeSubscriptions } from "./utils/realtimeSubscriptions";

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

app.get("/health", (_req: Request, res: Response) => {
  res.status(200).json({ status: "healthy", timestamp: new Date().toISOString() });
});

app.get("/api/test/trips", (_req: Request, res: Response) => {
  res.json({ 
    message: "This is a test endpoint that doesn't require authentication",
    timestamp: new Date().toISOString() 
  });
});

// Listen on all network interfaces
app.listen(port, '0.0.0.0', () => {
  console.log(`Server listening on 0.0.0.0:${port}`);
});

export { app };
