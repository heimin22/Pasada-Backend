import { DatabaseService } from './databaseService';
import { AnalyticsService } from './analyticsService';
import { GoogleMapsService } from './googleMapsService';

export interface WeeklyAnalyticsData {
  routeId: number;
  routeName: string;
  weekStart: string;
  weekEnd: string;
  totalDataPoints: number;
  averageTrafficDensity: number;
  peakTrafficDensity: number;
  lowTrafficDensity: number;
  averageSpeed: number;
  peakHours: string[];
  lowTrafficHours: string[];
  weekdayVsWeekend: {
    weekday: number;
    weekend: number;
  };
  trend: 'increasing' | 'decreasing' | 'stable';
  dailyBreakdown: {
    date: string;
    dataPoints: number;
    averageDensity: number;
    peakDensity: number;
  }[];
}

export interface WeeklyProcessingResponse {
  success: boolean;
  message: string;
  data: {
    weekOffset: number;
    routesProcessed: number;
    totalDataPoints: number;
    weekStart: string;
    weekEnd: string;
    analytics: WeeklyAnalyticsData[];
  };
  timestamp: string;
}

export class WeeklyAnalyticsService {
  constructor(
    private databaseService: DatabaseService,
    private analyticsService: AnalyticsService,
    private googleMapsService: GoogleMapsService
  ) {}

  async processWeeklyAnalytics(weekOffset: number = 0): Promise<WeeklyProcessingResponse> {
    try {
      console.log(`Processing weekly analytics for week offset: ${weekOffset}`);
      
      // Calculate the week start and end dates
      const { weekStart, weekEnd } = this.calculateWeekDates(weekOffset);
      
      // Get all routes
      const routes = await this.databaseService.getAllRoutes();
      console.log(`Found ${routes.length} routes to process`);
      
      const weeklyAnalytics: WeeklyAnalyticsData[] = [];
      let totalDataPoints = 0;
      
      // Process each route
      for (const route of routes) {
        try {
          console.log(`Processing route ${route.route_name} (ID: ${route.officialroute_id})`);
          
          // Get historical traffic data for the specific week
          const historicalData = await this.getWeeklyTrafficData(route.officialroute_id, weekStart, weekEnd);
          
          if (historicalData.length === 0) {
            console.log(`No data found for route ${route.route_name} in the specified week`);
            continue;
          }
          
          // Generate analytics for this route
          const routeAnalytics = await this.generateRouteWeeklyAnalytics(route, historicalData, weekStart, weekEnd);
          weeklyAnalytics.push(routeAnalytics);
          totalDataPoints += historicalData.length;
          
          console.log(`Processed route ${route.route_name}: ${historicalData.length} data points`);
        } catch (error) {
          console.error(`Error processing route ${route.route_name}:`, error);
          // Continue with other routes even if one fails
        }
      }
      
      const response: WeeklyProcessingResponse = {
        success: true,
        message: `Weekly analytics processing completed for ${weeklyAnalytics.length} routes`,
        data: {
          weekOffset,
          routesProcessed: weeklyAnalytics.length,
          totalDataPoints,
          weekStart: weekStart.toISOString(),
          weekEnd: weekEnd.toISOString(),
          analytics: weeklyAnalytics
        },
        timestamp: new Date().toISOString()
      };
      
      console.log(`Weekly analytics processing completed: ${weeklyAnalytics.length} routes, ${totalDataPoints} total data points`);
      return response;
      
    } catch (error) {
      console.error('Error processing weekly analytics:', error);
      return {
        success: false,
        message: `Failed to process weekly analytics: ${error instanceof Error ? error.message : 'Unknown error'}`,
        data: {
          weekOffset,
          routesProcessed: 0,
          totalDataPoints: 0,
          weekStart: '',
          weekEnd: '',
          analytics: []
        },
        timestamp: new Date().toISOString()
      };
    }
  }

  private calculateWeekDates(weekOffset: number): { weekStart: Date; weekEnd: Date } {
    const now = new Date();
    
    // Calculate the start of the current week (Monday)
    const currentWeekStart = new Date(now);
    const dayOfWeek = now.getDay();
    const daysToMonday = dayOfWeek === 0 ? -6 : 1 - dayOfWeek; // Sunday is 0, Monday is 1
    currentWeekStart.setDate(now.getDate() + daysToMonday);
    currentWeekStart.setHours(0, 0, 0, 0);
    
    // Apply week offset
    const weekStart = new Date(currentWeekStart);
    weekStart.setDate(currentWeekStart.getDate() + (weekOffset * 7));
    
    // Calculate week end (Sunday)
    const weekEnd = new Date(weekStart);
    weekEnd.setDate(weekStart.getDate() + 6);
    weekEnd.setHours(23, 59, 59, 999);
    
    return { weekStart, weekEnd };
  }

