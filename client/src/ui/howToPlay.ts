import type Phaser from 'phaser';
import { VIEW_H, VIEW_W } from '../layout.ts';
import { FONT } from '../scenes/BootScene.ts';
import { ff6Window } from './ff6Window.ts';
import { dedupe } from './keys.ts';
import { TextButton } from './TextButton.ts';
import { TOUCH } from './touch.ts';

interface Page {
  title: string;
  lines: string[];
}

const CONTROLS: Page = TOUCH
  ? {
      title: 'CONTROLS',
      lines: [
        'TAP A COMMAND CARD SLOT, THEN TAP A FREE',
        'GRID SPOT TWICE TO BUILD THERE.',
        'TAP ONE OF YOUR FIGHTERS: UPGRADE OR SELL.',
        'HOLD A BUTTON: SHOW WHAT IT DOES.',
        '',
        'SWIPE THE FIELD TO PAN.',
        'TABS AT THE TOP: OTHER LANES AND KINGS.',
        'C BUTTON: CHAT   O BUTTON: OPTIONS',
      ],
    }
  : {
      title: 'CONTROLS',
      lines: [
        'QWER ASDF YXCV  PICK A COMMAND CARD SLOT',
        '1 / 2           FIGHTERS / SENDS',
        'CLICK THE GRID  PLACE THE PICKED FIGHTER',
        'CLICK FIGHTER   U: UPGRADE  DEL: SELL',
        'B / G           BUY WISP / FARM UPGRADE',
        'H / J / K       KING HP / ATTACK / REGEN',
        'TAB / SPACE     OTHER LANES / BACK HOME',
        'ARROWS, WHEEL   PAN THE FIELD',
        'ENTER           TEAM CHAT (SHIFT: ALL)',
        'T / I / O       TYPES / NEXT WAVE / OPTIONS',
      ],
    };

const PAGES: Page[] = [
  {
    title: 'THE GOAL',
    lines: [
      'TWO TEAMS PLAY: WEST (BLUE) AND EAST (RED).',
      'EVERY PLAYER HAS A LANE OF THEIR OWN, EVERY',
      'TEAM A KING. YOU ARE SHOWN IN GOLD.',
      '',
      'CREEPS WALK IN FROM THE LEFT TOWARDS THE RED',
      'LINE ON THE RIGHT. EVERY CREEP THAT GETS',
      'PAST IT RUNS TO YOUR KING AND HURTS IT.',
      '',
      'KILL THE FOE KING TO WIN THE GAME.',
    ],
  },
  {
    title: 'ONE ROUND',
    lines: [
      '1. BUILD PHASE: A TIMER RUNS (TOP LEFT).',
      '   PLACE FIGHTERS ON YOUR GRID.',
      '2. WHEN IT RUNS OUT, THE WAVE STARTS BY',
      '   ITSELF. FIGHTERS ATTACK ON THEIR OWN.',
      '3. AFTER THE WAVE YOUR FIGHTERS RETURN TO',
      '   THEIR SPOT, FULLY HEALED, AND YOU GET',
      '   YOUR INCOME.',
      '',
      'WAVES 10, 20 AND 30 ARE BOSSES. AFTER 10',
      'AND 20 BOTH ARMIES MEET IN THE ARENA.',
    ],
  },
  {
    title: 'FIGHTERS, GOLD AND FOOD',
    lines: [
      'FIGHTERS COST GOLD AND FOOD. YOUR BUILDER',
      'DECIDES WHICH FIGHTERS YOU CAN BUILD.',
      'CLICK A FIGHTER TO UPGRADE OR SELL IT.',
      'SELLING PAYS 100% IN THE BUILD PHASE YOU',
      'BUILT IT, LATER 50%.',
      '',
      'GOLD COMES FROM KILLS AND AFTER EACH WAVE.',
      'FOOD LIMITS YOUR ARMY: FARM UPGRADES (G)',
      'RAISE IT.',
    ],
  },
  {
    title: 'LUMBER AND SENDS',
    lines: [
      'WISPS (B) GATHER LUMBER OVER TIME.',
      '',
      'SENDS COST LUMBER. THEY JOIN THE NEXT WAVE',
      'ON A FOE LANE, AND EACH ONE RAISES YOUR',
      'INCOME FOR THE REST OF THE GAME. INCOME IS',
      'PAID AFTER EVERY WAVE.',
      '',
      'THE FOES SEND TOO: EXPECT EXTRA UNITS IN',
      'YOUR WAVES.',
    ],
  },
  {
    title: 'THE KING',
    lines: [
      'EACH TEAM HAS A KING IN ITS OWN ARENA',
      '(TAB "MY KING"). IT FIGHTS LEAKED CREEPS',
      'ITSELF. ITS HP DO NOT RESET BETWEEN WAVES.',
      '',
      'KING UPGRADES (H: HP, J: ATTACK, K: REGEN)',
      'COST LUMBER AND ALSO RAISE YOUR INCOME.',
    ],
  },
  {
    title: 'DAMAGE TYPES',
    lines: [
      'EVERY ATTACK TYPE IS STRONG OR WEAK AGAINST',
      'EACH ARMOR TYPE.',
      '',
      'COMMAND CARD BADGES ON GREEN: GOOD AGAINST',
      'THE NEXT WAVE. ON RED: WEAK AGAINST IT.',
      '',
      'THE NEXT WAVE SHOWS IN THE INFO PANEL (I).',
      'T OPENS THE FULL DAMAGE CHART.',
    ],
  },
  CONTROLS,
];

