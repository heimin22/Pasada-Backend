export interface TrafficData {
    routeId: number;
    timestamp: Date;
    trafficDensity: number; // 0-1 scale
    duration: number; // in seconds
    durationInTraffic: number; // in seconds
    distance: number; // in meters
    status: 'OK' | 'ZERO_RESULTS' | 'OVER_DAILY_LIMIT' | 'OVER_QUERY_LIMIT' | 'REQUEST_DENIED' | 'INVALID_REQUEST' | 'UNKNOWN_ERROR';
  }