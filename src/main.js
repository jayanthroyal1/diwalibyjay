import './style.css';
import './mobile.css';
import { FilesetResolver, HandLandmarker } from '@mediapipe/tasks-vision';

const $ = (id) => document.getElementById(id);
const canvas = $('stage'), ctx = canvas.getContext('2d', { alpha: true, desynchronized: true });
const video = $('camera');
const app = $('app');
const ui = { intro: $('intro'), permission: $('permission'), live: $('liveStatus'), status: $('statusText'), hint: $('gestureHint'), name: $('celebrationName'), toast: $('toast') };
const PARTICLE_CAPACITY = 3500;
const particlePool = Array.from({ length: PARTICLE_CAPACITY }, () => ({ x: 0, y: 0, px: 0, py: 0, vx: 0, vy: 0, color: '#fff', life: 0, max: 1, size: 1, gravity: 0, twinkle: false }));
const activeParticles = new Int16Array(PARTICLE_CAPACITY), freeParticles = new Int16Array(PARTICLE_CAPACITY);
for (let i = 0; i < PARTICLE_CAPACITY; i++) freeParticles[i] = PARTICLE_CAPACITY - 1 - i;
let activeCount = 0, freeCount = PARTICLE_CAPACITY;
let width = 0, height = 0, dpr = 1, lastFrame = 0, landmarker, cameraStream, running = false;
let soundOn = true, audio, audioBus, noiseBuffer, lastGesture = '', gestureAt = 0, toastTimer, videoFrameId, debugHands = [], debugMode = false, creatorMode = false;
const colors = ['#ff4d6d', '#57ed9a', '#ffd166', '#54c8ff', '#c084fc', '#fff2cd', '#ff9e43'];
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

function resize() {
  dpr = Math.min(window.devicePixelRatio || 1, 1.5);
  width = window.innerWidth; height = window.innerHeight;
  canvas.width = Math.round(width * dpr); canvas.height = Math.round(height * dpr);
  canvas.style.width = `${width}px`; canvas.style.height = `${height}px`;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
}
window.addEventListener('resize', resize, { passive: true }); resize();

function sound(type, frequency = 500) {
  if (!soundOn) return;
  try {
    ensureAudio(); if (audio.state === 'suspended') audio.resume();
    const now = audio.currentTime, variation = .92 + Math.random() * .16, duration = (.28 + Math.random() * .12) * variation;
    const gain = audio.createGain(); gain.connect(audioBus);
    if (type === 'fountain' || type === 'crackle') {
      noiseBuffer ||= makeNoiseBuffer();
      const source = audio.createBufferSource(), filter = audio.createBiquadFilter();
      source.buffer = noiseBuffer; filter.type = 'bandpass'; filter.frequency.value = (type === 'fountain' ? 1800 : 4200) * variation; filter.Q.value = type === 'fountain' ? .65 : 1.8;
      source.connect(filter); filter.connect(gain); gain.gain.setValueAtTime(type === 'fountain' ? .027 : .045, now); gain.gain.exponentialRampToValueAtTime(.001, now + duration);
      source.start(now); source.stop(now + duration); return;
    }
    const osc = audio.createOscillator(); osc.connect(gain);
    const base = type === 'rocket' ? 320 : frequency; osc.type = type === 'rocket' ? 'triangle' : 'sine';
    osc.frequency.setValueAtTime(base * variation, now);
    if (type === 'rocket') osc.frequency.exponentialRampToValueAtTime(1550 * variation, now + .46 * variation);
    else osc.frequency.exponentialRampToValueAtTime(45 * variation, now + duration * .75);
    gain.gain.setValueAtTime(type === 'rocket' ? .075 : .095, now); gain.gain.exponentialRampToValueAtTime(.001, now + (type === 'rocket' ? .5 : duration));
    osc.start(now); osc.stop(now + Math.max(duration, .5));
  } catch { /* audio is an enhancement; the show still runs */ }
}

function ensureAudio() {
  audio ||= new (window.AudioContext || window.webkitAudioContext)();
  if (!audioBus) { audioBus = audio.createGain(); audioBus.connect(audio.destination); }
  return audio;
}
function makeNoiseBuffer() {
  const buffer = audio.createBuffer(1, audio.sampleRate, audio.sampleRate), data = buffer.getChannelData(0);
  for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
  return buffer;
}

