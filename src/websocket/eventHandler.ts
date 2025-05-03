import { supabase } from '../utils/supabaseClient';
export class RealtimeEventHandler {
    private channels: ReturnType<typeof supabase.channel>[] = [];

    constructor() {
        this.setupSubscriptions();
    }

    /**
     * Sets up all Supabase Realtime subscriptions
     */
    private setupSubscriptions() {
        this.setupBookingsSubscription();
        this.setupDriverLocationSubscription();
    }

    /**
     * Sets up subscription for bookings table changes
     */
    private setupBookingsSubscription() {
        const bookingsChannel = supabase.channel('bookings_changes')
            .on('postgres_changes', 
                { event: '*', schema: 'public', table: 'bookings' }, 
                (payload) => {
                    console.log('Booking change detected:', payload);
                    // The client will handle this data directly through their own subscriptions
                }
            )
            .subscribe();
        
        this.channels.push(bookingsChannel);
    }

    /**
     * Sets up subscription for driver location updates
     */
    private setupDriverLocationSubscription() {
        const driversChannel = supabase.channel('drivers_location')
            .on('postgres_changes', 
                { event: 'UPDATE', schema: 'public', table: 'driverTable', filter: 'current_location=neq.null' }, 
                (payload) => {
                    console.log('Driver location updated:', payload);
                    // The client will handle this data directly through their own subscriptions
                }
            )
            .subscribe();
        
        this.channels.push(driversChannel);
    }

    /**
     * Unsubscribes from all channels when shutting down
     */
    public cleanup() {
        this.channels.forEach(channel => {
            supabase.removeChannel(channel);
        });
        console.log('Cleaned up all Supabase Realtime subscriptions');
    }
}
