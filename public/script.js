// public/script.js

const startBtn = document.getElementById("startBtn");
const callBtn = document.getElementById("callBtn");
const hangupBtn = document.getElementById("hangupBtn");
const statusEl = document.getElementById("status");

const localVideo = document.getElementById("localVideo");
const remoteVideo = document.getElementById("remoteVideo");

const socket = io(); // Connect to our Socket.IO server

let localStream;
let peerConnection;

// STUN server config (public Google STUN)
const iceConfig = {
  iceServers: [{ urls: "stun:stun.l.google.com:19302" }],
};

function setStatus(text) {
  console.log(text);
  statusEl.textContent = "Status: " + text;
}

// 1) Start camera / mic
startBtn.onclick = async () => {
  try {
    localStream = await navigator.mediaDevices.getUserMedia({
      video: true,
      audio: true,
    });

    localVideo.srcObject = localStream;

    callBtn.disabled = false;
    startBtn.disabled = true;

    setStatus("Camera started. Now click 'Start Call' on ONE tab.");
  } catch (err) {
    console.error("Error getting user media:", err);
    setStatus("Error accessing camera/mic. Check permissions.");
  }
};

// Helper: create RTCPeerConnection and glue events
function createPeerConnection() {
  peerConnection = new RTCPeerConnection(iceConfig);

  // When we get ICE candidates locally, send them to the other peer
  peerConnection.onicecandidate = (event) => {
    if (event.candidate) {
      socket.emit("ice-candidate", event.candidate);
    }
  };

  // Remote stream tracks
  peerConnection.ontrack = (event) => {
    console.log("Received remote track");
    remoteVideo.srcObject = event.streams[0];
  };

  // Add our local stream tracks to the connection
  if (localStream) {
    localStream.getTracks().forEach((track) => {
      peerConnection.addTrack(track, localStream);
    });
  }
}

// 2) Start call (create offer)
callBtn.onclick = async () => {
  if (!localStream) {
    setStatus("Start camera first!");
    return;
  }

  createPeerConnection();

  try {
    const offer = await peerConnection.createOffer();
    await peerConnection.setLocalDescription(offer);

    socket.emit("offer", offer);
    setStatus("Offer sent. Waiting for answer...");

    callBtn.disabled = true;
    hangupBtn.disabled = false;
  } catch (err) {
    console.error("Error creating offer:", err);
    setStatus("Error creating offer.");
  }
};

// 3) Handle incoming offer (from the other peer)
socket.on("offer", async (offer) => {
  // If we are the receiving side
  if (!peerConnection) {
    createPeerConnection();
  }

  try {
    await peerConnection.setRemoteDescription(new RTCSessionDescription(offer));

    const answer = await peerConnection.createAnswer();
    await peerConnection.setLocalDescription(answer);

    socket.emit("answer", answer);
    setStatus("Answer sent.");

    callBtn.disabled = true;
    hangupBtn.disabled = false;
  } catch (err) {
    console.error("Error handling offer:", err);
    setStatus("Error handling offer.");
  }
});

// 4) Handle incoming answer
socket.on("answer", async (answer) => {
  try {
    await peerConnection.setRemoteDescription(new RTCSessionDescription(answer));
    setStatus("Connected! Video call established.");
  } catch (err) {
    console.error("Error setting remote description with answer:", err);
    setStatus("Error handling answer.");
  }
});

// 5) Handle incoming ICE candidates
socket.on("ice-candidate", async (candidate) => {
  try {
    if (peerConnection) {
      await peerConnection.addIceCandidate(new RTCIceCandidate(candidate));
    }
  } catch (err) {
    console.error("Error adding received ICE candidate:", err);
  }
});

// 6) Hang up
hangupBtn.onclick = () => {
  if (peerConnection) {
    peerConnection.close();
    peerConnection = null;
  }

  if (localStream) {
    localStream.getTracks().forEach((track) => track.stop());
    localStream = null;
  }

  localVideo.srcObject = null;
  remoteVideo.srcObject = null;

  startBtn.disabled = false;
  callBtn.disabled = true;
  hangupBtn.disabled = true;

  setStatus("Call ended. You can start again.");
};