import { createClient, SupabaseClient } from "@supabase/supabase-js";
import dotenv from "dotenv";

dotenv.config();

const supabaseUrl = process.env.SUPABASE_URL!;
const supaabseKey = process.env.SUPABASE_ANON_KEY!;
const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

// Check if all required environment variables are set then exit if there are missing ones
if (!supabaseUrl || !supaabseKey || !supabaseServiceRoleKey) {
    console.error("Missing Supabase environment variables");
    process.exit(1);
}

// client for general use, respects RLS
export const supabase: SupabaseClient = createClient(supabaseUrl, supaabseKey);
