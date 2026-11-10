// Electron main process of the desktop app. The built client (desktop/app, `vite build --mode desktop`)
// is served from the custom scheme app://legion/: absolute paths like /icons/... resolve as on the
// web, and the origin stays the same between starts, so localStorage (settings, name) persists.
const { app, BrowserWindow, Menu, ipcMain, net, protocol, shell } = require('electron');
const fs = require('node:fs');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

const SCHEME = 'app';
const HOST = 'legion';
const ORIGIN = `${SCHEME}://${HOST}`;
const APP_DIR = path.join(__dirname, '..', 'app');
const WINDOW_FILE = () => path.join(app.getPath('userData'), 'window.json');

protocol.registerSchemesAsPrivileged([
  { scheme: SCHEME, privileges: { standard: true, secure: true, supportFetchAPI: true, corsEnabled: true, stream: true } },
]);

/** `--server=URL` overrides the server set in the options (e.g. a LAN or test server). */
function serverArg() {
  const arg = process.argv.find((a) => a.startsWith('--server='));
  const value = arg?.slice('--server='.length).trim();
  if (!value) return null;
  try {
    const url = new URL(/^https?:\/\//.test(value) ? value : `http://${value}`);
    return url.protocol === 'http:' || url.protocol === 'https:' ? url.origin : null;
  } catch {
    return null;
  }
}

function readWindowState() {
  try {
    const s = JSON.parse(fs.readFileSync(WINDOW_FILE(), 'utf8'));
    return { width: Math.max(640, Number(s.width) || 1280), height: Math.max(360, Number(s.height) || 720), fullscreen: !!s.fullscreen };
  } catch {
    return { width: 1280, height: 720, fullscreen: false };
  }
}

function saveWindowState(win) {
  const [width, height] = win.isFullScreen() ? [readWindowState().width, readWindowState().height] : win.getSize();
  try {
    fs.writeFileSync(WINDOW_FILE(), JSON.stringify({ width, height, fullscreen: win.isFullScreen() }));
  } catch {
    // Not worth bothering the player; the next start uses the defaults.
  }
}

/** Serves app://legion/<path> from APP_DIR; anything outside it is a 404. */
function serveApp() {
  protocol.handle(SCHEME, (req) => {
    const url = new URL(req.url);
    if (url.host !== HOST) return new Response('not found', { status: 404 });
    const rel = decodeURIComponent(url.pathname);
    const file = path.normalize(path.join(APP_DIR, rel === '/' ? 'index.html' : rel));
    if (file !== APP_DIR && !file.startsWith(APP_DIR + path.sep)) return new Response('not found', { status: 404 });
    if (!fs.existsSync(file) || fs.statSync(file).isDirectory()) return new Response('not found', { status: 404 });
    return net.fetch(pathToFileURL(file).toString());
  });
}

function createWindow() {
  const state = readWindowState();
  const win = new BrowserWindow({
    width: state.width,
    height: state.height,
    minWidth: 640,
    minHeight: 360,
    fullscreen: state.fullscreen,
    backgroundColor: '#0b0b18',
    title: 'Legion Pixel',
    icon: path.join(APP_DIR, 'icons', 'icon-512.png'),
    show: false,
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      sandbox: true,
      nodeIntegration: false,
      // Solo games keep running behind other windows; the game has its own pause menu.
      backgroundThrottling: false,
      additionalArguments: [`--legion-server=${serverArg() ?? ''}`, `--legion-version=${app.getVersion()}`],
    },
  });
  win.once('ready-to-show', () => win.show());

  const notify = () => win.webContents.send('fullscreen', win.isFullScreen());
  win.on('enter-full-screen', notify);
  win.on('leave-full-screen', notify);
  win.on('close', () => saveWindowState(win));

  // No menu bar, so Ctrl+R / Ctrl+W can't reload or close mid-game. F11 / Alt+Enter: fullscreen;
  // F12: developer tools (only when run from source).
  win.webContents.on('before-input-event', (event, input) => {
    if (input.type !== 'keyDown') return;
    if (input.key === 'F11' || (input.alt && input.key === 'Enter')) {
      win.setFullScreen(!win.isFullScreen());
      event.preventDefault();
    } else if (input.key === 'F12' && !app.isPackaged) {
      win.webContents.toggleDevTools();
      event.preventDefault();
    }
  });

  // Links leave the app for the system browser; the window itself never navigates away.
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:\/\//.test(url)) void shell.openExternal(url);
    return { action: 'deny' };
  });
  win.webContents.on('will-navigate', (event, url) => {
    if (!url.startsWith(`${ORIGIN}/`)) event.preventDefault();
  });

  void win.loadURL(`${ORIGIN}/`);
  return win;
}

if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  Menu.setApplicationMenu(null);
  app.on('second-instance', () => {
    const win = BrowserWindow.getAllWindows()[0];
    if (!win) return;
    if (win.isMinimized()) win.restore();
    win.focus();
  });
  ipcMain.on('set-fullscreen', (event, on) => BrowserWindow.fromWebContents(event.sender)?.setFullScreen(!!on));
  ipcMain.on('get-fullscreen', (event) => {
    event.returnValue = !!BrowserWindow.fromWebContents(event.sender)?.isFullScreen();
  });
  app.whenReady().then(() => {
    serveApp();
    createWindow();
  });
  app.on('window-all-closed', () => app.quit());
}
