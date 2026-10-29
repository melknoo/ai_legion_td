import Phaser from 'phaser';
import { DRAFT_SIZE, LEGION_DATA, MODES, MODE_IDS, PROPHET, modeLocksBuilder, rollBuilders, rollableBuilders, type ModeId } from '@legion/shared';
import { builderPortrait, TITLE_PARADE, UNIT_SPRITES, spriteKey } from '../assets/manifest.ts';
import { VIEW_H, VIEW_W, layoutCamera } from '../layout.ts';
import type { SoloConfig } from '../session/LocalSession.ts';
import { ff6Window } from '../ui/ff6Window.ts';
import { facesetKey } from '../ui/Hud.ts';
import { TextInput } from '../ui/TextInput.ts';
import { setTipsEnabled, tipsEnabled } from '../ui/Tutorial.ts';
import { onKey } from '../ui/keys.ts';
import { FONT } from './BootScene.ts';

type Panel = 'main' | 'solo' | 'join' | 'name';

interface MenuItem {
  label: () => string;
  action?: () => void;
  /** Option items cycle with left/right. */
  change?: (step: number) => void;
}

/** Night-sky gradient behind the menus (the lobby can be opened without the title first). */
export function addSky(scene: Phaser.Scene): void {
  if (!scene.textures.exists('title-sky')) {
    const tex = scene.textures.createCanvas('title-sky', VIEW_W, VIEW_H)!;
    const ctx = tex.getContext();
    const g = ctx.createLinearGradient(0, 0, 0, VIEW_H);
    g.addColorStop(0, '#06061c');
    g.addColorStop(0.6, '#1c1c58');
    g.addColorStop(1, '#3a2a6a');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, VIEW_W, VIEW_H);
    tex.refresh();
  }
  scene.add.image(0, 0, 'title-sky').setOrigin(0, 0);
}

const NAME_KEY = 'legion.name';
const BUILDERS = Object.keys(LEGION_DATA.builders);

/** FF6-style title screen and main menu: solo setup, create/join online games, player name. */
export class TitleScene extends Phaser.Scene {
  private panel: Panel = 'main';
  private items: MenuItem[] = [];
  private index = 0;
  private layer!: Phaser.GameObjects.Container;
  private lines: Phaser.GameObjects.BitmapText[] = [];
  private hand!: Phaser.GameObjects.Image;
  private name = 'PLAYER';
  private solo: SoloConfig = { builder: BUILDERS[0]!, teamSize: 1, mode: 'ap' };
  private draft: string[] = [];
  private input_: TextInput | null = null;
  /** Hover only selects after the mouse moved; new panels appear under a resting pointer. */
  private mouseMoved = false;
  /** Solo panel: builder portrait and mode hint, refreshed every frame. */
  private preview: { hint: Phaser.GameObjects.BitmapText; portrait: Phaser.GameObjects.Image } | null = null;

  constructor() {
    super('title');
  }

  create(): void {
    layoutCamera(this);
    this.name = readName();
    this.drawBackground();
    this.drawLogo();
    this.hand = this.add.image(0, 0, 'icon-hand').setOrigin(1, 0.5).setDepth(10);
    this.tweens.add({ targets: this.hand, x: '-=2', duration: 300, yoyo: true, repeat: -1 });

    const kb = this.input.keyboard!;
    onKey(kb, 'keydown-UP', () => this.move(-1));
    onKey(kb, 'keydown-DOWN', () => this.move(1));
    onKey(kb, 'keydown-LEFT', () => this.items[this.index]?.change?.(-1));
    onKey(kb, 'keydown-RIGHT', () => this.items[this.index]?.change?.(1));
    onKey(kb, 'keydown-ENTER', () => !this.input_ && this.items[this.index]?.action?.());
    onKey(kb, 'keydown-SPACE', () => !this.input_ && this.items[this.index]?.action?.());
    onKey(kb, 'keydown-ESC', () => this.panel !== 'main' && this.show('main'));
    this.input.on('pointermove', () => (this.mouseMoved = true));
    this.show('main');
  }

  override update(): void {
    this.lines.forEach((t, i) => t.setText(this.items[i]!.label()));
    const sel = this.lines[this.index];
    if (sel) this.hand.setPosition(sel.x - 3, sel.y + 4);
    if (this.preview) {
      const random = this.solo.mode === 'ar';
      this.preview.hint.setText(MODES[this.solo.mode].hint);
      this.preview.portrait.setVisible(!random);
      if (!random) this.preview.portrait.setTexture(facesetKey(builderPortrait(LEGION_DATA.builders[this.soloBuilder()]!)));
    }
  }

