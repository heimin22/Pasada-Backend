import { Request, Response } from "express";
import { supabase, supabaseAdmin } from "../utils/supabaseClient";
// import admin from "firebase-admin/app";
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
const SEARCH_TIMEOUT_MS = 60000; // 1 minute timeout
/**
 * KEEP: Core function for requesting a new trip
 * Handles passenger trip requests, finds nearby drivers, and assigns the closest one
 */
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
    // Create a trip request with "requested" status first
    const routeTripId = typeof route_trip === 'number' ? route_trip : parseInt(route_trip, 10);
    const { data: newBooking, error: bookingError } = await supabaseAdmin
      .from("bookings")
      .insert({
        passenger_id: passengerUserId,
        ride_status: "requested",
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
    
    // Now search for drivers with proper timeout
    const pickupLng = origin_longitude;
    const pickupLat = origin_latitude;
    
    // Define the search function that we'll race against a timeout
    const findDrivers = async () => {
      const radiusMultipliers = [1, 2, 3, 4];
      let drivers;
      let searchError;
      let usedRadius = SEARCH_RADIUS_METERS;
      
      for (const multiplier of radiusMultipliers) {
        const radius = SEARCH_RADIUS_METERS * multiplier;
        console.log(`Searching for drivers within ${radius}m`);
        
        // search purely by passenger location, ignoring route
        const result = await supabase.rpc("find_available_drivers_for_route", {
          max_drivers: MAX_DRIVERS_TO_FIND,
          passenger_lat: pickupLat,
          passenger_lon: pickupLng,
          p_route_id: routeTripId,
          search_radius_m: radius,
        });
        
        drivers = result.data;
        searchError = result.error;
        console.log(`Found ${drivers?.length || 0} drivers`);
        
        if (searchError) {
          console.error("Error finding drivers:", searchError);
          throw searchError;
        }
        
        if (drivers && drivers.length > 0) {
          usedRadius = radius;
          return { drivers, usedRadius };
        }
      }
      
      // If we get here, no drivers were found
      return { drivers: null, usedRadius };
    };
    
    // Create a timeout promise
    const timeout = new Promise((_, reject) => {
      setTimeout(() => {
        reject(new Error('Driver search timed out after 1 minute'));
      }, SEARCH_TIMEOUT_MS);
    });
    
    // Race the search against the timeout
    try {
      const { drivers, usedRadius } = await Promise.race([
        findDrivers(),
        timeout
      ]) as { drivers: any[] | null, usedRadius: number };
      
      // If we get here, the search completed before the timeout
      if (!drivers || drivers.length === 0) {
        console.log("No drivers found, performing diagnostics");
        // Count total registered drivers
        const { data: totalDrivers, error: totalDriversError } = await supabaseAdmin
          .from("driverTable")
          .select("driver_id");
        const totalDriversCount = Array.isArray(totalDrivers) ? totalDrivers.length : 0;
        if (totalDriversError) {
          console.error("Error fetching total drivers count:", totalDriversError);
        }
        // Count busy drivers with accepted or ongoing trips
        const { data: busyBookings, error: busyError } = await supabaseAdmin
          .from("bookings")
          .select("driver_id")
          .in("ride_status", ["accepted", "ongoing"]);
        if (busyError) {
          console.error("Error fetching busy bookings:", busyError);
        }
        const busyDriverIds = Array.isArray(busyBookings)
          ? busyBookings.map((b) => b.driver_id)
          : [];
        const uniqueBusyDriversCount = new Set(busyDriverIds).size;
        // Compute available drivers
        const availableDriversCount = totalDriversCount - uniqueBusyDriversCount;
        // Determine reason why no driver was found
        let reason = "";
        if (totalDriversCount === 0) {
          reason = "No registered drivers in the system";
        } else if (availableDriversCount === 0) {
          reason = "All drivers are currently busy";
        } else {
          reason = "Drivers available, but none within the search radius for the specified route";
        }
        res.status(404).json({
          error: "No drivers found",
          reason,
          stats: {
            totalDrivers: totalDriversCount,
            busyDrivers: uniqueBusyDriversCount,
            availableDrivers: availableDriversCount,
          },
          booking: newBooking
        });
        return;
      }
      
      // Found a driver - update booking to "accepted" status
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
        res.status(500).json({ error: "Error assigning driver", booking: newBooking });
        return;
      }
      
      // respond with booking details and assigned driver
      res.status(201).json({
        message: "Trip requested and driver assigned successfully",
        booking: updatedBooking,
        driver: assignedDriver,
      });
    } catch (error) {
      // Timed out or other search error
      console.error("Error or timeout during driver search:", error);
      if (error instanceof Error && error.message.includes('timed out')) {
        res.status(408).json({ 
          error: "Driver search timed out", 
          message: "No drivers found within 1 minute. Please try again later.",
          booking: newBooking
        });
      } else {
        res.status(500).json({ 
          error: "Error finding drivers", 
          booking: newBooking 
        });
      }
      return;
    }
  } catch (error) {
    console.error("Error requesting trip:", error);
    res.status(500).json({ error: "Error requesting trip" });
    return;
  }
};
/**
 * Modified: Important function for retrieving driver information
 * Updated to use booking ID instead of driver ID for better UX
 */
