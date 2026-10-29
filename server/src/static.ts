import fs from 'node:fs';
import type { IncomingMessage, ServerResponse } from 'node:http';
import path from 'node:path';

const TYPES: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json',
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
    if (!file.startsWith(dir)) return next();
    if (!fs.existsSync(file) || fs.statSync(file).isDirectory()) {
      // Matchmaking and other API routes have no extension-less file behind them either.
      if (url.startsWith('/matchmake') || path.extname(url)) return next();
      file = path.join(dir, 'index.html');
    }
    // Vite fingerprints assets, so those can be cached for good; the page itself must stay fresh.
    const immutable = url.startsWith('/assets/') && /-[\w-]{8,}\./.test(url);
    res.writeHead(200, {
      'Content-Type': TYPES[path.extname(file)] ?? 'application/octet-stream',
      'Cache-Control': immutable ? 'public, max-age=31536000, immutable' : 'no-cache',
    });
    if (req.method === 'HEAD') return void res.end();
    fs.createReadStream(file).pipe(res);
  };
}
