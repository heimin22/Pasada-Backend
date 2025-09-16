const axios = require('axios');

// Configuration
const BASE_URL = process.env.API_URL || 'http://localhost:8080';
const ANALYTICS_API_URL = process.env.ANALYTICS_API_URL || 'https://pasada-analytics-v2.fly.dev';

console.log('Testing External Analytics Integration');
console.log(`Base URL: ${BASE_URL}`);
console.log(`Analytics API URL: ${ANALYTICS_API_URL}`);
console.log('');

async function testEndpoint(method, endpoint, data = null, description = '') {
  try {
    console.log(`Testing: ${description || `${method} ${endpoint}`}`);
    
    const config = {
      method,
      url: `${BASE_URL}${endpoint}`,
      headers: {
        'Content-Type': 'application/json',
      },
    };

    if (data) {
      config.data = data;
    }

    const response = await axios(config);
    console.log(`Success: ${response.status} ${response.statusText}`);
    
    if (response.data) {
      console.log(`Response:`, JSON.stringify(response.data, null, 2));
    }
    console.log('');
    return true;
  } catch (error) {
    console.log(` Error: ${error.response?.status || error.code} - ${error.message}`);
    if (error.response?.data) {
      console.log(`Error Response:`, JSON.stringify(error.response.data, null, 2));
    }
    console.log('');
    return false;
  }
}

async function runTests() {
  console.log('Starting External Analytics Integration Tests\n');

  const tests = [
    // Health checks
    {
      method: 'GET',
      endpoint: '/api/analytics/external/health',
      description: 'External Analytics Health Check'
    },
    {
      method: 'GET',
      endpoint: '/api/analytics/external/traffic/status',
      description: 'Traffic Analytics Status Check'
    },
    
    // Analytics routes (direct)
    {
      method: 'GET',
      endpoint: '/api/analytics/health',
      description: 'Analytics Service Health Check'
    },
    {
      method: 'GET',
      endpoint: '/api/analytics/traffic/status',
      description: 'Traffic Analytics Status (Direct)'
    },
    
    // Traffic analytics
    {
      method: 'POST',
      endpoint: '/api/analytics/external/traffic/run',
      data: {
        routeIds: [1, 2, 3],
        includeHistoricalAnalysis: true,
        generateForecasts: true
      },
      description: 'Run Traffic Analytics'
    },
    
    // Route analytics
    {
      method: 'GET',
      endpoint: '/api/analytics/external/route/1/traffic-summary?days=7',
      description: 'Get Route Traffic Summary'
    },
    {
      method: 'GET',
      endpoint: '/api/analytics/external/route/1/predictions',
      description: 'Get Route Predictions'
    },
    
    // Hybrid analytics
    {
      method: 'GET',
      endpoint: '/api/analytics/hybrid/route/1',
      description: 'Get Hybrid Route Analytics'
    },
    
    // Data ingestion
    {
      method: 'POST',
      endpoint: '/api/analytics/external/data/traffic',
      data: {
        trafficData: [
          {
            timestamp: new Date().toISOString(),
            routeId: 1,
            trafficDensity: 0.75,
            duration: 600,
            durationInTraffic: 900,
            distance: 5000,
            status: 'active'
          }
        ]
      },
      description: 'Ingest Traffic Data'
    },
    
    // Admin endpoints
    {
      method: 'GET',
      endpoint: '/api/analytics/external/admin/metrics',
      description: 'Get System Metrics'
    }
  ];

  let passed = 0;
  let failed = 0;

  for (const test of tests) {
    const success = await testEndpoint(test.method, test.endpoint, test.data, test.description);
    if (success) {
      passed++;
    } else {
      failed++;
    }
    
    // Add a small delay between requests
    await new Promise(resolve => setTimeout(resolve, 1000));
  }

  console.log('Test Results Summary:');
  console.log(`Passed: ${passed}`);
  console.log(`Failed: ${failed}`);
  console.log(`Success Rate: ${((passed / (passed + failed)) * 100).toFixed(1)}%`);
  
  if (failed === 0) {
    console.log('\nAll tests passed! External analytics integration is working correctly.');
  } else {
    console.log('\nSome tests failed. Check the error messages above for details.');
    console.log('Note: Some failures may be expected if the external analytics service is not available.');
  }
}

// Handle process termination
process.on('SIGINT', () => {
  console.log('\nTest interrupted by user');
  process.exit(0);
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('Unhandled Rejection at:', promise, 'reason:', reason);
  process.exit(1);
});

// Run the tests
runTests().catch(error => {
  console.error('Test suite failed:', error);
  process.exit(1);
});
