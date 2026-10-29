import fs from 'node:fs';
import type { IncomingMessage, ServerResponse } from 'node:http';
import path from 'node:path';

const TYPES: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json',
  '.webmanifest': 'application/manifest+json',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.ttf': 'font/ttf',
  '.woff2': 'font/woff2',
  '.ogg': 'audio/ogg',
  '.mp3': 'audio/mpeg',
  '.wav': 'audio/wav',
};

/**
 * Serves the built client (hosting: one process for game and page). Unknown GET paths
 * fall back to index.html; everything else goes on to the Colyseus routes.
 */
export function serveClient(root: string) {
  const dir = path.resolve(root);
  return (req: IncomingMessage, res: ServerResponse, next: () => void): void => {
    if (req.method !== 'GET' && req.method !== 'HEAD') return next();
    const url = decodeURIComponent((req.url ?? '/').split('?')[0]!);
    let file = path.join(dir, url);
    // With the separator, a sibling like `../dist-old` cannot pass as inside `dist`.
    if (file !== dir && !file.startsWith(dir + path.sep)) return next();
    if (!fs.existsSync(file) || fs.statSync(file).isDirectory()) {
      // Matchmaking and other API routes have no extension-less file behind them either.
      if (url.startsWith('/matchmake') || path.extname(url)) return next();
      file = path.join(dir, 'index.html');
    }
    // Vite fingerprints its bundles, so those can be cached for good; the page itself must stay
    // fresh, and so must the service worker and app manifest (else the CDN keeps an old one for a
    // day). The ~1900 sprite PNGs are not fingerprinted: a day at the CDN, an hour in the browser,
    // else every visit pulls them all through the home uplink again.
    const ext = path.extname(file);
    const immutable = url.startsWith('/assets/') && /-[\w-]{8,}\./.test(url);
    const cache = immutable
      ? 'public, max-age=31536000, immutable'
      : ext === '.html' || ext === '.webmanifest' || url === '/sw.js'
        ? 'no-cache'
        : 'public, max-age=3600, s-maxage=86400';
    const modified = fs.statSync(file).mtime;
    modified.setMilliseconds(0);
    const since = Date.parse(req.headers['if-modified-since'] ?? '');
    const headers = { 'Cache-Control': cache, 'Last-Modified': modified.toUTCString() };
    if (since >= modified.getTime()) return void res.writeHead(304, headers).end();
    res.writeHead(200, { ...headers, 'Content-Type': TYPES[ext] ?? 'application/octet-stream' });
    if (req.method === 'HEAD') return void res.end();
    fs.createReadStream(file).pipe(res);
  };
}
