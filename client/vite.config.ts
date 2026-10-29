import fs from 'node:fs';
import path from 'node:path';
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

export default defineConfig({
  // Listen on the LAN too, so friends can join a local game server.
  server: { port: 5173, host: true },
  plugins: [swVersion()],
});
