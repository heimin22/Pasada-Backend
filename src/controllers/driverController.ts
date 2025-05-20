import { Request, Response } from "express";
import { supabase } from "../utils/supabaseClient";
export const updateDriverLocation = async (req: Request, res: Response): Promise<void> => {
  const { latitude, longitude } = req.body;
  const driverId = req.user?.id;

  if (!driverId || latitude === undefined || longitude === undefined) {
    res.status(400).json({ error: "Missing required fields" });
    return;
  }

  const { error } = await supabase
    .from("driverTable")
    .update({
      current_location: `POINT(${longitude} ${latitude})`,
      last_online: new Date().toISOString(),
    })
    .eq("driver_id", driverId);
  if (error) {
    console.error("Error updating driver location:", error);
    res.status(500).json({ error: "Internal server error" });
    return;
  }
  res.status(200).json({ message: "Location updated successfully" });
};
export const updateDriverAvailability = async (req: Request, res: Response): Promise<void> => {
  let isAvailable: boolean | undefined;
  if (req.body.isAvailable !== undefined) {
    isAvailable = req.body.isAvailable === 'true';
  } else {
    isAvailable = req.body.isAvailable;
  }
  const driverId = req.user?.id;

  if (!driverId || isAvailable === undefined) {
    res.status(400).json({ error: "Missing required fields" });
    return;
  }
  if (typeof isAvailable !== "boolean") {
    res.status(400).json({ error: "Invalid availability value" });
    return;
  }

  // prevent unavailable drivers on active trips from becoming available
  if (isAvailable === true) {
    const { data: activeTrip, error: tripError } = await supabase
      .from("bookings")
      .select("booking_id")
      .eq("driver_id", driverId)
      .in("ride_status", ["ongoing"])
      .maybeSingle();

    if (tripError) {
      console.error("Error checking active trips:", tripError);
      res.status(500).json({ error: "Internal server error" });
      return;
    }
    if (activeTrip) {
      res.status(400).json({
        error: "Cannot set available while on an active trip",
      });
      return;
    }
  }

  const { error } = await supabase
    .from("driverTable")
    .update({
      is_available: isAvailable,
      last_online: new Date().toISOString(),
    })
    .eq("driver_id", driverId);

  if (error) {
    console.error("Error updating driver availability:", error);
    res.status(500).json({ error: "Internal server error" });
    return;
  }
  res.status(200).json({ message: "Availability updated successfully" });
};
