const axios = require('axios');

// Configuration
const BASE_URL = process.env.API_BASE_URL;

console.log('Populating traffic data with realistic values...');
console.log(`Backend URL: ${BASE_URL}`);
console.log('');

async function populateTrafficData() {
  try {
    console.log('Calling refresh endpoint to generate realistic traffic data...');
    
    const response = await axios.post(`${BASE_URL}/api/analytics/refresh`, {}, {
      timeout: 30000
    });
    
    console.log('Success! Traffic data populated.');
    console.log(`Response: ${JSON.stringify(response.data, null, 2)}`);
    
    // Now test the summaries endpoint to see the new data
    console.log('\nTesting summaries endpoint to verify data...');
    
    const summariesResponse = await axios.get(`${BASE_URL}/api/analytics/summaries`);
    
    console.log('Summaries response:');
    summariesResponse.data.forEach((summary, index) => {
      const densityPercent = Math.round(summary.averageDensity * 100);
      console.log(`${index + 1}. ${summary.routeName}: ${densityPercent}% - ${summary.summary}`);
    });
    
  } catch (error) {
    console.error('Error populating traffic data:', error.message);
    if (error.response) {
      console.error('Response status:', error.response.status);
      console.error('Response data:', error.response.data);
    }
  }
}

// Run if this file is executed directly
if (require.main === module) {
  populateTrafficData().catch(console.error);
}

module.exports = { populateTrafficData };
