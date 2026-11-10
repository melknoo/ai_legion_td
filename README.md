# Legion Pixel

Multiplayer browser tower defense in a SNES/FF6 pixel style: build fighters on your lane, send mercenaries to the enemy, defend your king. Solo against bots or online, 1v1 up to 4v4.

Inspired by the Warcraft III custom map *Legion TD Mega*. A fan project, not affiliated with Blizzard Entertainment or AutoAttack Games; builders, fighters and art are our own (art from a CC0 pack, see Credits).

Play: https://legion.schleiweb.de

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

- Open `http://localhost:5173`: the title menu offers a solo game (1v1 to 4v4 with bots), creating an online game (with a name, public or private), joining one from the list of open public games or by room code (or pasted invite link), and setting your name.
- Online rooms: the host picks the mode (All Pick, All Random, Single Draft, All Prophet), adds bots, switches the room between public (listed for everyone) and private (code/link only) and starts; others pick team and builder and get ready. Friends on your network use your LAN IP instead of localhost. A dropped player (reload, lost network) can rejoin a running game within 60 s: the tab keeps the reconnection token (`client/src/net/rejoin.ts`) and a bot plays the seat meanwhile.
- Deep links: `?room=CODE` joins, `?online` creates a private room, `?builder=grove&size=2&mode=ar` (`ap`, `ar`, `sd`, `apr`) starts a solo game directly.
- Dev options: `?fast` (short build phases), `?timeout` (setTimeout game loop for throttled/background windows), `?showcase` (bots only, 9:16 canvas and clip recording for Shorts, parameters in `docs/shorts.md`), `?auto` (a bot plays your seat in a normal solo game with HUD; `seed`/`wave` as in showcase, for screenshots and promo clips; also in campaign battles), `?campaign` (opens the campaign; `&builder=x&seed=n` starts a run at once).
- Server smoke test: `cd server && npx tsx scripts/smoke.ts` (with the server running).