function addParticle(x, y, vx, vy, color, life, size = 2, gravity = 35, twinkle = false) {
  if (freeCount === 0) return;
  const index = freeParticles[--freeCount], p = particlePool[index];
  p.x = p.px = x; p.y = p.py = y; p.vx = vx; p.vy = vy; p.color = color; p.life = p.max = life; p.size = size; p.gravity = gravity; p.twinkle = twinkle;
}
function burst(x, y, count, palette = colors, speed = 240, size = 2.1, gravity = 42) {
  const n = Math.min(count, 260);
  for (let i = 0; i < n; i++) {
    const a = Math.random() * Math.PI * 2, v = speed * (.28 + Math.random() * .85), c = palette[i % palette.length];
    addParticle(x, y, Math.cos(a) * v, Math.sin(a) * v, c, 1.1 + Math.random() * 1.1, size * (.55 + Math.random() * .95), gravity, true);
  }
}
function rocket(x, y, color = '#ffd166', n = 145) {
  sound('rocket');
  const startY = Math.max(35, y - height * (.25 + Math.random() * .16));
  const steps = 24, sx = x + (Math.random() - .5) * 34;
  for (let i = 0; i < steps; i++) setTimeout(() => addParticle(sx + (Math.random() - .5) * 5, y - (y - startY) * i / steps, (Math.random() - .5) * 10, -110 - Math.random() * 70, color, .38, 2, 0), i * 18);
  setTimeout(() => { burst(sx, startY, n, [color, '#fff5d6', '#ffad55'], 250, 2.2, 58); sound('boom', 800); }, 470);
}
function fountain(x, y) {
  sound('fountain');
  for (let i = 0; i < 36; i++) {
    const a = -Math.PI / 2 + (Math.random() - .5) * 1.05, v = 150 + Math.random() * 220;
    addParticle(x, y, Math.cos(a) * v, Math.sin(a) * v, colors[Math.random() > .28 ? 2 : 6], .9 + Math.random() * .8, 1.4 + Math.random(), 135, true);
  }
}
function starburst(x, y) {
  sound('boom'); burst(x, y, 210, ['#fff8dc', '#ffdc8c'], 260, 2.3, 45);
  setTimeout(() => burst(x, y, 120, colors.slice(0, 5), 330, 1.8, 30), 100);
  ring(x, y, '#fff3cc'); setTimeout(() => ring(x, y, '#ff70a6'), 130);
}
function ring(x, y, color) { for (let i = 0; i < 80; i++) { const a = i / 80 * Math.PI * 2; addParticle(x, y, Math.cos(a) * 200, Math.sin(a) * 200, color, .8, 1.8, 0); } }
function romanCandle(x, y) {
  const palette = ['#ff4d6d', '#57ed9a', '#ffd166', '#54c8ff', '#c084fc'];
  palette.forEach((c, i) => setTimeout(() => { sound('boom', 700); rocket(x + (i - 2) * 25, y, c, 36); }, i * 330));
}
function sparkler(x, y) {
  sound('crackle');
  for (let i = 0; i < 14; i++) {
    const a = Math.random() * Math.PI * 2, r = Math.random() * 27;
    addParticle(x + Math.cos(a) * r, y + Math.sin(a) * r, (Math.random() - .5) * 220, (Math.random() - .5) * 220, colors[Math.floor(Math.random() * colors.length)], .4 + Math.random() * .55, 1 + Math.random() * 2, 25, true);
  }
}
function finale() {
  for (let i = 0; i < 18; i++) setTimeout(() => rocket(width * (.12 + Math.random() * .76), height * (.52 + Math.random() * .23), colors[i % colors.length], 100), i * 190);
  setTimeout(() => { for (let i = 0; i < 5; i++) setTimeout(() => burst(width * (.12 + i * .19), height * (.32 + Math.random() * .12), 180, colors, 280, 2.2, 45), i * 160); }, 1100);
  setTimeout(() => sound('boom'), 4500);
}

