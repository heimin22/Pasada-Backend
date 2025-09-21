import axios from 'axios';

// Configuration
const BASE_URL = process.env.API_URL || 'http://localhost:8080';

console.log('Testing Analytics Functionality');
console.log(`Base URL: ${BASE_URL}`);
console.log('');

async function testAnalytics() {
  try {
    console.log('Testing: Local Analytics - Get Route Analytics');
    
    // Test local analytics for route 1
    const response = await axios.get(`${BASE_URL}/api/analytics/routes/1`);
    
    console.log(`Success: ${response.status} ${response.statusText}`);
    console.log('Analytics Data:');
    console.log(`- Route ID: ${response.data.routeId}`);
    console.log(`- Route Name: ${response.data.routeName}`);
    console.log(`- Historical Data Points: ${response.data.historicalData?.length || 0}`);
    console.log(`- Predictions: ${response.data.predictions?.length || 0}`);
    console.log(`- Average Density: ${response.data.summary?.averageDensity?.toFixed(3) || 'N/A'}`);
    console.log(`- Peak Hours: ${response.data.summary?.peakHours?.join(', ') || 'N/A'}`);
    console.log(`- AI Insights: ${response.data.geminiInsights ? 'Available' : 'Not Available'}`);
    console.log('');
    
    return true;
  } catch (error) {
    console.log(`Error: ${error.response?.status || error.code} - ${error.message}`);
    if (error.response?.data) {
      console.log('Error Response:', JSON.stringify(error.response.data, null, 2));
    }
    console.log('');
    return false;
  }
}

async function testHybridAnalytics() {
  try {
    console.log('Testing: Hybrid Analytics - Get Route Analytics with External Integration');
    
    // Test hybrid analytics for route 1
    const response = await axios.get(`${BASE_URL}/api/analytics/hybrid/route/1`);
    
    console.log(`Success: ${response.status} ${response.statusText}`);
    console.log('Hybrid Analytics Data:');
    console.log(`- Source: ${response.data.source}`);
    console.log(`- External Available: ${response.data.metadata?.externalAvailable || false}`);
    
    if (response.data.source === 'hybrid') {
      console.log('- Local Data: Available');
      console.log('- External Data: Available');
    } else if (response.data.source === 'local') {
      console.log('- Local Data: Available');
      console.log('- External Data: Not Available (Fallback)');
    }
    
    if (response.data.data || response.data.local) {
      const analyticsData = response.data.data || response.data.local;
      console.log(`- Route ID: ${analyticsData.routeId}`);
      console.log(`- Route Name: ${analyticsData.routeName}`);
      console.log(`- Historical Data Points: ${analyticsData.historicalData?.length || 0}`);
      console.log(`- Predictions: ${analyticsData.predictions?.length || 0}`);
      console.log(`- Average Density: ${analyticsData.summary?.averageDensity?.toFixed(3) || 'N/A'}`);
    }
    console.log('');
    
    return true;
  } catch (error) {
    console.log(`Error: ${error.response?.status || error.code} - ${error.message}`);
    if (error.response?.data) {
      console.log('Error Response:', JSON.stringify(error.response.data, null, 2));
    }
    console.log('');
    return false;
  }
}

async function testAllRoutesAnalytics() {
  try {
    console.log('Testing: Get All Routes Analytics');
    
    // Test getting analytics for all routes
    const response = await axios.get(`${BASE_URL}/api/analytics/routes`);
    
    console.log(`Success: ${response.status} ${response.statusText}`);
    console.log('All Routes Analytics:');
    console.log(`- Total Routes: ${response.data?.length || 0}`);
    
    if (response.data && response.data.length > 0) {
      console.log('- Route Summary:');
      response.data.slice(0, 3).forEach((route, index) => {
        console.log(`  ${index + 1}. Route ${route.routeId}: ${route.routeName} (Density: ${route.summary?.averageDensity?.toFixed(3) || 'N/A'})`);
      });
      if (response.data.length > 3) {
        console.log(`  ... and ${response.data.length - 3} more routes`);
      }
    }
    console.log('');
    
    return true;
  } catch (error) {
    console.log(`Error: ${error.response?.status || error.code} - ${error.message}`);
    if (error.response?.data) {
      console.log('Error Response:', JSON.stringify(error.response.data, null, 2));
    }
    console.log('');
    return false;
  }
}

async function testConciseSummaries() {
  try {
    console.log('Testing: Get Concise Summaries');
    
    // Test getting concise summaries
    const response = await axios.get(`${BASE_URL}/api/analytics/summaries`);
    
    console.log(`Success: ${response.status} ${response.statusText}`);
    console.log('Concise Summaries:');
    console.log(`- Total Summaries: ${response.data?.length || 0}`);
    
    if (response.data && response.data.length > 0) {
      console.log('- Summary Preview:');
      response.data.slice(0, 2).forEach((summary, index) => {
        console.log(`  ${index + 1}. Route ${summary.routeId}: ${summary.routeName}`);
        console.log(`     Average Density: ${summary.averageDensity?.toFixed(3) || 'N/A'}`);
        console.log(`     AI Summary: ${summary.summary ? summary.summary.substring(0, 100) + '...' : 'N/A'}`);
      });
    }
    console.log('');
    
    return true;
  } catch (error) {
    console.log(`Error: ${error.response?.status || error.code} - ${error.message}`);
    if (error.response?.data) {
      console.log('Error Response:', JSON.stringify(error.response.data, null, 2));
    }
    console.log('');
    return false;
  }
}

async function runAnalyticsTests() {
  console.log('Starting Analytics Tests\n');

  const tests = [
    { name: 'Local Analytics', fn: testAnalytics },
    { name: 'Hybrid Analytics', fn: testHybridAnalytics },
    { name: 'All Routes Analytics', fn: testAllRoutesAnalytics },
    { name: 'Concise Summaries', fn: testConciseSummaries }
  ];

  let passed = 0;
  let failed = 0;

  for (const test of tests) {
    const success = await test.fn();
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
    console.log('\nAll analytics tests passed! Analytics functionality is working correctly.');
  } else {
    console.log('\nSome tests failed. Check the error messages above for details.');
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
runAnalyticsTests().catch(error => {
  console.error('Test suite failed:', error);
  process.exit(1);
});
