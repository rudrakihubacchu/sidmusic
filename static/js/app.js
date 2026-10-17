/* =========================================================================
   1. OPTIONAL USER AUTHENTICATION (TOP-CORNER BUTTON -> MODAL)
   ========================================================================= */
let currentUser = null;

function openAuthModal(defaultTab = "login") {
  document.getElementById("authOverlay").classList.remove("hidden");
  switchAuthTab(defaultTab);
}

function closeAuthModal() {
  document.getElementById("authOverlay").classList.add("hidden");
}

function switchAuthTab(mode) {
  const loginForm = document.getElementById("loginForm");
  const regForm = document.getElementById("registerForm");
  document.getElementById("authError").textContent = "";

  if (mode === "login") {
    loginForm.style.display = "block";
    regForm.style.display = "none";
    document.getElementById("tabLoginBtn").classList.add("active");
    document.getElementById("tabRegisterBtn").classList.remove("active");
  } else {
    loginForm.style.display = "none";
    regForm.style.display = "block";
    document.getElementById("tabRegisterBtn").classList.add("active");
    document.getElementById("tabLoginBtn").classList.remove("active");
  }
}

async function checkLoggedInUser() {
  try {
    const res = await fetch("/api/me");
    const data = await res.json();
    if (data.user) {
      applyAuthenticatedUser(data.user);
    } else {
      renderRoomMembers([
        {
          name: "Guest Listener",
          avatar: "https://api.dicebear.com/9.x/adventurer/svg?seed=Guest"
        }
      ]);
    }
  } catch (e) {
    console.error("Session check error:", e);
  }
}

async function handleLogin(e) {
  e.preventDefault();
  const email = document.getElementById("loginEmail").value.trim();
  const password = document.getElementById("loginPassword").value;

  const res = await fetch("/api/login", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password })
  });
  const data = await res.json();
  if (!res.ok) {
    document.getElementById("authError").textContent = data.error || "Login failed.";
    return;
  }
  applyAuthenticatedUser(data.user);
}

async function handleRegister(e) {
  e.preventDefault();
  const name = document.getElementById("regName").value.trim();
  const email = document.getElementById("regEmail").value.trim();
  const password = document.getElementById("regPassword").value;
  const avatar = document.getElementById("regAvatar").value.trim();

  const res = await fetch("/api/register", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name, email, password, avatar })
  });
  const data = await res.json();
  if (!res.ok) {
    document.getElementById("authError").textContent = data.error || "Registration failed.";
    return;
  }
  applyAuthenticatedUser(data.user);
}

async function handleLogout() {
  await fetch("/api/logout", { method: "POST" });
  currentUser = null;
  document.getElementById("userProfilePill").style.display = "none";
  document.getElementById("guestAuthBtn").style.display = "inline-block";
}

function applyAuthenticatedUser(user) {
  currentUser = user;
  closeAuthModal();
  document.getElementById("guestAuthBtn").style.display = "none";
  document.getElementById("userProfilePill").style.display = "flex";
  document.getElementById("headerUserName").textContent = user.name;
  document.getElementById("headerUserAvatar").src = user.avatar;

  renderRoomMembers([user]);

  if (activeRoomId && socket) {
    socket.emit("join_sync_room", { room: activeRoomId, mode: "duo", user });
  }
}

function renderRoomMembers(members) {
  const duoRow = document.getElementById("duoMembersRow");
  const trioRow = document.getElementById("trioMembersRow");

  const memberHTML = members
    .map(
      (m) => `
      <div class="avatar-circle">
        <img src="${m.avatar}" alt="${m.name}" />
        <span>${m.name}</span>
      </div>
    `
    )
    .join('<div class="sync-pulse-icon">💞</div>');

  if (duoRow) duoRow.innerHTML = memberHTML;
  if (trioRow) trioRow.innerHTML = memberHTML;
}

/* =========================================================================
   2. AUTOMATIC COUPLE BACKGROUND SLIDESHOW (PINTEREST / ROMANTIC AESTHETIC)
   ========================================================================= */
