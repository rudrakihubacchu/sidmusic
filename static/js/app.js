/* =========================================================================
   1. AUTOMATIC COUPLE BACKGROUND SLIDESHOW (PINTEREST / ROMANTIC AESTHETIC)
   ========================================================================= */
const coupleWallpapers = [
  "https://images.unsplash.com/photo-1518199266791-5375a83190b7?w=1600&auto=format&fit=crop&q=80",
  "https://images.unsplash.com/photo-1516589178581-6cd7833ae3b2?w=1600&auto=format&fit=crop&q=80",
  "https://images.unsplash.com/photo-1522673607200-164d1b6ce486?w=1600&auto=format&fit=crop&q=80",
  "https://images.unsplash.com/photo-1494774157365-9e04c6720e47?w=1600&auto=format&fit=crop&q=80",
  "https://images.unsplash.com/photo-1511285560929-80b456fea0bc?w=1600&auto=format&fit=crop&q=80"
];
let bgIndex = 0;
let activeLayer = 1;
let bgTimer = null;

function applyBackground(url) {
  const layer1 = document.getElementById("bgLayer1");
  const layer2 = document.getElementById("bgLayer2");
  if (activeLayer === 1) {
    layer2.style.backgroundImage = `url('${url}')`;
    layer2.classList.add("active");
    layer1.classList.remove("active");
    activeLayer = 2;
  } else {
    layer1.style.backgroundImage = `url('${url}')`;
    layer1.classList.add("active");
    layer2.classList.remove("active");
    activeLayer = 1;
  }
}

function startBgSlideshow(intervalSec = 8) {
  if (bgTimer) clearInterval(bgTimer);
  document.getElementById("bgLayer1").style.backgroundImage = `url('${coupleWallpapers[0]}')`;
  bgTimer = setInterval(() => {
    bgIndex = (bgIndex + 1) % coupleWallpapers.length;
    applyBackground(coupleWallpapers[bgIndex]);
  }, intervalSec * 1000);
}

function addCustomBackground(sync = true) {
  const url = document.getElementById("newBgInput").value.trim();
  if (!url) return;
  coupleWallpapers.unshift(url);
  bgIndex = 0;
  applyBackground(url);
  document.getElementById("newBgInput").value = "";
  if (sync) broadcastSyncState("WALLPAPER", { url });
}

function updateBgSpeed(sec) {
  startBgSlideshow(Math.max(4, Number(sec) || 8));
}

/* =========================================================================
   2. BUILT-IN FREE SONGS + REAL-TIME AUDIO & FX ENGINE
   ========================================================================= */
