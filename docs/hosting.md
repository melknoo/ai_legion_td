# Hosting

Live: **https://legion.schleiweb.de**, served from the owner's always-on Linux laptop at home (Linux Mint, Starlink with CGNAT). Fly.io (`fly.toml`) still works as an alternative but is not the live setup.

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
The laptop holds a copy of the working tree, not a git clone. From the repo root on the Windows PC (Git Bash):

```sh
tar --exclude=node_modules --exclude=dist --exclude=reference --exclude=.git --exclude='.env' -czf - . \
  | ssh legion-home 'tar -xzf - -C ~/legion-pixel'
ssh legion-home 'cd ~/legion-pixel/deploy/home && docker compose up -d --build'
```

Rebuilding restarts the game container: running games end (rooms are in memory). Run `npm test` and `npm run typecheck` first.

Caching (`server/src/static.ts`): the page is `no-cache`, Vite bundles are immutable, and the ~1900 sprite PNGs stay a day at Cloudflare and an hour in the browser, because pulling them through the Starlink uplink makes the first load slow. If a deploy changes existing sprite files, purge the Cloudflare cache for the zone (Caching → Purge Everything) or they stay stale for up to a day.

## Check
```sh
ssh legion-home 'cd ~/legion-pixel/deploy/home && docker compose ps && docker compose logs --tail 20 cloudflared'
curl -s -o /dev/null -w '%{http_code}\n' https://legion.schleiweb.de/
```

`cloudflared` should log "Registered tunnel connection" (four connections, Frankfurt). If the home DNS has cached a miss for a new hostname, test with `--resolve` or another resolver.
