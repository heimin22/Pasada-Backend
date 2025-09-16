const axios = require('axios');

const BASE_URL = process.env.API_BASE_URL || 'http://localhost:8080';

async function testBookingFrequencyEndpoints() {
  console.log('Testing Booking Frequency Analytics Endpoints\n');
  
  const endpoints = [
    {
      name: 'GET /api/analytics/bookings/frequency?days=14',
      method: 'GET',
      url: `${BASE_URL}/api/analytics/bookings/frequency?days=14`,
      description: 'Get live booking frequency analytics from Supabase'
    },
    {
      name: 'POST /api/analytics/bookings/frequency/persist/daily?days=14',
      method: 'POST',
      url: `${BASE_URL}/api/analytics/bookings/frequency/persist/daily?days=14`,
      description: 'Persist daily booking counts to QuestDB'
    },
    {
      name: 'POST /api/analytics/bookings/frequency/persist/forecast?days=14',
      method: 'POST',
      url: `${BASE_URL}/api/analytics/bookings/frequency/persist/forecast?days=14`,
      description: 'Persist forecast to QuestDB'
    },
    {
      name: 'GET /api/analytics/bookings/frequency/daily?days=14',
      method: 'GET',
      url: `${BASE_URL}/api/analytics/bookings/frequency/daily?days=14`,
      description: 'Read daily booking counts from QuestDB'
    },
    {
      name: 'GET /api/analytics/bookings/frequency/forecast/latest',
      method: 'GET',
      url: `${BASE_URL}/api/analytics/bookings/frequency/forecast/latest`,
      description: 'Read latest forecast from QuestDB'
    }
  ];

  for (const endpoint of endpoints) {
    try {
      console.log(`Testing: ${endpoint.name}`);
      console.log(`   Description: ${endpoint.description}`);
      
      const startTime = Date.now();
      let response;
      
      if (endpoint.method === 'GET') {
        response = await axios.get(endpoint.url, { timeout: 30000 });
      } else if (endpoint.method === 'POST') {
        response = await axios.post(endpoint.url, {}, { timeout: 30000 });
      }
      
      const duration = Date.now() - startTime;
      
      console.log(`   Status: ${response.status}`);
      console.log(`   Duration: ${duration}ms`);
      
      if (response.data) {
        console.log(`   Response:`, JSON.stringify(response.data, null, 2));
      }
      
      console.log('');
      
    } catch (error) {
      console.log(`   Error: ${error.message}`);
      if (error.response) {
        console.log(`   Status: ${error.response.status}`);
        console.log(`   Response:`, JSON.stringify(error.response.data, null, 2));
      }
      console.log('');
    }
  }
}

async function testErrorHandling() {
  console.log('Testing Error Handling\n');
  
  const errorTests = [
    {
      name: 'Invalid days parameter (too high)',
      url: `${BASE_URL}/api/analytics/bookings/frequency?days=1000`
    },
    {
      name: 'Invalid days parameter (negative)',
      url: `${BASE_URL}/api/analytics/bookings/frequency?days=-1`
    },
    {
      name: 'Missing days parameter',
      url: `${BASE_URL}/api/analytics/bookings/frequency`
    }
  ];

  for (const test of errorTests) {
    try {
      console.log(`Testing: ${test.name}`);
      const response = await axios.get(test.url, { timeout: 10000 });
      console.log(`   Status: ${response.status}`);
      console.log(`   Response:`, JSON.stringify(response.data, null, 2));
    } catch (error) {
      if (error.response && error.response.status === 400) {
        console.log(`   Expected error: ${error.response.status}`);
        console.log(`   Response:`, JSON.stringify(error.response.data, null, 2));
      } else {
        console.log(`   Unexpected error: ${error.message}`);
      }
    }
    console.log('');
  }
}

async function main() {
  try {
    console.log('Starting Booking Frequency Analytics Tests\n');
    console.log(`Base URL: ${BASE_URL}\n`);
    
    await testBookingFrequencyEndpoints();
    await testErrorHandling();
    
    console.log('All tests completed!\n');
    
  } catch (error) {
    console.error('Test suite failed:', error.message);
    process.exit(1);
  }
}

// Run the tests
main();