const songs = [
  {
    id: 1,
    title: "Sakura Midnight Promise",
    artist: "VelvetSync Originals",
    cover: "https://images.unsplash.com/photo-1522383225653-ed111181a951?w=600&auto=format&fit=crop&q=80",
    couple: true,
    liked: true,
    tempo: 88,
    lyric: "🌸 Under the falling cherry blossoms, every heartbeat stays in sync with yours...",
    notes: [261.63, 329.63, 392.00, 523.25, 392.00, 329.63],
    audioUrl: null
  },
  {
    id: 2,
    title: "Two Hearts Under Neon",
    artist: "Toxic x Akshu Sessions",
    cover: "https://images.unsplash.com/photo-1518199266791-5375a83190b7?w=600&auto=format&fit=crop&q=80",
    couple: true,
    liked: true,
    tempo: 96,
    lyric: "💞 Distance means nothing when the same melody plays in both our ears tonight...",
    notes: [293.66, 369.99, 440.00, 587.33, 440.00, 369.99],
    audioUrl: null
  },
  {
    id: 3,
    title: "Velvet Rain & Coffee",
    artist: "Lo-Fi Couple Collective",
    cover: "https://images.unsplash.com/photo-1516589178581-6cd7833ae3b2?w=600&auto=format&fit=crop&q=80",
    couple: true,
    liked: false,
    tempo: 78,
    lyric: "☕ Warm coffee, rain on the windowpane, and your hand in mine...",
    notes: [220.00, 261.63, 329.63, 440.00, 329.63, 261.63],
    audioUrl: null
  },
  {
    id: 4,
    title: "Golden Hour Silhouette",
    artist: "Sunset Dreamers",
    cover: "https://images.unsplash.com/photo-1494774157365-9e04c6720e47?w=600&auto=format&fit=crop&q=80",
    couple: true,
    liked: false,
    tempo: 92,
    lyric: "✨ Chasing sunsets together where the sky turns gold and crimson...",
    notes: [349.23, 440.00, 523.25, 698.46, 523.25, 440.00],
    audioUrl: null
  },
  {
    id: 5,
    title: "Starlight Highway (Trio Mix)",
    artist: "Night Drive Crew",
    cover: "https://images.unsplash.com/photo-1511671782779-c97d3d27a1d4?w=600&auto=format&fit=crop&q=80",
    couple: false,
    liked: false,
    tempo: 112,
    lyric: "🥂 Windows down, city lights blurring past on the midnight highway...",
    notes: [329.63, 392.00, 493.88, 659.25, 493.88, 392.00],
    audioUrl: null
  },
  {
    id: 6,
    title: "Cherry Blossom Breeze",
    artist: "Kyoto Acoustic Duo",
    cover: "https://images.unsplash.com/photo-1493976040374-85c8e12f0c0e?w=600&auto=format&fit=crop&q=80",
    couple: true,
    liked: true,
    tempo: 84,
    lyric: "🌸 Soft acoustic whispers carried across the spring breeze for two...",
    notes: [246.94, 311.13, 369.99, 493.88, 369.99, 311.13],
    audioUrl: null
  }
];

let currentIndex = 0;
let isPlaying = false;
let isLooping = false;
let currentProgress = 0;
let progressInterval = null;
let masterVolume = 0.8;

// Audio FX State
let pitchMultiplier = 1.0;
let tempoMultiplier = 1.0;
let is8DEnabled = false;
let pannerInterval = null;
let rainNode = null;
let sleepTimeout = null;

// Web Audio API Context
let audioCtx = null;
let analyser = null;
let gainNode = null;
let filterNode = null;
let pannerNode = null;
let synthInterval = null;
let htmlAudio = new Audio();
htmlAudio.crossOrigin = "anonymous";

function initAudioEngine() {
  if (audioCtx) return;
  const AudioContext = window.AudioContext || window.webkitAudioContext;
  audioCtx = new AudioContext();
  analyser = audioCtx.createAnalyser();
  analyser.fftSize = 128;

  filterNode = audioCtx.createBiquadFilter();
  filterNode.type = "lowpass";
  filterNode.frequency.value = 18000;

  pannerNode = audioCtx.createStereoPanner();
  gainNode = audioCtx.createGain();
  gainNode.gain.value = masterVolume;

  filterNode.connect(pannerNode);
  pannerNode.connect(gainNode);
  gainNode.connect(analyser);
  analyser.connect(audioCtx.destination);

  drawFrequencyVisualizer();
}

function playSong(index, broadcast = true) {
  initAudioEngine();
  if (audioCtx.state === "suspended") audioCtx.resume();

  currentIndex = index;
  const track = songs[currentIndex];
  isPlaying = true;
  currentProgress = 0;

  // Update Player & Spinning Vinyl UI
  document.getElementById("playerArt").src = track.cover;
  document.getElementById("vinylArt").src = track.cover;
  document.getElementById("vinylDisc").classList.add("spinning");
  document.getElementById("playerTitle").textContent = track.title;
  document.getElementById("playerArtist").textContent = track.artist;
  document.getElementById("playPauseBtn").textContent = "⏸";
  document.getElementById("favBtn").classList.toggle("active", !!track.liked);
  document.getElementById("lyricTicker").textContent = track.lyric || `♫ Now Playing: ${track.title} — ${track.artist}`;

  stopAudioPlayback();

  if (track.audioUrl) {
    htmlAudio.src = track.audioUrl;
    htmlAudio.loop = isLooping;
    htmlAudio.volume = masterVolume;
    htmlAudio.playbackRate = tempoMultiplier;
    htmlAudio.play();
  } else {
    startPolyphonicTrack(track);
  }

  startProgressCounter();
  renderSongs();

  if (broadcast) broadcastSyncState("PLAY", { index: currentIndex, progress: 0 });
}