function animate(timestamp) {
  requestAnimationFrame(animate);
  const dt = Math.min(.04, Math.max(.001, (timestamp - (lastFrame || timestamp)) / 1000)); lastFrame = timestamp;
  ctx.clearRect(0, 0, width, height);
  if (cameraStream && video.readyState >= 2) {
    ctx.save(); ctx.globalAlpha = .2; ctx.translate(width, 0); ctx.scale(-1, 1);
    ctx.drawImage(video, 0, 0, width, height); ctx.restore();
  }
  if (activeCount > 0) {
    ctx.globalCompositeOperation = 'lighter';
    for (let i = activeCount - 1; i >= 0; i--) {
      const index = activeParticles[i], p = particlePool[index]; p.life -= dt;
      if (p.life <= 0) { activeParticles[i] = activeParticles[--activeCount]; freeParticles[freeCount++] = index; continue; }
      p.px = p.x; p.py = p.y; p.vy += p.gravity * dt; p.vx *= .995; p.x += p.vx * dt; p.y += p.vy * dt;
      const alpha = clamp(p.life / p.max, 0, 1) * (p.twinkle ? (.64 + Math.sin(timestamp * .03 + p.x) * .35) : 1);
      ctx.globalAlpha = alpha; ctx.strokeStyle = p.color; ctx.lineWidth = Math.max(.7, p.size); ctx.lineCap = 'round';
      ctx.beginPath(); ctx.moveTo(p.px, p.py); ctx.lineTo(p.x, p.y); ctx.stroke();
      ctx.fillStyle = p.color; ctx.beginPath(); ctx.arc(p.x, p.y, p.size * .55, 0, Math.PI * 2); ctx.fill();
    }
    ctx.globalAlpha = 1; ctx.globalCompositeOperation = 'source-over';
  }
  if (debugMode && debugHands.length) drawDebugHands();
}
requestAnimationFrame(animate);

function drawDebugHands() {
  const bones = [[0,1],[1,2],[2,3],[3,4],[0,5],[5,6],[6,7],[7,8],[5,9],[9,10],[10,11],[11,12],[9,13],[13,14],[14,15],[15,16],[13,17],[17,18],[18,19],[19,20],[0,17]];
  ctx.save(); ctx.lineWidth = 2; ctx.strokeStyle = '#75ffd0'; ctx.fillStyle = '#fff2ad'; ctx.shadowColor = '#75ffd0'; ctx.shadowBlur = 8;
  for (const hand of debugHands) {
    ctx.beginPath();
    for (const [a, b] of bones) { ctx.moveTo((1 - hand[a].x) * width, hand[a].y * height); ctx.lineTo((1 - hand[b].x) * width, hand[b].y * height); }
    ctx.stroke();
    for (const point of hand) { ctx.beginPath(); ctx.arc((1 - point.x) * width, point.y * height, 3, 0, Math.PI * 2); ctx.fill(); }
  }
  ctx.restore();
}

// Landmark indices use MediaPipe's 21 point hand topology. Webcam inference is
// throttled to about 18fps; the canvas remains independently animated at display FPS.
const distance = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
function classify(hands) {
  if (!hands?.length) return null;
  const h = hands[0], wrist = h[0];
  const extended = (tip, pip) => distance(h[tip], wrist) > distance(h[pip], wrist) * 1.12;
  const index = extended(8, 6), middle = extended(12, 10), ringFinger = extended(16, 14), pinky = extended(20, 18);
  const pinch = distance(h[4], h[8]) < .075;
  if (hands.length > 1 && distance(hands[0][9], hands[1][9]) < .22) return 'namaste';
  if (pinch) return 'pinch';
  if (index && middle && !ringFinger && !pinky) return 'peace';
  if (index && !middle && !ringFinger && !pinky) return 'rocket';
  if (index && middle && ringFinger && pinky) return 'palm';
  if (!index && !middle && !ringFinger && !pinky) return 'fist';
  return null;
}
const gestureNames = { rocket: 'Rocket', fist: 'Anar fountain', palm: 'Starburst', peace: 'Roman candle', pinch: 'Sparkler', namaste: 'Grand finale' };
let lastPinchSpark = 0, lastFountain = 0;
function processHands(result) {
  const hands = result?.landmarks || [], g = classify(hands);
  debugHands = hands;
  if (!g) { lastGesture = ''; return; }
  const hand = hands[0], tip = hand[8], x = (1 - tip.x) * width, y = tip.y * height;
  if (g === 'pinch') { if (performance.now() - lastPinchSpark > 85) { sparkler(x, y); lastPinchSpark = performance.now(); } return; }
  if (g === 'fist') { if (performance.now() - lastFountain > 130) { fountain(x, y); lastFountain = performance.now(); } return; }
  if (g === lastGesture && performance.now() - gestureAt < 1200) return;
  lastGesture = g; gestureAt = performance.now(); $('statusText').textContent = `✦ ${gestureNames[g]}!`;
  if (g === 'rocket') rocket(x, y, colors[2], 160);
  else if (g === 'palm') starburst(x, y);
  else if (g === 'peace') romanCandle(x, y);
  else if (g === 'namaste') finale();
}
let lastDetect = 0;
function detectionLoop(now) {
  if (!running) return;
  if (video.readyState >= 2 && now - lastDetect > 55) {
    lastDetect = now;
    try { const result = landmarker.detectForVideo(video, now); processHands(result); } catch { /* camera may be transitioning */ }
  }
  if ('requestVideoFrameCallback' in video) videoFrameId = video.requestVideoFrameCallback(detectionLoop);
  else setTimeout(() => detectionLoop(performance.now()), 70);
}

