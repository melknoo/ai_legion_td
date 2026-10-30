# Hosting

Live: **https://legion.schleiweb.de**, served from the owner's always-on Linux laptop at home (Linux Mint, Starlink with CGNAT). Fly.io was used before and dropped to save cost.

## How it is wired
- Cloudflare (account of the owner, zone `schleiweb.de`) → Networking → Tunnels → tunnel `legion-home`, one published-application route `legion.schleiweb.de` → `http://legion:8080`. Cloudflare created the DNS CNAME itself.
- On the laptop: `~/legion-pixel/deploy/home/compose.yml` runs two containers in their own Docker network:
  - `legion`: the `Dockerfile` image (server + built client on port 8080). Non-root (`USER node`), read-only root with `/tmp` as tmpfs, all capabilities dropped, memory/CPU limits, published only on `127.0.0.1:8080`.
  - `cloudflared`: dials out to Cloudflare with `TUNNEL_TOKEN` from `deploy/home/.env` (mode 600, gitignored, only on the laptop – never read, print or commit it).
- No inbound port is open: `ufw` denies incoming except from the home LAN and `tailscale0`. Do not add port forwards or bind the game to `0.0.0.0`.
- Both containers use `restart: unless-stopped`, so they come back after a reboot.

## Access
SSH over Tailscale with key auth: `ssh legion-home`, an alias in the owner's `~/.ssh/config` (host and user stay out of this public repo; key of the owner's Windows PC). The SSH user is in the `docker` group, so deploys need no sudo. Never log in with a password; anything needing sudo (packages, firewall) is done by the owner.

## Deploy an update
The laptop holds a copy of the working tree (`~/legion-pixel`, previous one in `~/legion-pixel.old`), not a git clone. From the repo root on the Windows PC:

```sh
npm run deploy   # scripts/deploy-home.sh: typecheck + tests, upload, rebuild, health check
```

It deploys the working tree as it is, committed or not. Rebuilding restarts the game container: running games end (rooms are in memory). Run `npm test` and `npm run typecheck` first.

Caching (`server/src/static.ts`): the page is `no-cache`, Vite bundles are immutable, and the ~1900 sprite PNGs stay a day at Cloudflare and an hour in the browser, because pulling them through the Starlink uplink makes the first load slow. If a deploy changes existing sprite files, purge the Cloudflare cache for the zone (Caching → Purge Everything) or they stay stale for up to a day.

## Check
```sh
ssh legion-home 'cd ~/legion-pixel/deploy/home && docker compose ps && docker compose logs --tail 20 cloudflared'
curl -s -o /dev/null -w '%{http_code}\n' https://legion.schleiweb.de/
```

`cloudflared` should log "Registered tunnel connection" (four connections, Frankfurt). If the home DNS has cached a miss for a new hostname, test with `--resolve` or another resolver.

## Monitoring
All in `server/src/monitor.ts`, no external service needed:

- **`GET /health`** (public): `{ ok, uptimeS, rooms, playing, players }`. The deploy script checks it. For alerts when the site is down, point a free uptime checker (e.g. UptimeRobot or healthchecks.io, the owner's account) at `https://legion.schleiweb.de/health`.
- **`GET /stats`**: HTML page with open rooms, running solo games, recent games (online and solo), games per day, builder picks and recent client errors. Protected by HTTP basic auth (any user name, password `STATS_TOKEN` from `deploy/home/.env`); without `STATS_TOKEN` it answers 404. Finished games are appended to `/data/games.jsonl` in the `legion-data` volume, so the tables survive deploys; the counters at the top restart with the container.
- **`POST /client-error`**: production clients report uncaught errors here (`client/src/errorReport.ts`, at most 5 per page load; the server takes 10 per minute per IP and 4 KB per report).
- **`POST /solo`**: solo games run in the browser, so production clients report their start, each wave and their end here (`client/src/soloReport.ts`; leaving or closing the tab counts as abandoned, 20 minutes without a report too). Every field is checked against the game data, 30 reports per minute per IP, at most 200 running solo games. Finished ones go to the same history with `solo: true`.
- **Logs**: the server writes one JSON line per event (`server.start`, `room.create`, `game.start`, `game.end`, `game.abandon`, `solo.start`, `solo.end`, `solo.abandon`, `room.dispose`, `client.error`, `server.crash`). Docker keeps 3 × 10 MB.

```sh
ssh legion-home 'docker logs --tail 50 legion-legion-1'
ssh legion-home 'docker logs legion-legion-1 2>&1 | grep client.error'
```