function startPolyphonicTrack(track) {
  let step = 0;
  const effectiveTempo = track.tempo * tempoMultiplier;
  const beatMs = (60 / effectiveTempo) * 500;

  synthInterval = setInterval(() => {
    if (!isPlaying) return;
    const freq = track.notes[step % track.notes.length] * pitchMultiplier;

    const osc = audioCtx.createOscillator();
    const noteGain = audioCtx.createGain();
    osc.type = "triangle";
    osc.frequency.setValueAtTime(freq, audioCtx.currentTime);

    if (step % 2 === 0) {
      const subOsc = audioCtx.createOscillator();
      const subGain = audioCtx.createGain();
      subOsc.type = "sine";
      subOsc.frequency.setValueAtTime(freq / 2, audioCtx.currentTime);
      subGain.gain.setValueAtTime(0.18, audioCtx.currentTime);
      subGain.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + 0.85);
      subOsc.connect(subGain);
      subGain.connect(filterNode);
      subOsc.start();
      subOsc.stop(audioCtx.currentTime + 0.85);
    }

    noteGain.gain.setValueAtTime(0.24, audioCtx.currentTime);
    noteGain.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + 0.7);

    osc.connect(noteGain);
    noteGain.connect(filterNode);
    osc.start();
    osc.stop(audioCtx.currentTime + 0.7);

    step++;
  }, beatMs);
}

function stopAudioPlayback() {
  if (synthInterval) clearInterval(synthInterval);
  htmlAudio.pause();
}

function togglePlay(broadcast = true) {
  initAudioEngine();
  if (!isPlaying) {
    playSong(currentIndex, false);
  } else {
    isPlaying = false;
    stopAudioPlayback();
    if (progressInterval) clearInterval(progressInterval);
    document.getElementById("playPauseBtn").textContent = "▶";
    document.getElementById("vinylDisc").classList.remove("spinning");
    renderSongs();
  }
  if (broadcast) broadcastSyncState(isPlaying ? "PLAY" : "PAUSE", { index: currentIndex, progress: currentProgress });
}

function prevSong() {
  const nextIdx = (currentIndex - 1 + songs.length) % songs.length;
  playSong(nextIdx);
}

function nextSong() {
  const nextIdx = (currentIndex + 1) % songs.length;
  playSong(nextIdx);
}

function toggleLoop() {
  isLooping = !isLooping;
  htmlAudio.loop = isLooping;
  document.getElementById("loopBtn").classList.toggle("active", isLooping);
}

function setVolume(val) {
  masterVolume = parseFloat(val);
  if (gainNode) gainNode.gain.value = masterVolume;
  htmlAudio.volume = masterVolume;
}

function startProgressCounter() {
  if (progressInterval) clearInterval(progressInterval);
  progressInterval = setInterval(() => {
    if (!isPlaying) return;
    currentProgress += 1;
    if (currentProgress >= 100) {
      if (isLooping) {
        currentProgress = 0;
      } else {
        nextSong();
        return;
      }
    }
    document.getElementById("seekBar").value = currentProgress;
    const totalSec = Math.floor((currentProgress / 100) * 150);
    const mins = Math.floor(totalSec / 60);
    const secs = String(totalSec % 60).padStart(2, "0");
    document.getElementById("curTime").textContent = `${mins}:${secs}`;
  }, 1500);
}

