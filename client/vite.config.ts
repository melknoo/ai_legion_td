import { defineConfig } from 'vite';

export default defineConfig({
  // Listen on the LAN too, so friends can join a local game server.
  server: { port: 5173, host: true },
});
