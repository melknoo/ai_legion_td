import Phaser from 'phaser';
import { installErrorReporting } from './errorReport.ts';
import { CANVAS_H, CANVAS_W } from './layout.ts';
import { BattleScene } from './scenes/BattleScene.ts';
import { BootScene } from './scenes/BootScene.ts';
import { LobbyScene } from './scenes/LobbyScene.ts';
import { TitleScene } from './scenes/TitleScene.ts';
import { UiScene } from './scenes/UiScene.ts';
import { installTouchShell } from './ui/touch.ts';

// The dev server has no /client-error next to the page; there the console is enough.
if (import.meta.env.PROD) installErrorReporting();

// Installable app (PWA): the service worker caches page and sprites, so solo games also run
// offline. Not in dev, where it would get in the way of Vite's hot reload.
if (import.meta.env.PROD && 'serviceWorker' in navigator) {
  window.addEventListener('load', () => void navigator.serviceWorker.register('/sw.js').catch(() => {}));
}
installTouchShell();

// Fill the window at the canvas aspect ratio; `image-rendering: pixelated` keeps the pixel art sharp
// at fractional zooms (some pixels end up one screen pixel wider, which is hard to notice).
const zoomFor = () => Math.min(window.innerWidth / CANVAS_W, window.innerHeight / CANVAS_H);

// Dev aid: `?timeout` drives the loop with setTimeout, which keeps running in occluded windows
// where browsers throttle requestAnimationFrame (e.g. automated browser testing).
const useTimeout = new URLSearchParams(location.search).has('timeout');

const game = new Phaser.Game({
  type: Phaser.WEBGL,
  ...(useTimeout ? { fps: { forceSetTimeOut: true, target: 30 } } : {}),
  parent: 'game',
  width: CANVAS_W,
  height: CANVAS_H,
  pixelArt: true,
  roundPixels: true,
  backgroundColor: '#0b0b18',
  scale: { mode: Phaser.Scale.NONE, zoom: zoomFor(), autoCenter: Phaser.Scale.CENTER_BOTH },
  scene: [BootScene, TitleScene, LobbyScene, BattleScene, UiScene],
});

window.addEventListener('resize', () => game.scale.setZoom(zoomFor()));

// Dev aid for debugging from the browser console.
if (import.meta.env.DEV) Object.assign(window, { __phaser: game });
