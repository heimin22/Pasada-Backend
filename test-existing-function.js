const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_ANON_KEY);

async function testExistingFunction() {
  console.log('Testing existing function with seat_type parameter...\n');

  // Try the function with seat_type parameter (capitalized values)
  const testCases = [
    {
      name: 'Test with Sitting preference',
      params: {
        max_drivers: 5,
        p_route_id: 1,
        passenger_lat: 14.5995,
        passenger_lon: 120.9842,
        search_radius_m: 10000,
        seat_type: 'Sitting'
      }
    },
    {
      name: 'Test with Standing preference', 
      params: {
        max_drivers: 5,
        p_route_id: 1,
        passenger_lat: 14.5995,
        passenger_lon: 120.9842,
        search_radius_m: 10000,
        seat_type: 'Standing'
      }
    },
    {
      name: 'Test with Any preference',
      params: {
        max_drivers: 8,
        p_route_id: 1,
        passenger_lat: 14.5995,
        passenger_lon: 120.9842,
        search_radius_m: 10000,
        seat_type: 'Any'
      }
    },
    {
      name: 'Test with route 3 (matching sample data)',
      params: {
        max_drivers: 5,
        p_route_id: 3, // This matches the sample driver's currentroute_id
        passenger_lat: 14.6576827,
        passenger_lon: 120.9765061,
        search_radius_m: 10000,
        seat_type: 'Any'
      }
    }
  ];

  for (const testCase of testCases) {
    console.log(`\n=== ${testCase.name} ===`);
    console.log('Parameters:', testCase.params);

    try {
      const { data, error } = await supabase.rpc('find_available_drivers_for_route', testCase.params);
      
      if (error) {
        console.error('Error:', error.message);
        console.error('Details:', error);
      } else {
        console.log(`Success! Found ${data.length} drivers:`);
        if (data.length > 0) {
          data.forEach((driver, index) => {
            console.log(`  ${index + 1}. Driver ID: ${driver.driver_id}`);
            console.log(`     Distance: ${Math.round(driver.distance_m)}m`);
            console.log(`     Capacity: ${driver.passenger_capacity}`);
            console.log(`     Sitting: ${driver.sitting_passenger}/23`);
            console.log(`     Standing: ${driver.standing_passenger}/3`);
          });
        } else {
          console.log('  No drivers found matching criteria');
        }
      }
    } catch (err) {
      console.error('Unexpected error:', err);
    }
  }
}

// Also try to list available functions
async function listFunctions() {
  console.log('\nTrying to list available functions...');
  
  try {
    const { data, error } = await supabase
      .from('information_schema.routines')
      .select('routine_name, specific_name')
      .eq('routine_type', 'FUNCTION')
      .like('routine_name', '%driver%');
    
    if (error) {
      console.log('Could not list functions:', error.message);
    } else {
      console.log('Found functions with "driver" in the name:');
      data.forEach(func => {
        console.log(`  - ${func.routine_name} (${func.specific_name})`);
      });
    }
  } catch (err) {
    console.log('Error listing functions:', err.message);
  }
}

async function runTest() {
  await listFunctions();
  await testExistingFunction();
}

if (require.main === module) {
  runTest().catch(console.error);
}

module.exports = { testExistingFunction };
