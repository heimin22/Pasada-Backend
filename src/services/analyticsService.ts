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

      // Get AI insights
      const geminiInsights = await this.geminiService.analyzeTrafficData(analyticsWithoutInsights);

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
      const analyticsPromises = routes.map(route => 
        this.generateRouteAnalytics(route.officialroute_id)
      );

      return Promise.all(analyticsPromises);
    } catch (error) {
      console.error('Error generating all routes analytics:', error);
      throw new Error('Failed to generate analytics for all routes');
    }
  }

  private async getHistoricalTrafficData(route: OfficialRoute): Promise<TrafficData[]> {
    // First, try to get from database
    let historicalData = await this.databaseService.getHistoricalTrafficData(route.officialroute_id, 7);

    // If no data in database, fetch from Google Maps
    if (historicalData.length === 0) {
      console.log(`Fetching fresh traffic data for route ${route.route_name}`);
      historicalData = await this.googleMapsService.getHistoricalTrafficPattern(
        route.origin_name,
        route.destination_name,
        7
      );

      // Set route ID and save to database
      historicalData.forEach(data => data.routeId = route.officialroute_id);
      await this.databaseService.saveTrafficData(historicalData);
    }

    return historicalData;
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