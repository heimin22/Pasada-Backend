const axios = require('axios');

const BASE_URL = process.env.API_URL || 'http://localhost:8080';

console.log('Simple Analytics Test');
console.log(`Base URL: ${BASE_URL}`);
console.log('');

async function testRouteAnalytics() {
  try {
    console.log('Testing Route Analytics for Route 1...');
    
    const response = await axios.get(`${BASE_URL}/api/analytics/routes/1`);
    
    console.log('SUCCESS: Route analytics retrieved');
    console.log(`Route: ${response.data.routeName}`);
    console.log(`Historical Data Points: ${response.data.historicalData?.length || 0}`);
    console.log(`Traffic Predictions: ${response.data.predictions?.length || 0}`);
    console.log(`Average Traffic Density: ${response.data.summary?.averageDensity?.toFixed(3) || 'N/A'}`);
    console.log(`Peak Traffic Hours: ${response.data.summary?.peakHours?.join(', ') || 'N/A'}`);
    console.log(`AI Insights: ${response.data.geminiInsights ? 'Available' : 'Not Available'}`);
    
    if (response.data.geminiInsights) {
      console.log(`AI Summary: ${response.data.geminiInsights.substring(0, 100)}...`);
    }
    
    return true;
  } catch (error) {
    console.log(`ERROR: ${error.response?.status || error.code} - ${error.message}`);
    return false;
  }
}

async function testAllRoutes() {
  try {
    console.log('Testing All Routes Analytics...');
    
    const response = await axios.get(`${BASE_URL}/api/analytics/routes`);
    
    console.log('SUCCESS: All routes analytics retrieved');
    console.log(`Total Routes: ${response.data?.length || 0}`);
    
    if (response.data && response.data.length > 0) {
      console.log('Route Summary:');
      response.data.forEach((route, index) => {
        console.log(`  ${index + 1}. ${route.routeName} - Density: ${route.summary?.averageDensity?.toFixed(3) || 'N/A'}`);
      });
    }
    
    return true;
  } catch (error) {
    console.log(`ERROR: ${error.response?.status || error.code} - ${error.message}`);
    return false;
  }
}

async function runTest() {
  const results = [];
  
  results.push(await testRouteAnalytics());
  console.log('');
  results.push(await testAllRoutes());
  
  const passed = results.filter(r => r).length;
  const total = results.length;
  
  console.log('');
  console.log('Test Results:');
  console.log(`Passed: ${passed}/${total}`);
  console.log(`Success Rate: ${((passed / total) * 100).toFixed(1)}%`);
  
  if (passed === total) {
    console.log('All tests passed! Analytics is working correctly.');
  } else {
    console.log('Some tests failed.');
  }
}

runTest().catch(error => {
  console.error('Test failed:', error.message);
  process.exit(1);
});