export const getDriverDetails = async (
  req: Request,
  res: Response
): Promise<void> => {
  const bookingId = parseInt(req.params.bookingId, 10);
  const userId = req.user?.id;
  
  console.log(`getDriverDetails called: bookingId=${bookingId}, userId=${userId}`);
  
  if (!userId) {
    console.log('getDriverDetails: Unauthorized - no user ID');
    res.status(401).json({ error: 'Unauthorized' });
    return;
  }

  try {
    console.log(`Fetching driver details for booking ${bookingId}`);
    const { data: driverData, error } = await supabaseAdmin.rpc(
      'get_driver_details_by_booking',
      { 
        p_booking_id: bookingId, 
        p_user_id: userId 
      }
    );

    if (error) {
      console.error("Error fetching driver details from Supabase RPC:", error);
      if (error.message.includes('Unauthorized')) {
        res.status(403).json({ error: 'Forbidden' });
        return;
      }
      res.status(404).json({ error: error.message || 'Driver details not found' });
      return;
    }

    if (driverData && driverData.length > 0) {
      res.status(200).json({ driver: driverData[0] });
      return;
    } else {
      res.status(404).json({ error: 'Driver details not found' });
      return;
    }
  } catch (error) {
    console.error("Error in getDriverDetails:", error);
    res.status(500).json({ error: 'Internal server error' });
  }
}
// start of the trip
/**
 * KEEP: Core function for starting a trip
 * Updates trip status when driver starts the journey with passenger
 */
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
    if (!["accepted", "ongoing"].includes(bookingData.ride_status)) {
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
      .in("ride_status", ["accepted", "ongoing"])
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
/**
 * KEEP: Important function for retrieving active trip information
 * Used by both passengers and drivers to get details about their current trip
 */
export const getCurrentTrip = async (
  req: Request,
  res: Response
): Promise<void> => {
  const userId = req.user?.id;
  if (!userId) {
    res.status(401).json({ error: 'Unauthorized' });
    return;
  }

  const { data: trip,  error } = await supabaseAdmin.rpc('get_current_trip', { p_user_id: userId })

  if (error || !trip) {
    res.status(404).json({ error: 'No active trip found' });
    return;
  }

  res.status(200).json({ trip });
};
// end of the trip
/**
 * KEEP: Core function for completing a trip
 * Updates trip status when driver completes the journey and makes driver available again
 */
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
/**
 * KEEP: Important function for cancelling trips
 * Allows both passengers and drivers to cancel a trip with a reason
 */
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
/**
 * KEEP: Important function for retrieving detailed trip information
 * Used to get comprehensive details about a specific trip
 */
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

  try {
    // Fetch booking details with authorization via RPC
    const { data: booking, error } = await supabaseAdmin.rpc(
      "get_booking_details",
      {
        p_booking_id: parseInt(tripId, 10),
        p_user_id: userId,
      }
    );

    if (error || !booking) {
      if (error?.message.includes("Booking not found")) {
        res.status(404).json({ error: "Trip not found" });
      } else if (error?.message.includes("Unauthorized")) {
        res.status(403).json({ error: "Unauthorized to view this trip" });
      } else {
        console.error("Error fetching trip details:", error);
        res.status(500).json({ error: "An unexpected error occurred." });
      }
      return;
    }

    res.status(200).json({ trip: booking });
  } catch (error) {
    console.error("Error fetching trip details:", error);
    res.status(500).json({ error: "An unexpected error occurred." });
  }
};
/**
 * KEEP: Important function for retrieving passenger trip history
 * Used by passengers to view their past trips
 */
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
/**
 * DELETE: Commented out notification function
 * This function is already commented out and not being used
 */
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

/**
 * DELETE: Commented out notification function
 * This function is already commented out and not being used
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



