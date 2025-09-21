import { createClient, SupabaseClient } from "@supabase/supabase-js";
import axios, { AxiosInstance } from 'axios';

export interface BookingDailyCount {
  date: string;
  count: number;
  dayOfWeek: number;
}

export interface BookingForecast {
  date: string;
  predictedCount: number;
  confidence: number;
  dayOfWeek: number;
}

export interface BookingFrequencyResponse {
  history: BookingDailyCount[];
  forecast: BookingForecast[];
}

export interface QuestDBResponse {
  query: string;
  columns: Array<{
    name: string;
    type: string;
  }>;
  dataset: any[][];
  count: number;
}

export class BookingsAnalyticsService {
  private supabase: SupabaseClient;
  private questDbClient: AxiosInstance | null;
  private questDbUrl: string;
  private questDbAvailable: boolean = false;

  constructor(
    supabaseUrl: string,
    supabaseServiceRoleKey: string,
    questDbUrl?: string
  ) {
    this.supabase = createClient(supabaseUrl, supabaseServiceRoleKey);
    this.questDbUrl = questDbUrl || process.env.QUESTDB_HTTP || 'http://localhost:9000';
    
    // Only create QuestDB client if URL is not localhost (production)
    if (this.questDbUrl && !this.questDbUrl.includes('localhost')) {
      this.questDbClient = axios.create({
        baseURL: this.questDbUrl,
        timeout: 10000,
      });
      this.questDbAvailable = true;
    } else {
      this.questDbClient = null;
      console.warn('QuestDB not configured for production. Analytics features will be limited.');
    }
  }

  /**
   * Get booking frequency analytics from Supabase (live computation)
   */
  async getBookingFrequency(days: number = 14): Promise<BookingFrequencyResponse> {
    try {
      // Get historical booking counts
      const history = await this.getDailyBookingCounts(days);
      
      // Generate forecast
      const forecast = this.generateForecast(history);
      
      return { history, forecast };
    } catch (error: any) {
      console.error('Error getting booking frequency:', error);
      throw new Error(`Failed to get booking frequency analytics: ${error?.message || 'unknown error'}`);
    }
  }

  /**
   * Get daily booking counts from Supabase
   */
  private async getDailyBookingCounts(days: number): Promise<BookingDailyCount[]> {
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - days);

    const { data, error } = await this.supabase
      .from('bookings')
      .select('created_at')
      .gte('created_at', startDate.toISOString())
      .order('created_at', { ascending: true });

    if (error) {
      console.error('Error fetching bookings:', error);
      throw new Error('Failed to fetch bookings from Supabase');
    }

    // Group by date and count
    const dailyCounts = new Map<string, number>();
    
    data?.forEach(booking => {
      const date = new Date(booking.created_at).toISOString().split('T')[0];
      dailyCounts.set(date, (dailyCounts.get(date) || 0) + 1);
    });

    // Convert to array and fill missing dates
    const result: BookingDailyCount[] = [];
    for (let i = 0; i < days; i++) {
      const date = new Date();
      date.setDate(date.getDate() - (days - 1 - i));
      const dateStr = date.toISOString().split('T')[0];
      const count = dailyCounts.get(dateStr) || 0;
      
      result.push({
        date: dateStr,
        count,
        dayOfWeek: date.getDay()
      });
    }

