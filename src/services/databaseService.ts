import { createClient, SupabaseClient } from "@supabase/supabase-js";
import { OfficialRoute } from "../types/route";
import { TrafficData, TripAnalyticsData, RouteUsageData } from "../types/traffic";

export class DatabaseService {
    private supabase: SupabaseClient;

    constructor(supabaseUrl: string, supabaseKey: string) {
        this.supabase = createClient(supabaseUrl, supabaseKey);
    }

    getSupabaseClient(): SupabaseClient {
        return this.supabase;
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

    // Booking & system summaries for AI grounding
    async getBookingsSummary(days: number = 7): Promise<{
        totalBookings: number;
        averagePerDay: number;
        daily: Array<{ date: string; count: number }>;
    }> {
        try {
            const startDate = new Date();
            startDate.setDate(startDate.getDate() - days);

            const { data, error } = await this.supabase
                .from('bookings')
                .select('created_at')
                .gte('created_at', startDate.toISOString())
                .order('created_at', { ascending: true });
            if (error) throw error;

            const counts = new Map<string, number>();
            for (let i = 0; i < days; i++) {
                const d = new Date();
                d.setDate(d.getDate() - (days - 1 - i));
                counts.set(d.toISOString().split('T')[0], 0);
            }
            (data || []).forEach(row => {
                const ds = new Date(row.created_at as string).toISOString().split('T')[0];
                counts.set(ds, (counts.get(ds) || 0) + 1);
            });

            const daily = Array.from(counts.entries()).map(([date, count]) => ({ date, count }));
            const totalBookings = daily.reduce((s, d) => s + d.count, 0);
            const averagePerDay = daily.length ? Math.round(totalBookings / daily.length) : 0;

            return { totalBookings, averagePerDay, daily };
        } catch (error) {
            console.error('Error fetching bookings summary:', error);
            return { totalBookings: 0, averagePerDay: 0, daily: [] };
        }
    }

    async getRoutesSummary(): Promise<{
        activeRoutes: number;
        routeNames: string[];
    }> {
        try {
            const { data, error } = await this.supabase
                .from('official_routes')
                .select('route_name')
                .eq('status', 'active');
            if (error) throw error;
            const names = (data || []).map(r => r.route_name as string);
            return { activeRoutes: names.length, routeNames: names };
        } catch (error) {
            console.error('Error fetching routes summary:', error);
            return { activeRoutes: 0, routeNames: [] };
        }
    }

    // Additional summaries for extended AI context
    async getDriversSummary(): Promise<{ totalDrivers: number }> {
        try {
            const { count, error } = await this.supabase
                .from('driverTable')
                .select('*', { count: 'exact', head: true });
            if (error) throw error;
            return { totalDrivers: count || 0 };
        } catch (error) {
            console.warn('Drivers summary unavailable:', error);
            return { totalDrivers: 0 };
        }
    }

    async getDriverQuotasSummary(): Promise<{ quotaPolicies: number }> {
        try {
            const { count, error } = await this.supabase
                .from('driverQuotasTable')
                .select('*', { count: 'exact', head: true });
            if (error) throw error;
            return { quotaPolicies: count || 0 };
        } catch (error) {
            console.warn('Driver quotas summary unavailable:', error);
            return { quotaPolicies: 0 };
        }
    }

    async getAdminQuotasSummary(): Promise<{ adminQuotaPolicies: number }> {
        try {
            const { count, error } = await this.supabase
                .from('adminQuotaTable')
                .select('*', { count: 'exact', head: true });
            if (error) throw error;
            return { adminQuotaPolicies: count || 0 };
        } catch (error) {
            console.warn('Admin quotas summary unavailable:', error);
            return { adminQuotaPolicies: 0 };
        }
    }

    async getAdminsSummary(): Promise<{ totalAdmins: number }> {
        try {
            const { count, error } = await this.supabase
                .from('adminTable')
                .select('*', { count: 'exact', head: true });
            if (error) throw error;
            return { totalAdmins: count || 0 };
        } catch (error) {
            console.warn('Admins summary unavailable:', error);
            return { totalAdmins: 0 };
        }
    }

    async getVehiclesSummary(): Promise<{ totalVehicles: number }> {
        try {
            const { count, error } = await this.supabase
                .from('vehicleTable')
                .select('*', { count: 'exact', head: true });
            if (error) throw error;
            return { totalVehicles: count || 0 };
        } catch (error) {
            console.warn('Vehicles summary unavailable:', error);
            return { totalVehicles: 0 };
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