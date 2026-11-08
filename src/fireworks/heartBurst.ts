import { ParticlePool } from '../particles/particle';
import { FireworkEffect, SoundTriggerCallback } from './fireworkTypes';
import { COLORS } from './fireworkColors';

/** Launches from the finger-heart pose, then breaks into a bright heart shell. */
export class HeartBurst implements FireworkEffect {
  public active = true;
  private x: number;
  private y: number;
  private readonly targetY: number;
  private vx = (Math.random() - 0.5) * 1.4;
  private vy = -18;
  private trailTimer = 0;
  private exploded = false;
  private elapsed = 0;

  constructor(startX: number, startY: number, screenHeight: number, private onSound?: SoundTriggerCallback) {
    this.x = startX;
    this.y = startY;
    this.targetY = Math.max(54, startY - screenHeight * (0.25 + Math.random() * 0.06));
    this.onSound?.('ROCKET_LAUNCH');
  }

  public update(dt: number, pool: ParticlePool): void {
    if (this.exploded) {
      this.elapsed += dt;
      if (this.elapsed > 0.04) this.active = false;
      return;
    }

    // The rocket starts at the fingertips and climbs toward the upper sky.
    const frame = Math.min(2.4, dt * 60);
    this.x += this.vx * frame;
    this.y += this.vy * frame;
    this.vy += 0.24 * frame;
    this.trailTimer += dt;
    while (this.trailTimer >= 0.022) {
      this.trailTimer -= 0.022;
      for (let i = 0; i < 3; i++) {
        pool.spawn({
          x: this.x + (Math.random() - 0.5) * 5,
          y: this.y + (Math.random() - 0.5) * 5,
          vx: (Math.random() - 0.5) * 2.2,
          vy: Math.random() * 4 + 1.6,
          color: i === 0 ? COLORS.WHITE_HOT : COLORS.GOLD,
          fadeColor: COLORS.DEEP_ORANGE,
          size: 2.4 + Math.random(), life: 0.42 + Math.random() * 0.2,
          drag: 0.94, gravity: 0.12, flicker: true
        });
      }
    }
    pool.spawn({
      x: this.x, y: this.y, vx: 0, vy: 0,
      color: COLORS.WHITE_HOT, fadeColor: COLORS.GOLD,
      size: 5.8, life: 0.08, drag: 0.9, gravity: 0
    });

    if (this.y <= this.targetY || this.vy >= -1) this.detonate(pool);
  }

  private detonate(pool: ParticlePool): void {
    this.exploded = true;
    this.onSound?.('HEART_BURST');
    pool.addFlash(this.x, this.y, 440, COLORS.MAGENTA, 0.82);

    const launchHeart = (scale: number, count: number, size: number, life: number): void => {
      for (let i = 0; i < count; i++) {
        const t = (i / count) * Math.PI * 2;
        const heartX = 16 * Math.pow(Math.sin(t), 3) * scale;
        const heartY = -(13 * Math.cos(t) - 5 * Math.cos(2 * t) - 2 * Math.cos(3 * t) - Math.cos(4 * t)) * scale;
        const color = i % 7 === 0 ? COLORS.WHITE_HOT : i % 2 === 0 ? COLORS.MAGENTA : COLORS.CRIMSON;
        pool.spawn({
          x: this.x, y: this.y,
          vx: heartX * 11.2, vy: heartY * 11.2,
          color, fadeColor: i % 3 === 0 ? COLORS.GOLD : COLORS.PURPLE,
          size, life: life + Math.random() * 0.28,
          drag: 0.978, gravity: 0.055, flicker: true,
          crackle: scale > 0.8 && i % 9 === 0
        });
      }
    };

    launchHeart(1, 160, 3.5, 1.1);
    launchHeart(0.54, 92, 2.2, 0.78);
  }
}
