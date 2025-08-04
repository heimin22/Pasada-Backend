import { Request, Response } from "express";
import { createClient } from "@supabase/supabase-js";
import axios from "axios";

const supabase = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_ANON_KEY!);
const GOOGLE_MAPS_API_KEY = process.env.GOOGLE_MAPS_API_KEY;

export const getRouteTraffic = async (req: Request, res: Response): Promise<void> => {
  try {
    const { routeId } = req.body;
    const { data: routeData, error } = await supabase
      .from('official_routes')
      .select('origin_lat, origin_lng, destination_lat, destination_lng, intermediate_coordinates')
      .eq('officialroute_id', routeId)
      .single();

    if (error || !routeData) {
      res.status(404).json({ error: 'Route not found or incomplete coordinates' });
      return;
    }

    const {
      origin_lat,
      origin_lng,
      destination_lat,
      destination_lng,
      intermediate_coordinates
    } = routeData;

    let waypoints = '';
    if (Array.isArray(intermediate_coordinates) && intermediate_coordinates.length) {
      waypoints = intermediate_coordinates
        .map((coord: { lat: number; lng: number }) => `via:${coord.lat},${coord.lng}`)
        .join('|');
    }

    const params = new URLSearchParams({
      origin: `${origin_lat},${origin_lng}`,
      destination: `${destination_lat},${destination_lng}`,
      departure_time: 'now',
      traffic_model: 'best_guess',
      key: GOOGLE_MAPS_API_KEY!
    });

    if (waypoints) {
      params.append('waypoints', waypoints);
    }

    const url = `https://maps.googleapis.com/maps/api/directions/json?${params.toString()}`;
    const apiRes = await axios.get(url);

    if (apiRes.data.status !== 'OK') {
      const msg = apiRes.data.error_message || apiRes.data.status;
      console.error('Google Directions error:', msg);
      res.status(500).json({ error: 'Failed to fetch route traffic' });
      return;
    }

    const leg = apiRes.data.routes[0].legs[0];
    const duration = leg.duration.text;
    const durationInTraffic = leg.duration_in_traffic?.text || duration;

    // Return simplified traffic info
    res.json({ routeId, duration, durationInTraffic });
  } catch (err: any) { 
    console.error('Error fetching route traffic:', err);
    res.status(500).json({ error: err.message || err.toString() });
  }
};