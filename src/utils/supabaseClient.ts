import {
  createClient,
  SupabaseClient,
  User,
  AuthError,
} from "@supabase/supabase-js";

import dotenv from "dotenv";
import process from "node:process";
dotenv.config();
const supabaseUrl = process.env.SUPABASE_URL!;
const supaabseKey = process.env.SUPABASE_ANON_KEY!;
const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
// check if all required environment variables are set then exit if there are missing ones
if (!supabaseUrl || !supaabseKey || !supabaseServiceRoleKey) {
  console.error("Missing Supabase environment variables");
  process.exit(1);
}
// client for general use, respects RLS
export const supabase: SupabaseClient = createClient(supabaseUrl, supaabseKey);
// admin client for operations requiring elevated privileges (use carefully!)
export const supabaseAdmin: SupabaseClient = createClient(
  supabaseUrl,
  supabaseServiceRoleKey!
);
// helper function to get user from JWT
export const getUserFromJWT = async (
  authHeader?: string
): Promise<{ user: User | null; error: AuthError | null }> => {
  if (!authHeader) {
    return {
      user: null,
      error: new AuthError("No authentication header provided"),
    };
  }
  const token = authHeader.split(" ")[1];
  if (!token) {
    return { user: null, error: new AuthError("No token provided") };
  }
  const { data, error } = await supabase.auth.getUser(token);
  return { user: data.user, error };
};
