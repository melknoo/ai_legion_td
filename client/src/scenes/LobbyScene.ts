import Phaser from 'phaser';
import { Client, type Room } from '@colyseus/sdk';
import {
  LEGION_DATA,
  MAX_TEAM_SIZE,
  MODES,
  MODE_IDS,
  ROOM_NAME,
  NAME_CHARS,
  NAME_MAX,
  modeLocksBuilder,
  playerName,
  type JoinOptions,
  type LobbyMessages,
  type ModeId,
  type TeamId,
} from '@legion/shared';
import { builderPortrait } from '../assets/manifest.ts';
import { VIEW_H, VIEW_W, layoutCamera } from '../layout.ts';
import { serverUrl } from '../net/server.ts';
import { ChatLog } from '../net/ChatLog.ts';
import { NetSession } from '../session/NetSession.ts';
import { ChatBox } from '../ui/ChatBox.ts';
import { ff6Window } from '../ui/ff6Window.ts';
import { TEAM_NAMES, teamColor } from '../ui/playerColors.ts';
import { facesetKey } from '../ui/Hud.ts';
import { TextButton } from '../ui/TextButton.ts';
import { TextInput } from '../ui/TextInput.ts';
import { onKey } from '../ui/keys.ts';
import { TOUCH } from '../ui/touch.ts';
import { FONT } from './BootScene.ts';
import { addSky, readName, storeName } from './TitleScene.ts';

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
  title: string;
  private: boolean;
  players: Iterable<SlotLike>;
}

/** How to enter the lobby: create a new room or join one by code. */
export interface LobbyEntry {
  create?: boolean;
  join?: string;
  name?: string;
  /** Creating: hide the room from the public game list. */
  private?: boolean;
  /** Creating: game name (empty: the server's default). */
  title?: string;
}

const BUILDERS = Object.keys(LEGION_DATA.builders);

/** Online lobby: team and builder per player, game mode and bots chosen by the host. */
export class LobbyScene extends Phaser.Scene {
  private entry: LobbyEntry = {};
  private room: Room | null = null;
  private status!: Phaser.GameObjects.BitmapText;
  private titleText!: Phaser.GameObjects.BitmapText;
  private codeText!: Phaser.GameObjects.BitmapText;
  private modeText!: Phaser.GameObjects.BitmapText;
  private modeHint!: Phaser.GameObjects.BitmapText;
  private teamText: Phaser.GameObjects.BitmapText[] = [];
  private botRemove: TextButton[] = [];
  private errorText!: Phaser.GameObjects.BitmapText;
  private portrait!: Phaser.GameObjects.Image;
  private builderName!: Phaser.GameObjects.BitmapText;
  private builderNote!: Phaser.GameObjects.BitmapText;
  private buttons!: Record<'copy' | 'visibility' | 'modePrev' | 'modeNext' | 'builderPrev' | 'builderNext' | 'team' | 'ready' | 'leave' | 'name' | 'botW' | 'botE' | 'start', TextButton>;
  private unbindErr: (() => void) | null = null;
  private chat: ChatLog | null = null;
  private chatBox: ChatBox | null = null;
  /** Open while the player types a new name (over the status line). */
  private nameInput: TextInput | null = null;

  constructor() {
    super('lobby');
  }

  init(entry?: LobbyEntry): void {
    // Deep links (`?room=CODE`, `?online`) arrive without scene data; a room made from a link is for friends, so private.
    const params = new URLSearchParams(location.search);
    this.entry = entry?.create || entry?.join
      ? entry
      : { join: params.get('room') ?? undefined, create: !params.get('room'), name: params.get('name') ?? readName(), private: true };
    this.room = null;
    this.teamText = [];
    this.botRemove = [];
  }

