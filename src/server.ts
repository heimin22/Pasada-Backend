import express, { Express, Request, Response } from "express";
import driverRoutes from "./routes/driverRoutes";
import tripRoutes from "./routes/tripRoutes";
import cors from "cors";
import dotenv from "dotenv";
import { setupRealtimeSubscriptions } from "./utils/realtimeSubscriptions";

dotenv.config();
console.log("This is the Pasada Backend Server");
const app: Express = express();
const port = process.env.PORT || 3000;

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

app.listen(port, () => {
  console.log(`Server is running on port ${port}`);
});

export { app };
