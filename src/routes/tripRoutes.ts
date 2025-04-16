// import express from 'express';
// import asyncHandler from 'express-async-handler';
// import {
//     requestTrip,
//     acceptTrip,
//     driverArrived,
//     startTrip,
//     completeTrip,
//     cancelTrip,
//     getCurrentTrip,
// } from '../controllers/tripController';
// import { authenticate, driverMiddleware, passengerMiddleware } from '../middleware/authMiddleware';

// const router = express.Router();

// // apply authentication globally to all routes
// router.use(authenticate as express.RequestHandler);

// // POST /api/trips/request
// router.post('/request', passengerMiddleware, asyncHandler(requestTrip));

// // GET /api/trips/current
// router.get('/current', passengerMiddleware, asyncHandler(getCurrentTrip));

// // POST /api/trips/accept/:bookingId
// router.post('/:bookingId/accept', driverMiddleware, asyncHandler(acceptTrip));

// // POST /api/trips/driver-arrived/:bookingId
// router.post('/:bookingId/driver-arrived', driverMiddleware, asyncHandler(driverArrived));

// // POST /api/trips/start/:bookingId
// router.post('/:bookingId/start', passengerMiddleware, asyncHandler(startTrip));

// // POST /api/trips/complete/:bookingId
// router.post('/:bookingId/complete', passengerMiddleware, asyncHandler(completeTrip));

// // POST /api/trips/cancel/:bookingId
// router.post('/:bookingId/cancel', passengerMiddleware, asyncHandler(cancelTrip));

// export default router;
