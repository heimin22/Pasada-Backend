import { createClient, SupabaseClient } from "@supabase/supabase-js";
import axios, { AxiosInstance } from 'axios';

export interface MigrationStatus {
  isReady: boolean;
  supabaseConfigured: boolean;
  questDbConfigured: boolean;
  questDbConnected: boolean;
  errors: string[];
  configuration: {
    supabaseUrl?: string;
    questDbUrl?: string;
  };
}

export interface MigrationProgress {
  totalRecords: number;
  processedRecords: number;
  currentBatch: number;
  totalBatches: number;
  errors: string[];
  isComplete: boolean;
  startTime: Date;
  endTime?: Date;
}

export interface MigrationResult {
  success: boolean;
  totalRecords: number;
  processedRecords: number;
  errors: string[];
  duration: number;
  batchesProcessed: number;
}

export class MigrationService {
  private supabase: SupabaseClient;
  private questDbClient: AxiosInstance;
  private questDbUrl: string;
  private supabaseUrl: string;

  constructor(
    supabaseUrl: string,
    supabaseServiceRoleKey: string,
    questDbUrl?: string
  ) {
    this.supabaseUrl = supabaseUrl;
    this.supabase = createClient(supabaseUrl, supabaseServiceRoleKey);
    this.questDbUrl = questDbUrl || process.env.QUESTDB_HTTP || 'http://localhost:9000';
    
    this.questDbClient = axios.create({
      baseURL: this.questDbUrl,
      timeout: 30000, // Longer timeout for migration operations
    });
  }

  /**
   * Check migration readiness
   */
  async checkMigrationStatus(): Promise<MigrationStatus> {
    const errors: string[] = [];
    let supabaseConfigured = false;
    let questDbConfigured = false;
    let questDbConnected = false;

    // Check Supabase configuration
    try {
      if (!this.supabaseUrl || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
        errors.push('Supabase configuration is missing');
      } else {
        supabaseConfigured = true;
        // Test Supabase connection
        const { error } = await this.supabase
          .from('traffic_analytics')
          .select('count')
          .limit(1);
        
        if (error) {
          errors.push(`Supabase connection test failed: ${error.message}`);
        }
      }
    } catch (error: any) {
      errors.push(`Supabase configuration error: ${error.message}`);
    }

    // Check QuestDB configuration
    try {
      if (!this.questDbUrl) {
        errors.push('QuestDB URL is not configured');
      } else {
        questDbConfigured = true;
        
        // Test QuestDB connection
        const testQuery = 'SELECT 1 as test';
        const response = await this.questDbClient.get('/exec', {
          params: { query: testQuery },
          timeout: 5000
        });
        
        if (response.status === 200) {
          questDbConnected = true;
        } else {
          errors.push(`QuestDB connection test failed with status ${response.status}`);
        }
      }
    } catch (error: any) {
      errors.push(`QuestDB connection error: ${error.message}`);
    }

    const isReady = supabaseConfigured && questDbConfigured && questDbConnected && errors.length === 0;

    return {
      isReady,
      supabaseConfigured,
      questDbConfigured,
      questDbConnected,
      errors,
      configuration: {
        supabaseUrl: this.supabaseUrl,
        questDbUrl: this.questDbUrl
      }
    };
  }