const coupleWallpapers = [
  "https://images.unsplash.com/photo-1518199266791-5375a83190b7?w=1200&auto=format&fit=crop&q=75",
  "https://images.unsplash.com/photo-1516589178581-6cd7833ae3b2?w=1200&auto=format&fit=crop&q=75",
  "https://images.unsplash.com/photo-1522673607200-164d1b6ce486?w=1200&auto=format&fit=crop&q=75",
  "https://images.unsplash.com/photo-1494774157365-9e04c6720e47?w=1200&auto=format&fit=crop&q=75",
  "https://images.unsplash.com/photo-1511285560929-80b456fea0bc?w=1200&auto=format&fit=crop&q=75"
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
   3. 100% FULL-LENGTH SONGS ENGINE + MEDIASESSION API (LOCK-SCREEN CONTROLS)
   ========================================================================= */
let songs = [];
let likedSongsMap = new Map();
let currentIndex = 0;
let isPlaying = false;
let isLooping = false;
let playbackRate = 1.0;

let activeCategory = "all";
let activeQuery = "";
let activePage = 1;

const htmlAudio = new Audio();
htmlAudio.preload = "auto";

let audioCtx = null;
let rainNode = null;
let sleepTimeout = null;

function formatDuration(sec) {
  if (!sec || isNaN(sec)) return "0:00";
  const m = Math.floor(sec / 60);
  const s = String(Math.floor(sec % 60)).padStart(2, "0");
  return `${m}:${s}`;
}

/* Setup MediaSession API for Phone Lock-Screen & Notification Controls */
function initMediaSessionHandlers() {
  if (!("mediaSession" in navigator)) return;

  navigator.mediaSession.setActionHandler("play", () => togglePlay(true));
  navigator.mediaSession.setActionHandler("pause", () => togglePlay(true));
  navigator.mediaSession.setActionHandler("previoustrack", () => prevSong());
  navigator.mediaSession.setActionHandler("nexttrack", () => nextSong());
  navigator.mediaSession.setActionHandler("seekbackward", (details) => {
    htmlAudio.currentTime = Math.max(0, htmlAudio.currentTime - (details.seekOffset || 10));
  });
  navigator.mediaSession.setActionHandler("seekforward", (details) => {
    htmlAudio.currentTime = Math.min(htmlAudio.duration || 0, htmlAudio.currentTime + (details.seekOffset || 10));
  });
  try {
    navigator.mediaSession.setActionHandler("seekto", (details) => {
      if (details.seekTime !== undefined && htmlAudio.duration) {
        htmlAudio.currentTime = details.seekTime;
        const pct = (details.seekTime / htmlAudio.duration) * 100;
        document.getElementById("seekBar").value = pct;
        broadcastSyncState("SEEK", { currentTime: details.seekTime });
      }
    });
  } catch (e) {}
}

function updateMediaSessionMetadata(track) {
  if (!("mediaSession" in navigator)) return;

  navigator.mediaSession.metadata = new MediaMetadata({
    title: track.title,
    artist: track.artist,
    album: "VelvetSync 320kbps Sanctuary",
    artwork: [
      { src: track.cover, sizes: "96x96", type: "image/jpeg" },
      { src: track.cover, sizes: "128x128", type: "image/jpeg" },
      { src: track.cover, sizes: "192x192", type: "image/jpeg" },
      { src: track.cover, sizes: "512x512", type: "image/jpeg" },
    ],
  });
  navigator.mediaSession.playbackState = isPlaying ? "playing" : "paused";
}

function renderSkeletonCards(count = 8, append = false) {
  const discoverGrid = document.getElementById("discoverGrid");
  if (!discoverGrid) return;

  const skeletonHTML = Array.from({ length: count })
    .map(
      () => `
      <div class="skeleton-card temp-skeleton">
        <div class="skeleton-art shimmer"></div>
        <div class="skeleton-line title shimmer"></div>
        <div class="skeleton-line sub shimmer"></div>
      </div>
    `
    )
    .join("");

  if (append) {
    discoverGrid.insertAdjacentHTML("beforeend", skeletonHTML);
  } else {
    discoverGrid.innerHTML = skeletonHTML;
  }
}

async function loadSongCategory(category = "all") {
  activeCategory = category;
  activeQuery = "";
  activePage = 1;
  document.getElementById("searchInput").value = "";

  const loader = document.getElementById("loadingIndicator");
  if (loader) loader.style.display = "inline-block";

  const headingMap = {
    all: "🔥 All Trending Full-Length Songs",
    hindi: "🇮🇳 Real Hindi Romantic & Bollywood Full Songs",
    english: "🌎 Global English Full-Length Hits",
    punjabi: "🎶 Punjabi Full-Length Chartbusters",
    marathi: "🚩 Marathi Romantic & Evergreen Hits",
    lofi: "🎧 Lo-Fi, Chill & Slowed Full Tracks",
    party: "💃 Party & Club Anthems"
  };
  document.getElementById("catalogHeading").textContent = headingMap[category] || headingMap.all;

  renderSkeletonCards(8, false);

  try {
    const res = await fetch(`/api/songs?category=${encodeURIComponent(category)}&page=1`);
    const data = await res.json();
    if (data.songs) {
      songs = data.songs.map((s) => ({
        ...s,
        liked: likedSongsMap.has(s.id)
      }));
      renderSongs();
    }
  } catch (err) {
    console.error("Failed to fetch full songs:", err);
  } finally {
    if (loader) loader.style.display = "none";
  }
}

async function searchRealSongs(source = "auto") {
  const query = document.getElementById("searchInput").value.trim();
  if (!query) {
    loadSongCategory("all");
    return;
  }

  switchSection("discover");
  activeQuery = query;
  activePage = 1;

  const loader = document.getElementById("loadingIndicator");
  if (loader) loader.style.display = "inline-block";
  document.getElementById("catalogHeading").textContent =
    source === "youtube"
      ? `🌎 Global YouTube Music Results for "${query}"`
      : `Full-Length Results for "${query}"`;

  renderSkeletonCards(8, false);

  try {
    const res = await fetch(
      `/api/songs?q=${encodeURIComponent(query)}&page=1&source=${encodeURIComponent(source)}`
    );
    const data = await res.json();
    songs = (data.songs || []).map((s) => ({
      ...s,
      liked: likedSongsMap.has(s.id)
    }));
    renderSongs();
  } catch (err) {
    console.error("Search failed:", err);
  } finally {
    if (loader) loader.style.display = "none";
  }
}

async function loadMoreSongs() {
  activePage += 1;
  const loader = document.getElementById("loadingIndicator");
  if (loader) loader.style.display = "inline-block";

  renderSkeletonCards(4, true);

  try {
    const url = activeQuery
      ? `/api/songs?q=${encodeURIComponent(activeQuery)}&page=${activePage}`
      : `/api/songs?category=${encodeURIComponent(activeCategory)}&page=${activePage}`;
    const res = await fetch(url);
    const data = await res.json();
    if (data.songs && data.songs.length > 0) {
      const existingIds = new Set(songs.map((s) => s.id));
      const newTracks = data.songs
        .filter((s) => !existingIds.has(s.id))
        .map((s) => ({ ...s, liked: likedSongsMap.has(s.id) }));
      songs = [...songs, ...newTracks];
    }
    renderSongs();
  } catch (err) {
    console.error("Load more failed:", err);
    document.querySelectorAll(".temp-skeleton").forEach((el) => el.remove());
  } finally {
    if (loader) loader.style.display = "none";
  }
}

function playSong(index, broadcast = true) {
  if (!songs[index]) return;
  currentIndex = index;
  const track = songs[currentIndex];
  isPlaying = true;

  document.getElementById("playerArt").src = track.cover;
  document.getElementById("vinylArt").src = track.cover;
  document.getElementById("vinylDisc").classList.add("spinning");
  document.getElementById("playerTitle").textContent = track.title;
  document.getElementById("playerArtist").textContent = track.artist;
  document.getElementById("playPauseBtn").textContent = "⏸";
  document.getElementById("favBtn").classList.toggle("active", !!track.liked);
  document.getElementById("durTime").textContent = formatDuration(track.duration);
  document.getElementById("lyricTicker").textContent =
    `♫ Streaming Full Song (${formatDuration(track.duration)}): ${track.title} — ${track.artist}`;

  htmlAudio.src = track.audioUrl;
  htmlAudio.loop = isLooping;
  htmlAudio.playbackRate = playbackRate;
  if ("preservesPitch" in htmlAudio) {
    htmlAudio.preservesPitch = playbackRate === 1.0;
  }

  htmlAudio.play().catch((err) => console.warn("Playback interaction needed:", err));
  renderSongs();

  // Update Lock-Screen MediaSession metadata
  updateMediaSessionMetadata(track);

  if (broadcast) {
    broadcastSyncState("PLAY_TRACK", { track, currentTime: 0 });
  }
}

function playSyncedTrack(track, seekTime = 0) {
  let idx = songs.findIndex((s) => s.id === track.id);
  if (idx === -1) {
    songs.unshift(track);
    idx = 0;
  }
  playSong(idx, false);
  if (seekTime > 0) {
    htmlAudio.currentTime = seekTime;
  }
}

function togglePlay(broadcast = true) {
  if (!htmlAudio.src && songs.length > 0) {
    playSong(0, broadcast);
    return;
  }

  if (htmlAudio.paused) {
    htmlAudio.play();
    isPlaying = true;
    document.getElementById("playPauseBtn").textContent = "⏸";
    document.getElementById("vinylDisc").classList.add("spinning");
  } else {
    htmlAudio.pause();
    isPlaying = false;
    document.getElementById("playPauseBtn").textContent = "▶";
    document.getElementById("vinylDisc").classList.remove("spinning");
  }

  if ("mediaSession" in navigator) {
    navigator.mediaSession.playbackState = isPlaying ? "playing" : "paused";
  }

  renderSongs();
  if (broadcast) {
    broadcastSyncState(isPlaying ? "RESUME" : "PAUSE", {
      currentTime: htmlAudio.currentTime
    });
  }
}

function prevSong() {
  if (!songs.length) return;
  const nextIdx = (currentIndex - 1 + songs.length) % songs.length;
  playSong(nextIdx);
}

function nextSong() {
  if (!songs.length) return;
  const nextIdx = (currentIndex + 1) % songs.length;
  playSong(nextIdx);
}

function toggleLoop() {
  isLooping = !isLooping;
  htmlAudio.loop = isLooping;
  document.getElementById("loopBtn").classList.toggle("active", isLooping);
}

function setVolume(val) {
  htmlAudio.volume = parseFloat(val);
}

htmlAudio.addEventListener("timeupdate", () => {
  const totalDur = htmlAudio.duration || (songs[currentIndex] && songs[currentIndex].duration) || 0;
  if (!totalDur) return;
  const pct = Math.min(100, (htmlAudio.currentTime / totalDur) * 100);
  document.getElementById("seekBar").value = pct;
  document.getElementById("curTime").textContent = formatDuration(htmlAudio.currentTime);
  document.getElementById("durTime").textContent = formatDuration(totalDur);

  // Update lock-screen position state if supported
  if ("mediaSession" in navigator && typeof navigator.mediaSession.setPositionState === "function") {
    try {
      navigator.mediaSession.setPositionState({
        duration: totalDur,
        playbackRate: htmlAudio.playbackRate,
        position: htmlAudio.currentTime,
      });
    } catch (e) {}
  }
});

htmlAudio.addEventListener("ended", () => {
  if (!isLooping) nextSong();
});

function seekSong(pct) {
  const totalDur = htmlAudio.duration || (songs[currentIndex] && songs[currentIndex].duration) || 0;
  if (!totalDur) return;
  const targetTime = (Number(pct) / 100) * totalDur;
  htmlAudio.currentTime = targetTime;
  broadcastSyncState("SEEK", { currentTime: targetTime });
}

/* =========================================================================
   4. REAL VOCAL SLOWED + REVERB, NIGHTCORE & RAIN AMBIENCE
   ========================================================================= */
let activeVibe = "normal";

function setAudioVibe(vibe) {
  const slowedBtn = document.getElementById("slowedBtn");
  const nightcoreBtn = document.getElementById("nightcoreBtn");

  if (activeVibe === vibe) {
    activeVibe = "normal";
    playbackRate = 1.0;
    slowedBtn.classList.remove("active");
    nightcoreBtn.classList.remove("active");
  } else if (vibe === "slowed") {
    activeVibe = "slowed";
    playbackRate = 0.84;
    slowedBtn.classList.add("active");
    nightcoreBtn.classList.remove("active");
  } else if (vibe === "nightcore") {
    activeVibe = "nightcore";
    playbackRate = 1.22;
    nightcoreBtn.classList.add("active");
    slowedBtn.classList.remove("active");
  }

  htmlAudio.playbackRate = playbackRate;
  if ("preservesPitch" in htmlAudio) {
    htmlAudio.preservesPitch = playbackRate === 1.0;
  }
}

function toggleRainAmbience() {
  if (!audioCtx) {
    const AudioContext = window.AudioContext || window.webkitAudioContext;
    audioCtx = new AudioContext();
  }
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
  rainFilter.frequency.value = 900;

  rainNode.connect(rainFilter);
  rainNode.connect(audioCtx.destination);
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
      alert("🌙 Sleep Timer finished. Goodnight!");
    }, mins * 60 * 1000);
  }
}

