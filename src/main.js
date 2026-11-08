import './style.css';
import './mobile.css';
import './camera-fix.css';
import { VisionEngine } from './vision/visionEngine.ts';
import { FireworkDirector } from './fireworks/fireworkDirector.ts';

const $ = (id) => document.getElementById(id);
const canvas = $('stage');
const ctx = canvas.getContext('2d', { alpha: false, desynchronized: true });
const video = $('camera');
const app = $('app');
const ui = { intro: $('intro'), permission: $('permission'), live: $('liveStatus'), status: $('statusText'), hint: $('gestureHint'), name: $('celebrationName'), toast: $('toast') };
const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
let width = 0, height = 0, dpr = 1, lastFrame = 0, cameraStream, running = false;
let audio, audioBus, noiseBuffer, soundOn = true, vision, director, debugMode = false, creatorMode = false;
let videoFrameId = 0, fallbackDetectionTimer = 0, lastDetection = 0, finaleTimer = 0, toastTimer = 0, lastStatusGesture = '';
const soundTimes = Object.create(null);
const soundLabels = { ROCKET: 'Rocket', ANAR: 'Anar fountain', STARBURST: 'Starburst', ROMAN_CANDLE: 'Roman candle', PHOOLJHADI: 'Sparkler', GRAND_FINALE: 'Grand finale' };

function resize() {
  dpr = Math.min(window.devicePixelRatio || 1, 1.5);
  width = window.innerWidth;
  height = window.innerHeight;
  canvas.width = Math.round(width * dpr);
  canvas.height = Math.round(height * dpr);
  canvas.style.width = `${width}px`;
  canvas.style.height = `${height}px`;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
}
window.addEventListener('resize', resize, { passive: true });
resize();

function ensureAudio() {
  audio ||= new (window.AudioContext || window.webkitAudioContext)();
  if (!audioBus) {
    audioBus = audio.createGain();
    audioBus.connect(audio.destination);
  }
  if (audio.state === 'suspended') audio.resume().catch(() => {});
  return audio;
}

