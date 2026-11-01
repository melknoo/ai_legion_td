import Phaser from 'phaser';
import type { Game } from '@legion/shared';
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
 * `data-clip="recording|saved"` (and `data-clip-file`) so automation can wait for the file.
 */
export class ShowcaseScene extends Phaser.Scene {
  /** Showcase games always run locally. */
  private view!: Game;
  /** Wave of the clip being recorded. */
  private recWave = 0;
  /** Creeps leaked from the shown lane before this clip (the result caption counts from here). */
  private leaksBefore = 0;
  private result!: Phaser.GameObjects.BitmapText;
  private params!: ShowcaseParams;
  private info!: Phaser.GameObjects.BitmapText;
  private recorder: ClipRecorder | null = null;
  private recStartedAt = 0;
  private stopAt = 0;
  private autoDone = false;

  constructor() {
    super('showcase');
  }

  create(data: { game: Game }): void {
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
    // The answer to the hook, over the field during the clip's tail.
    this.result = this.add.bitmapText(center, top + height / 2, FONT, '').setOrigin(0.5).setScale(6).setVisible(false);
    this.add.bitmapText(center, top + height + 100, FONT, 'PLAY FREE IN YOUR BROWSER').setOrigin(0.5, 0).setScale(2).setTint(0x9aa0d0);
    this.add.bitmapText(center, top + height + 124, FONT, URL_TEXT).setOrigin(0.5, 0).setScale(3).setTint(0xe8e8f0);
    this.input.keyboard?.on('keydown-P', () => (this.recorder ? this.stopRecording() : this.startRecording()));
  }

  override update(time: number): void {
    const g = this.view;
    const owner = g.players[this.params.lane];
    const builder = owner ? g.data.builders[owner.builder]?.name.toUpperCase() : '';
    // A clip keeps its wave number to the end, even if the next build phase starts during the tail.
    const wave = this.recorder ? this.recWave : g.wave;
    const boss = wave % 10 === 0 ? ' - BOSS' : '';
    this.info.setText(`WAVE ${wave}${boss}\n${builder ?? ''}`);

    if (this.params.rec && !this.autoDone && !this.recorder && g.phase === 'fight') this.startRecording();
    if (!this.recorder) return;
    if (!this.stopAt) {
      // The wave only ends once every lane is clear: stop when the shown lane is (creeps still
      // queued to spawn count), not much later.
      const cleared = g.phase !== 'fight' || !g.laneHasAttackers(this.params.lane);
      if (cleared) this.showResult();
      if (cleared || time - this.recStartedAt > MAX_CLIP_MS - TAIL_MS) this.stopAt = time + TAIL_MS;
    }
    if (this.stopAt && time >= this.stopAt) this.stopRecording();
  }

  /** A clip is being recorded (BattleScene holds the picture during its tail). */
  get recording(): boolean {
    return this.recorder !== null;
  }

  private startRecording(): void {
    this.recorder = new ClipRecorder(this.sys.game.canvas, this.sound);
    this.recStartedAt = this.time.now;
    this.recWave = this.view.wave;
    this.stopAt = 0;
    this.leaksBefore = this.view.players[this.params.lane]?.leaks ?? 0;
    this.result.setVisible(false);
    document.body.dataset.clip = 'recording';
  }

  /** HELD! or how many creeps got through on the shown lane during the clip. */
  private showResult(): void {
    const leaks = (this.view.players[this.params.lane]?.leaks ?? 0) - this.leaksBefore;
    this.result
      .setText(leaks ? `${leaks} LEAKED!` : 'HELD!')
      .setTint(leaks ? 0xff5050 : 0x60ff90)
      .setVisible(true)
      .setScale(9);
    this.tweens.add({ targets: this.result, scale: 6, duration: 250, ease: 'Back.easeOut' });
  }

  private stopRecording(): void {
    const rec = this.recorder;
    if (!rec) return;
    this.recorder = null;
    this.autoDone = true;
    const { seed, lane } = this.params;
    const builder = this.view.players[lane]?.builder ?? 'none';
    void rec.stop(`legion-s${seed}-w${this.recWave}-l${lane}-${builder}.webm`).then((where) => {
      document.body.dataset.clip = 'saved';
      document.body.dataset.clipFile = where;
    });
  }
}