/* =========================================================================
   5. FULL-LENGTH AUDIO FILE DOWNLOAD
   ========================================================================= */
function downloadCurrentSong() {
  const track = songs[currentIndex];
  if (!track || !track.audioUrl) return;
  const downloadUrl = `/api/download?url=${encodeURIComponent(track.audioUrl)}&title=${encodeURIComponent(track.title)}`;
  const a = document.createElement("a");
  a.href = downloadUrl;
  a.click();
}

/* =========================================================================
   6. REAL-TIME DUO & TRIO LINK SYNCHRONIZATION (SOCKET.IO)
   ========================================================================= */
const socket = typeof io !== "undefined" ? io() : null;
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
  document.getElementById("syncStatusText").textContent = `${mode.toUpperCase()} Live: ${roomCode}`;

  const userPayload = currentUser || {
    name: "Guest Listener",
    avatar: "https://api.dicebear.com/9.x/adventurer/svg?seed=Guest"
  };

  if (socket) {
    socket.emit("join_sync_room", { room: roomCode, mode, user: userPayload });
  }
  toggleVideoBackground(true);
}

function copyRoomLink(inputId) {
  const input = document.getElementById(inputId);
  if (!input.value) return;
  input.select();
  navigator.clipboard.writeText(input.value);
  alert("Invite Link Copied! Send it to your partner or friends to stream full songs in real-time sync.");
}

