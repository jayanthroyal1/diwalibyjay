import { ParticlePool } from '../particles/particle';
import { FireworkEffect, SoundTriggerCallback } from './fireworkTypes';
import { COLORS } from './fireworkColors';

/** A twin-layer, heart-shaped aerial shell for the Korean finger-heart pose. */
export class HeartBurst implements FireworkEffect {
  public active = true;
  private emitted = false;
  private elapsed = 0;

  constructor(private x: number, private y: number, private onSound?: SoundTriggerCallback) {
    this.onSound?.('HEART_BURST');
  }

  public update(dt: number, pool: ParticlePool): void {
    if (this.emitted) {
      this.elapsed += dt;
      if (this.elapsed > 0.05) this.active = false;
      return;
    }
    this.emitted = true;
    pool.addFlash(this.x, this.y, 420, COLORS.MAGENTA, 0.78);

    const outline = 150;
    for (let i = 0; i < outline; i++) {
      const t = (i / outline) * Math.PI * 2;
      const hx = 16 * Math.pow(Math.sin(t), 3);
      const hy = -(13 * Math.cos(t) - 5 * Math.cos(2 * t) - 2 * Math.cos(3 * t) - Math.cos(4 * t));
      const color = i % 5 === 0 ? COLORS.WHITE_HOT : i % 2 === 0 ? COLORS.MAGENTA : COLORS.CRIMSON;
      pool.spawn({
        x: this.x, y: this.y,
        vx: hx * 11.2, vy: hy * 11.2,
        color, fadeColor: i % 3 === 0 ? COLORS.GOLD : COLORS.PURPLE,
        size: 3.6, life: 1.15 + Math.random() * 0.35,
        drag: 0.978, gravity: 0.055, flicker: true, crackle: i % 7 === 0
      });
    }

    const inner = 85;
    for (let i = 0; i < inner; i++) {
      const t = (i / inner) * Math.PI * 2;
      const hx = 16 * Math.pow(Math.sin(t), 3) * 0.56;
      const hy = -(13 * Math.cos(t) - 5 * Math.cos(2 * t) - 2 * Math.cos(3 * t) - Math.cos(4 * t)) * 0.56;
      pool.spawn({
        x: this.x, y: this.y,
        vx: hx * 9, vy: hy * 9,
        color: i % 3 === 0 ? COLORS.WHITE_HOT : COLORS.GOLD,
        fadeColor: COLORS.MAGENTA, size: 2.4,
        life: 0.8 + Math.random() * 0.3, drag: 0.974,
        gravity: 0.035, flicker: true
      });
    }
  }
}
