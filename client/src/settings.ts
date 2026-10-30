/** Player settings, kept per browser. */
export interface Settings {
  sound: boolean;
  /** Effects volume 0..1. */
  volume: number;
  shake: boolean;
}

const KEY = 'legion.settings';
const DEFAULTS: Settings = { sound: true, volume: 0.6, shake: true };

let current: Settings | null = null;

export function settings(): Settings {
  if (!current) {
    try {
      current = { ...DEFAULTS, ...JSON.parse(localStorage.getItem(KEY) ?? '{}') };
    } catch {
      current = { ...DEFAULTS };
    }
  }
  return current!;
}

export function updateSettings(change: Partial<Settings>): void {
  current = { ...settings(), ...change };
  try {
    localStorage.setItem(KEY, JSON.stringify(current));
  } catch {
    // Storage may be unavailable (private mode); the choice then lasts for this page only.
  }
}
