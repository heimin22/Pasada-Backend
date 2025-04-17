// import express from 'express';
// import asyncHandler from 'express-async-handler';
// import {
//   requestTrip,
//   acceptTrip,
//   driverArrived,
//   startTrip,
//   completeTrip,
//   cancelTrip,
//   getCurrentTrip,
// } from '../controllers/tripController';
// import { authenticate, driverMiddleware, passengerMiddleware } from '../middleware/authMiddleware';

// const router = express.Router();

// // apply authentication globally to all routes
// router.use(authenticate);

// router.post('/request', passengerMiddleware, asyncHandler(requestTrip));
// router.get('/current', passengerMiddleware, asyncHandler(getCurrentTrip));
// router.post('/:bookingId/accept', driverMiddleware, asyncHandler(acceptTrip));
// router.post('/:bookingId/driver-arrived', driverMiddleware, asyncHandler(driverArrived));
// router.post('/:bookingId/start', passengerMiddleware, asyncHandler(startTrip));
// router.post('/:bookingId/complete', passengerMiddleware, asyncHandler(completeTrip));
// router.post('/:bookingId/cancel', passengerMiddleware, asyncHandler(cancelTrip));

// export default router;

