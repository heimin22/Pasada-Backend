import express from "express";
import asyncHandler from "express-async-handler";
import {
  requestTrip, 
  startTrip, 
  completeTrip, 
  getCurrentTrip, 
  cancelTrip, 
  getTripDetails, 
  getPassengerTripHistory, 
  getDriverDetails
} from '../controllers/tripController';
import { authenticate, driverMiddleware, passengerMiddleware } from '../middleware/authMiddleware';

const router = express.Router();

router.use(asyncHandler(authenticate as express.RequestHandler));

// Passenger routes
router.post('/request', asyncHandler(passengerMiddleware as express.RequestHandler), asyncHandler(requestTrip));
router.get('/current', asyncHandler(passengerMiddleware as express.RequestHandler), asyncHandler(getCurrentTrip));
router.post('/:tripId/cancel', asyncHandler(passengerMiddleware as express.RequestHandler), asyncHandler(cancelTrip));

// Driver routes
router.post('/:tripId/start', asyncHandler(driverMiddleware as express.RequestHandler), asyncHandler(startTrip));
router.post('/:tripId/complete', asyncHandler(driverMiddleware as express.RequestHandler), asyncHandler(completeTrip));

// Potential additional routes 
router.get('/:tripId', asyncHandler(getTripDetails));
router.get('/history/passenger', asyncHandler(passengerMiddleware as express.RequestHandler), asyncHandler(getPassengerTripHistory)); 
router.get('/driver/:driverId', asyncHandler(getDriverDetails));

export default router;