async function startCamera() {
  $('cameraButton').disabled = true; $('cameraButton').textContent = 'STARTING CAMERA…';
  try {
    if (!navigator.mediaDevices?.getUserMedia) {
      const secure = window.isSecureContext;
      throw new Error(secure ? 'This browser does not provide camera access. Open the link in Safari or Chrome.' : 'Camera access requires HTTPS. Open the secure site link in your browser.');
    }
    try {
      cameraStream = await navigator.mediaDevices.getUserMedia({ audio: false, video: { facingMode: { ideal: 'user' }, width: { ideal: 640 }, height: { ideal: 480 }, frameRate: { ideal: 24, max: 30 } } });
    } catch (firstError) {
      // Some mobile browsers reject optional size/frame-rate constraints. Retry with the front camera only.
      try { cameraStream = await navigator.mediaDevices.getUserMedia({ audio: false, video: { facingMode: 'user' } }); }
      catch { throw firstError; }
    }
    video.srcObject = cameraStream;
    try { await video.play(); }
    catch { await new Promise((resolve, reject) => { video.onloadedmetadata = resolve; video.onerror = reject; }); }
    app.classList.add('camera-on');
    $('permission').classList.add('hidden'); $('liveStatus').classList.remove('hidden'); $('gestureHint').classList.remove('hidden');
    $('statusText').textContent = 'Loading hand tracking…';
  } catch (error) {
    cameraStream?.getTracks().forEach(t => t.stop()); cameraStream = null; app.classList.remove('camera-on');
    const messages = {
      NotAllowedError: 'Camera permission is blocked. Allow camera access for this site in your browser settings, then retry.',
      NotFoundError: 'No camera was found on this device.',
      NotReadableError: 'The camera is busy in another app. Close it and try again.',
      SecurityError: 'This browser blocked camera access. Open the HTTPS link directly in Safari or Chrome.',
      OverconstrainedError: 'This camera could not use the requested settings. Try again to use its default settings.',
    };
    showToast(messages[error?.name] || `Camera could not start${error?.message ? `: ${error.message}` : '. Check browser camera permission and try again.'}`);
    $('cameraButton').disabled = false; $('cameraButton').innerHTML = 'TRY CAMERA AGAIN <span>↗</span>';
    return;
  }
  try {
    const assetBase = import.meta.env.BASE_URL;
    const vision = await FilesetResolver.forVisionTasks(`${assetBase}wasm`);
    const modelUrl = new URL(`${assetBase}models/hand_landmarker.task`, window.location.href).href;
    const trackerOptions = { baseOptions: { modelAssetPath: modelUrl, delegate: 'GPU' }, runningMode: 'VIDEO', numHands: 2, minHandDetectionConfidence: .55, minHandPresenceConfidence: .5, minTrackingConfidence: .5 };
    try { landmarker = await HandLandmarker.createFromOptions(vision, trackerOptions); }
    catch { trackerOptions.baseOptions.delegate = 'CPU'; landmarker = await HandLandmarker.createFromOptions(vision, trackerOptions); }
    running = true; $('statusText').textContent = 'Show me a gesture'; detectionLoop(performance.now());
  } catch (error) {
    $('statusText').textContent = 'Hand tracking unavailable';
    showToast('The camera is on, but hand tracking could not load. Reload the page and try again.');
  }
}
function showToast(msg) { ui.toast.textContent = msg; ui.toast.classList.remove('hidden'); clearTimeout(toastTimer); toastTimer = setTimeout(() => ui.toast.classList.add('hidden'), 4800); }