function seekSong(val) {
  currentProgress = Number(val);
  broadcastSyncState("SEEK", { index: currentIndex, progress: currentProgress });
}

/* =========================================================================
   3. NEW: SLOWED + REVERB, NIGHTCORE, 8D SURROUND & RAIN AMBIENCE
   ========================================================================= */
let activeVibe = "normal";

function setAudioVibe(vibe) {
  initAudioEngine();
  const slowedBtn = document.getElementById("slowedBtn");
  const nightcoreBtn = document.getElementById("nightcoreBtn");

  if (activeVibe === vibe) {
    activeVibe = "normal";
    pitchMultiplier = 1.0;
    tempoMultiplier = 1.0;
    filterNode.frequency.value = 18000;
    slowedBtn.classList.remove("active");
    nightcoreBtn.classList.remove("active");
  } else if (vibe === "slowed") {
    activeVibe = "slowed";
    pitchMultiplier = 0.82;
    tempoMultiplier = 0.82;
    filterNode.frequency.value = 1600; // Warm dreamy low-pass filter
    slowedBtn.classList.add("active");
    nightcoreBtn.classList.remove("active");
  } else if (vibe === "nightcore") {
    activeVibe = "nightcore";
    pitchMultiplier = 1.25;
    tempoMultiplier = 1.25;
    filterNode.frequency.value = 18000;
    nightcoreBtn.classList.add("active");
    slowedBtn.classList.remove("active");
  }

  if (isPlaying) playSong(currentIndex, false);
}

function toggle8DAudio() {
  initAudioEngine();
  is8DEnabled = !is8DEnabled;
  document.getElementById("surroundBtn").classList.toggle("active", is8DEnabled);
  document.getElementById("status8D").textContent = is8DEnabled ? "ON" : "Off";

  if (pannerInterval) clearInterval(pannerInterval);
  if (is8DEnabled) {
    let angle = 0;
    pannerInterval = setInterval(() => {
      angle += 0.08;
      if (pannerNode) pannerNode.pan.setValueAtTime(Math.sin(angle), audioCtx.currentTime);
    }, 60);
  } else if (pannerNode) {
    pannerNode.pan.setValueAtTime(0, audioCtx.currentTime);
  }
}

function toggleRainAmbience() {
  initAudioEngine();
  const btn = document.getElementById("rainBtn");
  const label = document.getElementById("statusRain");

  if (rainNode) {
    rainNode.stop();
    rainNode.disconnect();
    rainNode = null;
    btn.classList.remove("active");
    label.textContent = "Off";
    return;
  }

  // Synthesize cozy pink-noise rain
  const bufferSize = audioCtx.sampleRate * 2;
  const noiseBuffer = audioCtx.createBuffer(1, bufferSize, audioCtx.sampleRate);
  const output = noiseBuffer.getChannelData(0);
  for (let i = 0; i < bufferSize; i++) {
    output[i] = (Math.random() * 2 - 1) * 0.035;
  }

  rainNode = audioCtx.createBufferSource();
  rainNode.buffer = noiseBuffer;
  rainNode.loop = true;

  const rainFilter = audioCtx.createBiquadFilter();
  rainFilter.type = "lowpass";
  rainFilter.frequency.value = 950;

  rainNode.connect(rainFilter);
  rainFilter.connect(gainNode);
  rainNode.start();

  btn.classList.add("active");
  label.textContent = "ON";
}

function setSleepTimer(minutes) {
  if (sleepTimeout) clearTimeout(sleepTimeout);
  const mins = Number(minutes);
  if (mins > 0) {
    sleepTimeout = setTimeout(() => {
      if (isPlaying) togglePlay();
      alert("🌙 Sleep Timer finished. Sweet dreams!");
    }, mins * 60 * 1000);
  }
}

