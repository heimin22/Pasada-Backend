import { Server } from "socket.io";
import { createServer } from "http";
import express, { Express, Request, Response } from "express";
import driverRoutes from "./routes/driverRoutes";
import tripRoutes from "./routes/tripRoutes";
import cors from "cors";
import dotenv from "dotenv";

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
