import { Request, Response } from "express";
import { supabase } from "../utils/supabaseClient";

const SEARCH_RADIUS_METERS = 5000;
const MAX_DRIVERS_TO_FIND = 10;

export const requestTrip = async (req: Request, res: Response) => {
    const { origin_latitude, origin_longitude, origin_address, destination_latitude, destination_longitude, destination_address, route_trip, fare, payment_method } = req.body;
    const passengerUserId = req.user?.id;

    
    if (!passengerUserId) {
        return res.status(401).json({ error: "Unauthorized" });
    }
    if (!origin_latitude || !origin_longitude || !origin_address || !destination_latitude || !destination_longitude || !destination_address) {
        return res.status(400).json({ error: "Missing required fields" });
    }

    // find nearby drivers
    const { data: drivers, error: searchError } = await supabase
        .rpc('find_available_drivers_nearby', {
            passenger_lon: origin_longitude,
            passenger_lat: origin_latitude,
            search_radius: SEARCH_RADIUS_METERS,
            max_drivers: MAX_DRIVERS_TO_FIND,
        });

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




