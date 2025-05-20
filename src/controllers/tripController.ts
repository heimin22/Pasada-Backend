import { Request, Response } from "express";
import { supabase, supabaseAdmin } from "../utils/supabaseClient";
// import admin from "firebase-admin";
// import { getMessaging } from "firebase-admin/messaging";

/*
if (!admin.apps.length) {
  admin.initializeApp({
    credential: admin.credential.cert({
      projectId:   process.env.FIREBASE_PROJECT_ID,
      clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
      privateKey:  process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, "\n"),
    }),
  });
}
*/

const SEARCH_RADIUS_METERS = 1000;
const MAX_DRIVERS_TO_FIND = 32;
export const requestTrip = async (
  req: Request,
  res: Response
): Promise<void> => {
  const {
    origin_latitude,
    origin_longitude,
    pickup_address,
    destination_latitude,
    destination_longitude,
    dropoff_address,
    route_trip,
    fare,
    payment_method,
  } = req.body;

  // Debug: log incoming request payload
  console.log('requestTrip payload:', JSON.stringify(req.body));

  const passengerUserId = req.user?.id;
  if (!passengerUserId) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }
  const missingFields: string[] = [];
  if (typeof origin_latitude !== 'number') missingFields.push('origin_latitude');
  if (typeof origin_longitude !== 'number') missingFields.push('origin_longitude');
  if (typeof destination_latitude !== 'number') missingFields.push('destination_latitude');
  if (typeof destination_longitude !== 'number') missingFields.push('destination_longitude');
  if (!pickup_address) missingFields.push('pickup_address');
  if (!dropoff_address) missingFields.push('dropoff_address');
  if (typeof route_trip !== 'number' && typeof route_trip !== 'string') missingFields.push('route_trip');
  if (typeof fare !== 'number') missingFields.push('fare');
  if (!payment_method) missingFields.push('payment_method');
  if (missingFields.length > 0) {
    res.status(400).json({ error: 'Missing required fields', missingFields });
    return;
  }
  try {
    const pickupLng = origin_longitude;
    const pickupLat = origin_latitude;
    // find nearby drivers via Postgres RPC
    const routeTripId = typeof route_trip === 'string' ? parseInt(route_trip, 10) : route_trip;
    const { data: drivers, error: searchError } = await supabase.rpc(
      "find_available_drivers_for_route",
      {
        passenger_lon: pickupLng,
        passenger_lat: pickupLat,
        search_radius_m: SEARCH_RADIUS_METERS,
        max_drivers: MAX_DRIVERS_TO_FIND,
        p_route_id: routeTripId
      }
    );
    if (searchError) {
      console.error("Error finding drivers:", searchError);
      res.status(500).json({ error: "Error finding drivers" });
      return;
    }
    if (!drivers || drivers.length === 0) {
      res.status(404).json({ error: "No drivers found" });
      return;
    }
    // create a trip request
    const { data: newBooking, error: bookingError } = await supabase
      .from("bookings")
      .insert({
        passenger_id: passengerUserId,
        ride_status: "accepted",
        pickup_lat: origin_latitude,
        pickup_lng: origin_longitude,
        pickup_address: pickup_address,
        dropoff_lat: destination_latitude,
        dropoff_lng: destination_longitude,
        dropoff_address: dropoff_address,
        fare: fare,
        payment_method: payment_method,
        created_at: new Date().toISOString(),
        route_id: routeTripId,
      })
      .select()
      .single();
    if (bookingError) {
      console.error("Error creating trip request:", bookingError);
      res.status(500).json({ error: "Error creating trip request" });
      return;
    }
    // automatically assign the closest driver
    const assignedDriver = drivers[0];
    const { data: updatedBooking, error: assignmentError } = await supabaseAdmin
      .from("bookings")
      .update({
        driver_id: assignedDriver.driver_id,
        ride_status: "accepted",
        assigned_at: new Date().toISOString(),
      })
      .eq("booking_id", newBooking.booking_id)
      .select()
      .single();
    if (assignmentError || !updatedBooking) {
      console.error("Error assigning driver to booking:", assignmentError);
      res.status(500).json({ error: "Error assigning driver" });
      return;
    }
    // update driver status to unavailable
    const { error: driverStatusError } = await supabaseAdmin
      .from("driverTable")
      .update({
        driving_status: "Driving",
        last_online: new Date().toISOString(),
      })
      .eq("driver_id", assignedDriver.driver_id);
    if (driverStatusError) {
      console.error("Error updating driver status:", driverStatusError);
    }
    // respond with booking details and assigned driver
    res.status(201).json({
      message: "Trip requested and driver assigned successfully",
      booking: updatedBooking,
      driver: assignedDriver,
    });
  } catch (error) {
    console.error("Error requesting trip:", error);
    res.status(500).json({ error: "Error requesting trip" });
    return;
  }
};
export const acceptTrip = async (
  req: Request,
  res: Response
): Promise<void> => {
  const bookingId = req.body.booking_id;
  const driverUserId = req.user?.id;
  if (!driverUserId) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }
  if (!bookingId || typeof bookingId !== "string") {
    res.status(400).json({ error: "Missing booking ID" });
    return;
  }
  try {
    // transaction to ensure atomicity
    const { data: acceptedBookingData, error: rpcError } = await supabase.rpc(
      "accept_bookings",
      {
        booking_id_to_accept: bookingId,
        driver_id_to_accept: driverUserId,
      }
    );
    if (rpcError) {
      console.error("Error accepting trip:", rpcError);
      // check error message for specific reasons
      if (
        rpcError.message.includes("Booking not found") ||
        rpcError.message.includes("Booking already accepted")
      ) {
        res.status(409).json({
          message: "Trip could not be accepted (already accepted or not found)",
        });
        return;
      }
      res.status(500).json({ error: "Error accepting trip" });
      return;
    }
    const acceptedBooking = acceptedBookingData?.[0];
    if (!acceptedBooking) {
      res.status(409).json({ error: "Booking not found" });
      return;
    }
    // update the booking status and assign the driver to the booking
    const { data: updatedBooking, error: updateError } = await supabase
      .from("bookings")
      .update({
        ride_status: "accepted",
        driver_id: driverUserId,
      })
      .eq("booking_id", bookingId)
      .eq("ride_status", "accepted")
      .select()
      .single();
    if (updateError || !updatedBooking) {
      console.error("Error updating booking:", updateError);
      res.status(409).json({
        error: "Trip could not be accepted (already accepted or not found)",
      });
      return;
    }
    // set the driver status to unavailable
    const { error: driverStatusError } = await supabaseAdmin
      .from("driverTable")
      .update({
        driving_status: "Driving",
        last_online: new Date().toISOString()
      })
      .eq("driver_id", driverUserId);
    if (driverStatusError) {
      console.error("Error updating driver status:", driverStatusError);
      res.status(500).json({ error: "Error finalizing trip acceptance" });
      return;
    }
    res
      .status(200)
      .json({ message: "Trip accepted successfully", booking: updatedBooking });
  } catch (error) {
    console.error("Error accepting trip:", error);
    res.status(500).json({ error: "Error accepting trip" });
    return;
  }
};
export const getBookingStatus = async (
  req: Request,
  res: Response
): Promise<void> => {
  const { tripId } = req.params;
  const bookingId = parseInt(tripId, 10);
  if (isNaN(bookingId)) {
    res.status(400).json({ error: "Invalid trip ID" });
    return;
  }
  const userId = req.user?.id;
  if (!userId) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }

  try {
    const { data: booking, error } = await supabase
      .from("bookings")
      .select("*, passenger_id, driver_id")
      .eq("booking_id", bookingId)
      .single();

    if (error || !booking) {
      console.error("Error fetching booking status:", error);
      res.status(404).json({ error: "Booking not found" });
      return;
    }
    if (booking.passenger_id !== userId && booking.driver_id !== userId) {
      res.status(403).json({ error: "Unauthorized to view booking status" });
      return;
    }

    res.status(200).json({
      id: booking.booking_id,
      ride_status: booking.ride_status,
      driver_id: booking.driver_id,
      // Include other relevant fields
    });
  } catch (error) {
    console.error("Error getting booking status:", error);
    res.status(500).json({ error: "Error getting booking status" });
    return;
  }
};
export const getDriverDetails = async (
  req: Request,
  res: Response
): Promise<void> => {
  const { driverId } = req.params;
  const userId = req.user?.id;

  if (!userId) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }

  try {
    // First check if this user has a booking with this driver
    const { data: booking, error: bookingError } = await supabase
      .from("bookings")
      .select("booking_id")
      .eq("passenger_id", userId)
      .eq("driver_id", driverId)
      .maybeSingle();

    // Allow if user is the driver or has a booking with this driver
    if ((bookingError || !booking) && userId !== driverId) {
      res
        .status(403)
        .json({ error: "Unauthorized to view this driver's details" });
      return;
    }

    const { data: driver, error } = await supabase
      .from("driverTable")
      .select(
        `
        driver_id,
        first_name,
        last_name,
        phone_number,
        profile_picture,
        vehicle:vehicle_id (
          model,
          plate_number,
          color,
          passenger_capacity
        )
      `
      )
      .eq("driver_id", driverId)
      .single();

    if (error || !driver) {
      console.error("Error fetching driver details:", error);
      res.status(404).json({ error: "Driver not found" });
      return;
    }

    res.status(200).json({
      id: driver.driver_id,
      name: `${driver.first_name} ${driver.last_name}`,
      phone_number: driver.phone_number,
      profile_picture: driver.profile_picture,
      vehicle: driver.vehicle,
    });
  } catch (error) {
    console.error("Error fetching driver details:", error);
    res.status(500).json({ error: "Error fetching driver details" });
  }
};
// simplified controllers for other states
// driver arrived at the pickup location
export const driverArrived = async (
  req: Request,
  res: Response
): Promise<void> => {
  const { tripId: bookingId } = req.params;
  const driverUserId = req.user?.id;
  if (!driverUserId) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }
  if (!bookingId || typeof bookingId !== "string") {
    res.status(400).json({ error: "Missing booking ID" });
    return;
  }
  try {
    const { data: updatedBooking, error } = await supabase
      .from("bookings")
      .update({
        ride_status: "ongoing",
      })
      .eq("booking_id", bookingId)
      .eq("driver_id", driverUserId)
      .eq("ride_status", "assigned")
      .select()
      .single();
    if (error || !updatedBooking) {
      console.error("Error updating booking:", error);
      res
        .status(400)
        .json({ error: "Error updating booking status to driver_arrived" });
      return;
    }
    if (!updatedBooking) {
      res.status(404).json({ error: "Booking not found or not accepted" });
      return;
    }
    res.status(200).json({
      message: "Driver arrived at pickup location",
      booking: updatedBooking,
    });
  } catch (error) {
    console.error("Error updating booking status to driver_arrived:", error);
    res.status(500).json({ error: "An unexpected error occured." });
    return;
  }
};
// start of the trip
export const startTrip = async (req: Request, res: Response): Promise<void> => {
  const { tripId: bookingId } = req.params;
  const userId = req.user?.id;
  if (!userId) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }
  if (!bookingId || typeof bookingId !== "string") {
    res.status(400).json({ error: "Missing booking ID" });
    return;
  }
  try {
    // find the trip first to ensure the user is part of it
    const { data: bookingData, error: bookingError } = await supabase
      .from("bookings")
      .select("passenger_id, driver_id, ride_status")
      .eq("booking_id", bookingId)
      .maybeSingle();
    if (bookingError) {
      console.error("Error fetching booking:", bookingError);
      res.status(500).json({ error: "Error fetching trip details" });
      return;
    }
    if (!bookingData) {
      res.status(404).json({ error: "Booking not found" });
      return;
    }
    if (
      bookingData.passenger_id !== userId &&
      bookingData.driver_id !== userId
    ) {
      res
        .status(403)
        .json({ error: "Forbidden: You are not part of this trip." });
      return;
    }
    // check if the booking is in a valid state to start
    if (!["assigned", "ongoing"].includes(bookingData.ride_status)) {
      res
        .status(409)
        .json({ error: "Trip cannot be started in its current state." });
      return;
    }
    // update the booking to ongoing
    const { data: updatedBooking, error: updateError } = await supabase
      .from("bookings")
      .update({
        ride_status: "ongoing",
        started_at: new Date().toISOString(),
      })
      .eq("booking_id", bookingId)
      .in("ride_status", ["assigned", "ongoing"])
      .select()
      .single();
    if (updateError || !updatedBooking) {
      console.error("Error updating booking:", updateError);
      res.status(400).json({ error: "Error starting trip" });
      return;
    }
    res
      .status(200)
      .json({ message: "Trip started successfully", booking: updatedBooking });
  } catch (error) {
    console.error("Error starting trip:", error);
    res.status(500).json({ error: "An unexpected error occured." });
    return;
  }
};
// get the current trip
export const getCurrentTrip = async (
  req: Request,
  res: Response
): Promise<void> => {
  const userId = req.user?.id;
  if (!userId) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }
  try {
    const { data: booking, error } = await supabase
      .from("bookings")
      .select(
        "*, driverTable: driver_id ( first_name, last_name, driver_id, vehicle_id ), passenger: id ( id ) "
      )
      .or(`id.eq.${userId},driver_id.eq.${userId}`)
      .in("ride_status", ["assigned", "ongoing"])
      .order("created_at", { ascending: false })
      .maybeSingle();
    if (error) {
      console.error("Error fetching booking:", error);
      res.status(500).json({ error: "Error fetching trip details" });
      return;
    }
    if (!booking) {
      res.status(404).json({ message: "No active trip found" });
      return;
    }
    // fetch the driver's current location if the user is a passenger
    if (booking.id === userId && booking.driver_id) {
      const { data: driverLocation, error: locationError } = await supabase
        .from("driverTable")
        .select("current_location")
        .eq("driver_id", booking.driver_id)
        .single();
      if (!locationError && driverLocation) {
        booking.driver_location = driverLocation.current_location;
        console.log("Driver location fetched:", booking.driver_location);
      } else {
        console.error("Error fetching driver location:", locationError);
      }
    }
    res.status(200).json({ booking });
    return;
  } catch (error) {
    console.error("Error fetching current trip:", error);
    res.status(500).json({ error: "An unexpected error occured." });
    return;
  }
};
// end of the trip
export const completeTrip = async (
  req: Request,
  res: Response
): Promise<void> => {
  const { tripId: bookingId } = req.params;
  const driverUserId = req.user?.id;
  if (!driverUserId) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }
  if (!bookingId || typeof bookingId !== "string") {
    res.status(400).json({ error: "Missing booking ID" });
    return;
  }
  try {
    // update booking
    const { data: bookingData, error: bookingError } = await supabase
      .from("bookings")
      .update({
        ride_status: "completed",
        completed_at: new Date().toISOString(),
      })
      .eq("booking_id", bookingId)
      .eq("driver_id", driverUserId)
      .eq("ride_status", "ongoing")
      .select()
      .single();
    if (bookingError || !bookingData) {
      console.error("Error updating booking:", bookingError);
      res.status(400).json({ error: "Error completing trip" });
      return;
    }
    // make the driver available again after the trip
    const { error: driverStatusError } = await supabaseAdmin
      .from("driverTable")
      .update({
        driving_status: "Offline",
        last_online: new Date().toISOString()
      })
      .eq("driver_id", driverUserId);
    if (driverStatusError) {
      console.error(
        "Error updating driver status post-trip:",
        driverStatusError
      );
    }
    res
      .status(200)
      .json({ message: "Trip completed successfully", booking: bookingData });
  } catch (error) {
    console.error("Error completing trip:", error);
    res.status(500).json({ error: "An unexpected error occured." });
    return;
  }
};
// cancelling the trip
export const cancelTrip = async (
  req: Request,
  res: Response
): Promise<void> => {
  const { tripId: bookingId } = req.params;
  const userId = req.user?.id;
  const { reason } = req.body;
  // Debug log cancellation invocation
  console.log(`cancelTrip invoked: bookingId=${bookingId}, userId=${userId}, reason=${reason}`);
  if (!userId) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }
  if (!bookingId || typeof bookingId !== "string") {
    res.status(400).json({ error: "Missing booking ID" });
    return;
  }
  try {
    const { data: booking, error: fetchError } = await supabase
      .from("bookings")
      .select("ride_status, passenger_id, driver_id, id")
      .eq("booking_id", bookingId)
      .maybeSingle();
    if (fetchError || !booking) {
      console.error("Error fetching booking for cancellation:", fetchError);
      res
        .status(404)
        .json({ error: "Booking not found or error fetching details." });
      return;
    }
    // Authorization check: Ensure the user is either the passenger or the assigned driver
    if (booking.passenger_id !== userId && booking.driver_id !== userId) {
      res
        .status(403)
        .json({ error: "Forbidden: You cannot cancel this trip." });
      return;
    }
    // Check if the trip is already in a final state
    const cancellableStates = [
      "accepted",
      "ongoing",
    ];
    if (!cancellableStates.includes(booking.ride_status)) {
      res
        .status(409)
        .json({ error: "Trip is not cancellable in its current state." });
      return;
    }
    // Proceed with cancellation
    const { data: cancelledBooking, error: cancellationError } = await supabase
      .from("bookings")
      .update({
        ride_status: "cancelled",
        cancelled_at: new Date().toISOString(),
        cancellation_reason: reason,
      })
      .eq("booking_id", bookingId)
      .in("ride_status", cancellableStates) // Only cancel if in cancellable state
      .select()
      .single();
    if (cancellationError || !cancelledBooking) {
      console.error("Error updating booking to cancelled:", cancellationError);
      res.status(400).json({ error: "Error cancelling trip" });
      return;
    }
    // If a driver was assigned, set their status back to available
    if (cancelledBooking.driver_id) {
      const { error: driverStatusError } = await supabaseAdmin
        .from("driverTable")
        .update({ driving_status: "Offline" })
        .eq("driver_id", cancelledBooking.driver_id);
      if (driverStatusError) {
        // Log this error but don't fail the cancellation for the user
        console.error(
          "Error updating driver status to available after cancellation:",
          driverStatusError
        );
      }
    }
    res.status(200).json({
      message: "Trip cancelled successfully",
      booking: cancelledBooking,
    });
  } catch (error) {
    console.error("Error cancelling trip:", error);
    res.status(500).json({ error: "An unexpected error occured." });
    return;
  }
};
export const getTripDetails = async (
  req: Request,
  res: Response
): Promise<void> => {
  const { tripId } = req.params;
  const userId = req.user?.id;
  if (!userId) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }
  if (!tripId || typeof tripId !== "string") {
    res.status(400).json({ error: "Missing trip ID" });
    return;
  }
  try {
    const { data: trip, error } = await supabase
      .from("bookings")
      .select("*")
      .eq("booking_id", tripId)
      .or(`passenger_id.eq.${userId},driver_id.eq.${userId}`)
      .maybeSingle();
    if (error || !trip) {
      console.error("Error fetching trip details:", error);
      res.status(404).json({ error: "Trip not found or unauthorized." });
      return;
    }
    res.status(200).json({ trip });
    return;
  } catch (error) {
    console.error("Error fetching trip details:", error);
    res.status(500).json({ error: "An unexpected error occured." });
    return;
  }
};
export const getPassengerTripHistory = async (
  req: Request,
  res: Response
): Promise<void> => {
  const passengerId = req.user?.id;
  if (!passengerId) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }
  try {
    const { data: history, error } = await supabase
      .from("bookings")
      .select("*")
      .eq("passenger_id", passengerId)
      .order("created_at", { ascending: false });
    if (error) {
      console.error(
        "Erorr fetching trip history for passenger ${passengerId}:",
        error
      );
      res.status(500).json({ error: "Error fetching trip history" });
      return;
    }
    res.status(200).json(history || []);
  } catch (error) {
    console.error("Error fetching trip history for passenger:", error);
    res.status(500).json({ error: "An unexpected error occured. " });
    return;
  }
};
export const getDriverTripHistory = async (
  req: Request,
  res: Response
): Promise<void> => {
  const driverId = req.user?.id;
  if (!driverId) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }
  try {
    const { data: history, error } = await supabase
      .from("bookings")
      .select("*")
      .eq("driver_id", driverId)
      .order("created_at", { ascending: false });
    if (error) {
      console.error(
        "Error fetching trip history for driver ${driver_id}:",
        error
      );
      res.status(500).json({ error: "Error fetching trip history" });
      return;
    }
    res.status(200).json(history || []);
  } catch (error) {
    console.error("Error fetching trip history for driver", error);
    res.status(500).json({ error: "Internal server error" });
  }
};