  private async getWeeklyTrafficData(routeId: number, weekStart: Date, weekEnd: Date): Promise<any[]> {
    try {
      // Use the existing getHistoricalTrafficData method but filter by date range
      const allHistoricalData = await this.databaseService.getHistoricalTrafficData(routeId, 30); // Get more data to ensure we have the week
      
      // Filter to the specific week
      return allHistoricalData.filter(data => {
        const dataDate = new Date(data.timestamp);
        return dataDate >= weekStart && dataDate <= weekEnd;
      });
    } catch (error) {
      console.error(`Error fetching weekly traffic data for route ${routeId}:`, error);
      return [];
    }
  }

  private async generateRouteWeeklyAnalytics(route: any, historicalData: any[], weekStart: Date, weekEnd: Date): Promise<WeeklyAnalyticsData> {
    // Calculate basic statistics
    const trafficDensities = historicalData.map(data => data.trafficDensity);
    const averageTrafficDensity = trafficDensities.reduce((sum, density) => sum + density, 0) / trafficDensities.length;
    const peakTrafficDensity = Math.max(...trafficDensities);
    const lowTrafficDensity = Math.min(...trafficDensities);
    
    // Calculate average speed (if duration and distance are available)
    const speedData = historicalData.filter(data => data.duration && data.distance && data.duration > 0);
    const averageSpeed = speedData.length > 0 
      ? speedData.reduce((sum, data) => sum + (data.distance / data.duration * 3.6), 0) / speedData.length // Convert m/s to km/h
      : 0;
    
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

    // Generate daily breakdown
    const dailyBreakdown = this.generateDailyBreakdown(historicalData, weekStart);

    return {
      routeId: route.officialroute_id,
      routeName: route.route_name,
      weekStart: weekStart.toISOString(),
      weekEnd: weekEnd.toISOString(),
      totalDataPoints: historicalData.length,
      averageTrafficDensity,
      peakTrafficDensity,
      lowTrafficDensity,
      averageSpeed,
      peakHours,
      lowTrafficHours,
      weekdayVsWeekend: {
        weekday: weekdayAvg,
        weekend: weekendAvg
      },
      trend,
      dailyBreakdown
    };
  }

  private calculateTrend(historicalData: any[]): 'increasing' | 'decreasing' | 'stable' {
    if (historicalData.length < 2) return 'stable';
    
    // Sort by timestamp
    const sortedData = historicalData.sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime());
    
    // Calculate average density for first half and second half
    const midPoint = Math.floor(sortedData.length / 2);
    const firstHalf = sortedData.slice(0, midPoint);
    const secondHalf = sortedData.slice(midPoint);
    
    const firstHalfAvg = firstHalf.reduce((sum, data) => sum + data.trafficDensity, 0) / firstHalf.length;
    const secondHalfAvg = secondHalf.reduce((sum, data) => sum + data.trafficDensity, 0) / secondHalf.length;
    
    const difference = secondHalfAvg - firstHalfAvg;
    const threshold = 0.1; // 10% change threshold
    
    if (difference > threshold) return 'increasing';
    if (difference < -threshold) return 'decreasing';
    return 'stable';
  }

  private generateDailyBreakdown(historicalData: any[], weekStart: Date): any[] {
    const dailyData = new Map<string, any[]>();
    
    // Group data by date
    historicalData.forEach(data => {
      const date = data.timestamp.toISOString().split('T')[0];
      if (!dailyData.has(date)) {
        dailyData.set(date, []);
      }
      dailyData.get(date)!.push(data);
    });
    
    // Generate breakdown for each day of the week
    const breakdown: any[] = [];
    for (let i = 0; i < 7; i++) {
      const date = new Date(weekStart);
      date.setDate(weekStart.getDate() + i);
      const dateStr = date.toISOString().split('T')[0];
      
      const dayData = dailyData.get(dateStr) || [];
      const densities = dayData.map(data => data.trafficDensity);
      
      breakdown.push({
        date: dateStr,
        dataPoints: dayData.length,
        averageDensity: densities.length > 0 ? densities.reduce((sum, d) => sum + d, 0) / densities.length : 0,
        peakDensity: densities.length > 0 ? Math.max(...densities) : 0
      });
    }
    
    return breakdown;
  }
}