    return result;
  }

  /**
   * Generate 7-day forecast based on historical data
   */
  private generateForecast(history: BookingDailyCount[]): BookingForecast[] {
    const forecast: BookingForecast[] = [];
    const now = new Date();

    // Calculate day-of-week averages
    const dayOfWeekAverages = new Map<number, number[]>();
    
    history.forEach(day => {
      if (!dayOfWeekAverages.has(day.dayOfWeek)) {
        dayOfWeekAverages.set(day.dayOfWeek, []);
      }
      dayOfWeekAverages.get(day.dayOfWeek)!.push(day.count);
    });

    // Calculate seasonal averages
    const seasonalAverages = new Map<number, number>();
    dayOfWeekAverages.forEach((counts, dayOfWeek) => {
      const average = counts.reduce((sum, count) => sum + count, 0) / counts.length;
      seasonalAverages.set(dayOfWeek, average);
    });

    // Calculate light trend (simple linear regression)
    const trend = this.calculateTrend(history);

    // Generate 7-day forecast
    for (let i = 1; i <= 7; i++) {
      const forecastDate = new Date(now);
      forecastDate.setDate(now.getDate() + i);
      const dayOfWeek = forecastDate.getDay();
      
      // Base prediction from seasonal average
      let predictedCount = seasonalAverages.get(dayOfWeek) || 0;
      
      // Apply trend
      predictedCount += trend * i;
      
      // Ensure non-negative
      predictedCount = Math.max(0, Math.round(predictedCount));
      
      // Calculate confidence based on data availability
      const confidence = this.calculateConfidence(history, dayOfWeek);
      
      forecast.push({
        date: forecastDate.toISOString().split('T')[0],
        predictedCount,
        confidence,
        dayOfWeek
      });
    }

    return forecast;
  }

  /**
   * Calculate trend from historical data
   */
  private calculateTrend(history: BookingDailyCount[]): number {
    if (history.length < 2) return 0;

    const n = history.length;
    const x = history.map((_, i) => i);
    const y = history.map(day => day.count);

    const sumX = x.reduce((sum, val) => sum + val, 0);
    const sumY = y.reduce((sum, val) => sum + val, 0);
    const sumXY = x.reduce((sum, val, i) => sum + val * y[i], 0);
    const sumXX = x.reduce((sum, val) => sum + val * val, 0);

    const slope = (n * sumXY - sumX * sumY) / (n * sumXX - sumX * sumX);
    return slope;
  }

  /**
   * Calculate confidence based on data availability
   */
  private calculateConfidence(history: BookingDailyCount[], dayOfWeek: number): number {
    const dayData = history.filter(day => day.dayOfWeek === dayOfWeek);
    const dataPoints = dayData.length;
    
    // Base confidence on number of data points for this day of week
    if (dataPoints === 0) return 0.1;
    if (dataPoints === 1) return 0.3;
    if (dataPoints === 2) return 0.5;
    if (dataPoints >= 3) return 0.7;
    
    return 0.5;
  }

  /**
   * Persist daily booking counts to QuestDB
   */
  async persistDailyCounts(days: number = 14): Promise<void> {
    try {
      // Ensure table exists
      await this.ensureBookingDailyCountsTable();
      
      // Get daily counts
      const dailyCounts = await this.getDailyBookingCounts(days);
      
      // Insert into QuestDB
      for (const day of dailyCounts) {
        await this.insertDailyCount(day);
      }
      
      console.log(`Persisted ${dailyCounts.length} daily booking counts to QuestDB`);
    } catch (error: any) {
      console.error('Error persisting daily counts:', error);
      throw new Error(`Failed to persist daily booking counts: ${error?.message || 'unknown error'}`);
    }
  }

  /**
   * Persist forecast to QuestDB
   */
  async persistForecast(days: number = 14): Promise<void> {
    try {
      // Ensure table exists
      await this.ensureBookingForecastsTable();
      
      // Get historical data and generate forecast
      const history = await this.getDailyBookingCounts(days);
      const forecast = this.generateForecast(history);
      
      // Insert forecast into QuestDB
      for (const prediction of forecast) {
        await this.insertForecast(prediction);
      }
      
      console.log(`Persisted ${forecast.length} forecast predictions to QuestDB`);
    } catch (error: any) {
      console.error('Error persisting forecast:', error);
      throw new Error(`Failed to persist booking forecast: ${error?.message || 'unknown error'}`);
    }
  }

  /**
   * Read daily counts from QuestDB
   */
  async getDailyCountsFromQuestDB(days: number = 14): Promise<BookingDailyCount[]> {
    try {
      const endDate = new Date();
      const startDate = new Date();
      startDate.setDate(endDate.getDate() - days);

      const query = `
        SELECT 
          day,
          total_bookings
        FROM booking_daily_counts 
        WHERE day >= to_timestamp('${startDate.toISOString().split('T')[0]}', 'yyyy-MM-dd')
        AND day <= to_timestamp('${endDate.toISOString().split('T')[0]}', 'yyyy-MM-dd')
        ORDER BY day ASC
      `;

      const response = await this.executeQuestDBQuery(query);
      return response.dataset.map((row: any[]) => {
        const dateStr = String(row[0]).split('T')[0];
        const jsDate = new Date(dateStr + 'T00:00:00Z');
        return {
          date: dateStr,
          count: row[1],
          dayOfWeek: jsDate.getUTCDay(),
        };
      });
    } catch (error: any) {
      console.error('Error reading daily counts from QuestDB:', error);
      throw new Error(`Failed to read daily counts from QuestDB: ${error?.message || 'unknown error'}`);
    }
  }

  /**
   * Read latest forecast from QuestDB
   */
  async getLatestForecastFromQuestDB(): Promise<BookingForecast[]> {
    try {
      const query = `
        SELECT 
          target_day,
          predicted_count,
          confidence,
        FROM booking_forecasts 
        WHERE forecast_date = (
          SELECT MAX(forecast_date) FROM booking_forecasts
        )
        ORDER BY target_day ASC
      `;
      const response = await this.executeQuestDBQuery(query);
      return response.dataset.map((row: any[]) => {
        const dateStr = String(row[0]).split('T')[0];
        const jsDate = new Date(dateStr + 'T00:00:00Z');
        return {
          date: dateStr,
          predictedCount: row[1],
          confidence: row[2],
          dayOfWeek: jsDate.getUTCDay(),
        };
      });
    } catch (error: any) {
      console.error('Error reading latest forecast from QuestDB:', error);
      throw new Error(`Failed to read latest forecast from QuestDB: ${error?.message || 'unknown error'}`);
    }
  }

  /**
   * Ensure booking_daily_counts table exists
   */
  private async ensureBookingDailyCountsTable(): Promise<void> {
    const createTableQuery = `
      CREATE TABLE IF NOT EXISTS booking_daily_counts (
        day TIMESTAMP,
        route_id INT,
        total_bookings LONG,
        created_at TIMESTAMP
      ) TIMESTAMP(day) PARTITION BY DAY
    `;
    await this.executeQuestDBQuery(createTableQuery);
  }

  /**
   * Ensure booking_forecasts table exists
   */
  private async ensureBookingForecastsTable(): Promise<void> {
    const createTableQuery = `
      CREATE TABLE IF NOT EXISTS booking_forecasts (
        forecast_date TIMESTAMP,
        target_day TIMESTAMP,
        route_id INT,
        predicted_count LONG,
        confidence DOUBLE
      ) TIMESTAMP(forecast_date) PARTITION BY DAY
    `;
    await this.executeQuestDBQuery(createTableQuery);
  }

  /**
   * Insert daily count into QuestDB
   */
  private async insertDailyCount(dailyCount: BookingDailyCount): Promise<void> {
    const insertQuery = `
      INSERT INTO booking_daily_counts (day, route_id, total_bookings, created_at) 
      VALUES (
        to_timestamp('${dailyCount.date}', 'yyyy-MM-dd'),
        0,
        ${dailyCount.count},
        NOW()
      )
    `;
    await this.executeQuestDBQuery(insertQuery);
  }

  /**
   * Insert forecast into QuestDB
   */
  private async insertForecast(forecast: BookingForecast): Promise<void> {
    const insertQuery = `
      INSERT INTO booking_forecasts (forecast_date, target_day, route_id, predicted_count, confidence) 
      VALUES (
        NOW(),
        to_timestamp('${forecast.date}', 'yyyy-MM-dd'),
        0,
        ${forecast.predictedCount},
        ${forecast.confidence}
      )
    `;
    await this.executeQuestDBQuery(insertQuery);
  }

  /**
   * Execute QuestDB query with retry logic
   */
  private async executeQuestDBQuery(query: string, maxRetries: number = 3): Promise<QuestDBResponse> {
    if (!this.questDbClient || !this.questDbAvailable) {
      throw new Error('QuestDB is not available. Please configure QUESTDB_HTTP environment variable.');
    }

    let lastError: Error | null = null;
    
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        const response = await this.questDbClient.get('/exec', {
          params: { query },
          timeout: 10000
        });

        if (response.status === 200) {
          return response.data;
        }
        
        throw new Error(`QuestDB query failed with status ${response.status}: ${JSON.stringify(response.data)}`);
      } catch (error: any) {
        lastError = error;
        
        if (error.code === 'ETIMEDOUT' || error.code === 'ECONNREFUSED') {
          console.warn(`QuestDB query attempt ${attempt} failed:`, error.message);
          
          if (attempt < maxRetries) {
            // Exponential backoff: 1s, 2s, 4s
            const delay = Math.pow(2, attempt - 1) * 1000;
            await new Promise(resolve => setTimeout(resolve, delay));
            continue;
          }
        }
        // Surface server-provided error details when available
        const details = error?.response?.data ? ` | details: ${JSON.stringify(error.response.data)}` : '';
        throw new Error(`${error.message}${details}`);
      }
    }
    
    throw lastError || new Error('QuestDB query failed after all retries');
  }
}
