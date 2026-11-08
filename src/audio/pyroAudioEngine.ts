/**
 * Authentic Pyrotechnics Audio Engine
 * Loads and plays real recorded Diwali firecracker samples with zero latency,
 * pitch randomization, smooth looping, and heavy aerial blast synthesis.
 */

export class PyroAudioEngine {
  private ctx: AudioContext | null = null;
  private masterGain: GainNode | null = null;
  public isMuted: boolean = false;
  private isUnlocked: boolean = false;
  private watchdogTimer: number | null = null;
  private preloadPromise: Promise<void> | null = null;

  // Decoded Audio Buffers
  private buffers: Map<string, AudioBuffer> = new Map();

  // Active continuous loop source nodes
  private anarLoopSource: AudioBufferSourceNode | null = null;
  private anarGain: GainNode | null = null;
  private anarActive: boolean = false;

  private sparklerLoopSource: AudioBufferSourceNode | null = null;
  private sparklerGain: GainNode | null = null;
  private sparklerActive: boolean = false;

  private lastAnarPulse: number = 0;
  private lastSparklerPulse: number = 0;

  constructor() {
    // Lazy AudioContext initialization
  }

  public unlock(): void {
    if (this.isUnlocked && this.ctx) {
      if (this.ctx.state === 'suspended') {
        this.ctx.resume().catch(() => {});
      }
      return;
    }

    try {
      const AudioCtx =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      this.ctx = new AudioCtx();
      this.masterGain = this.ctx.createGain();
      this.masterGain.gain.value = this.isMuted ? 0 : 0.95;

      this.masterGain.connect(this.ctx.destination);

      this.isUnlocked = true;

      // Load all authentic audio samples
      this.preloadPromise = this.preloadSamples();

      // Start continuous loop watchdog
      this.watchdogTimer = window.setInterval(() => this.watchdog(), 80);
    } catch (e) {
      console.warn('AudioContext unlock failed:', e);
    }
  }

  public ready(): Promise<void> {
    this.unlock();
    return this.preloadPromise || Promise.resolve();
  }

  private async preloadSamples(): Promise<void> {
    if (!this.ctx) return;

    const files: Record<string, string> = {
      ROCKET_WHISTLE: 'rocket-whistle.mp3',
      ROCKET_EXPLOSION: 'rocket-explosion.mp3',
      STARBURST: 'starburst.mp3',
      HEAVY_EXPLOSION: 'heavy-explosion-hit.mp3',
      THUNDER_CRACK: 'thunder-crack.mp3',
      AERIAL_BURST: 'aerial-shell-burst.mp3',
      ROMAN_POP: 'roman-pop.mp3',
      ANAR: 'anar-fountain.mp3',
      SPARKLER: 'sparkler.mp3',
      FINALE: 'finale-barrage.mp3',
      CHAKRI: 'chakri-spin.mp3'
    };

    const ctx = this.ctx;
    const base = `${import.meta.env.BASE_URL}audio/`;
    await Promise.all(Object.entries(files).map(async ([key, filename]) => {
      const url = `${base}${filename}`;
      try {
        const response = await fetch(url);
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        const audioBuffer = await ctx.decodeAudioData(await response.arrayBuffer());
        this.buffers.set(key, audioBuffer);
      } catch (error) {
        console.warn(`Failed to preload firework sound ${filename}:`, error);
      }
    }));
  }

  public toggleMute(): boolean {
    this.isMuted = !this.isMuted;
    if (this.masterGain && this.ctx) {
      this.masterGain.gain.setTargetAtTime(this.isMuted ? 0 : 0.95, this.ctx.currentTime, 0.05);
    }
    return this.isMuted;
  }

  public stopAnarLoop(): void {
    if (!this.ctx) return;
    this.anarGain?.gain.setTargetAtTime(0, this.ctx.currentTime, 0.04);
    this.stopSource(this.anarLoopSource);
    this.anarLoopSource = null;
    this.anarGain = null;
    this.anarActive = false;
    this.lastAnarPulse = 0;
  }

  public stopSparklerLoop(): void {
    if (!this.ctx) return;
    this.sparklerGain?.gain.setTargetAtTime(0, this.ctx.currentTime, 0.04);
    this.stopSource(this.sparklerLoopSource);
    this.sparklerLoopSource = null;
    this.sparklerGain = null;
    this.sparklerActive = false;
    this.lastSparklerPulse = 0;
  }

  /**
   * Plays a one-shot sample with randomized pitch (±4%)
   */
  private playSample(key: string, volume: number = 1.0, pitchVariation: number = 0.06): void {
    if (!this.ctx || !this.masterGain || this.isMuted) return;

    const buffer = this.buffers.get(key);
    if (!buffer) return;

    const source = this.ctx.createBufferSource();
    source.buffer = buffer;

    // Pitch randomization
    const rate = 1.0 + (Math.random() - 0.5) * pitchVariation * 2;
    source.playbackRate.value = rate;

    const gain = this.ctx.createGain();
    gain.gain.value = volume;

    source.connect(gain);
    gain.connect(this.masterGain);

    source.start();
  }

  /**
   * 1. Rocket Launch Whistle
   */
  public playRocketLaunch(): void {
    this.playSample('ROCKET_WHISTLE', 0.95, 0.05);
  }

