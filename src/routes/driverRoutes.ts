import express from "express";
import { updateDriverLocation, updateDriverAvailability } from "../controllers/driverController"; 
import { authenticate, driverMiddleware } from "../middleware/authMiddleware"; 

const router = express.Router();

// middleware to check if the user is authenticated and a driver for the routes
router.use(authenticate as express.RequestHandler);
router.use(driverMiddleware as express.RequestHandler);

// update driver location
router.put("/location", updateDriverLocation as express.RequestHandler);

// update driver availability
router.put("/availability/:isAvailable", updateDriverAvailability as express.RequestHandler);

export default router;
