import './style.css';
import './mobile.css';
import { FilesetResolver, HandLandmarker } from '@mediapipe/tasks-vision';

const $ = (id) => document.getElementById(id);
const canvas = $('stage'), ctx = canvas.getContext('2d', { alpha: true, desynchronized: true });
const video = $('camera');
const app = $('app');
const ui = { intro: $('intro'), permission: $('permission'), live: $('liveStatus'), status: $('statusText'), hint: $('gestureHint'), name: $('celebrationName'), replay: $('replay'), toast: $('toast') };
let width = 0, height = 0, dpr = 1, particles = [], lastFrame = 0, landmarker, cameraStream, running = false;
let soundOn = true, audio, lastGesture = '', gestureAt = 0, toastTimer, videoFrameId;
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
    audio ||= new (window.AudioContext || window.webkitAudioContext)();
    if (audio.state === 'suspended') audio.resume();
    const now = audio.currentTime, osc = audio.createOscillator(), gain = audio.createGain();
    osc.connect(gain); gain.connect(audio.destination);
    if (type === 'fountain') { osc.type = 'sawtooth'; osc.frequency.setValueAtTime(120, now); osc.frequency.exponentialRampToValueAtTime(55, now + .55); gain.gain.setValueAtTime(.035, now); gain.gain.exponentialRampToValueAtTime(.001, now + .6); osc.start(now); osc.stop(now + .61); }
    else { osc.type = type === 'rocket' ? 'triangle' : 'sine'; osc.frequency.setValueAtTime(type === 'rocket' ? 320 : frequency, now); if (type === 'rocket') osc.frequency.exponentialRampToValueAtTime(1550, now + .46); else osc.frequency.exponentialRampToValueAtTime(45, now + .23); gain.gain.setValueAtTime(.11, now); gain.gain.exponentialRampToValueAtTime(.001, now + (type === 'rocket' ? .5 : .3)); osc.start(now); osc.stop(now + .52); }
  } catch { /* audio is an enhancement; the show still runs */ }
}

function addParticle(x, y, vx, vy, color, life, size = 2, gravity = 35, twinkle = false) {
  if (particles.length < 1800) particles.push({ x, y, px: x, py: y, vx, vy, color, life, max: life, size, gravity, twinkle });
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
  sound('fountain');
  for (let i = 0; i < 14; i++) {
    const a = Math.random() * Math.PI * 2, r = Math.random() * 27;
    addParticle(x + Math.cos(a) * r, y + Math.sin(a) * r, (Math.random() - .5) * 220, (Math.random() - .5) * 220, colors[Math.floor(Math.random() * colors.length)], .4 + Math.random() * .55, 1 + Math.random() * 2, 25, true);
  }
}
function finale() {
  for (let i = 0; i < 18; i++) setTimeout(() => rocket(width * (.12 + Math.random() * .76), height * (.52 + Math.random() * .23), colors[i % colors.length], 100), i * 190);
  setTimeout(() => { for (let i = 0; i < 5; i++) setTimeout(() => burst(width * (.12 + i * .19), height * (.32 + Math.random() * .12), 180, colors, 280, 2.2, 45), i * 160); }, 1100);
  setTimeout(() => { $('replay').classList.remove('hidden'); sound('boom'); }, 4500);
}

function animate(timestamp) {
  requestAnimationFrame(animate);
  const dt = Math.min(.04, Math.max(.001, (timestamp - (lastFrame || timestamp)) / 1000)); lastFrame = timestamp;
  ctx.clearRect(0, 0, width, height);
  if (particles.length > 0) {
    for (let i = particles.length - 1; i >= 0; i--) {
      const p = particles[i]; p.life -= dt;
      if (p.life <= 0) { particles[i] = particles[particles.length - 1]; particles.pop(); continue; }
      p.px = p.x; p.py = p.y; p.vy += p.gravity * dt; p.vx *= .995; p.x += p.vx * dt; p.y += p.vy * dt;
      const alpha = clamp(p.life / p.max, 0, 1) * (p.twinkle ? (.64 + Math.sin(timestamp * .03 + p.x) * .35) : 1);
      ctx.globalAlpha = alpha; ctx.fillStyle = p.color; ctx.shadowColor = p.color; ctx.shadowBlur = p.size * 4;
      ctx.beginPath(); ctx.arc(p.x, p.y, p.size * (p.life < .25 ? p.life / .25 : 1), 0, Math.PI * 2); ctx.fill();
    }
    ctx.globalAlpha = 1; ctx.shadowBlur = 0;
  }
}
requestAnimationFrame(animate);

