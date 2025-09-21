import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config();

// Supabase configuration
const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error('Missing Supabase configuration');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

async function testDriverFunction() {
  console.log('Testing find_available_drivers_for_route function...\n');

  // Test parameters
  const testCases = [
    {
      name: 'Test 1: Looking for sitting preference',
      params: {
        max_drivers: 5,
        passenger_lat: 14.5995,
        passenger_lon: 120.9842,
        p_route_id: 1,
        search_radius_m: 10000, // 10km radius
        seating_preference: 'sitting'
      }
    },
    {
      name: 'Test 2: Looking for standing preference',
      params: {
        max_drivers: 5,
        passenger_lat: 14.5995,
        passenger_lon: 120.9842,
        p_route_id: 1,
        search_radius_m: 10000,
        seating_preference: 'standing'
      }
    },
    {
      name: 'Test 3: Looking for any preference',
      params: {
        max_drivers: 5,
        passenger_lat: 14.5995,
        passenger_lon: 120.9842,
        p_route_id: 1,
        search_radius_m: 10000,
        seating_preference: 'any'
      }
    }
  ];

  for (const testCase of testCases) {
    console.log(`\n=== ${testCase.name} ===`);
    console.log(`Parameters:`, testCase.params);
    
    try {
      const { data, error } = await supabase.rpc('find_available_drivers_for_route', testCase.params);
      
      if (error) {
        console.error('Error:', error.message);
        console.error('Details:', error);
      } else {
        console.log(`Found ${data.length} available drivers:`);
        
        if (data.length > 0) {
          data.forEach((driver, index) => {
            console.log(`  ${index + 1}. Driver ID: ${driver.driver_id}`);
            console.log(`     Distance: ${Math.round(driver.distance_m)}m`);
            console.log(`     Capacity: ${driver.passenger_capacity}`);
            console.log(`     Sitting: ${driver.sitting_passenger}/23`);
            console.log(`     Standing: ${driver.standing_passenger}/3`);
            console.log(`     Location: ${JSON.stringify(driver.current_location)}`);
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

// Test if the function exists first
async function checkFunctionExists() {
  console.log('Checking if function exists in database...');
  
  try {
    const { data, error } = await supabase
      .from('pg_proc')
      .select('proname')
      .eq('proname', 'find_available_drivers_for_route');
    
    if (error) {
      console.log('Could not check function existence (this is normal)');
      return true; // Assume it exists and let the test fail if it doesn't
    }
    
    if (data && data.length > 0) {
      console.log('Function exists in database');
      return true;
    } else {
      console.log('Function does not exist in database');
      return false;
    }
  } catch (err) {
    console.log('Could not verify function existence, proceeding with test...');
    return true;
  }
}

async function checkTables() {
  console.log('\nChecking required tables...');
  
  try {
    // Check driverTable
    const { data: drivers, error: driverError } = await supabase
      .from('driverTable')
      .select('driver_id, driving_status, currentroute_id, current_location, vehicle_id')
      .limit(3);
    
    if (driverError) {
      console.log('driverTable error:', driverError.message);
    } else {
      console.log(`driverTable: Found ${drivers.length} drivers`);
      if (drivers.length > 0) {
        console.log('Sample driver:', drivers[0]);
      }
    }

    // Check vehicleTable
    const { data: vehicles, error: vehicleError } = await supabase
      .from('vehicleTable')
      .select('vehicle_id, passenger_capacity, sitting_passenger, standing_passenger')
      .limit(3);
    
    if (vehicleError) {
      console.log('vehicleTable error:', vehicleError.message);
    } else {
      console.log(`vehicleTable: Found ${vehicles.length} vehicles`);
      if (vehicles.length > 0) {
        console.log('Sample vehicle:', vehicles[0]);
      }
    }
  } catch (err) {
    console.error('Error checking tables:', err);
  }
}

async function runTests() {
  await checkTables();
  
  const functionExists = await checkFunctionExists();
  if (!functionExists) {
    console.log('\nPlease create the function in your Supabase database first.');
    return;
  }
  
  await testDriverFunction();
}

// Run tests if this file is executed directly
if (require.main === module) {
  runTests().catch(console.error);
}

module.exports = { testDriverFunction, checkTables };
