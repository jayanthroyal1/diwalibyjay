import './style.css';
import './mobile.css';
import './camera-fix.css';
import { VisionEngine } from './vision/visionEngine.ts';
import { FireworkDirector } from './fireworks/fireworkDirector.ts';
import { PyroAudioEngine } from './audio/pyroAudioEngine.ts';

const $ = (id) => document.getElementById(id);
const canvas = $('stage');
const ctx = canvas.getContext('2d', { alpha: true, desynchronized: true });
const video = $('camera');
const app = $('app');
const ui = { intro: $('intro'), permission: $('permission'), live: $('liveStatus'), status: $('statusText'), hint: $('gestureHint'), name: $('celebrationName'), toast: $('toast') };
let width = 0, height = 0, dpr = 1, lastFrame = 0, cameraStream, running = false;
let soundOn = true, audioEngine, vision, director, debugMode = false, creatorMode = false;
let videoFrameId = 0, renderFrameId = 0, fallbackDetectionTimer = 0, lastDetection = 0, finaleTimer = 0, toastTimer = 0, lastStatusGesture = '';
let effectsPainted = false;
const soundLabels = { ROCKET: 'Rocket', ANAR: 'Anar fountain', STARBURST: 'Starburst', ROMAN_CANDLE: 'Roman candle', PHOOLJHADI: 'Sparkler', FINGER_HEART: 'Heart burst', GRAND_FINALE: 'Grand finale' };

function resize() {
  dpr = Math.min(window.devicePixelRatio || 1, window.innerWidth < 700 ? 1 : 1.35);
  width = window.visualViewport?.width || window.innerWidth;
  height = window.visualViewport?.height || window.innerHeight;
  canvas.width = Math.round(width * dpr);
  canvas.height = Math.round(height * dpr);
  canvas.style.width = `${width}px`;
  canvas.style.height = `${height}px`;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
}
window.addEventListener('resize', resize, { passive: true });
window.visualViewport?.addEventListener('resize', resize, { passive: true });
resize();

function connectSampleAudio() {
  director.setSoundCallback((soundType, intensity = 1) => {
    if (!soundOn) return;
    if (soundType === 'ROCKET_LAUNCH') audioEngine.playRocketLaunch();
    else if (soundType === 'EXPLOSION') audioEngine.playExplosion(intensity);
    else if (soundType === 'HEART_BURST') audioEngine.playHeartBurst();
    else if (soundType === 'ANAR_LOOP') audioEngine.pulseAnarLoop();
    else if (soundType === 'ANAR_STOP') audioEngine.stopAnarLoop();
    else if (soundType === 'SPARKLER_LOOP') audioEngine.pulseSparklerLoop();
    else if (soundType === 'SPARKLER_STOP') audioEngine.stopSparklerLoop();
    else if (soundType === 'ROMAN_POP') audioEngine.playRomanPop();
    else if (soundType === 'FINALE') audioEngine.playFinaleBarrage();
  });
}
function wakeRenderer() {
  if (!renderFrameId) {
    lastFrame = 0;
    renderFrameId = requestAnimationFrame(animate);
  }
}

function animate(timestamp) {
  renderFrameId = 0;
  if (!director?.hasActiveEffects && !debugMode) {
    if (effectsPainted) {
      ctx.clearRect(0, 0, width, height);
      effectsPainted = false;
    }
    return;
  }
  if (lastFrame && timestamp - lastFrame < 15.5) {
    renderFrameId = requestAnimationFrame(animate);
    return;
  }
  const dt = Math.min(.04, Math.max(.001, (timestamp - (lastFrame || timestamp)) / 1000));
  lastFrame = timestamp;
  ctx.clearRect(0, 0, width, height);
  if (director) director.updateAndRender(dt, ctx);
  if (vision && debugMode) vision.drawDebugSkeleton(ctx);
  effectsPainted = true;
  renderFrameId = requestAnimationFrame(animate);
}

function detectFrame(now) {
  if (!running) return;
  if (video.readyState >= 2 && now - lastDetection > 52 && vision?.isReady) {
    lastDetection = now;
    try {
      const gestures = vision.update(video, width, height);
      director.handleGestures(gestures, width, height);
      if (gestures.length) wakeRenderer();
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
  audioEngine.unlock();
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
    await Promise.all([vision.init(), audioEngine.ready()]);
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
  audioEngine.unlock();
});
$('cameraButton').addEventListener('click', startCamera);
$('hintClose').addEventListener('click', () => ui.hint.classList.add('hidden'));
$('soundToggle').addEventListener('click', () => {
  soundOn = !soundOn;
  $('soundLabel').textContent = soundOn ? 'Sound on' : 'Muted';
  $('soundIcon').textContent = soundOn ? '♫' : '♪';
  audioEngine.toggleMute();
  if (soundOn) audioEngine.unlock();
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
  shot.fillStyle = '#160f20';
  shot.fillRect(0, 0, snap.width, snap.height);
  if (cameraStream && video.readyState >= 2 && video.videoWidth) {
    const scale = Math.max(snap.width / video.videoWidth, snap.height / video.videoHeight);
    const drawWidth = video.videoWidth * scale;
    const drawHeight = video.videoHeight * scale;
    shot.save();
    shot.globalAlpha = .78;
    shot.translate(snap.width, 0);
    shot.scale(-1, 1);
    shot.drawImage(video, (snap.width - drawWidth) / 2, (snap.height - drawHeight) / 2, drawWidth, drawHeight);
    shot.restore();
  }
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
  if (debugMode) wakeRenderer();
});
window.addEventListener('keydown', event => {
  if (event.target instanceof HTMLInputElement || event.target instanceof HTMLTextAreaElement) return;
  const key = event.key.toLowerCase();
  if (key === 'h') toggleCreatorMode();
  else if (key === 'd') {
    debugMode = !debugMode;
    if (vision) vision.showDebug = debugMode;
    $('debugToggle').classList.toggle('active', debugMode);
    if (debugMode) wakeRenderer();
  } else if (key === 'm') $('soundToggle').click();
  else if (key === 's') takePostcard();
});

vision = new VisionEngine();
director = new FireworkDirector();
audioEngine = new PyroAudioEngine();
connectSampleAudio();
document.addEventListener('visibilitychange', () => {
  if (document.hidden) {
    running = false;
    cameraStream?.getTracks().forEach(track => track.enabled = false);
    if ('cancelVideoFrameCallback' in video && videoFrameId) video.cancelVideoFrameCallback(videoFrameId);
    clearTimeout(fallbackDetectionTimer);
    audioEngine.stopAnarLoop();
    audioEngine.stopSparklerLoop();
    director.clear();
    if (renderFrameId) cancelAnimationFrame(renderFrameId);
    renderFrameId = 0;
    ctx.clearRect(0, 0, width, height);
    effectsPainted = false;
  } else if (cameraStream) {
    cameraStream.getTracks().forEach(track => track.enabled = true);
    running = true;
    detectFrame(performance.now());
  }
});
window.addEventListener('pagehide', () => {
  running = false;
  if ('cancelVideoFrameCallback' in video && videoFrameId) video.cancelVideoFrameCallback(videoFrameId);
  clearTimeout(fallbackDetectionTimer);
  if (renderFrameId) cancelAnimationFrame(renderFrameId);
  cameraStream?.getTracks().forEach(track => track.stop());
  vision?.close();
  audioEngine?.close();
});
