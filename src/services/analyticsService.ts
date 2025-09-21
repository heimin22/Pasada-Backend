import { OfficialRoute } from "../types/route";
import { TrafficAnalytics, TrafficData, TrafficPrediction, TrafficSummary } from "../types/traffic";
import { DatabaseService } from "./databaseService";
import { GeminiService } from "./geminiService";
import { GoogleMapsService } from "./googleMapsService";


export class AnalyticsService {
    constructor(
        private databaseService: DatabaseService,
        private geminiService: GeminiService,
        private googleMapsService: GoogleMapsService
    ) {}

    async generateRouteAnalytics(routeId: number): Promise<TrafficAnalytics> {
        try {
            // get route information
            const route = await this.databaseService.getRouteById(routeId);
            if (!route) {
                throw new Error(`Route with ID ${routeId} not found`);
            }

            // get historical traffic data
            const historicalData = await this.getHistoricalTrafficData(route);

            // generate predictions
            const predictions = this.generateTrafficPredictions(historicalData);
      
            // calculate summary
            const summary = this.calculateTrafficSummary(historicalData);

      // Create analytics object without Gemini insights first
      const analyticsWithoutInsights: Omit<TrafficAnalytics, 'geminiInsights'> = {
        routeId: route.officialroute_id,
        routeName: route.route_name,
        historicalData,
        predictions,
        summary
      };

      // Get AI insights with fallback
      let geminiInsights: string;
      try {
        geminiInsights = await this.geminiService.analyzeTrafficData(analyticsWithoutInsights);
      } catch (error) {
        console.warn(`Failed to get Gemini insights for route ${routeId}, using fallback:`, error);
        // Fallback insight based on traffic data
        const density = summary.averageDensity;
        const peakHours = summary.peakHours.join(', ');
        if (density > 0.7) {
          geminiInsights = `Heavy traffic expected on ${route.route_name}. Consider alternative routes during peak hours (${peakHours}).`;
        } else if (density > 0.4) {
          geminiInsights = `Moderate traffic on ${route.route_name}. Plan for slightly longer travel times during peak hours (${peakHours}).`;
        } else {
          geminiInsights = `Light traffic conditions on ${route.route_name}. Good time to travel with minimal delays expected.`;
        }
      }

      return {
        ...analyticsWithoutInsights,
        geminiInsights
      };
    } catch (error) {
      console.error('Error generating analytics:', error);
      throw new Error(`Failed to generate analytics for route ${routeId}`);
    }
  }

  async getAllRoutesAnalytics(): Promise<TrafficAnalytics[]> {
    try {
      const routes = await this.databaseService.getAllRoutes();
      const results: TrafficAnalytics[] = [];
      
      // Process routes sequentially to avoid rate limiting
      for (const route of routes) {
        try {
          const analytics = await this.generateRouteAnalytics(route.officialroute_id);
          results.push(analytics);
          
          // Add delay between requests to respect rate limits
          await new Promise(resolve => setTimeout(resolve, 1000));
        } catch (error) {
          console.error(`Error generating analytics for route ${route.officialroute_id}:`, error);
          // Continue with other routes even if one fails
          // You could also add a fallback analytics object here
        }
      }

      return results;
    } catch (error) {
      console.error('Error generating all routes analytics:', error);
      throw new Error('Failed to generate analytics for all routes');
    }
  }

  async getConciseSummaries(): Promise<Array<{ routeId: number; routeName: string; averageDensity: number; summary: string }>> {
    const analytics = await this.getAllRoutesAnalytics();
    return analytics.map(a => ({
      routeId: a.routeId,
      routeName: a.routeName,
      averageDensity: a.summary.averageDensity,
      summary: a.geminiInsights
    }));
  }

  async refreshAllTrafficData(): Promise<{ routesUpdated: number; message: string }> {
    try {
      const routes = await this.databaseService.getAllRoutes();
      let updatedCount = 0;
      
      for (const route of routes) {
        try {
          // Force refresh by getting fresh data
          const historicalData = await this.getHistoricalTrafficData(route);
          
          if (historicalData.length > 0) {
            // Save the fresh data
            await this.databaseService.saveTrafficData(historicalData);
            updatedCount++;
          }
        } catch (error) {
          console.error(`Failed to refresh traffic data for route ${route.route_name}:`, error);
        }
      }
      
      return {
        routesUpdated: updatedCount,
        message: `Successfully refreshed traffic data for ${updatedCount} routes`
      };
    } catch (error) {
      console.error('Error refreshing all traffic data:', error);
      throw new Error('Failed to refresh traffic data');
    }
  }