  /**
   * Execute migration from Supabase to QuestDB
   */
  async runMigration(): Promise<MigrationResult> {
    const startTime = new Date();
    const errors: string[] = [];
    let totalRecords = 0;
    let processedRecords = 0;
    let batchesProcessed = 0;

    try {
      // Ensure QuestDB table exists
      await this.ensureTrafficAnalyticsTable();

      // Get total count of records to migrate
      const { count, error: countError } = await this.supabase
        .from('traffic_analytics')
        .select('*', { count: 'exact', head: true });

      if (countError) {
        throw new Error(`Failed to count records: ${countError.message}`);
      }

      totalRecords = count || 0;
      const batchSize = 50;
      const totalBatches = Math.ceil(totalRecords / batchSize);

      console.log(`Starting migration of ${totalRecords} records in ${totalBatches} batches`);

      // Process data in batches
      for (let offset = 0; offset < totalRecords; offset += batchSize) {
        try {
          const batchNumber = Math.floor(offset / batchSize) + 1;
          console.log(`Processing batch ${batchNumber}/${totalBatches} (records ${offset + 1}-${Math.min(offset + batchSize, totalRecords)})`);

          // Fetch batch from Supabase
          const { data, error: fetchError } = await this.supabase
            .from('traffic_analytics')
            .select('*')
            .range(offset, offset + batchSize - 1)
            .order('created_at', { ascending: true });

          if (fetchError) {
            throw new Error(`Failed to fetch batch ${batchNumber}: ${fetchError.message}`);
          }

          if (!data || data.length === 0) {
            console.log(`No data in batch ${batchNumber}, skipping`);
            continue;
          }

          // Transform and insert into QuestDB
          await this.insertBatchToQuestDB(data, batchNumber);
          
          processedRecords += data.length;
          batchesProcessed++;
          
          console.log(`Batch ${batchNumber} completed: ${data.length} records processed`);
          
        } catch (batchError: any) {
          const errorMsg = `Batch ${Math.floor(offset / batchSize) + 1} failed: ${batchError.message}`;
          console.error(errorMsg);
          errors.push(errorMsg);
          
          // Continue with next batch instead of failing completely
          continue;
        }
      }

      const endTime = new Date();
      const duration = endTime.getTime() - startTime.getTime();

      console.log(`Migration completed: ${processedRecords}/${totalRecords} records processed in ${batchesProcessed} batches`);

      return {
        success: errors.length === 0,
        totalRecords,
        processedRecords,
        errors,
        duration,
        batchesProcessed
      };

    } catch (error: any) {
      const endTime = new Date();
      const duration = endTime.getTime() - startTime.getTime();
      
      console.error('Migration failed:', error);
      errors.push(`Migration failed: ${error.message}`);

      return {
        success: false,
        totalRecords,
        processedRecords,
        errors,
        duration,
        batchesProcessed
      };
    }
  }

  /**
   * Ensure traffic_analytics table exists in QuestDB
   */
  private async ensureTrafficAnalyticsTable(): Promise<void> {
    const createTableQuery = `
      CREATE TABLE IF NOT EXISTS traffic_analytics (
        route_id INT,
        timestamp TIMESTAMP,
        traffic_density DOUBLE,
        duration INT,
        duration_in_traffic INT,
        distance DOUBLE,
        status SYMBOL,
        created_at TIMESTAMP
      ) TIMESTAMP(timestamp) PARTITION BY DAY
    `;
    
    await this.executeQuestDBQuery(createTableQuery);
    console.log('QuestDB traffic_analytics table ensured');
  }

  /**
   * Insert batch of data into QuestDB
   */
  private async insertBatchToQuestDB(data: any[], batchNumber: number): Promise<void> {
    const insertQueries = data.map(record => {
      // Escape single quotes in string values - handle null/undefined values
      const escapeString = (str: any) => {
        if (str === null || str === undefined) return '';
        return String(str).replace(/'/g, "''");
      };
      
      return `
        INSERT INTO traffic_analytics (
          route_id, timestamp, traffic_density, 
          duration, duration_in_traffic, distance, status, created_at
        ) VALUES (
          ${record.route_id || 0},
          '${record.timestamp}',
          ${record.traffic_density || 0.0},
          ${record.duration || 0},
          ${record.duration_in_traffic || 0},
          ${record.distance || 0.0},
          '${escapeString(record.status)}',
          '${record.created_at}'
        )
      `;
    });

    // Execute all inserts in the batch
    for (const query of insertQueries) {
      await this.executeQuestDBQuery(query);
    }
  }

  /**
   * Execute QuestDB query with retry logic
   */
  private async executeQuestDBQuery(query: string, maxRetries: number = 3): Promise<any> {
    let lastError: Error | null = null;
    
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        const response = await this.questDbClient.get('/exec', {
          params: { query },
          timeout: 30000
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
            // Exponential backoff: 2s, 4s, 8s
            const delay = Math.pow(2, attempt) * 1000;
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

  /**
   * Get QuestDB connection status
   */
  async getQuestDBStatus(): Promise<{
    isAvailable: boolean;
    isConfigured: boolean;
    url: string;
    testQuery: boolean;
    error?: string;
  }> {
    const isConfigured = !!this.questDbUrl;
    let isAvailable = false;
    let testQuery = false;
    let error: string | undefined;

    if (!isConfigured) {
      error = 'QuestDB URL is not configured';
      return {
        isAvailable: false,
        isConfigured: false,
        url: '',
        testQuery: false,
        error
      };
    }

    try {
      // Test basic connectivity
      const testQueryStr = 'SELECT 1 as test';
      const response = await this.questDbClient.get('/exec', {
        params: { query: testQueryStr },
        timeout: 5000
      });

      if (response.status === 200) {
        isAvailable = true;
        testQuery = true;
      } else {
        error = `QuestDB responded with status ${response.status}`;
      }
    } catch (err: any) {
      error = err.message;
      isAvailable = false;
    }

    return {
      isAvailable,
      isConfigured,
      url: this.questDbUrl,
      testQuery,
      error
    };
  }
}
