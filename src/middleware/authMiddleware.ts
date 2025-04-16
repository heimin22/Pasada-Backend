import { Request, Response, NextFunction } from "express";
import { getUserFromJWT } from "../utils/supabaseClient";

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
