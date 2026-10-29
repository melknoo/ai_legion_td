import Phaser from 'phaser';
import { Client, type Room } from '@colyseus/sdk';
import {
  LEGION_DATA,
  MAX_TEAM_SIZE,
  MODES,
  MODE_IDS,
  ROOM_NAME,
  SERVER_PORT,
  modeLocksBuilder,
  type JoinOptions,
  type LobbyMessages,
  type ModeId,
  type TeamId,
} from '@legion/shared';
import { builderPortrait } from '../assets/manifest.ts';
import { VIEW_H, VIEW_W, layoutCamera } from '../layout.ts';
import { NetSession } from '../session/NetSession.ts';
import { ff6Window } from '../ui/ff6Window.ts';
import { facesetKey } from '../ui/Hud.ts';
import { TextButton } from '../ui/TextButton.ts';
import { onKey } from '../ui/keys.ts';
import { FONT } from './BootScene.ts';
import { addSky } from './TitleScene.ts';

interface SlotLike {
  sessionId: string;
  name: string;
  team: number;
  builder: string;
  offer: Iterable<string>;
  ready: boolean;
  bot: boolean;
}

interface LobbyStateLike {
  status: string;
  host: string;
  mode: string;
  players: Iterable<SlotLike>;
}

/** How to enter the lobby: create a new room or join one by code. */
export interface LobbyEntry {
  create?: boolean;
  join?: string;
  name?: string;
}

const TEAM_NAMES = ['WEST', 'EAST'];
const BUILDERS = Object.keys(LEGION_DATA.builders);

/** Online lobby: team and builder per player, game mode and bots chosen by the host. */
export class LobbyScene extends Phaser.Scene {
  private entry: LobbyEntry = {};
  private room: Room | null = null;
  private status!: Phaser.GameObjects.BitmapText;
  private codeText!: Phaser.GameObjects.BitmapText;
  private modeText!: Phaser.GameObjects.BitmapText;
  private modeHint!: Phaser.GameObjects.BitmapText;
  private teamText: Phaser.GameObjects.BitmapText[] = [];
  private botRemove: TextButton[] = [];
  private errorText!: Phaser.GameObjects.BitmapText;
  private portrait!: Phaser.GameObjects.Image;
  private builderName!: Phaser.GameObjects.BitmapText;
  private builderNote!: Phaser.GameObjects.BitmapText;
  private buttons!: Record<'copy' | 'modePrev' | 'modeNext' | 'builderPrev' | 'builderNext' | 'team' | 'ready' | 'leave' | 'botW' | 'botE' | 'start', TextButton>;
  private unbindErr: (() => void) | null = null;

  constructor() {
    super('lobby');
  }

  init(entry?: LobbyEntry): void {
    // Deep links (`?room=CODE`, `?online`) arrive without scene data.
    const params = new URLSearchParams(location.search);
    this.entry = entry?.create || entry?.join ? entry : { join: params.get('room') ?? undefined, create: !params.get('room'), name: params.get('name') ?? undefined };
    this.room = null;
    this.teamText = [];
    this.botRemove = [];
  }

