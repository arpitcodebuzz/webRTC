// server.js
import express from "express";
import http from "http";
import { Server } from "socket.io";

const app = express();
const server = http.createServer(app);

const io = new Server(server, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"],
  },
});

// Serve static frontend
app.use(express.static("public"));

io.on("connection", (socket) => {
  console.log("User connected:", socket.id);

  // User joins a room (we'll use a simple string from client)
  socket.on("join-room", async (roomId) => {
    console.log(`Socket ${socket.id} joining room ${roomId}`);
    socket.join(roomId);

    // Get all sockets in this room
    const clients = await io.in(roomId).allSockets(); // Set of socket IDs
    const otherUsers = [...clients].filter((id) => id !== socket.id);

    // Send existing users to the new client
    socket.emit("all-users", otherUsers);
  });

  // Relay offer to specific target
  socket.on("send-offer", ({ targetId, offer }) => {
    console.log(`Offer from ${socket.id} to ${targetId}`);
    io.to(targetId).emit("receive-offer", { fromId: socket.id, offer });
  });

  // Relay answer to specific target
  socket.on("send-answer", ({ targetId, answer }) => {
    console.log(`Answer from ${socket.id} to ${targetId}`);
    io.to(targetId).emit("receive-answer", { fromId: socket.id, answer });
  });

  // Relay ICE candidate to specific target
  socket.on("send-ice-candidate", ({ targetId, candidate }) => {
    // candidate can be null at end of gathering; usually we forward only real ones
    if (candidate) {
      io.to(targetId).emit("receive-ice-candidate", {
        fromId: socket.id,
        candidate,
      });
    }
  });

  socket.on("disconnect", () => {
    console.log("User disconnected:", socket.id);
    // For a real app you might notify others to remove this user's video
  });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});