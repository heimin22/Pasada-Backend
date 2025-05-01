import { supabase } from './supabaseClient.ts';

export const setupRealtimeSubscriptions = () => {
  console.log('Setting up Supabase Realtime subscriptions');
  
  // Subscribe to bookings table changes
  const bookingsChannel = supabase.channel('bookings_changes')
    .on('postgres_changes', 
      { event: '*', schema: 'public', table: 'bookings' }, 
      (payload) => {
        console.log('Booking change detected:', payload);
        // The client will subscribe to these changes directly
      }
    )
    .subscribe();

  // Subscribe to driver location updates
  const driversChannel = supabase.channel('drivers_location')
    .on('postgres_changes', 
      { event: 'UPDATE', schema: 'public', table: 'driverTable', filter: 'current_location=neq.null' }, 
      (payload) => {
        console.log('Driver location updated:', payload);
        // The client will subscribe to these changes directly
      }
    )
    .subscribe();

  return { bookingsChannel, driversChannel };
};