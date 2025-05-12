import { Request, Response } from "express";
import { supabase } from "../utils/supabaseClient";

export const registerPushToken = async (
  req: Request,
  res: Response
): Promise<void> => {
  const userId = req.user?.id;
  const { token, deviceId, platform } = req.body;
  if (!userId) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }
  if (!token || !deviceId) {
    res.status(400).json({ error: "Missing required fields" });
    return;
  }
  try {
    const { error } = await supabase.from("push_tokens").upsert(
      {
        user_id: userId,
        token,
        device_id: deviceId,
        platform: platform || "unknown",
        updated_at: new Date().toISOString(),
      },
      {
        onConflict: "user_id, device_id",
      }
    );
    if (error) {
      console.error("Error registering push token:", error);
      res.status(500).json({ error: "Error registering push token" });
      return;
    }
    res.status(200).json({ message: "Push token registered successfully" });
  } catch (error) {
    console.error("Error registering push token:", error);
    res.status(500).json({ error: "Internal server error" });
  }
};
