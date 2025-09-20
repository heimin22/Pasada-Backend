const axios = require('axios');

const BASE_URL = process.env.API_BASE_URL || 'http://localhost:8080';

async function testMigrationEndpoints() {
  console.log('Testing Migration Endpoints');
  console.log('================================');
  
  try {
    // Test 1: Check migration status
    console.log('\n1. Testing GET /api/admin/migration/status');
    try {
      const statusResponse = await axios.get(`${BASE_URL}/api/admin/migration/status`);
      console.log('Status check successful');
      console.log('Response:', JSON.stringify(statusResponse.data, null, 2));
    } catch (error) {
      console.log('Status check failed');
      console.log('Error:', error.response?.data || error.message);
    }

    // Test 2: Check QuestDB status (public endpoint)
    console.log('\n2. Testing GET /api/status/questdb');
    try {
      const questDbResponse = await axios.get(`${BASE_URL}/api/status/questdb`);
      console.log('QuestDB status check successful');
      console.log('Response:', JSON.stringify(questDbResponse.data, null, 2));
    } catch (error) {
      console.log('QuestDB status check failed');
      console.log('Error:', error.response?.data || error.message);
    }

    // Test 2b: Check QuestDB status (admin endpoint)
    console.log('\n2b. Testing GET /api/admin/migration/questdb-status');
    try {
      const questDbAdminResponse = await axios.get(`${BASE_URL}/api/admin/migration/questdb-status`);
      console.log('QuestDB admin status check successful');
      console.log('Response:', JSON.stringify(questDbAdminResponse.data, null, 2));
    } catch (error) {
      console.log('QuestDB admin status check failed');
      console.log('Error:', error.response?.data || error.message);
    }

    // Test 3: Run migration (only if status is ready)
    console.log('\n3. Testing POST /api/admin/migration/run');
    try {
      // First check if migration is ready
      const statusCheck = await axios.get(`${BASE_URL}/api/admin/migration/status`);
      
      if (statusCheck.data.data.isReady) {
        console.log('Migration service is ready, attempting to run migration...');
        const migrationResponse = await axios.post(`${BASE_URL}/api/admin/migration/run`);
        console.log('Migration run successful');
        console.log('Response:', JSON.stringify(migrationResponse.data, null, 2));
      } else {
        console.log('Migration service is not ready, skipping migration test');
        console.log('Status details:', statusCheck.data.data);
      }
    } catch (error) {
      console.log('Migration run failed');
      console.log('Error:', error.response?.data || error.message);
    }

  } catch (error) {
    console.error('Test suite failed:', error.message);
  }
}

// Run the tests
testMigrationEndpoints().then(() => {
  console.log('\nMigration endpoint tests completed');
}).catch(error => {
  console.error('Test suite crashed:', error);
});
