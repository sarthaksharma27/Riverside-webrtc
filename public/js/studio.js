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

inviteBtn.addEventListener('click', async () => {
  try {
    const res = await fetch('/generatetoken', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ roomId })
    });

    if (!res.ok) throw new Error("Failed to generate invite token");

    const data = await res.json();
    const inviteLink = `${window.location.origin}/studio/${roomId}?guestToken=${data.token}`;

    await navigator.clipboard.writeText(inviteLink);
    alert(`Invite link copied to clipboard:\n${inviteLink}`);
  } catch (err) {
    console.error('Failed to copy invite link:', err);
    alert("Something went wrong while generating invite link.");
  }
});

const recordBtn = document.getElementById('record-btn');
const recordBtnText = recordBtn.querySelector('.control-button-text');
const recordingSection = document.getElementById('recording-section');
let isHostRecording = false;

recordBtn.addEventListener('click', async () => {
  if (isHostRecording) {
    stopLocalRecording(); 
  } else {
    socket.emit("start-recording-request", roomId);
  }
});

const countdownOverlay = document.getElementById('countdownOverlay');
const countdownNumber = document.getElementById('countdownNumber');
const recordingText = document.getElementById('recordingText');

function startCountdown(duration, callback) {
  countdownOverlay.classList.add('show');
  let count = duration;
  countdownNumber.textContent = count;
  countdownNumber.classList.add('countdown-pulse');

  const countdownInterval = setInterval(() => {
    count--;

    if (count >= 0) {
      countdownNumber.classList.remove('countdown-pulse');
      void countdownNumber.offsetWidth; // reflow
      countdownNumber.textContent = count;
      countdownNumber.classList.add('countdown-pulse');
    }

    if (count === 0) {
      clearInterval(countdownInterval);

      setTimeout(() => {
        countdownNumber.style.opacity = '0';
        recordingText.style.opacity = '1';

        // Delay a bit before calling actual recording function
        setTimeout(() => {
          countdownOverlay.classList.remove('show');
          // Reset state
          setTimeout(() => {
            countdownNumber.style.opacity = '1';
            recordingText.style.opacity = '0';
            countdownNumber.textContent = duration;
          }, 500);

          if (typeof callback === 'function') callback();
        }, 1000);
      }, 1000);
    }
  }, 1000);
}

// Socket flow integration
socket.on("start-recording", ({ startTime }) => {
  const delay = startTime - Date.now();

  if (delay > 0) {
    startCountdown(5, () => {
      startLocalRecording(); 
    });

    setTimeout(() => {
      startLocalRecording();
    }, delay);
  } else {
    startLocalRecording();
  }
});

let mediaRecorder;
let isUploading = false;
let chunkIndex = 0;
let recordingTimer = null;

const CHUNK_DURATION_MS = 7000;
const RESTART_DELAY_MS = 300;

function startLocalRecording() {
  recordBtnText.textContent = 'Stop';
  isHostRecording = true;

  if (isHostRecording) {
    recordingSection.style.display = 'block';
  }

  startNewRecorder();
}

function startNewRecorder() {
  const options = {
    mimeType: 'video/webm;codecs=vp9,opus',
    audioBitsPerSecond: 128000,
    videoBitsPerSecond: 4000000,
  };

  mediaRecorder = new MediaRecorder(localStream, options);
  const chunkStartTime = Date.now();

  mediaRecorder.ondataavailable = function (event) {
    if (event.data.size > 0) {
      chunkIndex++;
      const chunkBlob = event.data;
      const duration = Date.now() - chunkStartTime;
      console.log(`Chunk ${chunkIndex} duration: ${duration} ms`);

      const uploadingStatus = document.getElementById("uploadingStatus");
      const uploadingText = document.getElementById("uploadingText");
      uploadingStatus.style.display = "block";
      uploadingText.textContent = `Uploading chunk ${chunkIndex}…`;

      const formData = new FormData();
      formData.append("file", chunkBlob, `chunk-${chunkIndex}.webm`);
      formData.append("roomId", roomId);
      formData.append("userType", isInitiator ? "host" : "guest");

      isUploading = true;

      fetch("/upload-chunk", {
        method: "POST",
        body: formData,
      }).then(() => {
        isUploading = false;
      }).catch((err) => {
        console.error("Upload failed", err);
      });
    }
  };

  mediaRecorder.onstop = () => {
    if (isHostRecording) {
      // Slight delay to ensure stream is settled before restarting
      setTimeout(() => {
        startNewRecorder();
      }, RESTART_DELAY_MS);
    }
  };

  mediaRecorder.start();
  console.log(`Started chunk ${chunkIndex + 1}`);

  // Stop this chunk after CHUNK_DURATION_MS
  recordingTimer = setTimeout(() => {
    if (mediaRecorder && mediaRecorder.state === "recording") {
      mediaRecorder.stop();
    }
  }, CHUNK_DURATION_MS);
}

function stopLocalRecording() {
  isHostRecording = false;
  recordBtnText.textContent = 'Record';
  socket.emit("recording-stopped", roomId);
  alert("Recording has been stopped!");

  // Prevent next chunk timer
  clearTimeout(recordingTimer);

  // Finalize current recording
  if (mediaRecorder && mediaRecorder.state !== "inactive") {
    mediaRecorder.stop();
  }

  // Stop all local media tracks
  if (localStream) {
    localStream.getTracks().forEach(track => track.stop());
  }

  // Wait for final upload
  const uploadingStatus = document.getElementById("uploadingStatus");
  const uploadingText = document.getElementById("uploadingText");

  uploadingStatus.style.display = "block";
  uploadingText.textContent = "Finalizing upload…";

  const checkUploadComplete = setInterval(() => {
    if (!isUploading) {
      clearInterval(checkUploadComplete);
      uploadingStatus.style.display = "none";
      console.log("All uploads completed.");
    }
  }, 500);
}

socket.on("stop-rec", () => {
  recordingSection.style.display = 'none';
  stopLocalRecording();
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
