import { createClient } from '@supabase/supabase-js';
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import process from "node:process";

const SUPABASE_URL = process.env.SUPABASE_URL!; // Changed from Deno.env.get to process.env
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const FCM_SERVER_KEY = process.env.FCM_SERVER_KEY!;

const supabaseAdmin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

// constants (same as the backend API)
const SEARCH_RADIUS_METERS = 5000;
const MAX_DRIVERS_TO_FIND = 10;

serve(async (req: Request): Promise<Response> => {
  // direct calls

  // parsing the request body (webhook payload)
  let Booking;
  try {
    const payload = await req.json();
    // check payload structure
    if (payload.type !== 'INSERT' || payload.table !== 'bookings' || !payload.record) {
      console.warn('Invalid payload:', payload);
      return new Response('Invalid payload', { status: 400 });
    }
    if (payload.record.status !== 'requested') {
      console.log('Skipping non-requested booking:', payload.record);
      return new Response('Skipping non-requested booking', { status: 200 });
    }
    Booking = payload.record;
    console.log('Processing booking:', Booking);
  } catch (error) {
    console.error('Invalid request body:', error);
    return new Response('Invalid request body', { status: 400 });
  }

  // extract the booking details
  const match = Booking.origin_location?.match(/POINT\(([-\d.]+) ([-\d.]+)\)/);
  if (!match || match.length < 3) {
    console.error('Invalid origin location:', Booking.origin_location);
    return new Response('Invalid origin location', { status: 400 });
  }
  const originLongitude = parseFloat(match[1]);
  const originLatitude = parseFloat(match[2]);

  // find drivers within radius
  const { data: driversToNotify, error: searchError } = await supabaseAdmin.rpc(
    'find_available_drivers_nearby', {
        passenger_lon: originLongitude,
        passenger_lat: originLatitude,
        search_radius: SEARCH_RADIUS_METERS,
        max_results: MAX_DRIVERS_TO_FIND,
    }
  );
  if (searchError) {
    console.error('Error searching for drivers:', searchError);
    return new Response('Error searching for drivers', { status: 500 });
  }
  if (!driversToNotify || driversToNotify.length === 0) {
    console.log('No drivers found nearby');
    return new Response('No drivers found nearby', { status: 200 });
  }

  interface NearbyDriver {
    user_id: string;
  }
  
  const driverUserIds = driversToNotify.map((driver: NearbyDriver) => driver.user_id);
  console.log(`Found drivers to notify for booking ${Booking.id}:`, driverUserIds);

  // get FCM tokens for drivers
  const { data: tokensData, error: tokensError } = await supabaseAdmin
    .from('push_Tokens')
    .select('token, platform')
    .in('user_id', driverUserIds);
  if (tokensError) {
    console.error('Error getting driver tokens:', tokensError);
    return new Response('Error getting driver tokens', { status: 500 });
  }
  if (!tokensData || tokensData.length === 0) {
    console.log('No tokens found for drivers:', driverUserIds);
    return new Response('No tokens found for drivers', { status: 200 });
  }

  return new Response('Success', { status: 200 });
});
