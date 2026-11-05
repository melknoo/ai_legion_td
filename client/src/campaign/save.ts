import { parseRun, type RunState } from '@legion/shared';

/**
 * The campaign's autosave: one run in localStorage (also persists in the desktop app, whose origin
 * is fixed). Saved on every run change and when a node starts, so a reload resumes at the node start.
 * Profile slots (M2) will replace this single key.
 */
const KEY = 'legion.campaign.run';

export type SaveRead = { run: RunState } | { run: null; broken: boolean };

export function loadRun(): SaveRead {
  let raw: string | null = null;
  try {
    raw = localStorage.getItem(KEY);
  } catch {
    return { run: null, broken: false };
  }
  if (raw === null) return { run: null, broken: false };
  const run = parseRun(raw);
  return run ? { run } : { run: null, broken: true };
}

export function saveRun(run: RunState): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(run));
  } catch {
    // Storage full or blocked: the run goes on, it just won't survive a reload.
  }
}

export function clearRun(): void {
  try {
    localStorage.removeItem(KEY);
  } catch {
    // Nothing to do.
  }
}
