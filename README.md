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
- Online rooms: the host picks the mode (All Pick, All Random, Single Draft, All Prophet), adds bots and starts; others pick team and builder and get ready. Friends on your network use your LAN IP instead of localhost.
- Deep links: `?room=CODE` joins, `?online` creates a room, `?builder=grove&size=2&mode=ar` (`ap`, `ar`, `sd`, `apr`) starts a solo game directly.
- Dev options: `?fast` (short build phases), `?timeout` (setTimeout game loop for throttled/background windows).
- Server smoke test: `cd server && npx tsx scripts/smoke.ts` (with the server running).

Controls (everything also works with the mouse via the HUD):
- Command card `Q W E R` / `A S D F` / `Y X C V` (`Z` works for `Y` on QWERTY) or click a portrait: arm a fighter / send a merc; click a tile to place one, hold `Shift` to place several
- `1` / `2` or the coin/log buttons: fighters (gold) or sends (lumber); `2` again (or `N`) turns the send page. Sends work in the build phase too, a running wave shows sends only
- Prophet (or the All Prophet mode): one random fighter per tier; `V` rerolls them (7 times, rising gold and lumber cost)
- `T` or the `?` button: attack-vs-armor damage chart. Slot corners show attack type (icon) and armor (shield) in their type colours; a green/red backing means strong/weak against the coming wave
- click a unit to select it (any unit, including creeps and enemies; hover shows its HP and stats); `U` upgrade, `Del` sell
- `Esc` / right click: cancel placement and selection
- `B` buy wisp, `G` farm, `H/J/K` king HP/attack/regen
- `TAB` / view tabs: my lane, my king, foe lane, foe king; `R` restart after game over
- The battlefield camera follows the fighting; pan with `←/→` or the mouse wheel. Menus/HUD are laid out at 480x270 and drawn 2x on a 960x540 canvas, the field at 3x

## Hosting (Fly.io)

The server can serve the built client itself (`CLIENT_DIR`), so one process on one port runs page and game:

```sh
npm run build -w @legion/client
cd server && CLIENT_DIR=../client/dist PORT=8080 npx tsx src/index.ts   # http://localhost:8080
```

`Dockerfile` and `fly.toml` deploy exactly that. Rooms live in memory, so run a single machine:

```sh
fly launch --no-deploy --copy-config   # first time only: creates the app (rename it in fly.toml if the name is taken)
fly deploy --ha=false
```

The machine stops when nobody is connected and starts again on the next visit (a few seconds' wait).

## Hosting at home (Cloudflare Tunnel)

Any always-on Linux box with Docker works, even behind CGNAT (Starlink): `cloudflared` only dials out, so no router port is opened and the home IP stays hidden.

1. Cloudflare Zero Trust → Networks → Tunnels → create a `cloudflared` tunnel, copy its token, and add a public hostname (e.g. `legion.example.com`) → service `http://legion:8080`.
2. On the box:

```sh
git clone <repo> && cd ai_legion_td
cp deploy/home/.env.example deploy/home/.env   # paste TUNNEL_TOKEN
docker compose -f deploy/home/compose.yml up -d --build
```

Updates: `git pull` and the same `up -d --build` (running games end, rooms live in memory). The game container runs as non-root on a read-only filesystem without capabilities and is only bound to `127.0.0.1`. Keep the host firewall closed to incoming traffic (e.g. `ufw default deny incoming`, SSH only over Tailscale).

## Credits

Graphics: [Ninja Adventure Asset Pack](https://pixel-boy.itch.io/ninja-adventure-asset-pack) by Pixel-boy & AAA (CC0).
