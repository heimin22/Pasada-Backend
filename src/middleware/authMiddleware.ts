import { NextFunction, Request, Response } from "express";
import { getUserFromJWT, supabase } from "../utils/supabaseClient.ts";
// define a custom property 'user' on the request object
declare global {
  namespace Express {
    interface Request {
      user?: any;
    }
  }
}
console.log("Hello Pasada!");
export const authenticate = async (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return res.status(401).json({
      error: "Unauthorized: Bearer token required",
    });
  }
  const { user, error } = await getUserFromJWT(authHeader);
  if (error || !user) {
    return res.status(401).json({ error: "Invalid or expired token" });
  }
  // attach the user to the request object
  req.user = user;
  next();
};
// middleware for admins
export const adminMiddleware = async (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  if (!req.user?.id) {
    return res.status(401).json({ error: "Unauthorized" });
  }
  const userId = req.user.id;
  try {
    const { data, error, count } = await supabase
      .from("adminTable")
      .select("admin_id", { count: "exact", head: true })
      .eq("admin_id", userId)
      .single();
    if (error) {
      console.error("Error fetching admin data:", error);
      return res.status(500).json({ error: "Internal server error" });
    }
    if (count && count > 0) {
      // user is an admin
      next();
    } else {
      // user is not an admin
      return res.status(403).json({ error: "Forbidden" });
    }
    console.warn(
      "isAdmin middleware check not implemented for user ${userId}. Denying access.",
    );
    return res.status(403).json({ error: "Forbidden" });
  } catch (error) {
    console.error("Error fetching admin data:", error);
    return res.status(500).json({ error: "Internal server error" });
  }
};
// middleware for drivers
export const driverMiddleware = async (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  if (!req.user?.id) {
    return res.status(401).json({ error: "Unauthorized" });
  }
  const userId = req.user.id;
  try {
    const { data, error, count } = await supabase
      .from("driverTable")
      .select("driver_id", { count: "exact", head: true })
      .eq("driver_id", userId)
      .single();
    if (error) {
      console.error("Error fetching driver data:", error);
      return res.status(500).json({ error: "Internal server error" });
    }
    if (count && count > 0) {
      // user is a driver
      next();
    } else {
      // user is not a driver
      return res.status(403).json({ error: "Forbidden" });
    }
  } catch (error) {
    console.error("Error fetching driver data:", error);
    return res.status(500).json({ error: "Internal server error" });
  }
};
// middleware for passengers
export const passengerMiddleware = async (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  if (!req.user?.id) {
    return res.status(401).json({ error: "Unauthorized" });
  }
  const userId = req.user.id;
  try {
    const { data, error, count } = await supabase
      .from("passenger")
      .select("id", { count: "exact", head: true })
      .eq("id", userId)
      .single();
    if (error) {
      console.error("Error fetching passenger data:", error);
      return res.status(500).json({ error: "Internal server error" });
    }
    if (count && count > 0) {
      // user is a passenger
      next();
    } else {
      // user is not a passenger
      return res.status(403).json({ error: "Forbidden" });
    }
  } catch (error) {
    console.error("Error fetching passenger data:", error);
    return res.status(500).json({ error: "Internal server error" });
  }
};