function makeNoiseBuffer() {
  const buffer = audio.createBuffer(1, audio.sampleRate, audio.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
  return buffer;
}

function sound(type, frequency = 500, intensity = 1) {
  if (!soundOn) return;
  const nowMs = performance.now();
  const minGap = type === 'fountain' ? 140 : type === 'crackle' ? 85 : 0;
  if (minGap && nowMs - (soundTimes[type] || 0) < minGap) return;
  soundTimes[type] = nowMs;
  try {
    ensureAudio();
    const now = audio.currentTime;
    const variation = .92 + Math.random() * .16;
    const duration = (.28 + Math.random() * .12) * variation;
    const gain = audio.createGain();
    gain.connect(audioBus);
    if (type === 'fountain' || type === 'crackle') {
      noiseBuffer ||= makeNoiseBuffer();
      const source = audio.createBufferSource();
      const filter = audio.createBiquadFilter();
      source.buffer = noiseBuffer;
      filter.type = 'bandpass';
      filter.frequency.value = (type === 'fountain' ? 1800 : 4200) * variation;
      filter.Q.value = type === 'fountain' ? .65 : 1.8;
      source.connect(filter);
      filter.connect(gain);
      gain.gain.setValueAtTime((type === 'fountain' ? .027 : .045) * intensity, now);
      gain.gain.exponentialRampToValueAtTime(.001, now + duration);
      source.start(now);
      source.stop(now + duration);
      return;
    }
    const osc = audio.createOscillator();
    osc.connect(gain);
    const base = type === 'rocket' ? 320 : frequency;
    osc.type = type === 'rocket' ? 'triangle' : 'sine';
    osc.frequency.setValueAtTime(base * variation, now);
    if (type === 'rocket') osc.frequency.exponentialRampToValueAtTime(1550 * variation, now + .46 * variation);
    else osc.frequency.exponentialRampToValueAtTime(45 * variation, now + duration * .75);
    gain.gain.setValueAtTime((type === 'rocket' ? .075 : .095) * intensity, now);
    gain.gain.exponentialRampToValueAtTime(.001, now + (type === 'rocket' ? .5 : duration));
    osc.start(now);
    osc.stop(now + Math.max(duration, .5));
  } catch { /* Audio is optional; gestures and fireworks continue if audio is unavailable. */ }
}

function connectProceduralAudio() {
  director.setSoundCallback((soundType, intensity = 1) => {
    if (soundType === 'ROCKET_LAUNCH') sound('rocket', 320, intensity);
    else if (soundType === 'EXPLOSION') sound('boom', 780, intensity);
    else if (soundType === 'ANAR_LOOP') sound('fountain', 1800, intensity);
    else if (soundType === 'SPARKLER_LOOP') sound('crackle', 4200, intensity);
    else if (soundType === 'ROMAN_POP') sound('boom', 620, intensity);
    else if (soundType === 'FINALE') sound('boom', 220, intensity);
  });
}

function drawCameraGlass() {
  ctx.globalCompositeOperation = 'source-over';
  ctx.filter = 'none';
  ctx.fillStyle = '#160f20';
  ctx.fillRect(0, 0, width, height);
  if (!cameraStream || video.readyState < 2 || !video.videoWidth || !video.videoHeight) return;

  const scale = Math.max(width / video.videoWidth, height / video.videoHeight);
  const drawWidth = video.videoWidth * scale;
  const drawHeight = video.videoHeight * scale;
  ctx.save();
  ctx.translate(width, 0);
  ctx.scale(-1, 1);
  ctx.filter = 'brightness(.82) contrast(1.04) saturate(.88)';
  ctx.drawImage(video, (width - drawWidth) / 2, (height - drawHeight) / 2, drawWidth, drawHeight);
  ctx.restore();
  ctx.filter = 'none';
  ctx.fillStyle = 'rgba(25, 13, 31, .26)';
  ctx.fillRect(0, 0, width, height);
}

function animate(timestamp) {
  requestAnimationFrame(animate);
  const dt = Math.min(.04, Math.max(.001, (timestamp - (lastFrame || timestamp)) / 1000));
  lastFrame = timestamp;
  drawCameraGlass();
  if (director) director.updateAndRender(dt, ctx);
  if (vision && debugMode) vision.drawDebugSkeleton(ctx);
}
requestAnimationFrame(animate);

function detectFrame(now) {
  if (!running) return;
  if (video.readyState >= 2 && now - lastDetection > 52 && vision?.isReady) {
    lastDetection = now;
    try {
      const gestures = vision.update(video, width, height);
      director.handleGestures(gestures, width, height);
      const gesture = gestures[0];
      if (gesture) {
        const label = soundLabels[gesture.type];
        if (label && gesture.type !== lastStatusGesture) ui.status.textContent = `✦ ${label}`;
        lastStatusGesture = gesture.type;
        ui.hint.classList.add('hidden');
        if (gesture.type === 'GRAND_FINALE') {
          $('grandFinale').classList.remove('hidden');
          clearTimeout(finaleTimer);
          finaleTimer = setTimeout(() => $('grandFinale').classList.add('hidden'), 4800);
        }
      } else {
        lastStatusGesture = '';
        ui.status.textContent = 'Show me a gesture';
      }
    } catch { /* A camera frame may briefly be unavailable during mobile camera transitions. */ }
  }
  if ('requestVideoFrameCallback' in video) videoFrameId = video.requestVideoFrameCallback(detectFrame);
  else fallbackDetectionTimer = window.setTimeout(() => detectFrame(performance.now()), 60);
}

async function startCamera() {
  $('cameraButton').disabled = true;
  $('cameraButton').textContent = 'STARTING CAMERA…';
  try {
    if (!navigator.mediaDevices?.getUserMedia) {
      const message = window.isSecureContext
        ? 'This browser does not provide camera access. Open the link in Safari or Chrome.'
        : 'Camera access requires HTTPS. Open the secure site link in your browser.';
      throw new Error(message);
    }
    try {
      cameraStream = await navigator.mediaDevices.getUserMedia({ audio: false, video: { facingMode: { ideal: 'user' }, width: { ideal: 640 }, height: { ideal: 480 }, frameRate: { ideal: 24, max: 30 } } });
    } catch (firstError) {
      try { cameraStream = await navigator.mediaDevices.getUserMedia({ audio: false, video: { facingMode: 'user' } }); }
      catch { throw firstError; }
    }
    video.srcObject = cameraStream;
    await video.play();
    app.classList.add('camera-on');
    ui.permission.classList.add('hidden');
    ui.live.classList.remove('hidden');
    ui.hint.classList.remove('hidden');
    ui.status.textContent = 'Loading hand tracking…';
    await vision.init();
    running = true;
    ui.status.textContent = 'Show me a gesture';
    detectFrame(performance.now());
  } catch (error) {
    cameraStream?.getTracks().forEach(track => track.stop());
    cameraStream = null;
    app.classList.remove('camera-on');
    const messages = {
      NotAllowedError: 'Camera permission is blocked. Allow camera access for this site in your browser settings, then retry.',
      NotFoundError: 'No camera was found on this device.',
      NotReadableError: 'The camera is busy in another app. Close it and try again.',
      SecurityError: 'This browser blocked camera access. Open the HTTPS link directly in Safari or Chrome.',
      OverconstrainedError: 'This camera could not use the requested settings. Try again to use its default settings.',
    };
    showToast(messages[error?.name] || `Camera or hand tracking could not start${error?.message ? `: ${error.message}` : '. Check permission and try again.'}`);
    $('cameraButton').disabled = false;
    $('cameraButton').innerHTML = 'TRY CAMERA AGAIN <span>↗</span>';
  }
}

function showToast(message) {
  ui.toast.textContent = message;
  ui.toast.classList.remove('hidden');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => ui.toast.classList.add('hidden'), 4800);
}

