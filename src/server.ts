import { Server } from "socket.io";
import { createServer } from "http";
import express, { Express, Request, Response } from "express";
import driverRoutes from "./routes/driverRoutes.ts";
import tripRoutes from "./routes/tripRoutes.ts";
import cors from "cors";
import dotenv from "dotenv";
import process from "node:process";

// import passengerRoutes from "./routes/passengerRoutes";
dotenv.config();
console.log("This is the Pasada Backend Server");
const app: Express = express();
const httpServer = createServer(app);
const io = new Server(httpServer, {
  cors: {
    origin: process.env.FRONTEND_URL || '*',
    methods: ["GET", "POST"],
  },
})

const port = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

io.on('connection', (socket) => {
  console.log('Client connected: ', socket.id);

  socket.on('join_trip', (tripId) => {
    socket.join(`trip_${tripId}`);
    console.log(`Client ${socket.id} joined trip ${tripId}`);
  });

  socket.on('leave_trip', (tripId) => {
    socket.leave(`trip_${tripId}`);
    console.log(`Client ${socket.id} left trip ${tripId}`);
  });

  socket.on('disconnect', () => {
    console.log('Client disconnected: ', socket.id);
  });
});

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

httpServer.listen(port, () => {
  console.log(`Server is running on port ${port}`);
});

app.get("/", (_req: Request, res: Response) => {
  res.send("Pasada Backend API is running");
});
app.use("/api/drivers", driverRoutes);
app.use("/api/trips", tripRoutes);
// app.use("/api/passengers", passengerRoutes);
app.use(
  (err: Error, _req: Request, res: Response, _next: express.NextFunction) => {
    console.error(err.stack);
    res.status(500).send("Something broke!");
  }
);
app.listen(port, () => {
  console.log(`Server is running on port ${port}`);
});

export { app, io };