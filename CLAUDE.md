# Legion Pixel – notes for Claude

Personal browser remake of the WC3 map *Legion TD Mega*: online multiplayer, side-view lanes (FF6 battle layout), SNES/FF6 pixel look with strong effects. See `README.md` for layout, commands and controls, `docs/mechanics.md` (German) for the game rules. The owner writes in German.

## Hard rules
- No Blizzard assets, models or texts. Builders and fighters are renamed; mechanics and numbers are adapted, not copied 1:1 (Legion TD 2 is commercial).
- Raw map data lives only in the gitignored `reference/`. Never commit it: this repo is public.
- Ask the owner before downloading anything (asset/VFX packs: name the file, source and size first).
- Only add npm packages whose version is at least two weeks old, pinned exactly. `@colyseus/schema` must resolve to a single version (5.0.42) or state sync silently breaks.

## Architecture
- `shared/`: deterministic simulation (`sim/game.ts`, 20 Hz, seeded `rng.ts`), abilities (`sim/abilities.ts`, 12 effect kinds; data in `data/abilities.ts` + one file per builder in `data/abilities/`), bot (`sim/bot.ts`), content (`data/legion.ts`; fighters are generated into `data/fighters.generated.ts`).
- `server/`: Colyseus 0.18 `LegionRoom` – lobby (modes AP/AR/SD/All Prophet, bots fill seats), then runs the authoritative sim and sends patches + `ev` event batches. Clients only send commands.
- `client/`: Phaser 4 + Vite. `Session` interface with `LocalSession` (solo vs bots, sim in the browser) and `NetSession`. `BattleScene` draws the field, `UiScene` the HUD on top.
- Screen: canvas 960x540; menus/HUD are laid out at 480x270 and drawn at 2x via `layoutCamera()` (`client/src/layout.ts`); the battlefield camera uses zoom 3. World units → field pixels via `SCALE` 0.25.
- Graphics: Ninja Adventure pack (CC0) in `client/public/assets/ninja`, mapped in `client/src/assets/manifest.ts` and the generated `sprites.generated.ts`. Fighters attack in their builder's style (`client/src/render/attackStyle.ts`: projectile + impact FX, per-fighter overrides).
- Sound: picks from the same pack in `assets/ninja/Audio` (`SOUNDS` in the manifest), played through `client/src/audio/sfx.ts` (throttled per key, voice cap). Settings (sound, volume, shake) in `client/src/settings.ts`, UI in `client/src/ui/options.ts`.

## Content pipeline
- 18 builders + Chimera (morph eggs that hatch into a random fighter of the same tier) = 232 fighters. The Prophet (`random` builder) has no fighters of its own: the sim rolls each player a roster in `PlayerState.fighters`, so read that, never `builders[..].fighters`. Pharaoh is skipped on purpose (unfinished in the original).
- New names/sprites go in `tools/map-extract/rename-fighters.json` or `rename-parts/<builderId>.json`, then run the exporter (command in README). It needs `reference/analysis/builders.json`, which is not in git – copy `reference/` over by hand. Without it the game still runs; only regeneration fails.
- `reference/` (when present): `map/` (3.47lHf3 from epicwar.com/maps/356721 – Reforged v3 object data, obfuscated JASS; 3.44 from /maps/327712 – readable GUI trigger names, use it for logic), `analysis/` (builders.json/md, builder-abilities.md, jass-mechanics.md).

## Gotchas
- Sprite texture keys must go through `spriteKey()`: the pack has characters and monsters with the same folder name (e.g. Spirit).
- Phaser 4's glow filter renders black boxes on small sprites – don't use it.
- Mobile performance: no filters on per-unit or HUD objects (each one is an extra render pass); hue-shifted sprites are baked copies (`spriteKey()` adds `~hue`, `render/hue.ts`, baked in BootScene). Don't mix Shapes/Graphics in between images either (each switch is a draw call): use `ellipseTexture()` / tinted `__WHITE` images, one shared Graphics per layer (HP bars, `SwingTrails`). A busy 4v4 fight is ~13 draw calls per frame; count `gl.drawElements` after rendering changes.
- Phaser re-dispatches queued key events; keyboard input is deduped in `client/src/ui/keys.ts`.
- Killed creeps and sends are removed from the state before their `death` event is handled; read their `def` from the unit view (it lives until the next `syncUnits`), position from the event.
- No pushback: enemies cannot shove a unit that is fighting (`engaged` set in `game.ts`). A test guards this.
- Bosses (waves 10/20/30) take stuns/slows at `BOSS_CC_FACTOR` 0.25.
- Hosting: the owner's home laptop behind a Cloudflare Tunnel (https://legion.schleiweb.de, `deploy/home/compose.yml`, `Dockerfile`); deploy with `npm run deploy` (`scripts/deploy-home.sh`), details in `docs/hosting.md`. Fly.io was dropped to save cost. The server serves `client/dist` when `CLIENT_DIR` is set, and the client connects to its own origin in production builds. One instance only: rooms are in memory. The image runs as `USER node` on a read-only root, so the server must not write outside `/tmp` and the `/data` volume (game history). Monitoring (`/health`, `/stats`, `/client-error`, JSON logs) lives in `server/src/monitor.ts`, see `docs/hosting.md`.
- Browser testing: a background/occluded Chrome window throttles `requestAnimationFrame`; use `?timeout&fast`.

## Verify
`npm test` (Vitest, sim) and `npm run typecheck` must stay clean; check visual changes in the browser (no console errors).

## Open
- Balance: bots leak a lot around waves 5–10 even with roughly the original recommended army value; bot-vs-bot games end around wave 10. Unclear whether the sim is harder than the original or the bot builds badly – needs the owner's feel from playing.
- External VFX packs (candidate: Foozle "Pixel Magic Effects", CC0) – waiting for the owner's OK.
- Mobile: first version is in (PWA, touch controls, see README). Not yet checked on a real phone/tablet; desktop Chrome has no touch, so tests feed touch events into `game.input.onTouchStart/Move/End`. Command-card slots on phones are ~55x36 CSS px, MiniButtons were enlarged for touch only. Possible next steps: Play Store via TWA (Bubblewrap), bigger touch layout after the WC3-style HUD rework.
- Later: "Prophet Randomize" mode (new roster every wave), leak-bounty factor, team-size balancing, music, client auto-reconnect, `npm audit` warnings.