Controls (everything also works with the mouse via the HUD):
- Command card `Q W E R` / `A S D F` / `Y X C V` (`Z` works for `Y` on QWERTY) or click a portrait: arm a fighter / send a merc; click a tile to place one, hold `Shift` to place several
- The command card has three tabs on its left: `1` BUILD (fighters for gold), `2` SEND (sends for lumber; `2` again, a click on the open tab or `N` turns the page) and `3` KING (wisp, farm and the king's HP/attack/regen upgrades). Sends work in the build phase too; each build phase opens on BUILD, each wave on SEND
- Prophet (or the All Prophet mode): one random fighter per tier; `V` rerolls them (7 times, rising gold and lumber cost)
- `T` or the `?` button in the info panel's corner: attack-vs-armor damage chart. Slot corners show attack type (icon) and armor (shield) in their type colours; a green/red backing means strong/weak against the coming wave
- `I` or the wave button in the top bar (next to the king bars): pin the next wave's preview in the info panel; click again, `Esc` or selecting a unit unpins it
- click a unit to select it (any unit, including creeps and enemies; hover shows its HP and stats); a dashed red line and ring mark what the selected or hovered unit attacks; `U` upgrade, `Del` sell
- damage numbers only show hits by your own units; your own units flash red when they are hit
- `Esc` / right click: cancel placement and selection; with nothing selected `Esc` pauses a solo or campaign game
- `P` or the `P` button in the top bar: pause menu (solo and campaign only: resume, options, how to play, quit / back to the map). Without it the game keeps running in the background, also in an inactive tab or behind other windows
- `B` buy wisp, `G` farm, `H/J/K` king HP/attack/regen: the KING tab's buys, from any tab
- `SPACE`: jump to my lane (again: my king)
- `O` or the `O` button in the top bar: options (sound on/off, volume, screen shake, tips; turning tips back on replays them, HOW TO PLAY opens the rules pages); also on the title screen, which has its own HOW TO PLAY entry
- Online: `Enter` team chat, `Shift+Enter` all chat (`Tab` switches while typing, `Esc` cancels); hotkeys pause while typing. The lobby has an all chat and a NAME button to rename yourself before the start
- Every game opens with a short intro card (builder, team, goal in two lines); your own fighters, lane frame and names are gold, everyone else wears their team colour (WEST blue, EAST red)
- The battlefield is one map with every area stacked top to bottom: your lane, ally lanes, your king, the arena battle, the foe king, foe lanes (`client/src/render/fieldMap.ts`). The view shows one whole lane at a time: mouse wheel, `↑`/`↓` or `TAB`/`Shift+TAB` step to the next area, the minimap (bottom right of the HUD, one bar per area) jumps there on click (drag to scroll; it settles on the nearest area). No edge scrolling
- Creeps and sends are drawn at 0.75 of their size, so the fighters stand out
- `R` restart after game over
- Gold, lumber, income and food sit in the top bar; the HUD below the field holds the command card, the info panel and the minimap
- Menus/HUD are laid out at 480x270 and drawn 2x on a 960x540 canvas, the field at 2x

Phones and tablets (landscape; `client/src/ui/touch.ts`):
- tap a button to press it, hold it (~0.35 s) for its tooltip
- tap a slot, then tap a free tile twice (first tap previews, second builds); the slot stays armed until tapped again or a tap lands off the grid
- tap a unit to select it, empty ground to deselect; swipe up/down or tap the minimap for other lanes and kings; the end screen has PLAY AGAIN / MENU buttons
- name, room code and chat use a hidden DOM input over the field, so the on-screen keyboard opens; in the game the `C` button next to `O` opens the chat, in the lobby tap the CHAT heading
- installable as a PWA ("Add to home screen"): `client/public/manifest.webmanifest`, service worker `client/public/sw.js` (production builds only, one cache per build, solo games also start offline). Icons come from `node tools/make-icons.mjs`

## Desktop app (Windows)

`desktop/` wraps the client in Electron: solo games run without any server, online games connect to `https://legion.schleiweb.de`. It is a separate npm package (not a workspace), so Electron stays out of the server image.

```sh
npm --prefix desktop install   # once; downloads the Electron binary (~100 MB)
npm run desktop                # builds the client (vite --mode desktop) into desktop/app and starts the app
npm run desktop:dist           # NSIS installer + portable .exe in desktop/release (build on Windows)
```

- The page is served from `app://legion/` (`desktop/src/main.cjs`); settings and name live in the app's localStorage under `%APPDATA%/Legion Pixel`, the window size in `window.json` there.
- Game server: OPTIONS → SERVER in the title menu (address or LAN IP such as `192.168.1.5:2567`, empty = official), or `--server=URL` on the command line, which wins.
- F11 or Alt+Enter toggles fullscreen (also OPTIONS → FULLSCREEN); no menu bar, so Ctrl+R/Ctrl+W do nothing. F12 opens the developer tools when run from source.
- The build is not code-signed: Windows SmartScreen warns on the first start ("More info" → "Run anyway").
- itch.io: `butler push desktop/release/LegionPixel-<version>-portable.exe <user>/<game>:windows` (butler from itch.io, logged in once with `butler login`).

## Hosting

The server can serve the built client itself (`CLIENT_DIR`), so one process on one port runs page and game:

```sh
npm run build -w @legion/client
cd server && CLIENT_DIR=../client/dist PORT=8080 npx tsx src/index.ts   # http://localhost:8080
```

The `Dockerfile` builds exactly that. Rooms live in memory, so run a single instance.

### At home (Cloudflare Tunnel)

Any always-on Linux box with Docker works, even behind CGNAT (Starlink): `cloudflared` only dials out, so no router port is opened and the home IP stays hidden.

1. Cloudflare Zero Trust → Networks → Tunnels → create a `cloudflared` tunnel, copy its token, and add a public hostname (e.g. `legion.example.com`) → service `http://legion:8080`.
2. On the box:

```sh
git clone <repo> && cd ai_legion_td
cp deploy/home/.env.example deploy/home/.env   # paste TUNNEL_TOKEN
docker compose -f deploy/home/compose.yml up -d --build
```

Updates: `git pull` and the same `up -d --build` (running games end, rooms live in memory), or `npm run deploy` from a dev machine with the SSH alias from `docs/hosting.md`. The game container runs as non-root on a read-only filesystem without capabilities and is only bound to `127.0.0.1`. Keep the host firewall closed to incoming traffic (e.g. `ufw default deny incoming`, SSH only over Tailscale).

## Credits

Graphics and sound effects: [Ninja Adventure Asset Pack](https://pixel-boy.itch.io/ninja-adventure-asset-pack) by Pixel-boy & AAA (CC0). The sounds in `client/public/assets/ninja/Audio` are picks from the pack's `Audio/Sounds` and `Jingles`, converted to mono mp3 (`ffmpeg -i in.wav -ac 1 -ar 32000 -b:a 56k out.mp3`).
