import axios from 'axios';

// Configuration
const BASE_URL = process.env.API_URL || 'http://localhost:8080';

console.log('Testing Database-Based Gemini Analysis');
console.log(`Base URL: ${BASE_URL}`);
console.log('');

async function testDatabaseAnalysis() {
  try {
    console.log('Testing: Database-Based Gemini Analysis for Route 1');
    
    // Test the new database-based analysis endpoint
    const response = await axios.get(`${BASE_URL}/api/analytics/database-analysis/route/1?days=7`);
    
    console.log(`Success: ${response.status} ${response.statusText}`);
    console.log('Database Analysis Results:');
    console.log(`- Route ID: ${response.data.data.routeId}`);
    console.log(`- Days Analyzed: ${response.data.data.days}`);
    console.log(`- Analysis Type: ${response.data.data.analysisType}`);
    console.log(`- Generated At: ${response.data.data.generatedAt}`);
    console.log(`- AI Insights: ${response.data.data.geminiInsights}`);
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

async function testDatabaseAnalysisWithDifferentDays() {
  try {
    console.log('Testing: Database-Based Analysis with 14 days of data');
    
    const response = await axios.get(`${BASE_URL}/api/analytics/database-analysis/route/1?days=14`);
    
    console.log(`Success: ${response.status} ${response.statusText}`);
    console.log('Extended Analysis Results:');
    console.log(`- Days Analyzed: ${response.data.data.days}`);
    console.log(`- AI Insights: ${response.data.data.geminiInsights}`);
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

async function testDatabaseAnalysisWithInvalidRoute() {
  try {
    console.log('Testing: Database Analysis with Invalid Route ID');
    
    const response = await axios.get(`${BASE_URL}/api/analytics/database-analysis/route/99999`);
    
    console.log(`Unexpected Success: ${response.status} ${response.statusText}`);
    console.log('Response:', JSON.stringify(response.data, null, 2));
    console.log('');
    
    return false; // This should have failed
  } catch (error) {
    if (error.response?.status === 400 || error.response?.status === 500) {
      console.log(`Expected Error: ${error.response.status} - ${error.message}`);
      console.log('Error Response:', JSON.stringify(error.response.data, null, 2));
      console.log('');
      return true; // Expected error, test passed
    } else {
      console.log(`Unexpected Error: ${error.response?.status || error.code} - ${error.message}`);
      console.log('');
      return false;
    }
  }
}

async function runDatabaseAnalysisTests() {
  console.log('Starting Database-Based Gemini Analysis Tests\n');

  const tests = [
    { name: 'Database Analysis (7 days)', fn: testDatabaseAnalysis },
    { name: 'Database Analysis (14 days)', fn: testDatabaseAnalysisWithDifferentDays },
    { name: 'Invalid Route Test', fn: testDatabaseAnalysisWithInvalidRoute }
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
    console.log('\nAll database-based analysis tests passed! The new functionality is working correctly.');
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
runDatabaseAnalysisTests().catch(error => {
  console.error('Test suite failed:', error);
  process.exit(1);
});
