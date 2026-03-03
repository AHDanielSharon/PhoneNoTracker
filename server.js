const express = require('express');
const http = require('http');
const { Server } = require('socket.io');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

const PORT = process.env.PORT || 3000;

app.use(express.static('public'));

const roomState = new Map();

io.on('connection', (socket) => {
  socket.on('join-room', ({ roomId, role }) => {
    if (!roomId || !role) return;

    socket.join(roomId);
    socket.data.roomId = roomId;
    socket.data.role = role;

    if (!roomState.has(roomId)) {
      roomState.set(roomId, { me: null, target: null });
    }

    socket.emit('room-joined', { roomId, role });

    const state = roomState.get(roomId);
    io.to(roomId).emit('state-update', state);
  });

  socket.on('location-update', ({ roomId, role, coords, timestamp }) => {
    if (!roomId || !role || !coords) return;

    if (!roomState.has(roomId)) {
      roomState.set(roomId, { me: null, target: null });
    }

    const state = roomState.get(roomId);
    state[role] = {
      coords,
      timestamp,
      socketId: socket.id,
    };

    io.to(roomId).emit('state-update', state);
  });

  socket.on('disconnect', () => {
    const { roomId, role } = socket.data;
    if (!roomId || !role || !roomState.has(roomId)) return;

    const state = roomState.get(roomId);
    if (state[role]?.socketId === socket.id) {
      state[role] = null;
      io.to(roomId).emit('state-update', state);
    }

    if (!state.me && !state.target) {
      roomState.delete(roomId);
    }
  });
});

server.listen(PORT, () => {
  console.log(`Consent location app running on http://localhost:${PORT}`);
});