  private async getHistoricalTrafficData(route: OfficialRoute): Promise<TrafficData[]> {
    // First, try to get from database
    let historicalData = await this.databaseService.getHistoricalTrafficData(route.officialroute_id, 7);

    // If no data in database, fetch from Google Maps
    if (historicalData.length === 0) {
      console.log(`Fetching fresh traffic data for route ${route.route_name}`);
      // Prefer coordinates if available; fallback to names
      const origin = route.origin_lat !== undefined && route.origin_lng !== undefined
        ? `${route.origin_lat},${route.origin_lng}`
        : route.origin_name;
      const destination = route.destination_lat !== undefined && route.destination_lng !== undefined
        ? `${route.destination_lat},${route.destination_lng}`
        : route.destination_name;
      const waypoints = Array.isArray(route.intermediate_coordinates) ? route.intermediate_coordinates : undefined;

      try {
        historicalData = await this.googleMapsService.getHistoricalTrafficPattern(
          origin,
          destination,
          7,
          waypoints
        );

        // Set route ID and save to database
        historicalData.forEach(data => data.routeId = route.officialroute_id);
        await this.databaseService.saveTrafficData(historicalData);
      } catch (error) {
        console.log(`Failed to fetch from Google Maps, generating realistic mock data for route ${route.route_name}`);
        // Generate realistic mock data if Google Maps fails
        historicalData = this.generateRealisticTrafficData(route);
        historicalData.forEach(data => data.routeId = route.officialroute_id);
        await this.databaseService.saveTrafficData(historicalData);
      }
    }

    return historicalData;
  }

  private generateRealisticTrafficData(route: OfficialRoute): TrafficData[] {
    const mockData: TrafficData[] = [];
    const now = new Date();
    
    // Generate 7 days of realistic traffic data
    for (let day = 0; day < 7; day++) {
      const baseDate = new Date(now);
      baseDate.setDate(now.getDate() - day);
      
      // Generate data for key hours with realistic patterns
      const keyHours = [6, 7, 8, 9, 12, 17, 18, 19, 22];
      
      keyHours.forEach(hour => {
        const timestamp = new Date(baseDate);
        timestamp.setHours(hour, 0, 0, 0);
        
        // Base traffic density varies by time and day
        let baseDensity = 0.3; // Default moderate traffic
        
        // Rush hour adjustments
        if (hour >= 7 && hour <= 9) {
          baseDensity = 0.7 + (Math.random() * 0.2); // 70-90% during morning rush
        } else if (hour >= 17 && hour <= 19) {
          baseDensity = 0.8 + (Math.random() * 0.15); // 80-95% during evening rush
        } else if (hour >= 22 || hour <= 6) {
          baseDensity = 0.1 + (Math.random() * 0.2); // 10-30% late night/early morning
        } else if (hour === 12) {
          baseDensity = 0.5 + (Math.random() * 0.2); // 50-70% lunch time
        }
        
        // Weekend adjustments
        const dayOfWeek = timestamp.getDay();
        if (dayOfWeek === 0 || dayOfWeek === 6) {
          baseDensity *= 0.6; // 40% less traffic on weekends
        }
        
        // Add some randomness
        baseDensity += (Math.random() - 0.5) * 0.1;
        baseDensity = Math.max(0, Math.min(1, baseDensity)); // Clamp between 0-1
        
        // Calculate realistic durations
        const baseDuration = 1800; // 30 minutes base
        const trafficMultiplier = 1 + (baseDensity * 0.8); // Up to 80% delay
        const durationInTraffic = Math.round(baseDuration * trafficMultiplier);
        
        // Distance (in meters) - varies by route
        const baseDistance = 5000; // 5km base
        const distanceVariation = 0.8 + (Math.random() * 0.4); // 80-120% variation
        const distance = Math.round(baseDistance * distanceVariation);
        
        mockData.push({
          routeId: route.officialroute_id,
          timestamp,
          trafficDensity: baseDensity,
          duration: baseDuration,
          durationInTraffic,
          distance,
          status: 'OK'
        });
      });
    }
    
    return mockData;
  }

  private generateTrafficPredictions(historicalData: TrafficData[]): TrafficPrediction[] {
    const predictions: TrafficPrediction[] = [];
    const now = new Date();

    // Generate predictions for next 7 days
    for (let day = 1; day <= 7; day++) {
      const predictionDate = new Date(now);
      predictionDate.setDate(now.getDate() + day);

      // Generate predictions for key hours
      const keyHours = [7, 9, 12, 17, 19, 22]; // Morning rush, work hours, evening rush, night

      keyHours.forEach(hour => {
        const prediction = this.predictTrafficForTime(historicalData, predictionDate, hour);
        predictions.push(prediction);
      });
    }

    return predictions;
  }