$('welcomeForm').addEventListener('submit', (event) => {
  event.preventDefault();
  const person = $('nameInput').value.trim(); if (!person) return;
  $('greetingTitle').textContent = `HAPPY DIWALI 2026, ${person.toUpperCase()} ✨`; ui.name.classList.remove('hidden'); ui.intro.classList.add('hidden'); ui.permission.classList.remove('hidden');
  ensureAudio(); audio.resume();
});
const nameInput = $('nameInput');
let baselineViewportHeight = window.visualViewport?.height || window.innerHeight;
function syncKeyboardViewport() {
  const visualHeight = window.visualViewport?.height || window.innerHeight;
  document.documentElement.style.setProperty('--visual-height', `${visualHeight}px`);
  const editing = document.activeElement === nameInput;
  if (!editing) baselineViewportHeight = visualHeight;
  document.documentElement.classList.toggle('keyboard-open', editing && visualHeight < baselineViewportHeight * .82);
}
nameInput.addEventListener('focus', syncKeyboardViewport);
nameInput.addEventListener('blur', () => setTimeout(syncKeyboardViewport, 120));
window.visualViewport?.addEventListener('resize', syncKeyboardViewport, { passive: true });
window.visualViewport?.addEventListener('scroll', syncKeyboardViewport, { passive: true });
window.addEventListener('resize', syncKeyboardViewport, { passive: true });
syncKeyboardViewport();
$('cameraButton').addEventListener('click', startCamera);
$('hintClose').addEventListener('click', () => ui.hint.classList.add('hidden'));
$('soundToggle').addEventListener('click', () => { soundOn = !soundOn; $('soundLabel').textContent = soundOn ? 'Sound on' : 'Muted'; $('soundIcon').textContent = soundOn ? '♫' : '♪'; });
function toggleCreatorMode() {
  creatorMode = !creatorMode; app.classList.toggle('creator-mode', creatorMode);
  $('restoreHud').classList.toggle('hidden', !creatorMode);
}
function takePostcard() {
  const snap = document.createElement('canvas'); snap.width = canvas.width; snap.height = canvas.height;
  const shot = snap.getContext('2d'); shot.drawImage(canvas, 0, 0);
  shot.save(); shot.scale(dpr, dpr);
  const gradient = shot.createLinearGradient(0, height - 110, 0, height); gradient.addColorStop(0, 'transparent'); gradient.addColorStop(1, 'rgba(16,8,22,.74)');
  shot.fillStyle = gradient; shot.fillRect(0, height - 110, width, 110);
  shot.textAlign = 'center'; shot.fillStyle = '#fff0c5'; shot.shadowColor = '#ffb94c'; shot.shadowBlur = 18;
  shot.font = `600 ${Math.max(24, Math.min(48, width * .055))}px Georgia, serif`; shot.fillText('✨ Happy Diwali 2026 ✨', width / 2, height - 54);
  shot.font = '600 12px Arial, sans-serif'; shot.shadowBlur = 0; shot.fillStyle = '#ffd999'; shot.fillText('FROM JAYANTH G', width / 2, height - 27); shot.restore();
  snap.toBlob(blob => {
    if (!blob) return showToast('Could not save the postcard in this browser.');
    const url = URL.createObjectURL(blob), link = document.createElement('a'); link.href = url; link.download = 'happy-diwali-2026.png'; link.click(); setTimeout(() => URL.revokeObjectURL(url), 1500);
    showToast('Your Diwali postcard has been saved.');
  }, 'image/png');
}
$('postcardButton').addEventListener('click', takePostcard);
$('creatorToggle').addEventListener('click', toggleCreatorMode);
$('restoreHud').addEventListener('click', toggleCreatorMode);
$('debugToggle').addEventListener('click', () => { debugMode = !debugMode; $('debugToggle').classList.toggle('active', debugMode); });
window.addEventListener('keydown', event => {
  if (event.target instanceof HTMLInputElement || event.target instanceof HTMLTextAreaElement) return;
  const key = event.key.toLowerCase();
  if (key === 'h') toggleCreatorMode();
  else if (key === 'd') { debugMode = !debugMode; $('debugToggle').classList.toggle('active', debugMode); }
  else if (key === 'm') $('soundToggle').click();
  else if (key === 's') takePostcard();
});
document.addEventListener('visibilitychange', () => { if (document.hidden && cameraStream) cameraStream.getTracks().forEach(t => t.enabled = false); else if (cameraStream) cameraStream.getTracks().forEach(t => t.enabled = true); });
window.addEventListener('pagehide', () => { running = false; cameraStream?.getTracks().forEach(t => t.stop()); landmarker?.close(); });