function syncKeyboardViewport() {
  const visualHeight = window.visualViewport?.height || window.innerHeight;
  document.documentElement.style.setProperty('--visual-height', `${visualHeight}px`);
  const editing = document.activeElement === nameInput;
  if (!editing) baselineViewportHeight = visualHeight;
  document.documentElement.classList.toggle('keyboard-open', editing && visualHeight < baselineViewportHeight * .82);
}

const nameInput = $('nameInput');
let baselineViewportHeight = window.visualViewport?.height || window.innerHeight;
nameInput.addEventListener('focus', syncKeyboardViewport);
nameInput.addEventListener('blur', () => setTimeout(syncKeyboardViewport, 120));
window.visualViewport?.addEventListener('resize', syncKeyboardViewport, { passive: true });
window.visualViewport?.addEventListener('scroll', syncKeyboardViewport, { passive: true });
window.addEventListener('resize', syncKeyboardViewport, { passive: true });
syncKeyboardViewport();

$('welcomeForm').addEventListener('submit', event => {
  event.preventDefault();
  const person = nameInput.value.trim();
  if (!person) return;
  $('greetingTitle').textContent = `HAPPY DIWALI 2026, ${person.toUpperCase()} ✨`;
  ui.name.classList.remove('hidden');
  ui.intro.classList.add('hidden');
  ui.permission.classList.remove('hidden');
  ensureAudio();
});
$('cameraButton').addEventListener('click', startCamera);
$('hintClose').addEventListener('click', () => ui.hint.classList.add('hidden'));
$('soundToggle').addEventListener('click', () => {
  soundOn = !soundOn;
  $('soundLabel').textContent = soundOn ? 'Sound on' : 'Muted';
  $('soundIcon').textContent = soundOn ? '♫' : '♪';
  if (soundOn) ensureAudio();
});
function toggleCreatorMode() {
  creatorMode = !creatorMode;
  app.classList.toggle('creator-mode', creatorMode);
  $('restoreHud').classList.toggle('hidden', !creatorMode);
}
function takePostcard() {
  const snap = document.createElement('canvas');
  snap.width = canvas.width;
  snap.height = canvas.height;
  const shot = snap.getContext('2d');
  shot.drawImage(canvas, 0, 0);
  shot.save();
  shot.scale(dpr, dpr);
  const gradient = shot.createLinearGradient(0, height - 110, 0, height);
  gradient.addColorStop(0, 'transparent');
  gradient.addColorStop(1, 'rgba(16,8,22,.74)');
  shot.fillStyle = gradient;
  shot.fillRect(0, height - 110, width, 110);
  shot.textAlign = 'center';
  shot.fillStyle = '#fff0c5';
  shot.shadowColor = '#ffb94c';
  shot.shadowBlur = 18;
  shot.font = `600 ${Math.max(24, Math.min(48, width * .055))}px Georgia, serif`;
  shot.fillText('✨ Happy Diwali 2026 ✨', width / 2, height - 54);
  shot.font = '600 12px Arial, sans-serif';
  shot.shadowBlur = 0;
  shot.fillStyle = '#ffd999';
  shot.fillText('FROM JAYANTH G', width / 2, height - 27);
  shot.restore();
  snap.toBlob(blob => {
    if (!blob) return showToast('Could not save the postcard in this browser.');
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = 'happy-diwali-2026.png';
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1500);
    showToast('Your Diwali postcard has been saved.');
  }, 'image/png');
}
$('postcardButton').addEventListener('click', takePostcard);
$('creatorToggle').addEventListener('click', toggleCreatorMode);
$('restoreHud').addEventListener('click', toggleCreatorMode);
$('debugToggle').addEventListener('click', () => {
  debugMode = !debugMode;
  if (vision) vision.showDebug = debugMode;
  $('debugToggle').classList.toggle('active', debugMode);
});
window.addEventListener('keydown', event => {
  if (event.target instanceof HTMLInputElement || event.target instanceof HTMLTextAreaElement) return;
  const key = event.key.toLowerCase();
  if (key === 'h') toggleCreatorMode();
  else if (key === 'd') {
    debugMode = !debugMode;
    if (vision) vision.showDebug = debugMode;
    $('debugToggle').classList.toggle('active', debugMode);
  } else if (key === 'm') $('soundToggle').click();
  else if (key === 's') takePostcard();
});

vision = new VisionEngine();
director = new FireworkDirector();
connectProceduralAudio();
document.addEventListener('visibilitychange', () => {
  if (document.hidden && cameraStream) cameraStream.getTracks().forEach(track => track.enabled = false);
  else if (cameraStream) cameraStream.getTracks().forEach(track => track.enabled = true);
});
window.addEventListener('pagehide', () => {
  running = false;
  if ('cancelVideoFrameCallback' in video && videoFrameId) video.cancelVideoFrameCallback(videoFrameId);
  clearTimeout(fallbackDetectionTimer);
  cameraStream?.getTracks().forEach(track => track.stop());
  vision?.close();
});
