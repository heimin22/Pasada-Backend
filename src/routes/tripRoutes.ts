import express from "express";
import asyncHandler from "express-async-handler";
import {
  requestTrip,
  acceptTrip,
  driverArrived,
  startTrip,
  completeTrip,
  cancelTrip,
  getCurrentTrip,
  getTripDetails,
  getPassengerTripHistory,
  getDriverTripHistory,
} from '../controllers/tripController';
import { authenticate, driverMiddleware, passengerMiddleware } from '../middleware/authMiddleware';

const router = express.Router();

router.use(asyncHandler(authenticate as express.RequestHandler));

// Passenger routes
router.post('/request', asyncHandler(passengerMiddleware as express.RequestHandler), asyncHandler(requestTrip));
router.get('/current', asyncHandler(passengerMiddleware as express.RequestHandler), asyncHandler(getCurrentTrip));
router.post('/:tripId/cancel', asyncHandler(passengerMiddleware as express.RequestHandler), asyncHandler(cancelTrip));

// Driver routes
router.post('/:tripId/accept', asyncHandler(driverMiddleware as express.RequestHandler), asyncHandler(acceptTrip));
router.post('/:tripId/driver-arrived', asyncHandler(driverMiddleware as express.RequestHandler), asyncHandler(driverArrived));
router.post('/:tripId/start', asyncHandler(driverMiddleware as express.RequestHandler), asyncHandler(startTrip));
router.post('/:tripId/complete', asyncHandler(driverMiddleware as express.RequestHandler), asyncHandler(completeTrip));

// Potential additional routes 
router.get('/:tripId', asyncHandler(getTripDetails));
router.get('/history/passenger', asyncHandler(passengerMiddleware as express.RequestHandler), asyncHandler(getPassengerTripHistory)); 
router.get('/history/driver', asyncHandler(driverMiddleware as express.RequestHandler), asyncHandler(getDriverTripHistory)); 

export default router;

