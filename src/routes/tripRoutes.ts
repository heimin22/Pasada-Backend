import express, { Request, Response, NextFunction } from 'express';
import asyncHandler from 'express-async-handler';
import {
  requestTrip,
  acceptTrip,
  driverArrived,
  startTrip,
  completeTrip,
  cancelTrip,
  getCurrentTrip,
} from '../controllers/tripController';
import { authenticate, driverMiddleware, passengerMiddleware } from '../middleware/authMiddleware';

const router = express.Router();

router.use(asyncHandler(authenticate as any));

// Passenger routes
router.post('/request', asyncHandler(passengerMiddleware as any), asyncHandler(requestTrip));
router.get('/current', asyncHandler(passengerMiddleware as any), asyncHandler(getCurrentTrip));
router.post('/:tripId/cancel', asyncHandler(passengerMiddleware as any), asyncHandler(cancelTrip));

// Driver routes
router.post('/:tripId/accept', asyncHandler(driverMiddleware as any), asyncHandler(acceptTrip));
router.post('/:tripId/driver-arrived', asyncHandler(driverMiddleware as any), asyncHandler(driverArrived));
router.post('/:tripId/start', asyncHandler(driverMiddleware as any), asyncHandler(startTrip));
router.post('/:tripId/complete', asyncHandler(driverMiddleware as any), asyncHandler(completeTrip));

// Potential additional routes 
router.get('/:tripId', asyncHandler(getTripDetails));
router.get('/history/passenger', asyncHandler(passengerMiddleware as any), asyncHandler(getPassengerTripHistory)); 
router.get('/history/driver', asyncHandler(driverMiddleware as any), asyncHandler(getDriverTripHistory)); 

export default router;

