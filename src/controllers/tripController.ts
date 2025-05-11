import { Request, Response } from "express";
import { supabase } from "../utils/supabaseClient";
const SEARCH_RADIUS_METERS = 500;
const MAX_DRIVERS_TO_FIND = 20;
export const requestTrip = async (
  req: Request,
  res: Response,
): Promise<void> => {
  const {
    origin_latitude,
    origin_longitude,
    origin_address,
    destination_latitude,
    destination_longitude,
    destination_address,
    route_trip,
    fare,
    payment_method,
  } = req.body;
  const passengerUserId = req.user?.id;
  if (!passengerUserId) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }
  if (
    typeof origin_latitude !== "number" ||
    typeof origin_longitude !== "number" ||
    typeof destination_latitude !== "number" ||
    typeof destination_longitude !== "number" ||
    !origin_address ||
    !destination_address
  ) {
    res.status(400).json({ error: "Missing required fields" });
    return;
  } 
  try {
    // find nearby drivers that match the route
    const { data: drivers, error: searchError } = await supabase
      .from("driverTable")
      .select(`
        driver_id,
        current_location,
        vehicle:vehicle_id (
          passenger_capacity,
          sitting_passenger,
          standing_passenger,
          route_id
        )
      `)
      .eq("is_available", true)                                   // online
      .eq("vehicle.route_id", route_trip)                         // same route
      .filter(
        "current_location",
        "st_dwithin",
        `(${origin_longitude},${origin_latitude},300)`
      )                                                           // within 300 m
      .order("current_location", { ascending: true })             // KNN sort
      .limit(MAX_DRIVERS_TO_FIND);
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
    const originLocationWKT = `POINT(${origin_longitude} ${origin_latitude})`;
    const destinationLocationWKT =
      `POINT(${destination_longitude} ${destination_latitude})`;
    const { data: newBooking, error: bookingError } = await supabase
      .from("bookings")
      .insert({
        passenger_id: passengerUserId,
        status: "requested",
        origin_location: originLocationWKT,
        origin_address: origin_address,
        destination_location: destinationLocationWKT,
        destination_address: destination_address,
        fare: fare,
        payment_method: payment_method,
        created_at: new Date().toISOString(),
        currentroute_id: route_trip,
      })
      .select()
      .single();
    if (bookingError) {
      console.error("Error creating trip request:", bookingError);
      res.status(500).json({ error: "Error creating trip request" });
      return;
    }
    // respond to passenger with booking details
    // this should return the newly created booking details
    // the frontend should use Realtime to get updates on the booking status
    res.status(201).json({
      message: "Trip requested successfully. Searching for drivers...",
      booking: newBooking,
      nearby_drivers: drivers,
    });
    // Notify drivers
    console.log(
      `INFO: Booking ${newBooking.id} requested by passenger ${passengerUserId}`,
    );
    console.log(
      `INFO: Searching for drivers within ${SEARCH_RADIUS_METERS} meters`,
    );
    // send notifications to drivers
  } catch (error) {
    console.error("Error requesting trip:", error);
    res.status(500).json({ error: "Error requesting trip" });
    return;
  }
};
export const acceptTrip = async (
  req: Request,
  res: Response,
): Promise<void> => {
  const { bookingId } = req.params;
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
      },
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
        status: "accepted",
        driver_id: driverUserId,
      })
      .eq("id", bookingId)
      .eq("status", "requested")
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
    const { error: driverStatusError } = await supabase
      .from("driverTable")
      .update({
        is_available: false,
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
// simplified controllers for other states
// driver arrived at the pickup location
export const driverArrived = async (
  req: Request,
  res: Response,
): Promise<void> => {
  const { bookingId } = req.params;
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
        status: "driver_arrived",
      })
      .eq("id", bookingId)
      .eq("driver_id", driverUserId)
      .eq("status", "accepted")
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
  const { bookingId } = req.params;
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
      .select("passenger_id, driver_id, status")
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
    if (!["accepted", "driver_arrived"].includes(bookingData.status)) {
      res
        .status(409)
        .json({ error: "Trip cannot be started in its current state." });
      return;
    }
    // update the booking to ongoing
    const { data: updatedBooking, error: updateError } = await supabase
      .from("bookings")
      .update({
        status: "ongoing",
        started_at: new Date().toISOString(),
      })
      .eq("id", bookingId)
      .in("status", ["accepted", "driver_arrived"])
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
  res: Response,
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
        "*, driverTable: driver_id ( first_name, last_name, driver_id, vehicle_id ), passenger: id ( id ) ",
      )
      .or(`id.eq.${userId},driver_id.eq.${userId}`)
      .in("status", ["accepted", "driver_arrived", "ongoing"])
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
  res: Response,
): Promise<void> => {
  const { bookingId } = req.params;
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
        status: "completed",
        completed_at: new Date().toISOString(),
      })
      .eq("id", bookingId)
      .eq("driver_id", driverUserId)
      .eq("status", "ongoing")
      .select()
      .single();
    if (bookingError || !bookingData) {
      console.error("Error updating booking:", bookingError);
      res.status(400).json({ error: "Error completing trip" });
      return;
    }
    // make the driver available again after the trip
    const { error: driverStatusError } = await supabase
      .from("driverTable")
      .update({
        is_available: true,
      })
      .eq("driver_id", driverUserId);
    if (driverStatusError) {
      console.error(
        "Error updating driver status post-trip:",
        driverStatusError,
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
  res: Response,
): Promise<void> => {
  const { bookingId } = req.params;
  const userId = req.user?.id;
  const { reason } = req.body;
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
      .select("status, passenger_id, driver_id, id")
      .eq("id", bookingId)
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
      "request",
      "completed",
      "driver_arrived",
      "ongoing",
    ];
    if (!cancellableStates.includes(booking.status)) {
      res
        .status(409)
        .json({ error: "Trip is not cancellable in its current state." });
      return;
    }
    // Proceed with cancellation
    const { data: cancelledBooking, error: cancellationError } = await supabase
      .from("bookings")
      .update({
        status: "cancelled",
        cancelled_at: new Date().toISOString(),
        cancellation_reason: reason,
      })
      .eq("id", bookingId)
      .in("status", cancellableStates) // Only cancel if in cancellable state
      .select()
      .single();
    if (cancellationError || !cancelledBooking) {
      console.error("Error updating booking to cancelled:", cancellationError);
      res.status(400).json({ error: "Error cancelling trip" });
      return;
    }
    // If a driver was assigned, set their status back to available
    if (cancelledBooking.driver_id) {
      const { error: driverStatusError } = await supabase
        .from("driverTable")
        .update({ is_available: true })
        .eq("driver_id", cancelledBooking.driver_id);
      if (driverStatusError) {
        // Log this error but don't fail the cancellation for the user
        console.error(
          "Error updating driver status to available after cancellation:",
          driverStatusError,
        );
      }
    }
    res
      .status(200)
      .json({
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
  res: Response,
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
      .eq("id", tripId)
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
  res: Response,
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
        error,
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
  res: Response,
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
        error,
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