// Landmark indices use MediaPipe's 21 point hand topology. Webcam inference is
// throttled to 12.5fps; the canvas remains independently animated at display FPS.
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
  if (video.readyState >= 2 && now - lastDetect > 80) {
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
      cameraStream = await navigator.mediaDevices.getUserMedia({ audio: false, video: { facingMode: { ideal: 'user' }, width: { ideal: 720 }, height: { ideal: 960 }, frameRate: { ideal: 24, max: 30 } } });
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
    const vision = await FilesetResolver.forVisionTasks('https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.22/wasm');
    const trackerOptions = { baseOptions: { modelAssetPath: 'https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task', delegate: 'GPU' }, runningMode: 'VIDEO', numHands: 2, minHandDetectionConfidence: .55, minHandPresenceConfidence: .5, minTrackingConfidence: .5 };
    try { landmarker = await HandLandmarker.createFromOptions(vision, trackerOptions); }
    catch { trackerOptions.baseOptions.delegate = 'CPU'; landmarker = await HandLandmarker.createFromOptions(vision, trackerOptions); }
    running = true; $('statusText').textContent = 'Show me a gesture'; detectionLoop(performance.now());
  } catch (error) {
    // Camera is still usable when a CDN/model is unavailable; tapping the screen launches manual fireworks.
    $('statusText').textContent = 'Camera ready · tap to launch';
    showToast('Camera is on, but hand tracking could not load. Tap anywhere to launch fireworks.');
    $('replay').classList.remove('hidden');
  }
}
function showToast(msg) { ui.toast.textContent = msg; ui.toast.classList.remove('hidden'); clearTimeout(toastTimer); toastTimer = setTimeout(() => ui.toast.classList.add('hidden'), 4800); }

$('welcomeForm').addEventListener('submit', (event) => {
  event.preventDefault();
  const person = $('nameInput').value.trim(); if (!person) return;
  $('greetingTitle').textContent = `HAPPY DIWALI 2026, ${person.toUpperCase()} ✨`; ui.name.classList.remove('hidden'); ui.intro.classList.add('hidden'); ui.permission.classList.remove('hidden');
  audio ||= new (window.AudioContext || window.webkitAudioContext)();
});
$('cameraButton').addEventListener('click', startCamera);
$('skipCamera').addEventListener('click', () => { ui.permission.classList.add('hidden'); ui.live.classList.remove('hidden'); $('statusText').textContent = 'Tap to light the sky'; ui.replay.classList.remove('hidden'); });
$('replay').addEventListener('click', finale);
$('hintClose').addEventListener('click', () => ui.hint.classList.add('hidden'));
$('soundToggle').addEventListener('click', () => { soundOn = !soundOn; $('soundLabel').textContent = soundOn ? 'Sound on' : 'Sound off'; $('soundIcon').textContent = soundOn ? '♫' : '♪'; });
// A first burst makes the no-camera path interactive and gives the page a festive heartbeat.
let tapTimer = 0;
canvas.addEventListener('pointerdown', (e) => {
  if (ui.intro.classList.contains('hidden') && !ui.permission.classList.contains('hidden')) return;
  if (!running) { const now = performance.now(); if (now - tapTimer > 500) burst(e.clientX, e.clientY, 85, colors, 210, 1.8, 45); tapTimer = now; }
});
document.addEventListener('visibilitychange', () => { if (document.hidden && cameraStream) cameraStream.getTracks().forEach(t => t.enabled = false); else if (cameraStream) cameraStream.getTracks().forEach(t => t.enabled = true); });
window.addEventListener('pagehide', () => { running = false; cameraStream?.getTracks().forEach(t => t.stop()); landmarker?.close(); });
