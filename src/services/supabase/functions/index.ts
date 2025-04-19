import { createClient } from '@supabase/supabase-js';
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';

const SUPABASE_URL = process.env.SUPABASE_URL!; // Changed from Deno.env.get to process.env
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const FCM_SERVER_KEY = process.env.FCM_SERVER_KEY!;

const supabaseAdmin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

// constants (same as the backend API)
const SEARCH_RADIUS_METERS = 5000;
const MAX_DRIVERS_TO_FIND = 10;

serve(async (req: Request) => {
  // direct calls

  // parsing the request body (webhook payload)
  let Booking;
  try {
    const payload = await req.json();
    // check payload structure
  } catch (error) {
    console.error('Invalid request body:', error);
    return new Response('Invalid request body', { status: 400 });
  }

  // extract the booking details
  
    
});
