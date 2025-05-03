import express from "express";
import cors from "cors";
import { createClient } from "@supabase/supabase-js";
import dotenv from "dotenv";

// Load environment variables
dotenv.config();

// Constants
const SEARCH_RADIUS_METERS = 5000;
const MAX_DRIVERS_TO_FIND = 10;

const app = express();
app.use(express.json());
app.use(cors());

// Basic health check endpoint
app.get("/api/test", function(_req: express.Request, res: express.Response) {
  res.json({ 
    message: "Pasada Backend API is running", 
    timestamp: new Date().toISOString() 
  });
});

// Trip request endpoint
app.post("/api/trips/request", async (req: express.Request, res: express.Response) => {
  try {
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
      passenger_id
    } = req.body;

    // Validate request
    if (!origin_latitude || !origin_longitude || !destination_latitude || !destination_longitude || !passenger_id) {
      return res.status(400).json({ error: "Missing required fields" });
    }

    // Get Supabase client
    const SUPABASE_URL = process.env.SUPABASE_URL!; // Changed from Deno.env.get to process.env
    const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!; // Changed from Deno.env.get to process.env
    const supabaseAdmin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    // Find nearby drivers
    const { data: drivers, error: searchError } = await supabaseAdmin.rpc(
      "find_available_drivers_nearby",
      {
        passenger_lon: origin_longitude,
        passenger_lat: origin_latitude,
        search_radius: SEARCH_RADIUS_METERS,
        max_results: MAX_DRIVERS_TO_FIND,
      }
    );

    if (searchError) {
      console.error("Error finding drivers:", searchError);
      return res.status(500).json({ error: "Error finding drivers" });
    }

    if (!drivers || drivers.length === 0) {
      return res.status(404).json({ error: "No drivers found" });
    }

    // Create trip request
    const originLocationWKT = `POINT(${origin_longitude} ${origin_latitude})`;
    const destinationLocationWKT = `POINT(${destination_longitude} ${destination_latitude})`;
    
    const { data: newBooking, error: bookingError } = await supabaseAdmin
      .from("bookings")
      .insert({
        passenger_id: passenger_id,
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

    // Get driver tokens for notifications
    const driverUserIds = drivers.map((driver: { user_id: string }) => driver.user_id);
    const { data: _tokensData, error: tokensError } = await supabaseAdmin
      .from('push_Tokens')
      .select('token, platform')
      .in('user_id', driverUserIds);

    if (tokensError) {
      console.error("Error getting driver tokens:", tokensError);
    }

    res.status(201).json({
      message: "Trip requested successfully. Searching for drivers...",
      booking: newBooking,
      nearby_drivers: drivers,
    });
  } catch (error) {
    console.error("Error processing request:", error);
    res.status(500).json({ error: "Error processing request" });
  }
});

// Trip accept endpoint
app.post("/api/trips/accept", async (req: express.Request, res: express.Response) => {
  try {
    const { booking_id, driver_id } = req.body;

    // Validate request
    if (!booking_id || !driver_id) {
      return res.status(400).json({ error: "Missing required fields" });
    }

    // Get Supabase client
    const SUPABASE_URL = process.env.SUPABASE_URL!; // Changed from Deno.env.get to process.env
    const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!; // Changed from Deno.env.get to process.env
    const supabaseAdmin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    // Update booking status
    const { data: updatedBooking, error: updateError } = await supabaseAdmin
      .from("bookings")
      .update({
        driver_id: driver_id,
        status: "accepted",
        accepted_at: new Date().toISOString(),
      })
      .eq("id", booking_id)
      .eq("status", "requested")
      .select()
      .single();

    if (updateError) {
      console.error("Error accepting trip:", updateError);
      return res.status(500).json({ error: "Error accepting trip" });
    }

    if (!updatedBooking) {
      return res.status(404).json({ error: "Booking not found or already accepted" });
    }

    res.status(200).json({
      message: "Trip accepted successfully",
      booking: updatedBooking,
    });
  } catch (error) {
    console.error("Error processing request:", error);
    return res.status(500).json({ error: "Error processing request" });
  }
});

// Get current trip endpoint
app.get("/api/trips/current/:userId", async (req: express.Request, res: express.Response) => {
  try {
    const userId = req.params.userId;
    
    if (!userId) {
      return res.status(400).json({ error: "User ID is required" });
    }

    // Get Supabase client
    const SUPABASE_URL = process.env.SUPABASE_URL!; // Changed from Deno.env.get to process.env
    const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!; // Changed from Deno.env.get to process.env
    const supabaseAdmin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    const { data: booking, error } = await supabaseAdmin
      .from("bookings")
      .select(
        "*, driverTable: driver_id ( first_name, last_name, driver_id, vehicle_id ), passenger: id ( id )"
      )
      .or(`id.eq.${userId},driver_id.eq.${userId}`)
      .in("status", ["accepted", "driver_arrived", "ongoing"])
      .order("created_at", { ascending: false })
      .maybeSingle();

    if (error) {
      console.error("Error fetching booking:", error);
      return res.status(500).json({ error: "Error fetching trip details" });
    }

    if (!booking) {
      return res.status(404).json({ message: "No active trip found" });
    }

    res.status(200).json({ booking });
  } catch (error) {
    console.error("Error processing request:", error);
    return res.status(500).json({ error: "Error processing request" });
  }
});

// Start the server
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});

export default app;

