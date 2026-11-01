import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineConfig, type Plugin } from 'vite';

/** Stamps the service worker with a build id, so each deploy replaces the offline cache. */
function swVersion(): Plugin {
  return {
    name: 'sw-version',
    apply: 'build',
    writeBundle(options) {
      const file = path.join(options.dir ?? 'dist', 'sw.js');
      fs.writeFileSync(file, fs.readFileSync(file, 'utf8').replaceAll('__BUILD__', Date.now().toString(36)));
    },
  };
}

/** Largest clip the dev server accepts (a 58 s Short at 12 Mbit/s is ~90 MB). */
const MAX_CLIP_BYTES = 200 * 1024 * 1024;
const LOOPBACK = new Set(['127.0.0.1', '::1', '::ffff:127.0.0.1']);

/**
 * Dev only: `?showcase&rec` posts finished clips to `/__clips/<name>.webm`, which lands them in
 * `media/clips/` (gitignored). Browsers block repeated automatic downloads; this needs no prompt.
 * The dev server listens on the LAN, so only this machine may write.
 */
function clipSink(): Plugin {
  const root = fileURLToPath(new URL('..', import.meta.url));
  const dir = path.join(root, 'media', 'clips');
  return {
    name: 'clip-sink',
    apply: 'serve',
    configureServer(server) {
      server.middlewares.use('/__clips', (req, res) => {
        const name = decodeURIComponent((req.url ?? '').slice(1));
        if (req.method !== 'POST' || !LOOPBACK.has(req.socket.remoteAddress ?? '') || !/^legion-[\w-]+\.webm$/.test(name)) {
          res.statusCode = 403;
          return res.end();
        }
        const chunks: Buffer[] = [];
        let size = 0;
        req.on('data', (c: Buffer) => {
          size += c.length;
          if (size > MAX_CLIP_BYTES) req.destroy();
          else chunks.push(c);
        });
        req.on('end', () => {
          fs.mkdirSync(dir, { recursive: true });
          const file = path.join(dir, name);
          fs.writeFileSync(file, Buffer.concat(chunks));
          res.setHeader('content-type', 'application/json');
          res.end(JSON.stringify({ file: path.relative(root, file).replaceAll(path.sep, '/') }));
        });
      });
    },
  };
}

export default defineConfig({
  // Listen on the LAN too, so friends can join a local game server.
  server: { port: 5173, host: true },
  plugins: [swVersion(), clipSink()],
});