/*
const sendDriverNotifications = async (drivers: any[], booking: any) => {
  try {
    // Get driver IDs
    const driverIds = drivers.map((driver) => driver.driver_id);

    // Get FCM tokens for these drivers
    const { data: tokenData, error: tokenError } = await supabase
      .from("push_tokens")
      .select("user_id, token")
      .in("user_id", driverIds);

    if (tokenError) {
      console.error("Error fetching driver FCM tokens:", tokenError);
      return;
    }

    // Create a map of driver IDs to tokens
    const tokenMap = tokenData.reduce(
      (map: { [key: string]: string }, item: any) => {
        map[item.user_id] = item.token;
        return map;
      },
      {}
    );

    // Prepare and send notifications
    const messaging = getMessaging();
    const notificationPromises = drivers.map((driver) => {
      const token = tokenMap[driver.driver_id];
      if (!token) return Promise.resolve(); // Skip if no token

      return messaging.send({
        token,
        notification: {
          title: "New Trip Request",
          body: `New trip request from ${booking.origin_address} to ${booking.destination_address}`,
        },
        data: {
          booking_id: booking.booking_id.toString(),
          type: "new_trip_request",
          origin: booking.origin_address,
          destination: booking.destination_address,
          fare: booking.fare.toString(),
        },
        android: {
          priority: "high",
        },
      });
    });

    await Promise.all(notificationPromises);
    console.log(`Notifications sent to ${drivers.length} drivers`);
  } catch (error) {
    console.error("Error sending driver notifications:", error);
  }
};
*/

/*
// Helper to notify passenger when no drivers are found
const sendPassengerNoDriversNotification = async (
  userId: string,
  bookingId: string | number
) => {
  try {
    const { data: tokenData, error: tokenError } = await supabase
      .from("push_tokens")
      .select("token")
      .eq("user_id", userId)
      .maybeSingle();
    if (tokenError || !tokenData) {
      console.error("Error fetching passenger FCM token:", tokenError);
      return;
    }
    const token = tokenData.token;
    const messaging = getMessaging();
    await messaging.send({
      token,
      notification: {
        title: "No Drivers Available",
        body: "Sorry, there are no available drivers for your trip request right now.",
      },
      data: {
        booking_id: bookingId.toString(),
        type: "no_drivers_found",
      },
      android: {
        priority: "high",
      },
    });
  } catch (error) {
    console.error("Error sending passenger notification:", error);
  }
};
*/