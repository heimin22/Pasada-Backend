import { Server, Socket } from "socket.io";
import { supabase } from '../utils/supabaseClient.ts';

export class WebSocketHandler {
    private io: Server;

    constructor(io: Server) {
        this.io = io;
        this.setupSupabaseSubscription();
    }

    private setupSupabaseSubscription() {
        const channel = supabase.channel('bookings_channel')
            .on('postgres_changes', { event: '*', schema: 'public', table: 'bookings' }, (payload) => {
                this.io.to(`trip_${(payload.new as { id: string }).id}`).emit('trip_update', payload.new);
            }
        )
        .subscribe();
    }

    public handleConnection(socket: Socket) {
        console.log('Client connected: ', socket.id);

        socket.on('join_trip', (tripId: string) => {
            socket.join(`trip_${tripId}`);
            console.log(`Client ${socket.id} joined trip ${tripId}`);
        });

        socket.on('driver_location_update', async (data: {
            driverId: string,
            latitude: number,
            longitude: number
          }) => {
            // Update driver location in database
            await supabase
              .from('drivers')
              .update({
                current_location: `POINT(${data.longitude} ${data.latitude})`
              })
              .eq('id', data.driverId);
      
            // Broadcast to relevant rooms
            this.io.to(`driver_${data.driverId}`).emit('location_update', data);
          });
      
          socket.on('disconnect', () => {
            console.log('Client disconnected:', socket.id);
          });
    }
}
