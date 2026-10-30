import type Phaser from 'phaser';
import type { FxKey, ProjKey, SoundKey } from '../assets/manifest.ts';
import { settings } from '../settings.ts';

/** Per-sound loudness, so frequent combat sounds sit under the rare important ones. */
const VOLUME: Partial<Record<SoundKey, number>> = {
  hit: 0.35, impact: 0.4, slash: 0.35, shoot: 0.3, magic: 0.35, fire: 0.35, water: 0.35, grass: 0.35,
  explosion: 0.45, death: 0.3, coin: 0.4, click: 0.5,
};

/** The same sound at most this often (ms); a 4v4 brawl fires dozens of attacks per second. */
const MIN_GAP_MS = 70;
/** Sounds playing at once, over all keys. */
const MAX_VOICES = 8;

const lastPlayed = new Map<SoundKey, number>();

/** Plays a sound effect unless muted or the same one just played. */
export function sfx(scene: Phaser.Scene, key: SoundKey, volume = 1): void {
  const s = settings();
  if (!s.sound || s.volume <= 0 || scene.sound.getAllPlaying().length >= MAX_VOICES) return;
  const now = performance.now();
  if (now - (lastPlayed.get(key) ?? -Infinity) < MIN_GAP_MS) return;
  if (!scene.cache.audio.exists(key)) return;
  lastPlayed.set(key, now);
  // play() adds a one-shot sound that removes itself when done.
  scene.sound.play(key, { volume: s.volume * (VOLUME[key] ?? 0.7) * volume });
}

/** The sound a hit or landing effect makes. */
export const FX_SOUND: Partial<Record<FxKey, SoundKey>> = {
  cut: 'hit', cutx: 'slash', slash: 'slash', claw: 'slash', clawdouble: 'slash', cutdouble: 'slash', slashcurved: 'slash',
  explosion: 'explosion', rock: 'impact', rockspike: 'impact', water: 'water', waterpillar: 'water', ice: 'water', frost: 'water',
  plant: 'grass', spirit: 'magic', magic: 'magic', holy: 'magic', spark: 'magic', thunder: 'stun', flame: 'fire',
};

/** The sound of a ranged attack leaving. */
export const SHOT_SOUND: Record<ProjKey | 'arrow' | 'kunai', SoundKey> = {
  arrow: 'shoot', kunai: 'shoot', shuriken: 'shoot', plantspike: 'shoot', icespike: 'water',
  energy: 'magic', fireball: 'fire', cannon: 'explosion', rock: 'impact',
};
