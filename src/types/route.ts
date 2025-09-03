export interface OfficialRoute {
    officialroute_id: number;
    route_name: string;
    origin_name: string;
    destination_name: string;
    // Coordinates sourced from DB (if present)
    origin_lat?: number;
    origin_lng?: number;
    destination_lat?: number;
    destination_lng?: number;
    intermediate_coordinates?: Array<{ lat: number; lng: number }>;
    description: string;
    status: string;
    created_at: string;
  }