import { createClient, SupabaseClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.SUPABASE_URL!;
const supaabseKey = process.env.SUPABASE_ANON_KEY!;

export const supabase: SupabaseClient = createClient(supabaseUrl, supaabseKey);