/* =========================================================================
   4. DOWNLOAD SONG GENERATOR (REAL WAV AUDIO EXPORT)
   ========================================================================= */
function downloadCurrentSong() {
  const track = songs[currentIndex];
  if (track.audioUrl) {
    const a = document.createElement("a");
    a.href = track.audioUrl;
    a.download = `${track.title}.mp3`;
    a.click();
    return;
  }

  const sampleRate = 44100;
  const durationSeconds = 8;
  const numSamples = sampleRate * durationSeconds;
  const buffer = new ArrayBuffer(44 + numSamples * 2);
  const view = new DataView(buffer);

  const writeStr = (offset, str) => {
    for (let i = 0; i < str.length; i++) view.setUint8(offset + i, str.charCodeAt(i));
  };

  writeStr(0, "RIFF");
  view.setUint32(4, 36 + numSamples * 2, true);
  writeStr(8, "WAVE");
  writeStr(12, "fmt ");
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, 1, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * 2, true);
  view.setUint16(32, 2, true);
  view.setUint16(34, 16, true);
  writeStr(36, "data");
  view.setUint32(40, numSamples * 2, true);

  for (let i = 0; i < numSamples; i++) {
    const t = i / sampleRate;
    const noteIdx = Math.floor(t * 2) % track.notes.length;
    const freq = track.notes[noteIdx] * pitchMultiplier;
    const env = Math.exp(-3 * ((t * 2) % 1));
    const sample = Math.sin(2 * Math.PI * freq * t) * env * 0.4;
    view.setInt16(44 + i * 2, sample * 32767, true);
  }

  const blob = new Blob([buffer], { type: "audio/wav" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `${track.title.replace(/\s+/g, "_")}_VelvetSync.wav`;
  a.click();
  URL.revokeObjectURL(url);
}

/* =========================================================================
   5. REAL-TIME DUO & TRIO LINK SYNCHRONIZATION (RAILWAY SOCKET.IO + LOCAL)
   ========================================================================= */
const socket = typeof io !== "undefined" ? io() : null;
const localChannel = new BroadcastChannel("velvetsync_realtime_room");
let activeRoomId = null;

function createSyncRoom(mode) {
  const code = `${mode.toUpperCase()}-${Math.random().toString(36).substring(2, 7).toUpperCase()}`;
  activeRoomId = code;
  const shareUrl = `${window.location.origin}${window.location.pathname}?room=${code}&mode=${mode}`;

  if (mode === "duo") {
    document.getElementById("duoLinkInput").value = shareUrl;
  } else {
    document.getElementById("trioLinkInput").value = shareUrl;
  }

  activateRoomExperience(code, mode);
}

function activateRoomExperience(roomCode, mode) {
  activeRoomId = roomCode;
  const username = document.getElementById("myNickname")?.value || "Toxic";
  document.getElementById("syncStatusText").textContent = `${mode.toUpperCase()} Live Room: ${roomCode}`;

  if (socket) {
    socket.emit("join_sync_room", { room: roomCode, mode, username });
  }
  toggleVideoBackground(true);
}

function copyRoomLink(inputId) {
  const input = document.getElementById(inputId);
  if (!input.value) return;
  input.select();
  navigator.clipboard.writeText(input.value);
  alert("Invite Link Copied! Send it to your partner to start synchronized playback.");
}

function broadcastSyncState(action, payload) {
  if (!activeRoomId) return;
  const packet = { room: activeRoomId, action, payload };
  if (socket) socket.emit("sync_action", packet);
  localChannel.postMessage(packet);
}

function handleIncomingSync(data) {
  const { room, action, payload } = data;
  if (room !== activeRoomId) return;

  if (action === "PLAY") {
    playSong(payload.index, false);
  } else if (action === "PAUSE") {
    if (isPlaying) togglePlay(false);
  } else if (action === "SEEK") {
    currentProgress = payload.progress;
    document.getElementById("seekBar").value = currentProgress;
  } else if (action === "WALLPAPER") {
    coupleWallpapers.unshift(payload.url);
    applyBackground(payload.url);
  } else if (action === "THEME") {
    setTheme(payload.theme, false);
  } else if (action === "VIDEO_URL") {
    changeCoupleVideo(payload.url, false);
  }
}

if (socket) {
  socket.on("room_joined", (data) => {
    document.getElementById("syncStatusText").textContent = `💞 Synced (${data.room}) • ${data.members.join(" & ")}`;
    toggleVideoBackground(true);
    playSong(currentIndex, true);
  });

  socket.on("sync_update", handleIncomingSync);

  socket.on("receive_chat", (data) => {
    appendChatMessage(data.user, data.text);
  });

  socket.on("receive_reaction", (data) => {
    spawnEmojiBurst(data.emoji);
  });
}

localChannel.onmessage = (e) => handleIncomingSync(e.data);

function toggleVideoBackground(enable) {
  const vid = document.getElementById("coupleVideoBg");
  if (enable) {
    vid.classList.add("active");
    vid.play().catch(() => {});
  } else {
    vid.classList.remove("active");
    vid.pause();
  }
}

function changeCoupleVideo(url, sync = true) {
  if (!url) return;
  const vid = document.getElementById("coupleVideoBg");
  vid.src = url;
  toggleVideoBackground(true);
  if (sync) broadcastSyncState("VIDEO_URL", { url });
}

/* =========================================================================
   6. LIVE COUPLE CHAT & FLOATING REACTION BURSTS
   ========================================================================= */
function sendChatMessage() {
  const input = document.getElementById("chatInput");
  const text = input.value.trim();
  if (!text) return;
  const user = document.getElementById("myNickname")?.value || "Toxic";

  if (socket && activeRoomId) {
    socket.emit("send_chat", { room: activeRoomId, user, text });
  } else {
    appendChatMessage(user, text);
  }
  input.value = "";
}

function appendChatMessage(user, text) {
  const box = document.getElementById("chatMessages");
  const div = document.createElement("div");
  div.className = "chat-msg";
  div.innerHTML = `<strong>${user}:</strong> ${text}`;
  box.appendChild(div);
  box.scrollTop = box.scrollHeight;
}

function sendLiveReaction(emoji) {
  if (socket && activeRoomId) {
    socket.emit("send_reaction", { room: activeRoomId, emoji });
  } else {
    spawnEmojiBurst(emoji);
  }
}

function spawnEmojiBurst(emoji) {
  for (let i = 0; i < 7; i++) {
    const p = document.createElement("div");
    p.className = "heart-particle";
    p.textContent = emoji;
    p.style.left = `${20 + Math.random() * 60}vw`;
    p.style.top = `${65 + Math.random() * 20}vh`;
    document.body.appendChild(p);
    setTimeout(() => p.remove(), 1400);
  }
}

/* =========================================================================
   7. FALLING SAKURA CHERRY BLOSSOM PETALS CANVAS
   ========================================================================= */
const sakuraCanvas = document.getElementById("sakuraCanvas");
const sCtx = sakuraCanvas.getContext("2d");
let sakuraActive = true;
let petals = [];

function resizeSakura() {
  sakuraCanvas.width = window.innerWidth;
  sakuraCanvas.height = window.innerHeight;
}
window.addEventListener("resize", resizeSakura);
resizeSakura();

for (let i = 0; i < 48; i++) {
  petals.push({
    x: Math.random() * window.innerWidth,
    y: Math.random() * window.innerHeight,
    r: 5 + Math.random() * 7,
    speedY: 0.7 + Math.random() * 1.4,
    speedX: -0.5 + Math.random() * 1.5,
    angle: Math.random() * Math.PI * 2,
    spin: (Math.random() - 0.5) * 0.03
  });
}

function animateSakura() {
  sCtx.clearRect(0, 0, sakuraCanvas.width, sakuraCanvas.height);
  if (sakuraActive) {
    petals.forEach((p) => {
      p.y += p.speedY;
      p.x += p.speedX + Math.sin(p.angle) * 0.4;
      p.angle += p.spin;

      if (p.y > sakuraCanvas.height) {
        p.y = -15;
        p.x = Math.random() * sakuraCanvas.width;
      }

      sCtx.save();
      sCtx.translate(p.x, p.y);
      sCtx.rotate(p.angle);
      sCtx.beginPath();
      sCtx.moveTo(0, 0);
      sCtx.bezierCurveTo(-p.r, -p.r, -p.r * 1.4, p.r / 2, 0, p.r);
      sCtx.bezierCurveTo(p.r * 1.4, p.r / 2, p.r, -p.r, 0, 0);
      sCtx.fillStyle = "rgba(255, 183, 213, 0.78)";
      sCtx.fill();
      sCtx.restore();
    });
  }
  requestAnimationFrame(animateSakura);
}

function toggleSakura() {
  sakuraActive = !sakuraActive;
  sakuraCanvas.classList.toggle("active", sakuraActive);
  document.getElementById("sakuraStatus").textContent = sakuraActive ? "Sakura: ON" : "Sakura: OFF";
}

/* =========================================================================
   8. REAL-TIME FREQUENCY VISUALIZER & UI RENDERING
   ========================================================================= */
function drawFrequencyVisualizer() {
  const canvas = document.getElementById("freqCanvas");
  const ctx = canvas.getContext("2d");
  const bufferLength = analyser.frequencyBinCount;
  const dataArray = new Uint8Array(bufferLength);

  function renderFrame() {
    requestAnimationFrame(renderFrame);
    analyser.getByteFrequencyData(dataArray);
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    const barWidth = (canvas.width / 24) - 2;
    let x = 2;
    for (let i = 0; i < 24; i++) {
      const barHeight = Math.max(4, (dataArray[i] / 255) * canvas.height);
      ctx.fillStyle = "#ff4d8d";
      ctx.fillRect(x, canvas.height - barHeight, barWidth, barHeight);
      x += barWidth + 2;
    }
  }
  renderFrame();
}

function renderSongs() {
  const query = document.getElementById("searchInput").value.toLowerCase();
  const discoverGrid = document.getElementById("discoverGrid");
  const coupleGrid = document.getElementById("coupleGrid");
  const favGrid = document.getElementById("favGrid");

  const createCardHTML = (song, idx) => {
    const activeClass = idx === currentIndex && isPlaying ? "playing" : "";
    const heartColor = song.liked ? "var(--primary)" : "var(--text-muted)";
    return `
      <div class="song-card ${activeClass}" onclick="playSong(${idx})">
        <div class="art-wrapper">
          <img src="${song.cover}" alt="${song.title}" />
          <div class="card-visualizer">
            <div class="bar"></div>
            <div class="bar"></div>
            <div class="bar"></div>
            <div class="bar"></div>
          </div>
        </div>
        <div class="song-title">
          <span>${song.title}</span>
          <span style="color:${heartColor};" onclick="toggleCardLike(event, ${idx})">♥</span>
        </div>
        <div class="song-artist">${song.artist}</div>
      </div>
    `;
  };

  discoverGrid.innerHTML = songs
    .map((s, idx) => ({ s, idx }))
    .filter(({ s }) => s.title.toLowerCase().includes(query) || s.artist.toLowerCase().includes(query))
    .map(({ s, idx }) => createCardHTML(s, idx))
    .join("");

  coupleGrid.innerHTML = songs
    .map((s, idx) => ({ s, idx }))
    .filter(({ s }) => s.couple)
    .map(({ s, idx }) => createCardHTML(s, idx))
    .join("");

  if (favGrid) {
    favGrid.innerHTML = songs
      .map((s, idx) => ({ s, idx }))
      .filter(({ s }) => s.liked)
      .map(({ s, idx }) => createCardHTML(s, idx))
      .join("");
  }
}

function toggleCardLike(e, idx) {
  e.stopPropagation();
  songs[idx].liked = !songs[idx].liked;
  triggerFavHeart(e);
  renderSongs();
}

function addNewSong() {
  const title = document.getElementById("customTitle").value.trim() || "Untitled Romantic Track";
  const artist = document.getElementById("customArtist").value.trim() || "Toxic & Akshu";
  const directUrl = document.getElementById("customAudioUrl").value.trim();
  const fileInput = document.getElementById("customAudioFile");

  let audioUrl = directUrl || null;
  if (!audioUrl && fileInput.files && fileInput.files[0]) {
    audioUrl = URL.createObjectURL(fileInput.files[0]);
  }

  songs.unshift({
    id: Date.now(),
    title,
    artist,
    cover: coupleWallpapers[bgIndex % coupleWallpapers.length],
    couple: true,
    liked: true,
    tempo: 90,
    lyric: `💖 Custom Dedication: ${title} by ${artist}`,
    notes: [261.63, 329.63, 392.00, 523.25],
    audioUrl
  });

  renderSongs();
  toggleWindow("addSongWin");
  playSong(0);
}

function switchSection(sectionId, btn) {
  document.querySelectorAll(".view-section").forEach((s) => s.classList.remove("active"));
  document.getElementById(`sec-${sectionId}`).classList.add("active");
  document.querySelectorAll(".nav-btn").forEach((b) => b.classList.remove("active"));
  if (btn) btn.classList.add("active");

  if (sectionId === "couple") {
    sakuraActive = true;
    sakuraCanvas.classList.add("active");
  }
  if (sectionId === "duo" || sectionId === "trio") {
    toggleVideoBackground(true);
  } else {
    toggleVideoBackground(false);
  }
}

function playCouplePlaylist() {
  const firstCoupleIndex = songs.findIndex((s) => s.couple);
  if (firstCoupleIndex !== -1) playSong(firstCoupleIndex);
}

function toggleWindow(winId) {
  const win = document.getElementById(winId);
  win.classList.toggle("open");
}

function setTheme(themeName, sync = false) {
  if (themeName === "default") {
    document.documentElement.removeAttribute("data-theme");
  } else {
    document.documentElement.setAttribute("data-theme", themeName);
  }
  if (sync) broadcastSyncState("THEME", { theme: themeName });
}

function triggerFavHeart(e) {
  songs[currentIndex].liked = !songs[currentIndex].liked;
  const btn = document.getElementById("favBtn");
  btn.classList.toggle("active", songs[currentIndex].liked);
  renderSongs();

  for (let i = 0; i < 6; i++) {
    const heart = document.createElement("div");
    heart.className = "heart-particle";
    heart.textContent = ["💖", "🌸", "💞", "✨"][i % 4];
    heart.style.left = `${e.clientX + (Math.random() * 40 - 20)}px`;
    heart.style.top = `${e.clientY - 10}px`;
    document.body.appendChild(heart);
    setTimeout(() => heart.remove(), 1200);
  }
}

// Initialize App on Load
window.addEventListener("DOMContentLoaded", () => {
  startBgSlideshow(8);
  renderSongs();
  sakuraCanvas.classList.add("active");
  animateSakura();

  // Auto-join if opening a shared Duo or Trio Link
  const params = new URLSearchParams(window.location.search);
  const room = params.get("room");
  const mode = params.get("mode") || "duo";
  if (room) {
    const nicknameInput = document.getElementById("myNickname");
    if (nicknameInput) nicknameInput.value = "Akshu";
    switchSection(mode, document.querySelectorAll(".nav-btn")[mode === "duo" ? 1 : 2]);
    activateRoomExperience(room, mode);
  }
});
