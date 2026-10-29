# Legion Pixel

Standalone browser remake of the Warcraft III map *Legion TD Mega* in a SNES/FF6 pixel style.

- `shared/` – deterministic game simulation, content (`src/data/legion.ts`) and the wire protocol
- `server/` – Colyseus 0.18 game server: lobby + authoritative simulation, bots fill empty seats
- `client/` – Phaser 4 + Vite client (local play vs. a bot, or online via the server)
- `tools/map-extract/` – pipeline that extracted the original map data (raw data stays in the gitignored `reference/`).
  Fighters are generated: names/sprites in `rename-fighters.json` + `rename-parts/*.json`, then
  `node tools/map-extract/export-fighters.mjs reference/analysis/builders.json tools/map-extract/rename-fighters.json shared/src/data/fighters.generated.ts client/src/assets/sprites.generated.ts client/public/assets/ninja`.
  Abilities per builder live in `shared/src/data/abilities/`.
- `docs/mechanics.md` – mechanics specification

## Run

```sh
npm install
npm run dev          # client, http://localhost:5173 (also reachable from the LAN)
npm run dev:server   # game server on :2567 (needed for online play)
npm test             # simulation tests
npm run typecheck
```

- Open `http://localhost:5173`: the title menu offers a solo game (1v1 to 4v4 with bots), creating an online game, joining one by room code (or pasted invite link) and setting your name.
- Online rooms: the host picks the mode (All Pick, All Random, Single Draft), adds bots and starts; others pick team and builder and get ready. Friends on your network use your LAN IP instead of localhost.
- Deep links: `?room=CODE` joins, `?online` creates a room, `?builder=grove&size=2&mode=ar` starts a solo game directly.
- Dev options: `?fast` (short build phases), `?timeout` (setTimeout game loop for throttled/background windows).
- Server smoke test: `cd server && npx tsx scripts/smoke.ts` (with the server running).

Controls (everything also works with the mouse via the HUD):
- `1-6` or click a portrait: arm a fighter / send a merc; click a tile to place one, hold `Shift` to place several
- `Q` or the coin/log buttons: switch the slots between fighters (gold) and sends (lumber); sends work in the build phase too, a running wave shows sends only
- `T` or the `?` button: attack-vs-armor damage chart. Slot corners show attack type (icon) and armor (shield) in their type colours; a green/red backing means strong/weak against the coming wave
- click a unit to select it (any unit, including creeps and enemies; hover shows its HP and stats); `U` upgrade, `S` sell
- `Esc` / right click: cancel placement and selection
- `B` buy wisp, `H/J/K` king HP/attack/regen, `N` next send page
- `TAB` / view tabs: my lane, my king, foe lane, foe king; `R` restart after game over
- The battlefield camera follows the fighting; pan with `←/→` or the mouse wheel. Menus/HUD are laid out at 480x270 and drawn 2x on a 960x540 canvas, the field at 3x

## Credits

Graphics: [Ninja Adventure Asset Pack](https://pixel-boy.itch.io/ninja-adventure-asset-pack) by Pixel-boy & AAA (CC0).
