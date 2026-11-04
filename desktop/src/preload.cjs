// Bridge between the sandboxed page and the main process, read by client/src/desktop.ts.
const { contextBridge, ipcRenderer } = require('electron');

const arg = (name) => process.argv.find((a) => a.startsWith(`--${name}=`))?.slice(name.length + 3) ?? '';

let fullscreen = ipcRenderer.sendSync('get-fullscreen');
ipcRenderer.on('fullscreen', (_event, on) => (fullscreen = on));

contextBridge.exposeInMainWorld('legionDesktop', {
  serverOverride: arg('legion-server') || null,
  version: arg('legion-version'),
  isFullscreen: () => fullscreen,
  setFullscreen: (on) => {
    fullscreen = !!on;
    ipcRenderer.send('set-fullscreen', !!on);
  },
});
