import express from "express";
import { updateDriverLocation, updateDriverAvailability } from "../controllers/driverController.ts"; // import the controller functions from driverController.ts
import { authenticate, driverMiddleware } from "../middleware/authMiddleware.ts"; // import the middleware functions from authMiddleware.ts

const router = express.Router();

// middleware to check if the user is authenticated and a driver for the routes
router.use(authenticate as express.RequestHandler);
router.use(driverMiddleware as express.RequestHandler);

// update driver location
router.put("/api/drivers/me/location", updateDriverLocation as express.RequestHandler);

// update driver availability
router.put("/api/drivers/me/availability/:isAvailable", updateDriverAvailability as express.RequestHandler);

export default router;