const W = 376;
const H = 178;

/**
 * Paged rules overview over any 480x270 scene (title menu or the battlefield HUD). Arrow keys or
 * the buttons turn pages, Esc or CLOSE closes. Returns a function that removes it.
 */
export function howToPlay(scene: Phaser.Scene, onClose: () => void, depth = 21500): () => void {
  const x = Math.round((VIEW_W - W) / 2);
  const y = Math.round((VIEW_H - H) / 2);
  let page = 0;
  // Swallows clicks so nothing under the window reacts.
  const blocker = scene.add
    .zone(x, y, W, H)
    .setOrigin(0, 0)
    .setInteractive()
    .on('pointerdown', (_p: Phaser.Input.Pointer, _x: number, _y: number, e: Phaser.Types.Input.EventData) => e.stopPropagation())
    .setDepth(depth);
  const box = ff6Window(scene, x, y, W, H).setDepth(depth);
  const title = scene.add.bitmapText(x + W / 2, y + 7, FONT, '').setOrigin(0.5, 0).setTint(0xfff080).setDepth(depth);
  const body = scene.add.bitmapText(x + 12, y + 22, FONT, '').setLineSpacing(3).setDepth(depth);
  const count = scene.add.bitmapText(x + W / 2, y + H - 17, FONT, '').setOrigin(0.5, 0).setTint(0xc0c8f0).setDepth(depth);
  const turn = (step: number) => {
    page = Math.min(PAGES.length - 1, Math.max(0, page + step));
    render();
  };
  const prev = new TextButton(scene, x + 8, y + H - 22, 56, '< BACK', () => turn(-1)).setDepth(depth);
  const next = new TextButton(scene, x + W - 144, y + H - 22, 56, 'NEXT >', () => turn(1)).setDepth(depth);
  const close = new TextButton(scene, x + W - 80, y + H - 22, 72, 'CLOSE', () => onClose()).setDepth(depth);
  function render(): void {
    const p = PAGES[page]!;
    title.setText(p.title);
    body.setText(p.lines.join('\n'));
    count.setText(`${page + 1}/${PAGES.length}`);
    prev.setEnabled(page > 0);
    next.setEnabled(page < PAGES.length - 1);
  }
  render();
  const onKey = dedupe((e: KeyboardEvent) => {
    if (e.key === 'ArrowLeft') turn(-1);
    else if (e.key === 'ArrowRight') turn(1);
    else if (e.key === 'Escape') onClose();
  });
  scene.input.keyboard?.on('keydown', onKey);
  return () => {
    scene.input.keyboard?.off('keydown', onKey);
    [blocker, box, title, body, count, prev, next, close].forEach((o) => o.destroy());
  };
}
