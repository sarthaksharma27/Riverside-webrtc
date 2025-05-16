const localVideo = document.getElementById('local-video');
const inviteBtn = document.getElementById('invite-btn');

const micBtn = document.querySelector('.control-button:nth-child(2)');
const camBtn = document.querySelector('.control-button:nth-child(3)');
const leaveBtn = document.querySelector('.control-button:nth-child(5)');

let localStream = null;
let micEnabled = true;
let camEnabled = true;

let peerConnection;
let isInitiator = false;

const config = {
  iceServers: [{ urls: 'stun:stun.l.google.com:19302' }],
};

const socket = io();
const roomId = window.roomId;

async function startLocalStream() {
  try {
    localStream = await navigator.mediaDevices.getUserMedia({
      video: { width: 1280, height: 720, frameRate: 30 },
      audio: true
    });
    localVideo.srcObject = localStream;
    console.log('🎥 Local stream started.');
  } catch (err) {
    console.error('Failed to get user media:', err);
    alert('Could not access camera or microphone.');
  }
}

function createPeerConnection() {
  peerConnection = new RTCPeerConnection(config);

  peerConnection.ontrack = (event) => {
    console.log('🎥 Remote track received:', event.streams[0]);
    const remoteVideo = document.getElementById('remote-video');
    if (remoteVideo) {
      remoteVideo.srcObject = event.streams[0];
    } else {
      console.warn('remote-video element not found!');
    }
  };

  peerConnection.onicecandidate = (event) => {
    if (event.candidate) {
      console.log('📤 Sending ICE candidate:', event.candidate);
      socket.emit('ice-candidate', { roomId, candidate: event.candidate });
    }
  };

  localStream.getTracks().forEach(track => {
    peerConnection.addTrack(track, localStream);
  });

  console.log('✅ PeerConnection created and local tracks added.');
}

async function createAndSendOffer() {
  try {
    const offer = await peerConnection.createOffer();
    await peerConnection.setLocalDescription(offer);
    socket.emit('offer', { roomId, offer });
    console.log('📤 Offer sent:', offer);
  } catch (err) {
    console.error('❌ Error creating or sending offer:', err);
  }
}

socket.on('offer', async ({ offer }) => {
  if (!peerConnection) createPeerConnection();
  console.log('📥 Offer received');
  await peerConnection.setRemoteDescription(new RTCSessionDescription(offer));
  const answer = await peerConnection.createAnswer();
  await peerConnection.setLocalDescription(answer);
  socket.emit('answer', { roomId, answer });
  console.log('📤 Answer sent');
});

socket.on('answer', async ({ answer }) => {
  if (!peerConnection) return;
  console.log('📥 Answer received');
  await peerConnection.setRemoteDescription(new RTCSessionDescription(answer));
});

socket.on('ice-candidate', async ({ candidate }) => {
  if (!peerConnection) return;
  try {
    console.log('📥 Received ICE candidate:', candidate);
    await peerConnection.addIceCandidate(new RTCIceCandidate(candidate));
  } catch (err) {
    console.error('❌ Error adding received ICE candidate:', err);
  }
});

function startCall() {
  createPeerConnection();
}

socket.on('ready', () => {
  if (isInitiator) {
    console.log('🟢 Peer is ready, sending offer...');
    createAndSendOffer();
  }
});

// ==== Signaling Events ====

socket.on('room-created', () => {
  isInitiator = true;
  console.log('🧭 You are the initiator.');
  startCall();
});

socket.on('room-joined', () => {
  isInitiator = false;
  console.log('🧭 You joined an existing room.');
  startCall(); 
  socket.emit('ready', roomId); 
});


socket.on('user-joined', userId => {
  console.log('👥 Another user joined:', userId);
  // No action needed.
});


// ==== Button Handlers ====

function toggleMic() {
  if (!localStream) return;
  micEnabled = !micEnabled;
  localStream.getAudioTracks().forEach(track => track.enabled = micEnabled);
  const icon = micBtn.querySelector('.control-button-icon');
  icon.style.backgroundColor = micEnabled ? '#333' : '#ff5959';
}

function toggleCam() {
  if (!localStream) return;
  camEnabled = !camEnabled;
  localStream.getVideoTracks().forEach(track => track.enabled = camEnabled);
  const icon = camBtn.querySelector('.control-button-icon');
  icon.style.backgroundColor = camEnabled ? '#333' : '#ff5959';
}

function leaveCall() {
  if (!localStream) return;
  localStream.getTracks().forEach(track => track.stop());
  localVideo.srcObject = null;
  localStream = null;
  alert('You have left the studio.');
}

// ==== Invite Button ====

inviteBtn.addEventListener('click', () => {
  const inviteLink = `${window.location.origin}/studio/${roomId}`;
  navigator.clipboard.writeText(inviteLink)
    .then(() => alert(`Invite link copied to clipboard:\n${inviteLink}`))
    .catch(err => console.error('Failed to copy invite link:', err));
});

// ==== Init on Load ====

window.addEventListener('load', async () => {
  await startLocalStream();

  if (!roomId) {
    console.error('No roomId defined on window!');
    return;
  }

  console.log('Connecting to room:', roomId);
  socket.emit('join-room', roomId);
});

// ==== Button Listeners ====

micBtn.addEventListener('click', toggleMic);
camBtn.addEventListener('click', toggleCam);
leaveBtn.addEventListener('click', leaveCall);
