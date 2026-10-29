import Phaser from 'phaser';
import { CANVAS_H, CANVAS_W } from './layout.ts';
import { BattleScene } from './scenes/BattleScene.ts';
import { BootScene } from './scenes/BootScene.ts';
import { LobbyScene } from './scenes/LobbyScene.ts';
import { TitleScene } from './scenes/TitleScene.ts';
import { UiScene } from './scenes/UiScene.ts';

// Integer zoom keeps every pixel square; only windows smaller than the canvas scale down.
const zoomFor = () => {
  const fit = Math.min(window.innerWidth / CANVAS_W, window.innerHeight / CANVAS_H);
  return fit >= 1 ? Math.floor(fit) : fit;
};

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
