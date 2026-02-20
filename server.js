// server.js
import express from "express";
import http from "http";
import { Server } from "socket.io";

const app = express();
const server = http.createServer(app);

// Socket.IO server (for signaling)
const io = new Server(server, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"],
  },
});

// Serve static files from "public" folder
app.use(express.static("public"));

io.on("connection", (socket) => {
  console.log("User connected:", socket.id);

  // Receive offer from one peer and send to the other
  socket.on("offer", (offer) => {
    console.log("Received offer from", socket.id);
    socket.broadcast.emit("offer", offer);
  });

  // Receive answer from other peer and send back
  socket.on("answer", (answer) => {
    console.log("Received answer from", socket.id);
    socket.broadcast.emit("answer", answer);
  });

  // ICE candidates exchange
  socket.on("ice-candidate", (candidate) => {
    // candidate can be null at the end; just forward if exists
    if (candidate) {
      console.log("Received ICE candidate from", socket.id);
      socket.broadcast.emit("ice-candidate", candidate);
    }
  });

  socket.on("disconnect", () => {
    console.log("User disconnected:", socket.id);
  });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});