// import { io as Client } from 'socket.io-client';
// import { app, io } from '../server';

// describe('WebSocket Tests', () => {
//   let clientSocket;

//   beforeAll((done) => {
//     clientSocket = Client(`http://localhost:${process.env.PORT}`);
//     clientSocket.on('connect', done);
//   });

//   afterAll(() => {
//     io.close();
//     clientSocket.close();
//   });

//   test('should join trip room', (done) => {
//     const tripId = 'test-trip-id';
//     clientSocket.emit('join_trip', tripId);
    
//     // Verify join
//     clientSocket.on('trip_update', (data) => {
//       expect(data).toBeDefined();
//       done();
//     });
//   });
// });