  // ---- panels ----------------------------------------------------------------

  private show(panel: Panel): void {
    this.panel = panel;
    this.layer?.destroy();
    this.input_?.destroy();
    this.input_ = null;
    this.preview = null;
    this.mouseMoved = false;
    this.layer = this.add.container(0, 0);
    this.index = 0;
    const back = { label: () => 'BACK', action: () => this.show('main') };

    if (panel === 'main') {
      this.items = [
        { label: () => 'SOLO GAME', action: () => this.show('solo') },
        { label: () => 'CREATE ONLINE GAME', action: () => this.scene.start('lobby', { create: true, name: this.name }) },
        { label: () => 'JOIN ONLINE GAME', action: () => this.show('join') },
        { label: () => `NAME: ${this.name}`, action: () => this.show('name') },
        { label: () => `TIPS: ${tipsEnabled() ? 'ON' : 'OFF'}`, action: () => setTipsEnabled(!tipsEnabled()) },
      ];
      this.window(150, 152, 180, 80);
    } else if (panel === 'solo') {
      this.items = [
        { label: () => `MODE      < ${MODES[this.solo.mode].name} >`, change: (s) => this.cycleMode(s), action: () => this.cycleMode(1) },
        { label: () => `BUILDER   < ${this.builderLabel()} >`, change: (s) => this.cycleBuilder(s), action: () => this.cycleBuilder(1) },
        { label: () => `TEAM SIZE < ${this.solo.teamSize}V${this.solo.teamSize} >`, change: (s) => this.cycleTeam(s), action: () => this.cycleTeam(1) },
        { label: () => 'START GAME', action: () => this.startSolo() },
        back,
      ];
      this.window(84, 150, 312, 92);
      this.preview = {
        hint: this.add.bitmapText(96, 226, FONT, '').setTint(0xc0c8f0),
        portrait: this.add.image(342, 160, '__DEFAULT').setOrigin(0, 0),
      };
      this.layer.add([this.preview.hint, this.preview.portrait]);
    } else {
      const join = panel === 'join';
      this.input_ = new TextInput(this, 160, 178, 160, {
        maxLength: join ? 16 : 10,
        allowed: join ? /[A-Za-z0-9_-]/ : /[A-Z0-9 ]/,
        upperCase: !join,
        initial: join ? '' : this.name,
        onEnter: (v) => (join ? this.join(v) : this.saveName(v)),
      }).setActive(true);
      this.items = [{ label: () => (join ? 'JOIN' : 'OK'), action: () => (join ? this.join(this.input_!.value) : this.saveName(this.input_!.value)) }, back];
      this.window(150, 158, 180, 74, 34);
      this.layer.add(this.add.bitmapText(240, 164, FONT, join ? 'ROOM CODE OR LINK (CTRL+V)' : 'YOUR NAME').setOrigin(0.5, 0).setTint(0xc0c8f0));
    }
  }

  /** Menu window with one line per item; `top` leaves room above the items. */
  private window(x: number, y: number, w: number, h: number, top = 0): void {
    this.layer.add(ff6Window(this, x, y, w, h));
    this.lines = this.items.map((item, i) => {
      const t = this.add.bitmapText(x + 22, y + 8 + top + i * 14, FONT, item.label());
      const zone = this.add.zone(x + 4, y + 5 + top + i * 14, w - 8, 14).setOrigin(0, 0).setInteractive({ useHandCursor: true });
      zone.on('pointermove', () => this.mouseMoved && (this.index = i));
      zone.on('pointerdown', (p: Phaser.Input.Pointer) => {
        this.index = i;
        // Clicking the left/right part of an option line steps it back/forward.
        if (item.change) item.change(p.worldX < x + w / 2 ? -1 : 1);
        else item.action?.();
      });
      this.layer.add([t, zone]);
      return t;
    });
  }

  private move(step: number): void {
    this.index = (this.index + step + this.items.length) % this.items.length;
  }

  // ---- solo setup -------------------------------------------------------------