function broadcastSyncState(action, payload) {
  if (!activeRoomId || !socket) return;
  socket.emit("sync_action", { room: activeRoomId, action, payload });
}

if (socket) {
  socket.on("room_joined", (data) => {
    const names = data.members.map((m) => m.name).join(" & ");
    document.getElementById("syncStatusText").textContent = `💞 Synced (${data.room}) • ${names}`;
    renderRoomMembers(data.members);
    toggleVideoBackground(true);

    if (songs[currentIndex]) {
      playSong(currentIndex, true);
    }
  });

  socket.on("sync_update", (data) => {
    const { room, action, payload } = data;
    if (room !== activeRoomId) return;

    if (action === "PLAY_TRACK") {
      playSyncedTrack(payload.track, payload.currentTime || 0);
    } else if (action === "PAUSE") {
      if (!htmlAudio.paused) togglePlay(false);
    } else if (action === "RESUME") {
      htmlAudio.currentTime = payload.currentTime || htmlAudio.currentTime;
      if (htmlAudio.paused) togglePlay(false);
    } else if (action === "SEEK") {
      htmlAudio.currentTime = payload.currentTime;
    } else if (action === "WALLPAPER") {
      coupleWallpapers.unshift(payload.url);
      applyBackground(payload.url);
    } else if (action === "THEME") {
      setTheme(payload.theme, false);
    } else if (action === "VIDEO_URL") {
      changeCoupleVideo(payload.url, false);
    }
  });

  socket.on("receive_chat", (data) => {
    appendChatMessage(data.user, data.text);
  });

  socket.on("receive_reaction", (data) => {
    spawnEmojiBurst(data.emoji);
  });
}

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
   7. LIVE ROOM CHAT & FLOATING REACTION BURSTS
   ========================================================================= */
