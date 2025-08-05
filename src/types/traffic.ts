export interface TrafficData {
    routeId: number;
    timestamp: Date;
    trafficDensity: number; // 0-1 scale
    duration: number; // in seconds
    durationInTraffic: number; // in seconds
    distance: number; // in meters
    status: 'OK' | 'ZERO_RESULTS' | 'OVER_DAILY_LIMIT' | 'OVER_QUERY_LIMIT' | 'REQUEST_DENIED' | 'INVALID_REQUEST' | 'UNKNOWN_ERROR';
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