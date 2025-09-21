import axios from "axios";
import { TrafficData } from "../types/traffic";

export class GoogleMapsService {
    private apiKey: string;
    private baseUrl = 'https://maps.googleapis.com/maps/api';
    
    constructor(apiKey: string) {
        this.apiKey = apiKey;
    }

    async getTrafficData(origin: string, destination: string, waypoints?: Array<{ lat: number; lng: number }>): Promise<TrafficData> {
        try {
            const params: Record<string, string> = {
                origin,
                destination,
                departure_time: 'now',
                traffic_model: 'best_guess',
                key: this.apiKey
            };

            if (waypoints && waypoints.length > 0) {
                params['waypoints'] = waypoints.map(wp => `via:${wp.lat},${wp.lng}`).join('|');
            }

            const response = await axios.get(`${this.baseUrl}/directions/json`, { params });

            const data = response.data;

            if (data.status !== 'OK' || !data.routes.length) {
                throw new Error(`Google Maps API returned status: ${data.status}`);
            }

            const route = data.routes[0];
            const legs = route.legs[0]; 

            const normalDuration = legs.duration.value;
            const trafficDuration = legs.duration_in_traffic?.value || normalDuration;
            const trafficDensity = Math.min((trafficDuration / normalDuration - 1), 1);

            return {
                routeId: 0, // Will be set by caller
                timestamp: new Date(),
                trafficDensity: Math.max(0, trafficDensity),
                duration: normalDuration,
                durationInTraffic: trafficDuration,
                distance: legs.distance.value,
                status: 'OK'
            }
        } catch (error) {
            console.error('Error fetching traffic data:', error);
            throw new Error('Failed to fetch traffic data from Google Maps API');
        }
    }

    async getTrafficDataForTime(origin: string, destination: string, targetTime: Date, waypoints?: Array<{ lat: number; lng: number }>): Promise<TrafficData | null> {
        try {
            const params: Record<string, string> = {
                origin,
                destination,
                departure_time: Math.floor(targetTime.getTime() / 1000).toString(),
                traffic_model: 'best_guess',
                key: this.apiKey
            };

            if (waypoints && waypoints.length > 0) {
                params['waypoints'] = waypoints.map(wp => `via:${wp.lat},${wp.lng}`).join('|');
            }

            const response = await axios.get(`${this.baseUrl}/directions/json`, { params });
            const data = response.data;

            if (data.status !== 'OK' || !data.routes.length) {
                console.warn(`Google Maps API returned status: ${data.status} for time ${targetTime.toISOString()}`);
                return null;
            }

            const route = data.routes[0];
            const legs = route.legs[0]; 

            const normalDuration = legs.duration.value;
            const trafficDuration = legs.duration_in_traffic?.value || normalDuration;
            const trafficDensity = Math.min((trafficDuration / normalDuration - 1), 1);

            return {
                routeId: 0, // Will be set by caller
                timestamp: targetTime,
                trafficDensity: Math.max(0, trafficDensity),
                duration: normalDuration,
                durationInTraffic: trafficDuration,
                distance: legs.distance.value,
                status: 'OK'
            };
        } catch (error) {
            console.error(`Error fetching traffic data for time ${targetTime.toISOString()}:`, error);
            return null;
        }
    }

    async getHistoricalTrafficPattern(origin: string, destination: string, days: number = 7, waypoints?: Array<{ lat: number; lng: number }>): Promise<TrafficData[]> {
        const historicalData: TrafficData[] = [];
        const now = new Date();

        // simulate getting historical data by sampling different times
        for (let day = 0; day < days; day++) {
            for (let hour = 0; hour < 24; hour += 2) {
                try {
                    const sampleTime = new Date(now);
                    sampleTime.setDate(now.getDate() - day);
                    sampleTime.setHours(hour, 0, 0, 0);

                    // use historical traffic if available
                    const trafficData = await this.getTrafficData(origin, destination, waypoints);
                    trafficData.timestamp = sampleTime;

                    // adjust density based on typical patterns
                    trafficData.trafficDensity = this.adjustForTimePattern(trafficData.trafficDensity, hour, sampleTime.getDay());
                    historicalData.push(trafficData);
                } catch (error) {
                    console.error(`Error getting traffic for ${day} days ago, hour ${hour}:`, error);
                }
            }
        }

        return historicalData;
    }

    private adjustForTimePattern(baseDensity: number, hour: number, dayOfWeek: number): number {
        // apply typical traffic patterns 
        let multiplier = 1;

        // rush hour adjustments
        if ((hour >= 7 && hour <= 9) || (hour >= 16 && hour <= 19)) {
            multiplier = 1.5;
        }

        // late night/early morning 
        else if (hour >= 23 || hour <= 5) {
            multiplier = 0.3;
        }

        // weekend adjustments
        if (dayOfWeek === 0 || dayOfWeek === 6) {
            multiplier = 0.7;
        }

        return Math.min(baseDensity * multiplier, 1);
    }

    async getEstimatedDuration(origin: string, destination: string): Promise<number> {
        try {
            const params = {
                origin,
                destination,
                departure_time: 'now',
                traffic_model: 'best_guess',
                key: this.apiKey
            };

            const response = await axios.get(`${this.baseUrl}/directions/json`, { params });
            const data = response.data;

            if (data.status !== 'OK' || !data.routes.length) {
                throw new Error(`Google Maps API returned status: ${data.status}`);
            }

            const route = data.routes[0];
            const legs = route.legs[0];
            
            return legs.duration.value; // Duration in seconds
        } catch (error) {
            console.error('Error getting estimated duration:', error);
            throw new Error('Failed to get estimated duration from Google Maps API');
        }
    }
}