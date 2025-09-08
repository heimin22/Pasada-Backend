export interface TrafficData {
    routeId: number;
    timestamp: Date;
    trafficDensity: number; // 0-1 scale
    duration: number; // in seconds
    durationInTraffic: number; // in seconds
    distance: number; // in meters
    status: 'OK' | 'ZERO_RESULTS' | 'OVER_DAILY_LIMIT' | 'OVER_QUERY_LIMIT' | 'REQUEST_DENIED' | 'INVALID_REQUEST' | 'UNKNOWN_ERROR';
}

// New interface for trip-based analytics data
export interface TripAnalyticsData {
    tripId: string;
    routeId: number;
    passengerId: string;
    driverId?: string;
    startTime: Date;
    endTime: Date;
    actualDuration: number; // in seconds - actual trip duration
    estimatedDuration?: number; // in seconds - original estimate
    actualDistance?: number; // in meters - if available
    pickupCoordinates: {
        lat: number;
        lng: number;
    };
    dropoffCoordinates: {
        lat: number;
        lng: number;
    };
    trafficCondition?: 'light' | 'moderate' | 'heavy' | 'severe';
    completionStatus: 'completed' | 'cancelled';
    fare?: number;
}

// Interface for route usage analytics
export interface RouteUsageData {
    routeId: number;
    timestamp: Date;
    endpoint: string;
    method: string;
    userId?: string;
    userType?: 'passenger' | 'driver' | 'admin';
    responseTime: number; // in milliseconds
    statusCode: number;
}
export interface TrafficAnalytics {
    routeId: number;
    routeName: string;
    historicalData: TrafficData[];
    predictions: TrafficPrediction[];
    summary: TrafficSummary;
    geminiInsights: string;
  }
  
  export interface TrafficPrediction {
    date: Date;
    predictedDensity: number;
    confidence: number;
    timeOfDay: string;
  }
  
  export interface TrafficSummary {
    averageDensity: number;
    peakHours: string[];
    lowTrafficHours: string[];
    weekdayVsWeekend: {
      weekday: number;
      weekend: number;
    };
    trend: 'increasing' | 'decreasing' | 'stable';
  }