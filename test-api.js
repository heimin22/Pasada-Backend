const axios = require('axios');

// Configuration
const BASE_URL = process.env.API_BASE_URL;

console.log('Testing Pasada Backend Traffic Analytics API');
console.log('');

async function testEndpoint(endpoint, description) {
  try {
    console.log(`Testing: ${description}`);
    console.log(`GET ${BASE_URL}${endpoint}`);
    
    const response = await axios.get(`${BASE_URL}${endpoint}`, {
      timeout: 10000
    });
    
    console.log(`Status: ${response.status}`);
    console.log(`Response: ${JSON.stringify(response.data, null, 2).substring(0, 200)}...`);
    console.log('');
    
    return true;
  } catch (error) {
    console.log(`Error: ${error.message}`);
    if (error.response) {
      console.log(`Status: ${error.response.status}`);
      console.log(`Response: ${JSON.stringify(error.response.data, null, 2)}`);
    }
    console.log('');
    return false;
  }
}

async function runTests() {
  console.log('Starting API endpoint tests...\n');
  
  const tests = [
    { endpoint: '/', description: 'Health Check' },
    { endpoint: '/api/health', description: 'API Health Status' },
    { endpoint: '/api/test', description: 'Test Endpoint' },
    { endpoint: '/api/analytics/routes', description: 'All Routes Analytics' },
    { endpoint: '/api/analytics/summaries', description: 'Concise Route Summaries' }
  ];
  
  let passed = 0;
  let total = tests.length;
  
  for (const test of tests) {
    const success = await testEndpoint(test.endpoint, test.description);
    if (success) passed++;
  }
  
  console.log('Test Results Summary:');
  console.log(`Passed: ${passed}/${total}`);
  console.log(`Failed: ${total - passed}/${total}`);
  
  if (passed === total) {
    console.log('\nAll tests passed! The traffic analytics API is working correctly.');
  } else {
    console.log('\nSome tests failed. Check the error messages above.');
  }
}

// Run tests if this file is executed directly
if (require.main === module) {
  runTests().catch(console.error);
}

module.exports = { runTests, testEndpoint };