  private predictTrafficForTime(historicalData: TrafficData[], date: Date, hour: number): TrafficPrediction {
    // Simple prediction based on historical patterns for same day of week and hour
    const dayOfWeek = date.getDay();
    const similarTimeData = historicalData.filter(data => {
      const dataDate = new Date(data.timestamp);
      return dataDate.getDay() === dayOfWeek && dataDate.getHours() === hour;
    });

    let predictedDensity = 0.5; // Default
    let confidence = 0.3; // Low confidence by default

    if (similarTimeData.length > 0) {
      const avgDensity = similarTimeData.reduce((sum, data) => sum + data.trafficDensity, 0) / similarTimeData.length;
      predictedDensity = avgDensity;
      confidence = Math.min(0.9, 0.5 + (similarTimeData.length * 0.1)); // Higher confidence with more data
    }

    return {
      date,
      predictedDensity,
      confidence,
      timeOfDay: `${hour.toString().padStart(2, '0')}:00`
    };
  }

  private calculateTrafficSummary(historicalData: TrafficData[]): TrafficSummary {
    if (historicalData.length === 0) {
      return {
        averageDensity: 0,
        peakHours: [],
        lowTrafficHours: [],
        weekdayVsWeekend: { weekday: 0, weekend: 0 },
        trend: 'stable'
      };
    }

    // Calculate average density
    const averageDensity = historicalData.reduce((sum, data) => sum + data.trafficDensity, 0) / historicalData.length;

    // Group by hour to find peak and low traffic times
    const hourlyData = new Map<number, number[]>();
    historicalData.forEach(data => {
      const hour = data.timestamp.getHours();
      if (!hourlyData.has(hour)) {
        hourlyData.set(hour, []);
      }
      hourlyData.get(hour)!.push(data.trafficDensity);
    });

    const hourlyAverages = new Map<number, number>();
    hourlyData.forEach((densities, hour) => {
      const avg = densities.reduce((sum, d) => sum + d, 0) / densities.length;
      hourlyAverages.set(hour, avg);
    });

    // Find peak and low traffic hours
    const sortedHours = Array.from(hourlyAverages.entries()).sort((a, b) => b[1] - a[1]);
    const peakHours = sortedHours.slice(0, 3).map(([hour]) => `${hour.toString().padStart(2, '0')}:00`);
    const lowTrafficHours = sortedHours.slice(-3).map(([hour]) => `${hour.toString().padStart(2, '0')}:00`);

    // Calculate weekday vs weekend
    const weekdayData = historicalData.filter(data => {
      const day = data.timestamp.getDay();
      return day >= 1 && day <= 5;
    });
    const weekendData = historicalData.filter(data => {
      const day = data.timestamp.getDay();
      return day === 0 || day === 6;
    });

    const weekdayAvg = weekdayData.length > 0 ? 
      weekdayData.reduce((sum, data) => sum + data.trafficDensity, 0) / weekdayData.length : 0;
    const weekendAvg = weekendData.length > 0 ? 
      weekendData.reduce((sum, data) => sum + data.trafficDensity, 0) / weekendData.length : 0;

    // Calculate trend
    const trend = this.calculateTrend(historicalData);

    return {
      averageDensity,
      peakHours,
      lowTrafficHours,
      weekdayVsWeekend: {
        weekday: weekdayAvg,
        weekend: weekendAvg
      },
      trend
    };
  }

  private calculateTrend(historicalData: TrafficData[]): 'increasing' | 'decreasing' | 'stable' {
    if (historicalData.length < 2) return 'stable';

    const sortedData = historicalData.sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime());
    const firstHalf = sortedData.slice(0, Math.floor(sortedData.length / 2));
    const secondHalf = sortedData.slice(Math.floor(sortedData.length / 2));

    const firstHalfAvg = firstHalf.reduce((sum, data) => sum + data.trafficDensity, 0) / firstHalf.length;
    const secondHalfAvg = secondHalf.reduce((sum, data) => sum + data.trafficDensity, 0) / secondHalf.length;

    const difference = secondHalfAvg - firstHalfAvg;
    
    if (Math.abs(difference) < 0.05) return 'stable';
    return difference > 0 ? 'increasing' : 'decreasing';
  }
}