  private cycleMode(step: number): void {
    const i = MODE_IDS.indexOf(this.solo.mode);
    this.solo.mode = MODE_IDS[(i + step + MODE_IDS.length) % MODE_IDS.length] as ModeId;
    if (this.solo.mode === 'sd') {
      this.draft = rollBuilders(rollableBuilders(LEGION_DATA), DRAFT_SIZE, Math.random);
      this.solo.builder = this.draft[0]!;
    }
  }

  private cycleBuilder(step: number): void {
    if (modeLocksBuilder(this.solo.mode)) return;
    const pool = this.solo.mode === 'sd' ? this.draft : BUILDERS;
    const i = pool.indexOf(this.solo.builder);
    this.solo.builder = pool[(i + step + pool.length) % pool.length]!;
  }

  private cycleTeam(step: number): void {
    this.solo.teamSize = ((this.solo.teamSize - 1 + step + 4) % 4) + 1;
  }

  private builderLabel(): string {
    return this.solo.mode === 'ar' ? 'RANDOM' : LEGION_DATA.builders[this.soloBuilder()]!.name.toUpperCase();
  }

  /** The builder the solo game will use (All Prophet overrides the pick). */
  private soloBuilder(): string {
    return this.solo.mode === 'apr' ? PROPHET : this.solo.builder;
  }

  private startSolo(): void {
    this.scene.start('battle', { solo: { ...this.solo } });
  }

  // ---- online -------------------------------------------------------------------

  private join(code: string): void {
    if (code.trim()) this.scene.start('lobby', { join: code.trim(), name: this.name });
  }

  private saveName(value: string): void {
    this.name = value.trim() || 'PLAYER';
    try {
      localStorage.setItem(NAME_KEY, this.name);
    } catch {
      // Storage may be unavailable (private mode); the name just isn't remembered.
    }
    this.show('main');
  }

  // ---- scenery ----------------------------------------------------------------

  private drawBackground(): void {
    addSky(this);
    for (let i = 0; i < 70; i++) {
      const star = this.add.rectangle(Math.random() * VIEW_W, Math.random() * 150, 1, 1, 0xffffff, 0.4 + Math.random() * 0.6);
      this.tweens.add({ targets: star, alpha: 0.1, duration: 600 + Math.random() * 1800, yoyo: true, repeat: -1, delay: Math.random() * 2000 });
    }
    // Mountain silhouettes.
    const m = this.add.graphics();
    m.fillStyle(0x241848, 1).beginPath().moveTo(0, 240);
    const peaks = [[0, 230], [60, 170], [120, 210], [190, 150], [260, 205], [330, 160], [410, 215], [480, 175], [480, 240]] as const;
    for (const [x, y] of peaks) m.lineTo(x, y);
    m.closePath().fillPath();
    this.add.tileSprite(0, 238, VIEW_W, 32, 'grass').setOrigin(0, 0);
    this.parade();
  }

  /** Creeps endlessly marching across the meadow. */
  private parade(): void {
    TITLE_PARADE.forEach((id, i) => {
      const spec = UNIT_SPRITES[id];
      if (!spec) return;
      const s = this.add.sprite(-20 - i * 70, 252, `${spriteKey(spec)}-Walk`).setScale(2).play(`${spriteKey(spec)}-walk`).setDepth(2);
      if (spec.hue) s.enableFilters().filters!.internal.addColorMatrix().colorMatrix.hue(spec.hue);
      this.tweens.add({ targets: s, x: VIEW_W + 520 - i * 70, duration: 26000, repeat: -1 });
    });
  }

  private drawLogo(): void {
    const logo = this.add.bitmapText(VIEW_W / 2, 40, FONT, 'LEGION').setOrigin(0.5).setScale(5).setTint(0xffd060);
    logo.enableFilters().filters!.external.addGlow(0xff8a20, 4, 0, 1, false, 10, 6);
    this.add.bitmapText(VIEW_W / 2, 82, FONT, 'P I X E L').setOrigin(0.5).setScale(2).setTint(0xe8e8f0);
    this.add.bitmapText(VIEW_W / 2, 104, FONT, 'A LEGION TD TRIBUTE').setOrigin(0.5).setTint(0x9aa0d0);
    this.tweens.add({ targets: logo, y: 43, duration: 1600, yoyo: true, repeat: -1, ease: 'Sine.easeInOut' });
  }
}

function readName(): string {
  try {
    return localStorage.getItem(NAME_KEY) || 'PLAYER';
  } catch {
    return 'PLAYER';
  }
}