function sendChatMessage() {
  const input = document.getElementById("chatInput");
  const text = input.value.trim();
  if (!text) return;
  const userName = currentUser ? currentUser.name : "Guest Listener";

  if (socket && activeRoomId) {
    socket.emit("send_chat", { room: activeRoomId, user: userName, text });
  } else {
    appendChatMessage(userName, text);
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
    p.style.left = `${15 + Math.random() * 70}vw`;
    p.style.top = `${60 + Math.random() * 20}vh`;
    document.body.appendChild(p);
    setTimeout(() => p.remove(), 1400);
  }
}

/* =========================================================================
   8. FALLING SAKURA CHERRY BLOSSOM PETALS CANVAS
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

for (let i = 0; i < 40; i++) {
  petals.push({
    x: Math.random() * window.innerWidth,
    y: Math.random() * window.innerHeight,
    r: 5 + Math.random() * 6,
    speedY: 0.7 + Math.random() * 1.3,
    speedX: -0.5 + Math.random() * 1.4,
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
   9. ANIMATED FREQUENCY VISUALIZER & UI RENDERING
   ========================================================================= */
function startFooterVisualizer() {
  const canvas = document.getElementById("freqCanvas");
  if (!canvas) return;
  const ctx = canvas.getContext("2d");

  function renderBars() {
    requestAnimationFrame(renderBars);
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    const barWidth = (canvas.width / 22) - 2;
    let x = 2;
    for (let i = 0; i < 22; i++) {
      const h = isPlaying
        ? 6 + Math.abs(Math.sin(Date.now() * 0.008 + i * 0.5)) * (canvas.height - 10)
        : 4;
      ctx.fillStyle = "#ff4d8d";
      ctx.fillRect(x, canvas.height - h, barWidth, h);
      x += barWidth + 2;
    }
  }
  renderBars();
}

