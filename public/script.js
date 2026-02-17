const socket = io();

const localVideo = document.getElementById("localVideo");
const remoteVideo = document.getElementById("remoteVideo");
const callBtn = document.getElementById("callBtn");

let role = null;

// Receive role from server
socket.on("role", (assignedRole) => {
  role = assignedRole;
  console.log("My role:", role);
});

// Peer connection
const pc = new RTCPeerConnection({
  iceServers: [{ urls: "stun:stun.l.google.com:19302" }],
});

// Get camera & mic
navigator.mediaDevices.getUserMedia({ video: true, audio: true })
  .then((stream) => {
    localVideo.srcObject = stream;
    stream.getTracks().forEach(track => pc.addTrack(track, stream));
  });

// Receive remote stream
pc.ontrack = (event) => {
  console.log("Remote stream received");
  remoteVideo.srcObject = event.streams[0];
};

// ICE candidates
pc.onicecandidate = (event) => {
  if (event.candidate) {
    socket.emit("ice-candidate", event.candidate);
  }
};

socket.on("ice-candidate", async (candidate) => {
  try {
    await pc.addIceCandidate(candidate);
  } catch (err) {
    console.error("ICE error:", err);
  }
});

// Offer received
socket.on("offer", async (offer) => {
  console.log("Offer received");
  await pc.setRemoteDescription(offer);

  const answer = await pc.createAnswer();
  await pc.setLocalDescription(answer);
  socket.emit("answer", answer);
});

// Answer received
socket.on("answer", async (answer) => {
  console.log("Answer received");
  await pc.setRemoteDescription(answer);
});

// Start call (ONLY caller)
callBtn.onclick = async () => {
  if (role !== "caller") {
    alert("Wait for caller to start the call");
    return;
  }

  console.log("Creating offer");
  const offer = await pc.createOffer();
  await pc.setLocalDescription(offer);
  socket.emit("offer", offer);
};