  create(): void {
    layoutCamera(this);
    addSky(this);
    this.chat = null;
    this.chatBox = null;
    this.nameInput = null;
    ff6Window(this, 8, 8, VIEW_W - 16, VIEW_H - 16);
    this.titleText = this.add.bitmapText(VIEW_W / 2, 15, FONT, 'ONLINE LOBBY').setOrigin(0.5, 0).setTint(0xfff080);
    this.codeText = this.add.bitmapText(20, 31, FONT, '');
    this.status = this.add.bitmapText(20, 140, FONT, 'CONNECTING...').setTint(0xc0c8f0);
    this.modeText = this.add.bitmapText(20, 47, FONT, '');
    this.modeHint = this.add.bitmapText(20, 58, FONT, '').setTint(0xc0c8f0);

    TEAM_NAMES.forEach((name, t) => {
      const x = 20 + t * 224;
      this.add.bitmapText(x, 74, FONT, `TEAM ${name}`).setTint(teamColor(t as TeamId));
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
    this.builderNote = this.add.bitmapText(20, 212, FONT, '').setTint(0xc0c8f0);
    // Errors take the status line's place for a moment; the chat fills the right of the builder panel.
    this.errorText = this.add.bitmapText(20, 140, FONT, '').setTint(0xff7070);

    const y = 228;
    this.buttons = {
      visibility: new TextButton(this, 264, 27, 84, 'PUBLIC', () => this.send('setPrivate', !this.state()?.private)),
      copy: new TextButton(this, 352, 27, 108, 'COPY LINK', () => this.copyLink()),
      modePrev: new TextButton(this, 190, 43, 16, '<', () => this.cycleMode(-1)),
      modeNext: new TextButton(this, 210, 43, 16, '>', () => this.cycleMode(1)),
      builderPrev: new TextButton(this, 64, 182, 20, '<', () => this.cycleBuilder(-1)),
      builderNext: new TextButton(this, 88, 182, 20, '>', () => this.cycleBuilder(1)),
      team: new TextButton(this, 20, y, 48, 'TEAM', () => this.switchTeam()),
      ready: new TextButton(this, 72, y, 56, 'READY', () => this.toggleReady()),
      leave: new TextButton(this, 132, y, 56, 'LEAVE', () => this.leave()),
      name: new TextButton(this, 192, y, 56, 'NAME', () => this.editName()),
      botW: new TextButton(this, 252, y, 64, '+BOT W', () => this.send('addBot', 0)),
      botE: new TextButton(this, 320, y, 64, '+BOT E', () => this.send('addBot', 1)),
      start: new TextButton(this, 388, y, 64, 'START', () => this.send('start', null)),
    };
    // Esc first closes the name field or the chat input, then leaves.
    onKey(this.input.keyboard!, 'keydown-ESC', () => {
      if (this.nameInput) this.closeName();
      else if (!this.chatBox?.capturing) this.leave();
    });

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
    if (s.title) this.titleText.setText(s.title);
    this.codeText.setText(`ROOM CODE: ${room.roomId}${host ? '' : s.private ? '  PRIVATE' : '  PUBLIC'}`);
    this.buttons.visibility.setLabel(s.private ? 'PRIVATE' : 'PUBLIC').setVisible(host);
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
    const note = random ? 'ROLLED WHEN THE GAME STARTS' : mode === 'apr' ? 'EVERYONE IS A PROPHET' : mode === 'sd' ? 'DRAFT: PICK ONE OF TWO' : 'ANY BUILDER';
    this.builderNote.setText(note);
    this.buttons.builderPrev.setVisible(!modeLocksBuilder(mode));
    this.buttons.builderNext.setVisible(!modeLocksBuilder(mode));

    this.buttons.ready.setActive(!!me?.ready).setVisible(!host);
    for (const key of ['botW', 'botE', 'start'] as const) this.buttons[key].setVisible(host);
    const status = this.nameInput ? 'NAME:' : host ? 'YOU HOST: PICK A MODE, ADD BOTS, START' : 'WAITING FOR THE HOST TO START';
    this.status.setText(status).setVisible(!this.errorText.text);
    this.chatBox?.update();
  }

  private async connect(): Promise<void> {
    const options: JoinOptions = { name: this.entry.name, fast: new URLSearchParams(location.search).has('fast'), private: this.entry.private, title: this.entry.title };
    const client = new Client(serverUrl());
    try {
      this.room = this.entry.join ? await client.joinById(this.entry.join, options) : await client.create(ROOM_NAME, options);
    } catch (e) {
      console.error(e);
      // The server's own reason when it turns us away (full, too many connections).
      const reason = e instanceof Error && /full|too many/i.test(e.message) ? e.message.toUpperCase() : null;
      this.status.setText(reason ?? (this.entry.join ? 'ROOM NOT FOUND OR ALREADY STARTED' : 'CANNOT CONNECT - IS THE SERVER RUNNING?')).setTint(0xff7070);
      return;
    }
    history.replaceState(null, '', `${location.pathname}?room=${this.room.roomId}`);
    this.unbindErr = this.room.onMessage('err', (msg: string) => this.showError(msg));
    this.chat = new ChatLog(this.room);
    // The heading doubles as the way to open the chat on touch screens.
    this.add
      .bitmapText(240, 156, FONT, TOUCH ? 'CHAT: TAP HERE' : 'CHAT: PRESS ENTER')
      .setTint(0xc0c8f0)
      .setInteractive({ useHandCursor: true })
      .on('pointerdown', () => this.chatBox?.toggle());
    this.chatBox = new ChatBox(this, this.chat, { x: 240, bottom: 224, cols: 28, rows: 4, inGame: false, team: () => (this.mySlot()?.team ?? 0) as TeamId, blocked: () => !!this.nameInput });
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

  private editName(): void {
    if (this.nameInput || !this.room) return;
    if (this.chatBox?.isOpen) this.chatBox.close();
    this.nameInput = new TextInput(this, 64, 136, 100, {
      maxLength: NAME_MAX,
      allowed: NAME_CHARS,
      upperCase: true,
      initial: this.mySlot()?.name ?? readName(),
      onEnter: (value) => {
        const name = playerName(value);
        if (name) {
          this.send('setName', name);
          storeName(name);
        }
        this.closeName();
      },
    }).setActive(true);
  }

  private closeName(): void {
    this.nameInput?.destroy();
    this.nameInput = null;
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
    this.scene.start('battle', { session: new NetSession(room, LEGION_DATA, this.chat ?? undefined) });
  }
}
