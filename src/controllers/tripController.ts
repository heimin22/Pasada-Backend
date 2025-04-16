import { Request, Response } from "express";
import { supabase } from "../utils/supabaseClient";

const SEARCH_RADIUS_METERS = 5000;
const MAX_DRIVERS_TO_FIND = 10;

export const requestTrip = async (req: Request, res: Response) => {
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
    return res.status(401).json({ error: "Unauthorized" });
  }
  if (
    !origin_latitude ||
    !origin_longitude ||
    !origin_address ||
    !destination_latitude ||
    !destination_longitude ||
    !destination_address
  ) {
    return res.status(400).json({ error: "Missing required fields" });
  }

  // find nearby drivers
  const { data: drivers, error: searchError } = await supabase.rpc(
    "find_available_drivers_nearby",
    {
      passenger_lon: origin_longitude,
      passenger_lat: origin_latitude,
      search_radius: SEARCH_RADIUS_METERS,
      max_drivers: MAX_DRIVERS_TO_FIND,
    }
  );

  if (searchError) {
    console.error("Error finding drivers:", searchError);
    return res.status(500).json({ error: "Error finding drivers" });
  }

  if (!drivers || drivers.length === 0) {
    return res.status(404).json({ error: "No drivers found" });
  }

  // create a trip request
  const originLocationWKT = `POINT(${origin_longitude} ${origin_latitude})`;
  const destinationLocationWKT = `POINT(${destination_longitude} ${destination_latitude})`;

  const { data: newBooking, error: bookingError } = await supabase
    .from("bookings")
    .insert({
      passenger_id: passengerUserId,
      status: "requested",
      origin_location: originLocationWKT,
      origin_address: origin_address,
      destination_location: destinationLocationWKT,
      destination_address: destination_address,
      route_trip: route_trip,
      fare: fare,
      payment_method: payment_method,
    })
    .select()
    .single();

  if (bookingError) {
    console.error("Error creating trip request:", bookingError);
    return res.status(500).json({ error: "Error creating trip request" });
  }

  // respond to passenger with booking details
  // this should return the newly created booking details
  // the frontend should use Realtime to get updates on the booking status
  res.status(201).json({
    message: "Trip requested successfully. Searching for drivers...",
    booking: newBooking,
    drivers: drivers,
  });

  // Notify drivers
};

export const acceptTrip = async (req: Request, res: Response) => {
  const { bookingId } = req.params;
  const driverUserId = req.user?.id;

  if (!driverUserId) {
    return res.status(401).json({ error: "Unauthorized" });
  }
  if (!bookingId) {
    return res.status(400).json({ error: "Missing booking ID" });
  }

  // transaction to ensure atomicity
  const { data, error } = await supabase.rpc("accept_bookings", {
    booking_id_to_accept: bookingId,
    driver_id_to_accept: driverUserId,
  });

  if (error) {
    console.error("Error accepting trip:", error);
    // check error message for specific reasons
    if (
      error.message.includes("Booking not found") ||
      error.message.includes("Booking already accepted")
    ) {
      return res
        .status(409)
        .json({
          message: "Trip could not be accepted (already accepted or not found)",
        });
    }
    return res.status(500).json({ error: "Error accepting trip" });
  }
  res.status(200).json({ message: "Trip accepted successfully" });

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
    return res.status(409).json({ error: "Error updating booking" });
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
    return res.status(500).json({ error: "Error updating driver status" });
  }

  res
    .status(200)
    .json({ message: "Trip accepted successfully", booking: updatedBooking });
};

// simplified controllers for other states

// driver arrived at the pickup location
export const driverArrived = async (req: Request, res: Response) => {
  const { bookingId } = req.params;

  const { data, error } = await supabase
    .from("bookings")
    .update({
      status: "driver_arrived",
    })
    .eq("id", bookingId)
    .eq("status", "accepted")
    .select()
    .single();

  if (error || !data) {
    console.error("Error updating booking:", error);
    return res.status(400).json({ error: "Error updating booking" });
  }
  res
    .status(200)
    .json({ message: "Driver arrived at pickup location", booking: data });
};

// start of the trip
export const startTrip = async (req: Request, res: Response) => {
  const { bookingId } = req.params;
  // add check if the booking is accepted
  const { data, error } = await supabase
    .from("bookings")
    .update({
      status: "ongoing",
      started_at: new Date().toISOString(),
    })
    .eq("id", bookingId)
    .eq("status", ["accepted", "driver_arrived"])
    .select()
    .single();

  if (error || !data) {
    console.error("Error updating booking:", error);
    return res.status(400).json({ error: "Error updating booking" });
  }
  res.status(200).json({ message: "Trip started.", booking: data });
};

// end of the trip
export const completeTrip = async (req: Request, res: Response) => {
  const { bookingId } = req.params;
  const driverUserId = req.user?.id;

  if (!driverUserId) {
    return res.status(401).json({ error: "Unauthorized" });
  }

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
    return res.status(400).json({ error: "Error updating booking" });
  }

  // make the driver available again after the trip
  const { error: driverStatusError } = await supabase
    .from("driverTable")
    .update({
      is_available: true,
    })
    .eq("driver_id", driverUserId);

  if (driverStatusError) {
    console.error("Error updating driver status:", driverStatusError);
    return res.status(500).json({ error: "Error updating driver status" });
  }

  res.status(200).json({ message: 'Trip completed', booking: bookingData });
};