  create(): void {
    layoutCamera(this);
    addSky(this);
    ff6Window(this, 8, 8, VIEW_W - 16, VIEW_H - 16);
    this.add.bitmapText(VIEW_W / 2, 15, FONT, 'ONLINE LOBBY').setOrigin(0.5, 0).setTint(0xfff080);
    this.codeText = this.add.bitmapText(20, 31, FONT, '');
    this.status = this.add.bitmapText(20, 140, FONT, 'CONNECTING...').setTint(0xc0c8f0);
    this.modeText = this.add.bitmapText(20, 47, FONT, '');
    this.modeHint = this.add.bitmapText(20, 58, FONT, '').setTint(0xc0c8f0);

    TEAM_NAMES.forEach((name, t) => {
      const x = 20 + t * 224;
      this.add.bitmapText(x, 74, FONT, `TEAM ${name}`).setTint(t === 0 ? 0x80b0ff : 0xff8080);
      this.teamText[t] = this.add.bitmapText(x, 87, FONT, '').setLineSpacing(4);
    });
    // Host-only "x" buttons next to bot rows.
    for (let i = 0; i < MAX_TEAM_SIZE * 2; i++) {
      const team = i < MAX_TEAM_SIZE ? 0 : 1;
      const row = i % MAX_TEAM_SIZE;
      this.botRemove.push(new TextButton(this, 20 + team * 224 + 196, 85 + row * 12, 12, 'X', () => this.removeBotAt(team as TeamId, row), 11).setVisible(false));
    }

    this.add.bitmapText(20, 156, FONT, 'YOUR BUILDER').setTint(0xc0c8f0);
    this.portrait = this.add.image(20, 168, '__DEFAULT').setOrigin(0, 0);
    this.builderName = this.add.bitmapText(64, 172, FONT, '');
    this.builderNote = this.add.bitmapText(64, 200, FONT, '').setTint(0xc0c8f0);
    this.errorText = this.add.bitmapText(VIEW_W / 2, 212, FONT, '').setOrigin(0.5, 0).setTint(0xff7070);

    const y = 228;
    this.buttons = {
      copy: new TextButton(this, 352, 27, 108, 'COPY LINK', () => this.copyLink()),
      modePrev: new TextButton(this, 190, 43, 16, '<', () => this.cycleMode(-1)),
      modeNext: new TextButton(this, 210, 43, 16, '>', () => this.cycleMode(1)),
      builderPrev: new TextButton(this, 64, 182, 20, '<', () => this.cycleBuilder(-1)),
      builderNext: new TextButton(this, 88, 182, 20, '>', () => this.cycleBuilder(1)),
      team: new TextButton(this, 20, y, 48, 'TEAM', () => this.switchTeam()),
      ready: new TextButton(this, 72, y, 56, 'READY', () => this.toggleReady()),
      leave: new TextButton(this, 132, y, 56, 'LEAVE', () => this.leave()),
      botW: new TextButton(this, 252, y, 64, '+BOT W', () => this.send('addBot', 0)),
      botE: new TextButton(this, 320, y, 64, '+BOT E', () => this.send('addBot', 1)),
      start: new TextButton(this, 388, y, 64, 'START', () => this.send('start', null)),
    };
    onKey(this.input.keyboard!, 'keydown-ESC', () => this.leave());

    void this.connect();
  }

  override update(): void {
    const room = this.room;
    if (!room) return;
    const s = room.state as LobbyStateLike;
    // Over a real network the first frames can run before the initial state has arrived.
    if (!s?.players) return;
    if (s.status && s.status !== 'lobby') return this.enterGame(room);
    const slots = [...s.players];
    const me = slots.find((p) => p.sessionId === room.sessionId);
    const host = s.host === room.sessionId;
    const mode = (MODE_IDS.includes(s.mode as ModeId) ? s.mode : 'ap') as ModeId;

    this.modeText.setText(`MODE: ${MODES[mode].name}`);
    this.modeHint.setText(MODES[mode].hint);
    this.buttons.modePrev.setVisible(host);
    this.buttons.modeNext.setVisible(host);

    for (const team of [0, 1] as const) {
      const members = slots.filter((p) => p.team === team);
      const lines = members.map((p) => {
        const tag = p.bot ? 'BOT' : p.sessionId === s.host ? 'HOST' : p.ready ? 'READY' : '...';
        const you = p.sessionId === room.sessionId ? '>' : ' ';
        const builder = mode === 'ar' ? '???' : (LEGION_DATA.builders[p.builder]?.name ?? '?').toUpperCase();
        return `${you}${p.name.padEnd(10)}${builder.padEnd(10)}${tag}`;
      });
      while (lines.length < MAX_TEAM_SIZE) lines.push(' -');
      this.teamText[team]!.setText(lines.join('\n'));
      for (let row = 0; row < MAX_TEAM_SIZE; row++) this.botRemove[team * MAX_TEAM_SIZE + row]!.setVisible(host && !!members[row]?.bot);
    }

    // Own builder: free pick, one of the draft offer, or hidden until start.
    const random = mode === 'ar';
    this.portrait.setVisible(!random);
    if (me && !random) this.portrait.setTexture(facesetKey(builderPortrait(LEGION_DATA.builders[me.builder] ?? { id: '', fighters: [] })));
    this.builderName.setText(random ? 'RANDOM' : (LEGION_DATA.builders[me?.builder ?? '']?.name ?? '').toUpperCase());
    const offer = [...(me?.offer ?? [])].map((b) => LEGION_DATA.builders[b]?.name.toUpperCase());
    const note = random ? 'ROLLED WHEN THE GAME STARTS' : mode === 'apr' ? 'EVERYONE IS A PROPHET' : mode === 'sd' ? `DRAFT: ${offer.join(' / ')}` : 'ANY BUILDER';
    this.builderNote.setText(note);
    this.buttons.builderPrev.setVisible(!modeLocksBuilder(mode));
    this.buttons.builderNext.setVisible(!modeLocksBuilder(mode));

    this.buttons.ready.setActive(!!me?.ready).setVisible(!host);
    for (const key of ['botW', 'botE', 'start'] as const) this.buttons[key].setVisible(host);
    this.status.setText(host ? 'YOU HOST: PICK A MODE, ADD BOTS, START' : 'WAITING FOR THE HOST TO START');
  }

