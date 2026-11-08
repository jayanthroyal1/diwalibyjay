import { ParticlePool } from '../particles/particle';

export interface FireworkEffect {
  active: boolean;
  update(dt: number, pool: ParticlePool): void;
}

export type SoundTriggerCallback = (
  soundType: 'ROCKET_LAUNCH' | 'EXPLOSION' | 'HEART_BURST' | 'ANAR_LOOP' | 'ANAR_STOP' | 'SPARKLER_LOOP' | 'SPARKLER_STOP' | 'ROMAN_POP' | 'FINALE',
  intensity?: number
) => void;
