import { createClient, SupabaseClient } from "@supabase/supabase-js";
import { OfficialRoute } from "../types/route";
import { TrafficData, TripAnalyticsData, RouteUsageData } from "../types/traffic";

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

    // New methods for trip-based analytics
    async saveTripAnalyticsData(tripData: TripAnalyticsData): Promise<void> {
        try {
            const { error } = await this.supabase
                .from('trip_analytics')
                .insert({
                    trip_id: tripData.tripId,
                    route_id: tripData.routeId,
                    passenger_id: tripData.passengerId,
                    driver_id: tripData.driverId,
                    start_time: tripData.startTime.toISOString(),
                    end_time: tripData.endTime.toISOString(),
                    actual_duration: tripData.actualDuration,
                    estimated_duration: tripData.estimatedDuration,
                    actual_distance: tripData.actualDistance,
                    pickup_lat: tripData.pickupCoordinates.lat,
                    pickup_lng: tripData.pickupCoordinates.lng,
                    dropoff_lat: tripData.dropoffCoordinates.lat,
                    dropoff_lng: tripData.dropoffCoordinates.lng,
                    traffic_condition: tripData.trafficCondition,
                    completion_status: tripData.completionStatus,
                    fare: tripData.fare,
                    created_at: new Date().toISOString()
                });
            
            if (error) throw error;
            console.log(`Trip analytics saved for trip ${tripData.tripId}`);
        } catch (error) {
            console.error('Error saving trip analytics data:', error);
            throw new Error('Failed to save trip analytics data to database');
        }
    }

    async saveRouteUsageData(usageData: RouteUsageData): Promise<void> {
        try {
            const { error } = await this.supabase
                .from('route_usage_analytics')
                .insert({
                    route_id: usageData.routeId,
                    timestamp: usageData.timestamp.toISOString(),
                    endpoint: usageData.endpoint,
                    method: usageData.method,
                    user_id: usageData.userId,
                    user_type: usageData.userType,
                    response_time: usageData.responseTime,
                    status_code: usageData.statusCode,
                    created_at: new Date().toISOString()
                });
            
            if (error) throw error;
        } catch (error) {
            console.error('Error saving route usage data:', error);
            // Don't throw here as this shouldn't break the main request
        }
    }

    async getTripAnalyticsData(routeId: number, days: number = 30): Promise<TripAnalyticsData[]> {
        try {
            const startDate = new Date();
            startDate.setDate(startDate.getDate() - days);

            const { data, error } = await this.supabase
                .from('trip_analytics')
                .select('*')
                .eq('route_id', routeId)
                .gte('start_time', startDate.toISOString())
                .order('start_time', { ascending: true });

            if (error) throw error;

            return (data || []).map(item => ({
                tripId: item.trip_id,
                routeId: item.route_id,
                passengerId: item.passenger_id,
                driverId: item.driver_id,
                startTime: new Date(item.start_time),
                endTime: new Date(item.end_time),
                actualDuration: item.actual_duration,
                estimatedDuration: item.estimated_duration,
                actualDistance: item.actual_distance,
                pickupCoordinates: {
                    lat: item.pickup_lat,
                    lng: item.pickup_lng
                },
                dropoffCoordinates: {
                    lat: item.dropoff_lat,
                    lng: item.dropoff_lng
                },
                trafficCondition: item.traffic_condition,
                completionStatus: item.completion_status,
                fare: item.fare
            }));
        } catch (error) {
            console.error('Error fetching trip analytics data:', error);
            return [];
        }
    }

    async getRouteUsageStats(routeId: number, days: number = 7): Promise<any> {
        try {
            const startDate = new Date();
            startDate.setDate(startDate.getDate() - days);

            const { data, error } = await this.supabase
                .from('route_usage_analytics')
                .select('*')
                .eq('route_id', routeId)
                .gte('timestamp', startDate.toISOString());

            if (error) throw error;

            return data || [];
        } catch (error) {
            console.error('Error fetching route usage stats:', error);
            return [];
        }
    }
}