function renderSongs() {
  const discoverGrid = document.getElementById("discoverGrid");
  const coupleGrid = document.getElementById("coupleGrid");
  const favGrid = document.getElementById("favGrid");

  const createCardHTML = (song, idx) => {
    const activeClass = idx === currentIndex && isPlaying ? "playing" : "";
    const heartColor = song.liked ? "var(--primary)" : "var(--text-muted)";
    const badge = (song.language || "music").toUpperCase();
    const durBadge = formatDuration(song.duration || 210);
    return `
      <div class="song-card ${activeClass}" onclick="playSong(${idx})">
        <div class="art-wrapper">
          <img src="${song.cover}" alt="${song.title}" loading="lazy" />
          <span class="lang-tag">${badge}</span>
          <span class="dur-tag">${durBadge}</span>
          <div class="card-visualizer">
            <div class="bar"></div>
            <div class="bar"></div>
            <div class="bar"></div>
            <div class="bar"></div>
          </div>
        </div>
        <div class="song-title">
          <span title="${song.title}">${song.title}</span>
          <span style="color:${heartColor};" onclick="toggleCardLike(event, ${idx})">♥</span>
        </div>
        <div class="song-artist" title="${song.artist}">${song.artist}</div>
      </div>
    `;
  };

  if (discoverGrid) {
    discoverGrid.innerHTML = songs.map((s, idx) => createCardHTML(s, idx)).join("");
  }
  if (coupleGrid) {
    coupleGrid.innerHTML = songs.map((s, idx) => createCardHTML(s, idx)).join("");
  }
  if (favGrid) {
    const likedList = Array.from(likedSongsMap.values());
    favGrid.innerHTML = likedList
      .map((s) => {
        const idxInCurrent = songs.findIndex((item) => item.id === s.id);
        const playIdx = idxInCurrent !== -1 ? idxInCurrent : 0;
        return createCardHTML(s, playIdx);
      })
      .join("");
  }
}

