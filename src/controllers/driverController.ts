import { Request, Response } from "express";
import { supabase } from "../utils/supabaseClient";

export const updateDriverLocation = async (req: Request, res: Response) => {
    const { latitude, longitude } = req.body;
    const driverId = req.params.id;

    if (!driverId || !latitude || !longitude) {
        return res.status(400).json({ error: "Missing required fields" });
    }

    const { error } = await supabase
        .from("driverTable")
        .update({
            current_location: `POINT(${longitude} ${latitude})`,
            last_seen: new Date().toISOString(),
        })
        .eq("user_id", driverId);

    if (error) {
        console.error("Error updating driver location:", error);
        return res.status(500).json({ error: "Internal server error" });
    } 
    res.status(200).json({ message: "Location updated successfully" });
};

export const updateDriverAvailability = async (req: Request, res: Response) => {
    const { isAvailable } = req.body;
    const driverId = req.params.id;

    if (!driverId || isAvailable === undefined) {
        return res.status(400).json({ error: "Missing required fields" });
    }
    if (typeof isAvailable !== "boolean") {
        return res.status(400).json({ error: "Invalid availability value" });
    }

    // prevent unavailable drivers on active trips from becoming available
    if (isAvailable === true) {
        const { data: activeTrip, error: tripError } = await supabase
            .from("bookings")
            .select("id")
            .eq("driver_id", driverId)
            .in("status", ["accepted", "driver_arrived", "ongoing"])
            .maybeSingle();
            
        if (tripError) {
            console.error("Error checking active trips:", tripError);
            return res.status(500).json({ error: "Internal server error" });
        }
        if (activeTrip) {
            return res.status(400).json({ error: "Cannot set available while on an active trip" });
        }
    }

    const { error } = await supabase
        .from("driverTable")
        .update({ 
            is_available: isAvailable, 
            last_seen: new Date().toISOString() 
        })
        .eq("user_id", driverId);

    if (error) {
        console.error("Error updating driver availability:", error);
        return res.status(500).json({ error: "Internal server error" });
    }
    res.status(200).json({ message: "Availability updated successfully" });
};
