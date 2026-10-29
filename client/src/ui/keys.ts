import type Phaser from 'phaser';

/**
 * Phaser re-dispatches its whole per-frame key queue on every new DOM key event, so keys
 * pressed within one frame would fire earlier handlers again. Act on each event only once.
 */
export function dedupe<E extends object>(fn: (e: E) => void): (e: E) => void {
  const seen = new WeakSet<E>();
  return (e) => {
    if (seen.has(e)) return;
    seen.add(e);
    fn(e);
  };
}

/** `keyboard.on(event, fn)` with duplicate key events filtered out. */
export function onKey(kb: Phaser.Input.Keyboard.KeyboardPlugin, event: string, fn: (e: KeyboardEvent) => void): void {
  kb.on(event, dedupe(fn));
}
