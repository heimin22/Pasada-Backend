import { Request, Response, NextFunction } from "express";
import { getUserFromJWT, supabase } from "../utils/supabaseClient";

// define a custom property 'user' on the request object
declare global {
    namespace Express {
        interface Request {
            user: any;
        }
    }
}

export const authMiddleware = async (req: Request, res: Response, next: NextFunction) => {
    const authHeader = req.headers.authorization;
    
    if (!authHeader) {
        return res.status(401).json({ error: "Unauthorized" });
    }

    const { user, error } = await getUserFromJWT(authHeader);

    if (error || !user) {
        console.error("Error fetching user from JWT:", error?.message);
        return res.status(401).json({ error: "Invalid or expired token" });
    }

    // attach the user to the request object
    req.user = user;
    next();
}   

// middleware for admins

// middleware for drivers
export const driverMiddleware = async (req: Request, res: Response, next: NextFunction) => {
    if (!req.user?.id) {
        return res.status(401).json({ error: "Unauthorized" });
    }

    const userId = req.user.id;

    try {
        const { data, error, count } = await supabase
            .from("driverTable")
            .select("user_id", { count: "exact" , head: true})
            .eq("user_id", userId)
            .single();

        if (error) {
            console.error("Error fetching driver data:", error);
            return res.status(500).json({ error: "Internal server error" });
        }

        if (count && count > 0) {
            next();
        } else {
            return res.status(403).json({ error: "Forbidden" });
        }        
    } catch (error) {
        console.error("Error fetching driver data:", error);
        return res.status(500).json({ error: "Internal server error" });
    }
}

// middleware for passengers
export const passengerMiddleware = async (req: Request, res: Response, next: NextFunction) => {
    
        
}