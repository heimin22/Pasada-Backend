import { createClient, SupabaseClient } from "@supabase/supabase-js";
import { OfficialRoute } from "../types/route";
import { TrafficData } from "../types/traffic";

export class DatabaseService {
    private supabase: SupabaseClient;

    constructor(supabaseUrl: string, supabaseKey: string) {
        this.supabase = createClient(supabaseUrl, supabaseKey);
    }

    async getAllRoutes(): Promise<OfficialRoute[]> {
        try {
            const { data, error } = await this.supabase
                .from('official_routes')
                .select('*')
                .eq('status', 'active');

            if (error) throw error;
            return data || [];
        } catch (error) {
            console.error('Error fetching routes:', error);
            throw new Error('Failed to fetch routes from database');
        }
    }

    async getRouteById(routeId: number): Promise<OfficialRoute | null> {
        try {
            const { data, error } = await this.supabase
                .from('official_routes')
                .select('*')
                .eq('officialroute_id', routeId)
                .single();

            if (error) throw error;
            return data || null;
        } catch (error) {
            console.error('Error fetching route by ID:', error);
            throw new Error('Failed to fetch route by ID from database');
        }
    }

    async saveTrafficData(trafficData: TrafficData[]): Promise<void> {
        try {
            const { error } = await this.supabase
                .from('traffic_analytics')
                .insert(trafficData.map(data => ({
                    route_id: data.routeId,
                    timestamp: data.timestamp.toISOString(),
                    traffic_density: data.trafficDensity,
                    duration: data.duration,
                    duration_in_traffic: data.durationInTraffic,
                    distance: data.distance,
                    status: data.status,
                    created_at: new Date().toISOString()
                  })));
            if (error) throw error;
        } catch (error) {
            console.error('Error saving traffic data:', error);
            throw new Error('Failed to save traffic data to database');
        }
    }

    async getHistoricalTrafficData(routeId: number, days: number = 7): Promise<TrafficData[]> {
        try {
            const startDate = new Date();
            startDate.setDate(startDate.getDate() - days);

            const { data, error } = await this.supabase
                .from('traffic_analytics')
                .select('*')
                .eq('route_id', routeId)
                .gte('timestamp', startDate.toISOString())
                .order('timestamp', { ascending: true });

            if (error) throw error;

            return (data || []).map(item => ({
                routeId: item.route_id,
                timestamp: new Date(item.timestamp),
                trafficDensity: item.traffic_density,
                duration: item.duration,
                durationInTraffic: item.duration_in_traffic,
                distance: item.distance,
                status: item.status
              }));
        } catch (error) {
            console.error('Error fetching historical traffic data:', error);
            return [];
        }
    }
}