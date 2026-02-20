// public/script.js

const startBtn = document.getElementById("startBtn");
const callBtn = document.getElementById("callBtn");
const hangupBtn = document.getElementById("hangupBtn");
const statusEl = document.getElementById("status");

const localVideo = document.getElementById("localVideo");
const remoteVideosContainer = document.getElementById("remoteVideos");

const socket = io();

// Store local media and peer connections
let localStream = null;
const peerConnections = {}; // { remoteSocketId: RTCPeerConnection }
const remoteVideoElements = {}; // { remoteSocketId: HTMLVideoElement }

const ROOM_ID = "main-room"; // simple single room

const iceConfig = {
  iceServers: [{ urls: "stun:stun.l.google.com:19302" }],
};

function setStatus(text) {
  console.log(text);
  statusEl.textContent = "Status: " + text;
}

// Create or get a remote <video> element for a specific peer
function getOrCreateRemoteVideoElement(remoteSocketId) {
  if (remoteVideoElements[remoteSocketId]) {
    return remoteVideoElements[remoteSocketId];
  }

  const wrapper = document.createElement("div");
  wrapper.style.marginBottom = "8px";

  const label = document.createElement("p");
  label.textContent = "User: " + remoteSocketId.substring(0, 6) + "...";
  label.style.fontSize = "12px";
  label.style.margin = "0 0 2px";

  const video = document.createElement("video");
  video.autoplay = true;
  video.playsInline = true;
  video.style.width = "100%";
  video.style.maxHeight = "220px";
  video.style.borderRadius = "6px";
  video.style.background = "#111827";

  wrapper.appendChild(label);
  wrapper.appendChild(video);
  remoteVideosContainer.appendChild(wrapper);

  remoteVideoElements[remoteSocketId] = video;
  return video;
}

// Create RTCPeerConnection for a given remote socket
function createPeerConnection(remoteSocketId) {
  const pc = new RTCPeerConnection(iceConfig);

  // Add local tracks if we have any (if device has camera/mic)
  if (localStream) {
    localStream.getTracks().forEach((track) => {
      pc.addTrack(track, localStream);
    });
  }

  // When we get local ICE candidates, send to remote
  pc.onicecandidate = (event) => {
    if (event.candidate) {
      socket.emit("send-ice-candidate", {
        targetId: remoteSocketId,
        candidate: event.candidate,
      });
    }
  };

  // When we receive remote media tracks
  pc.ontrack = (event) => {
    const [remoteStream] = event.streams;
    const videoEl = getOrCreateRemoteVideoElement(remoteSocketId);
    videoEl.srcObject = remoteStream;
  };

  peerConnections[remoteSocketId] = pc;
  return pc;
}

// 1) Start Camera (or allow receive-only if it fails)
startBtn.onclick = async () => {
  try {
    localStream = await navigator.mediaDevices.getUserMedia({
      video: true,
      audio: true,
    });

    localVideo.srcObject = localStream;
    setStatus(
      "Camera started. Now click 'Join Call' to connect to others in the room."
    );
  } catch (err) {
    console.error("Error getting user media:", err);
    setStatus(
      "No camera/mic found or permission denied. You can still join as receive-only.",
    );
  } finally {
    // Even without camera, we can still join and receive others
    callBtn.disabled = false;
    startBtn.disabled = true;
  }
};

// 2) Join the room & start group call
callBtn.onclick = () => {
  socket.emit("join-room", ROOM_ID);
  setStatus("Joined room. Looking for other users...");
  callBtn.disabled = true;
  hangupBtn.disabled = false;
};

// When we join, server sends all existing users in the room
socket.on("all-users", async (users) => {
  if (!users || users.length === 0) {
    setStatus("You are the first in the room. Waiting for others to join.");
    return;
  }

  setStatus("Found " + users.length + " users. Creating connections...");

  // For each existing user, create a connection and send offer
  for (const remoteSocketId of users) {
    const pc = createPeerConnection(remoteSocketId);

    try {
      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);

      socket.emit("send-offer", {
        targetId: remoteSocketId,
        offer,
      });

      setStatus("Sent offers to existing users.");
    } catch (err) {
      console.error("Error creating offer for", remoteSocketId, err);
    }
  }
});

// 3) Receive offer from someone who joined AFTER us, or we are the existing user
socket.on("receive-offer", async ({ fromId, offer }) => {
  let pc = peerConnections[fromId];
  if (!pc) {
    pc = createPeerConnection(fromId);
  }

  try {
    await pc.setRemoteDescription(new RTCSessionDescription(offer));

    const answer = await pc.createAnswer();
    await pc.setLocalDescription(answer);

    socket.emit("send-answer", {
      targetId: fromId,
      answer,
    });

    setStatus("Received offer and sent answer to " + fromId.substring(0, 6));
  } catch (err) {
    console.error("Error handling offer from", fromId, err);
  }
});

// 4) Receive answer to our offer
socket.on("receive-answer", async ({ fromId, answer }) => {
  const pc = peerConnections[fromId];
  if (!pc) {
    console.warn("No peerConnection for", fromId, "when receiving answer");
    return;
  }

  try {
    await pc.setRemoteDescription(new RTCSessionDescription(answer));
    setStatus("Connected with " + fromId.substring(0, 6));
  } catch (err) {
    console.error("Error setting remote description from answer:", err);
  }
});

// 5) Receive ICE candidate
socket.on("receive-ice-candidate", async ({ fromId, candidate }) => {
  const pc = peerConnections[fromId];
  if (!pc) {
    console.warn("No peerConnection for", fromId, "when receiving ICE");
    return;
  }

  try {
    await pc.addIceCandidate(new RTCIceCandidate(candidate));
  } catch (err) {
    console.error("Error adding received ICE candidate:", err);
  }
});

// 6) Hang up (local cleanup)
hangupBtn.onclick = () => {
  // Close all peer connections
  Object.values(peerConnections).forEach((pc) => pc.close());
  for (const key in peerConnections) {
    delete peerConnections[key];
  }

  // Stop local stream
  if (localStream) {
    localStream.getTracks().forEach((track) => track.stop());
    localStream = null;
  }

  localVideo.srcObject = null;

  // Remove remote video elements
  remoteVideosContainer.innerHTML = "";
  for (const key in remoteVideoElements) {
    delete remoteVideoElements[key];
  }

  startBtn.disabled = false;
  callBtn.disabled = true;
  hangupBtn.disabled = true;

  setStatus("Call ended. You can start again.");
};