function toggleCardLike(e, idx) {
  e.stopPropagation();
  const track = songs[idx];
  track.liked = !track.liked;
  if (track.liked) likedSongsMap.set(track.id, track);
  else likedSongsMap.delete(track.id);
  triggerFavHeart(e, false);
  renderSongs();
}

function addNewSong() {
  const title = document.getElementById("customTitle").value.trim() || "Custom Full Track";
  const artist = document.getElementById("customArtist").value.trim() || (currentUser ? currentUser.name : "Artist");
  const directUrl = document.getElementById("customAudioUrl").value.trim();
  const fileInput = document.getElementById("customAudioFile");

  let audioUrl = directUrl || null;
  if (!audioUrl && fileInput.files && fileInput.files[0]) {
    audioUrl = URL.createObjectURL(fileInput.files[0]);
  }
  if (!audioUrl) {
    alert("Please provide a direct MP3 URL or select an audio file.");
    return;
  }

  const customObj = {
    id: `custom_${Date.now()}`,
    title,
    artist,
    cover: coupleWallpapers[bgIndex % coupleWallpapers.length],
    language: "Custom",
    duration: 240,
    couple: true,
    liked: true,
    audioUrl
  };

  songs.unshift(customObj);
  likedSongsMap.set(customObj.id, customObj);

  renderSongs();
  toggleWindow("addSongWin");
  playSong(0);
}

function switchSection(sectionId) {
  document.querySelectorAll(".view-section").forEach((s) => s.classList.remove("active"));
  const target = document.getElementById(`sec-${sectionId}`);
  if (target) target.classList.add("active");

  document.querySelectorAll(".nav-btn, .mob-nav-btn").forEach((b) => {
    b.classList.toggle("active", b.getAttribute("data-sec") === sectionId);
  });

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
  if (songs.length > 0) playSong(0);
}

function toggleWindow(winId) {
  const win = document.getElementById(winId);
  const isOpen = win.classList.contains("open");
  document.querySelectorAll(".floating-window").forEach((w) => w.classList.remove("open"));
  if (!isOpen) win.classList.add("open");
}

function setTheme(themeName, sync = false) {
  if (themeName === "default") {
    document.documentElement.removeAttribute("data-theme");
  } else {
    document.documentElement.setAttribute("data-theme", themeName);
  }
  if (sync) broadcastSyncState("THEME", { theme: themeName });
}

function triggerFavHeart(e, toggleCurrent = true) {
  if (toggleCurrent && songs[currentIndex]) {
    const track = songs[currentIndex];
    track.liked = !track.liked;
    if (track.liked) likedSongsMap.set(track.id, track);
    else likedSongsMap.delete(track.id);
    document.getElementById("favBtn").classList.toggle("active", track.liked);
    renderSongs();
  }

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
  sakuraCanvas.classList.add("active");
  animateSakura();
  startFooterVisualizer();
  checkLoggedInUser();
  initMediaSessionHandlers();
  loadSongCategory("all");

  const params = new URLSearchParams(window.location.search);
  const room = params.get("room");
  const mode = params.get("mode") || "duo";
  if (room) {
    switchSection(mode);
    activateRoomExperience(room, mode);
  }
});
