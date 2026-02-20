// public/script.js

const startBtn = document.getElementById("startBtn");
const callBtn = document.getElementById("callBtn");
const hangupBtn = document.getElementById("hangupBtn");

const statusEl = document.getElementById("status");
const headerStatusEl = document.getElementById("headerStatus");

const localVideo = document.getElementById("localVideo");
const remoteVideo = document.getElementById("remoteVideo");

const localPlaceholder = document.getElementById("localPlaceholder");
const remotePlaceholder = document.getElementById("remotePlaceholder");

// Connect to Socket.IO server (same origin)
const socket = io();

let localStream = null;
let peerConnection = null;

const iceConfig = {
  iceServers: [{ urls: "stun:stun.l.google.com:19302" }],
};

function setStatus(text, headerState = "default") {
  console.log(text);
  statusEl.textContent = text;

  if (headerState === "connected") {
    headerStatusEl.textContent = "In call";
  } else if (headerState === "error") {
    headerStatusEl.textContent = "Error";
  } else if (headerState === "connecting") {
    headerStatusEl.textContent = "Connecting...";
  } else {
    headerStatusEl.textContent = "Idle";
  }
}

function showLocalPlaceholder(show) {
  localPlaceholder.style.display = show ? "flex" : "none";
}

function showRemotePlaceholder(show) {
  remotePlaceholder.style.display = show ? "flex" : "none";
}

// 1) Start camera / mic (or gracefully handle if not available)
startBtn.onclick = async () => {
  try {
    localStream = await navigator.mediaDevices.getUserMedia({
      video: true,
      audio: true,
    });

    localVideo.srcObject = localStream;
    showLocalPlaceholder(false);

    setStatus(
      "Camera started. Now open this page on another device/tab and click 'Start Call' on ONE of them.",
      "default"
    );
  } catch (err) {
    console.error("Error getting user media:", err);
    setStatus(
      "No camera/mic found or permission denied. You can still join as a receive-only peer.",
      "error"
    );
  } finally {
    // Even if camera fails, allow starting/receiving a call
    callBtn.disabled = false;
    startBtn.disabled = true;
  }
};

function createPeerConnection() {
  peerConnection = new RTCPeerConnection(iceConfig);

  peerConnection.onicecandidate = (event) => {
    if (event.candidate) {
      socket.emit("ice-candidate", event.candidate);
    }
  };

  peerConnection.ontrack = (event) => {
    console.log("Received remote track");
    remoteVideo.srcObject = event.streams[0];
    showRemotePlaceholder(false);
    setStatus("Receiving remote stream...", "connected");
  };

  // If we have local media, attach it; otherwise we act as receive-only
  if (localStream) {
    localStream.getTracks().forEach((track) => {
      peerConnection.addTrack(track, localStream);
    });
  }
}

// 2) Start call (create offer)
callBtn.onclick = async () => {
  if (!peerConnection) {
    createPeerConnection();
  }

  try {
    const offer = await peerConnection.createOffer();
    await peerConnection.setLocalDescription(offer);

    socket.emit("offer", offer);
    setStatus("Offer sent. Waiting for answer...", "connecting");

    callBtn.disabled = true;
    hangupBtn.disabled = false;
  } catch (err) {
    console.error("Error creating offer:", err);
    setStatus("Error creating offer.", "error");
  }
};

// 3) Handle incoming offer
socket.on("offer", async (offer) => {
  console.log("Received offer");

  if (!peerConnection) {
    createPeerConnection();
  }

  try {
    await peerConnection.setRemoteDescription(new RTCSessionDescription(offer));

    const answer = await peerConnection.createAnswer();
    await peerConnection.setLocalDescription(answer);

    socket.emit("answer", answer);
    setStatus("Answer sent. Waiting for media...", "connecting");

    callBtn.disabled = true;
    hangupBtn.disabled = false;
  } catch (err) {
    console.error("Error handling offer:", err);
    setStatus("Error handling offer.", "error");
  }
});

// 4) Handle incoming answer
socket.on("answer", async (answer) => {
  console.log("Received answer");
  try {
    await peerConnection.setRemoteDescription(
      new RTCSessionDescription(answer)
    );
    setStatus("Connected! Waiting for remote media...", "connecting");
  } catch (err) {
    console.error("Error handling answer:", err);
    setStatus("Error handling answer.", "error");
  }
});

// 5) Handle incoming ICE candidates
socket.on("ice-candidate", async (candidate) => {
  try {
    if (peerConnection && candidate) {
      await peerConnection.addIceCandidate(new RTCIceCandidate(candidate));
      console.log("Added remote ICE candidate");
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

  showLocalPlaceholder(true);
  showRemotePlaceholder(true);

  startBtn.disabled = false;
  callBtn.disabled = true;
  hangupBtn.disabled = true;

  setStatus("Call ended. You can start again.", "default");
};