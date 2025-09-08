import { DatabaseService } from "./databaseService";
import { GoogleMapsService } from "./googleMapsService";
import { TripAnalyticsData, TrafficData } from "../types/traffic";

interface TripData {
    booking_id: string;
    route_id: number;
    passenger_id: string;
    driver_id?: string;
    created_at: string;
    started_at?: string;
    completed_at?: string;
    pickup_lat: number;
    pickup_lng: number;
    dropoff_lat: number;
    dropoff_lng: number;
    fare?: number;
    ride_status: string;
}

export class RealTimeAnalyticsService {
    constructor(
        private databaseService: DatabaseService,
        private googleMapsService?: GoogleMapsService
    ) {}

    async processTripCompletion(tripData: TripData): Promise<void> {
        try {
            console.log(`Processing trip completion analytics for trip ${tripData.booking_id}`);

            // Extract trip analytics data
            const tripAnalytics = await this.extractTripAnalytics(tripData);
            
            // Save trip analytics
            await this.databaseService.saveTripAnalyticsData(tripAnalytics);

            // Convert trip data to traffic data and save it
            const trafficData = await this.convertTripToTrafficData(tripData, tripAnalytics);
            if (trafficData) {
                await this.databaseService.saveTrafficData([trafficData]);
                console.log(`Traffic data generated from trip ${tripData.booking_id}`);
            }

        } catch (error) {
            console.error(`Error processing trip completion analytics for trip ${tripData.booking_id}:`, error);
            // Don't throw - we don't want analytics processing to break trip completion
        }
    }

    private async extractTripAnalytics(tripData: TripData): Promise<TripAnalyticsData> {
        const startTime = tripData.started_at ? new Date(tripData.started_at) : new Date(tripData.created_at);
        const endTime = new Date(tripData.completed_at || new Date());
        const actualDuration = Math.floor((endTime.getTime() - startTime.getTime()) / 1000); // in seconds

        // Calculate estimated duration if we have Google Maps service
        let estimatedDuration: number | undefined;
        if (this.googleMapsService) {
            try {
                const estimate = await this.googleMapsService.getEstimatedDuration(
                    `${tripData.pickup_lat},${tripData.pickup_lng}`,
                    `${tripData.dropoff_lat},${tripData.dropoff_lng}`
                );
                estimatedDuration = estimate;
            } catch (error) {
                console.log('Could not get estimated duration from Google Maps');
            }
        }

        // Determine traffic condition based on actual vs estimated duration
        const trafficCondition = this.calculateTrafficCondition(actualDuration, estimatedDuration);

        const tripAnalytics: TripAnalyticsData = {
            tripId: tripData.booking_id,
            routeId: tripData.route_id,
            passengerId: tripData.passenger_id,
            driverId: tripData.driver_id,
            startTime,
            endTime,
            actualDuration,
            estimatedDuration,
            pickupCoordinates: {
                lat: tripData.pickup_lat,
                lng: tripData.pickup_lng
            },
            dropoffCoordinates: {
                lat: tripData.dropoff_lat,
                lng: tripData.dropoff_lng
            },
            trafficCondition,
            completionStatus: tripData.ride_status === 'completed' ? 'completed' : 'cancelled',
            fare: tripData.fare
        };

        return tripAnalytics;
    }

    private calculateTrafficCondition(
        actualDuration: number, 
        estimatedDuration?: number
    ): 'light' | 'moderate' | 'heavy' | 'severe' {
        if (!estimatedDuration) {
            // If no estimate, use time of day as a rough indicator
            const hour = new Date().getHours();
            if ((hour >= 7 && hour <= 9) || (hour >= 17 && hour <= 19)) {
                return 'moderate'; // Rush hour
            }
            return 'light';
        }

        const delayRatio = actualDuration / estimatedDuration;
        
        if (delayRatio <= 1.1) return 'light';      // Up to 10% delay
        if (delayRatio <= 1.3) return 'moderate';   // 10-30% delay
        if (delayRatio <= 1.6) return 'heavy';      // 30-60% delay
        return 'severe';                            // Over 60% delay
    }

    private async convertTripToTrafficData(
        tripData: TripData, 
        tripAnalytics: TripAnalyticsData
    ): Promise<TrafficData | null> {
        try {
            // Calculate traffic density based on the delay
            let trafficDensity = 0.3; // Default moderate traffic
            
            switch (tripAnalytics.trafficCondition) {
                case 'light':
                    trafficDensity = 0.1 + Math.random() * 0.2; // 10-30%
                    break;
                case 'moderate':
                    trafficDensity = 0.3 + Math.random() * 0.2; // 30-50%
                    break;
                case 'heavy':
                    trafficDensity = 0.5 + Math.random() * 0.3; // 50-80%
                    break;
                case 'severe':
                    trafficDensity = 0.8 + Math.random() * 0.2; // 80-100%
                    break;
            }

            // Calculate distance if not provided
            let distance = tripAnalytics.actualDistance;
            if (!distance) {
                // Rough distance calculation using Haversine formula
                distance = this.calculateDistance(
                    tripAnalytics.pickupCoordinates.lat,
                    tripAnalytics.pickupCoordinates.lng,
                    tripAnalytics.dropoffCoordinates.lat,
                    tripAnalytics.dropoffCoordinates.lng
                );
            }

            const trafficData: TrafficData = {
                routeId: tripData.route_id,
                timestamp: tripAnalytics.endTime,
                trafficDensity,
                duration: tripAnalytics.estimatedDuration || tripAnalytics.actualDuration,
                durationInTraffic: tripAnalytics.actualDuration,
                distance: distance || 5000, // Default 5km if calculation fails
                status: 'OK'
            };

            return trafficData;
        } catch (error) {
            console.error('Error converting trip to traffic data:', error);
            return null;
        }
    }

    private calculateDistance(lat1: number, lng1: number, lat2: number, lng2: number): number {
        const R = 6371e3; // Earth's radius in meters
        const φ1 = lat1 * Math.PI / 180;
        const φ2 = lat2 * Math.PI / 180;
        const Δφ = (lat2 - lat1) * Math.PI / 180;
        const Δλ = (lng2 - lng1) * Math.PI / 180;

        const a = Math.sin(Δφ/2) * Math.sin(Δφ/2) +
                Math.cos(φ1) * Math.cos(φ2) *
                Math.sin(Δλ/2) * Math.sin(Δλ/2);
        const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));

        return R * c; // Distance in meters
    }

    async processRouteUsage(
        routeId: number,
        endpoint: string,
        method: string,
        userId?: string,
        userType?: 'passenger' | 'driver' | 'admin',
        responseTime: number = 0,
        statusCode: number = 200
    ): Promise<void> {
        try {
            await this.databaseService.saveRouteUsageData({
                routeId,
                timestamp: new Date(),
                endpoint,
                method,
                userId,
                userType,
                responseTime,
                statusCode
            });
        } catch (error) {
            console.error('Error processing route usage analytics:', error);
            // Don't throw - analytics shouldn't break main functionality
        }
    }
}
