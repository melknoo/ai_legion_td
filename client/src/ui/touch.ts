import type Phaser from 'phaser';

/** Primary input is a finger (phone, tablet): layout and tips adapt, mouse paths stay as they are. */
export const TOUCH = typeof matchMedia === 'function' && matchMedia('(pointer: coarse)').matches;

/** Holding a finger this long on a button shows its tooltip instead of pressing it. */
export const LONG_PRESS_MS = 350;

/**
 * Click and hover for an interactive HUD object. Mouse: hover on over/out, click on press.
 * Touch has no hover, so a short tap clicks (on release) and a long press shows the tooltip
 * while the finger rests; sliding off before release cancels.
 */
export function bindPress(
  target: Phaser.GameObjects.GameObject,
  o: { onClick: () => void; onHover?: (over: boolean) => void; onHighlight?: (on: boolean) => void },
): void {
  const scene = target.scene;
  let pending = false;
  let held = false;
  let timer: Phaser.Time.TimerEvent | null = null;
  const highlight = (on: boolean) => o.onHighlight?.(on);
  target
    .on('pointerover', (p: Phaser.Input.Pointer) => {
      if (p.wasTouch) return;
      highlight(true);
      o.onHover?.(true);
    })
    .on('pointerout', (p: Phaser.Input.Pointer) => {
      if (p.wasTouch) return;
      highlight(false);
      o.onHover?.(false);
    })
    .on('pointerdown', (p: Phaser.Input.Pointer, _x: number, _y: number, e: Phaser.Types.Input.EventData) => {
      e.stopPropagation();
      if (!p.wasTouch) return o.onClick();
      pending = true;
      held = false;
      highlight(true);
      timer?.remove();
      timer = scene.time.delayedCall(LONG_PRESS_MS, () => {
        held = true;
        o.onHover?.(true);
      });
      // Object-level pointerup runs before the scene-level one, so a release on the button clicks first.
      scene.input.once('pointerup', () => {
        // The click may have left the scene or torn the button down.
        if (!target.scene) return;
        timer?.remove();
        timer = null;
        pending = false;
        highlight(false);
        if (held) o.onHover?.(false);
        held = false;
      });
    })
    .on('pointerup', (p: Phaser.Input.Pointer) => {
      if (!p.wasTouch || !pending || held) return;
      pending = false;
      o.onClick();
    });
}

/**
 * Phones and tablets: go fullscreen and lock landscape on the first tap (browsers only allow
 * both from a user gesture). iOS supports neither; the portrait hint in index.html covers it.
 */
export function installTouchShell(): void {
  if (!TOUCH) return;
  const standalone = matchMedia('(display-mode: fullscreen), (display-mode: standalone)').matches;
  const enter = () => {
    const el = document.documentElement;
    const lock = () => (screen.orientation as ScreenOrientation & { lock?: (o: string) => Promise<void> }).lock?.('landscape').catch(() => {});
    if (standalone || document.fullscreenElement || !el.requestFullscreen) return void lock();
    el.requestFullscreen({ navigationUI: 'hide' }).then(lock, () => {});
  };
  window.addEventListener('pointerup', enter, { once: true });
}