  private async connect(): Promise<void> {
    const options: JoinOptions = { name: this.entry.name, fast: new URLSearchParams(location.search).has('fast') };
    // Dev: Vite and the game server run on separate ports; hosted, the server also serves the page.
    const client = new Client(import.meta.env.DEV ? `${location.protocol}//${location.hostname}:${SERVER_PORT}` : location.origin);
    try {
      this.room = this.entry.join ? await client.joinById(this.entry.join, options) : await client.create(ROOM_NAME, options);
    } catch (e) {
      console.error(e);
      this.status.setText(this.entry.join ? 'ROOM NOT FOUND OR ALREADY STARTED' : 'CANNOT CONNECT - IS THE SERVER RUNNING?').setTint(0xff7070);
      return;
    }
    this.codeText.setText(`ROOM CODE: ${this.room.roomId}`);
    history.replaceState(null, '', `${location.pathname}?room=${this.room.roomId}`);
    this.unbindErr = this.room.onMessage('err', (msg: string) => this.showError(msg));
  }

  private showError(msg: string): void {
    this.errorText.setText(msg.toUpperCase());
    this.time.delayedCall(2500, () => this.errorText.setText(''));
  }

  private send<K extends keyof LobbyMessages>(type: K, payload: LobbyMessages[K]): void {
    this.room?.send(type, payload);
  }

  private state(): LobbyStateLike | undefined {
    return this.room?.state as LobbyStateLike | undefined;
  }

  private mySlot(): SlotLike | undefined {
    const room = this.room;
    return room ? [...((room.state as LobbyStateLike | undefined)?.players ?? [])].find((p) => p.sessionId === room.sessionId) : undefined;
  }

  private cycleMode(step: number): void {
    const i = MODE_IDS.indexOf((this.state()?.mode ?? 'ap') as ModeId);
    this.send('setMode', MODE_IDS[(i + step + MODE_IDS.length) % MODE_IDS.length]!);
  }

  private cycleBuilder(step: number): void {
    const me = this.mySlot();
    const pool = this.state()?.mode === 'sd' ? [...(me?.offer ?? [])] : BUILDERS;
    if (!pool.length) return;
    const current = pool.indexOf(me?.builder ?? pool[0]!);
    this.send('setBuilder', pool[(current + step + pool.length) % pool.length]!);
  }

  private switchTeam(): void {
    const me = this.mySlot();
    if (me) this.send('setTeam', (me.team === 0 ? 1 : 0) as TeamId);
  }

  private toggleReady(): void {
    this.send('setReady', !this.mySlot()?.ready);
  }

  private removeBotAt(team: TeamId, row: number): void {
    const slots = [...(this.state()?.players ?? [])];
    const bot = slots.filter((p) => p.team === team)[row];
    if (bot) this.send('removeBot', slots.indexOf(bot));
  }

  private copyLink(): void {
    if (!this.room) return;
    const link = `${location.origin}${location.pathname}?room=${this.room.roomId}`;
    // The clipboard API needs a secure context (localhost or https); plain LAN http falls back to the code.
    navigator.clipboard?.writeText(link).then(
      () => this.showError('LINK COPIED!'),
      () => this.showError(`SHARE THE ROOM CODE: ${this.room?.roomId}`),
    ) ?? this.showError(`SHARE THE ROOM CODE: ${this.room.roomId}`);
  }

  private leave(): void {
    void this.room?.leave();
    this.room = null;
    history.replaceState(null, '', location.pathname);
    this.scene.start('title');
  }

  private enterGame(room: Room): void {
    this.room = null;
    this.unbindErr?.();
    this.scene.start('battle', { session: new NetSession(room, LEGION_DATA) });
  }
}