  /**
   * 2. Rocket / Shell / Starburst Explosion
   * Powerful, layered aerial bomb burst with deep sub-bass punch
   */
  public playExplosion(intensity: number = 1.0): void {
    if (!this.ctx || !this.masterGain || this.isMuted) return;

    // Layer 1: Heavy Concussive Bomb Hit
    this.playSample('HEAVY_EXPLOSION', Math.min(1.0, 0.95 * intensity), 0.07);

    // Layer 2: Aerial Shell Crack & Sizzling Debris
    this.playSample('AERIAL_BURST', Math.min(1.0, 0.85 * intensity), 0.05);

    // Layer 3: Sub-Bass Sine Drop for physical chest rumble
    try {
      const now = this.ctx.currentTime;
      const osc = this.ctx.createOscillator();
      const oscGain = this.ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(115, now);
      osc.frequency.exponentialRampToValueAtTime(26, now + 0.65);

      oscGain.gain.setValueAtTime(0.7 * intensity, now);
      oscGain.gain.exponentialRampToValueAtTime(0.001, now + 0.7);

      osc.connect(oscGain);
      oscGain.connect(this.masterGain);
      osc.start(now);
      osc.stop(now + 0.75);
    } catch {
      // Ignore sub-bass if context busy
    }
  }

  /**
   * 3. Roman Candle Pop
   */
  public playRomanPop(): void {
    this.playSample('ROMAN_POP', 0.85, 0.08);
  }

  public playHeartBurst(): void {
    this.playSample('STARBURST', 0.92, 0.035);
    this.playSample('THUNDER_CRACK', 0.5, 0.055);
  }

  /**
   * 4. Grand Finale Multi-Burst
   */
  public playFinaleBarrage(): void {
    this.playSample('FINALE', 1.0, 0.04);
  }

  /**
   * 5. Continuous Anar Fountain Roar
   */
  public pulseAnarLoop(): void {
    this.lastAnarPulse = performance.now();
    if (!this.ctx || !this.masterGain || this.isMuted) return;

    if (!this.anarActive) {
      this.startContinuousSample('ANAR', (src, gain) => {
        this.anarLoopSource = src;
        this.anarGain = gain;
        this.anarActive = true;
      });
    } else if (this.anarGain) {
      this.anarGain.gain.setTargetAtTime(0.9, this.ctx.currentTime, 0.05);
    }
  }

  /**
   * 6. Continuous Sparkler Crackle
   */
  public pulseSparklerLoop(): void {
    this.lastSparklerPulse = performance.now();
    if (!this.ctx || !this.masterGain || this.isMuted) return;

    if (!this.sparklerActive) {
      this.startContinuousSample('SPARKLER', (src, gain) => {
        this.sparklerLoopSource = src;
        this.sparklerGain = gain;
        this.sparklerActive = true;
      });
    } else if (this.sparklerGain) {
      this.sparklerGain.gain.setTargetAtTime(0.8, this.ctx.currentTime, 0.05);
    }
  }

  private startContinuousSample(
    key: string,
    callback: (src: AudioBufferSourceNode, gain: GainNode) => void
  ): void {
    if (!this.ctx || !this.masterGain) return;
    const buffer = this.buffers.get(key);
    if (!buffer) return;

    const source = this.ctx.createBufferSource();
    source.buffer = buffer;
    source.loop = true;

    const gain = this.ctx.createGain();
    gain.gain.setValueAtTime(0.01, this.ctx.currentTime);
    gain.gain.linearRampToValueAtTime(0.85, this.ctx.currentTime + 0.1);

    source.connect(gain);
    gain.connect(this.masterGain);
    source.start();

    callback(source, gain);
  }

  private watchdog(): void {
    if (!this.ctx) return;
    const now = performance.now();

    if (this.anarActive && now - this.lastAnarPulse > 150) {
      if (this.anarGain) {
        this.anarGain.gain.setTargetAtTime(0, this.ctx.currentTime, 0.1);
      }
      if (now - this.lastAnarPulse > 300) {
        this.stopSource(this.anarLoopSource);
        this.anarLoopSource = null;
        this.anarGain = null;
        this.anarActive = false;
      }
    }

    if (this.sparklerActive && now - this.lastSparklerPulse > 150) {
      if (this.sparklerGain) {
        this.sparklerGain.gain.setTargetAtTime(0, this.ctx.currentTime, 0.1);
      }
      if (now - this.lastSparklerPulse > 300) {
        this.stopSource(this.sparklerLoopSource);
        this.sparklerLoopSource = null;
        this.sparklerGain = null;
        this.sparklerActive = false;
      }
    }
  }

  private stopSource(src: AudioBufferSourceNode | null): void {
    if (!src) return;
    try {
      src.stop();
      src.disconnect();
    } catch {
      // Ignore if already stopped
    }
  }

  public close(): void {
    if (this.watchdogTimer !== null) window.clearInterval(this.watchdogTimer);
    this.watchdogTimer = null;
    this.stopAnarLoop();
    this.stopSparklerLoop();
    this.ctx?.close().catch(() => {});
    this.ctx = null;
    this.masterGain = null;
    this.isUnlocked = false;
  }
}
