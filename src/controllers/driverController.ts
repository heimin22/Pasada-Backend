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


