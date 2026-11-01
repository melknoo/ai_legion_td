import Phaser from 'phaser';
import type { GameView } from '@legion/shared';
import { CANVAS_W } from '../layout.ts';
import { FONT } from '../scenes/BootScene.ts';
import { ClipRecorder } from './recorder.ts';

/** Battlefield band of the 1080x1920 showcase canvas (canvas px): one lane at 8x, captions above and below. */
export const SHOWCASE_FIELD = { top: 560, height: 832, zoom: 8, buildSpeed: 6 } as const;
/** Captions are laid out at 540x960 and drawn 2x, like the HUD. */
const CAPTION_ZOOM = 2;
const W = CANVAS_W / CAPTION_ZOOM;
/** A clip never runs longer than a Short should. */
const MAX_CLIP_MS = 58_000;
/** Footage kept after the wave ends, so the clip doesn't stop mid-celebration. */
const TAIL_MS = 1500;
const URL_TEXT = 'LEGION.SCHLEIWEB.DE';

export interface ShowcaseParams {
  seed: number;
  /** Wave to start at (played ahead without rendering). */
  wave: number;
  /** Area shown (lane index = player index). */
  lane: number;
  /** Hook caption at the top. */
  title: string;
  /** Record the first fight automatically and download it. */
  rec: boolean;
}

/**
 * `?showcase&seed=42&wave=10&lane=0&title=CAN+THIS+BUILD+HOLD%3F&rec` (plus the solo
 * params `builder`, `vs`, `size`, `mode`): a bot-only game for Shorts clips.
 */
export function showcaseParams(): ShowcaseParams {
  const p = new URLSearchParams(location.search);
  const int = (key: string, fallback: number) => (Number.isInteger(Number(p.get(key))) && p.get(key) ? Number(p.get(key)) : fallback);
  return {
    seed: int('seed', 1),
    wave: Math.max(1, int('wave', 1)),
    lane: Math.max(0, int('lane', 0)),
    title: (p.get('title') ?? '').toUpperCase(),
    rec: p.has('rec'),
  };
}

/**
 * Captions over the showcase battlefield (hook, wave, builder, URL) and the clip recorder:
 * `?rec` records the first fight, `P` starts/stops by hand. The page body carries
 * `data-clip="recording|saved"` so automation can wait for the download.
 */
export class ShowcaseScene extends Phaser.Scene {
  private view!: GameView;
  /** Wave of the clip being recorded. */
  private recWave = 0;
  private params!: ShowcaseParams;
  private info!: Phaser.GameObjects.BitmapText;
  private recorder: ClipRecorder | null = null;
  private recStartedAt = 0;
  private stopAt = 0;
  private autoDone = false;

  constructor() {
    super('showcase');
  }

  create(data: { game: GameView }): void {
    this.view = data.game;
    this.params = showcaseParams();
    this.cameras.main.setOrigin(0, 0).setZoom(CAPTION_ZOOM);
    const top = SHOWCASE_FIELD.top / CAPTION_ZOOM;
    const height = SHOWCASE_FIELD.height / CAPTION_ZOOM;
    const center = W / 2;
    if (this.params.title) {
      this.add
        .bitmapText(center, top / 2, FONT, this.params.title)
        .setOrigin(0.5)
        .setScale(4)
        // The wrap width counts scaled pixels.
        .setMaxWidth(W - 40)
        .setCenterAlign()
        .setTint(0xffd060);
    }
    this.info = this.add.bitmapText(center, top + height + 20, FONT, '').setOrigin(0.5, 0).setScale(3).setCenterAlign();
    this.add.bitmapText(center, top + height + 100, FONT, 'PLAY FREE IN YOUR BROWSER').setOrigin(0.5, 0).setScale(2).setTint(0x9aa0d0);
    this.add.bitmapText(center, top + height + 124, FONT, URL_TEXT).setOrigin(0.5, 0).setScale(3).setTint(0xe8e8f0);
    this.input.keyboard?.on('keydown-P', () => (this.recorder ? this.stopRecording() : this.startRecording()));
  }

  override update(time: number): void {
    const g = this.view;
    const owner = g.players[this.params.lane];
    const builder = owner ? g.data.builders[owner.builder]?.name.toUpperCase() : '';
    const boss = g.wave % 10 === 0 ? ' - BOSS' : '';
    this.info.setText(`WAVE ${g.wave}${boss}\n${builder ?? ''}`);

    if (this.params.rec && !this.autoDone && !this.recorder && g.phase === 'fight') this.startRecording();
    if (!this.recorder) return;
    if (!this.stopAt && (g.phase !== 'fight' || time - this.recStartedAt > MAX_CLIP_MS - TAIL_MS)) this.stopAt = time + TAIL_MS;
    if (this.stopAt && time >= this.stopAt) this.stopRecording();
  }

  private startRecording(): void {
    this.recorder = new ClipRecorder(this.sys.game.canvas, this.sound);
    this.recStartedAt = this.time.now;
    this.recWave = this.view.wave;
    this.stopAt = 0;
    document.body.dataset.clip = 'recording';
  }

  private stopRecording(): void {
    const rec = this.recorder;
    if (!rec) return;
    this.recorder = null;
    this.autoDone = true;
    const { seed, lane } = this.params;
    void rec.stop(`legion-s${seed}-w${this.recWave}-l${lane}.webm`).then(() => (document.body.dataset.clip = 'saved'));
  }
}
