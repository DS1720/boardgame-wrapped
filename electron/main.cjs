/**
 * The desktop shell.
 *
 * Board Game Wrapped is two halves that already talk over HTTP: a React UI and
 * a Node render service. This does not rewrite either of them — it starts the
 * service in a child process, waits for it to answer, and points a window at
 * it. That is deliberate: the packaged app runs the *same* server the dev
 * script does, so there is no second code path to keep in sync and no class of
 * bug that only appears in the .exe.
 *
 * CommonJS on purpose. Electron's main process supports ESM only from v28, and
 * a `.cjs` entry works on every version without a flag.
 */
const { app, BrowserWindow, ipcMain, shell, dialog } = require('electron');
const { spawn, execFile } = require('node:child_process');
const fs = require('node:fs');
const net = require('node:net');
const path = require('node:path');

/** Where the app's own files live, packaged or not. */
const ROOT = app.isPackaged ? path.join(process.resourcesPath, 'app') : path.join(__dirname, '..');

let child = null;
let window = null;
/** The port the service came up on, so shutdown can ask it to stop. */
let servicePort = null;

/**
 * Where the app keeps what the *user* accumulates: downloaded covers, uploaded
 * music, the mirrored fonts they depend on.
 *
 * Not the install directory. Everything under here is created after install,
 * and an update is entitled to replace the program's own files — so a cover
 * cache living beside the .exe is a cache that an update can delete, and an
 * uploaded track living there is a track the user loses. AppData survives
 * updates and uninstalls, which is the whole point of it.
 */
const userPublicDir = () => path.join(app.getPath('userData'), 'public');

/**
 * Copy the shipped fonts into the user's public directory, once.
 *
 * The other two subdirectories fill themselves — covers are downloaded and
 * tracks are uploaded — but the fonts ship with the app and `staticFile()`
 * resolves them against this directory, so they have to be here or every
 * render falls back to a system face.
 */
const seedFonts = (target) => {
  const from = path.join(ROOT, 'public', 'fonts');
  const to = path.join(target, 'fonts');
  if (!fs.existsSync(from) || fs.existsSync(path.join(to, 'manifest.json'))) return;
  fs.mkdirSync(to, { recursive: true });
  for (const file of fs.readdirSync(from)) {
    fs.copyFileSync(path.join(from, file), path.join(to, file));
  }
};

/**
 * A port nobody is using.
 *
 * Not hardcoded 4000: somebody running `npm run server` in a checkout would
 * otherwise collide with their own installed copy, and the failure would look
 * like the app silently showing the wrong thing.
 */
const freePort = () =>
  new Promise((resolve, reject) => {
    const probe = net.createServer();
    probe.unref();
    probe.on('error', reject);
    probe.listen(0, '127.0.0.1', () => {
      const { port } = probe.address();
      probe.close(() => resolve(port));
    });
  });

/** Resolve once the service answers /health, or give up. */
const waitForServer = async (port, timeoutMs = 60_000) => {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      const res = await fetch(`http://127.0.0.1:${port}/api/health`);
      if (res.ok) return true;
    } catch {
      // Not up yet. The first start also unpacks Remotion's native compositor,
      // which is why the timeout is generous rather than a couple of seconds.
    }
    await new Promise((r) => setTimeout(r, 250));
  }
  return false;
};

const startServer = (port) => {
  servicePort = port;
  // Electron's own binary is a Node runtime when ELECTRON_RUN_AS_NODE is set,
  // so the packaged app needs no system Node installed.
  child = spawn(process.execPath, [path.join(ROOT, 'build', 'server.cjs')], {
    cwd: ROOT,
    env: {
      ...process.env,
      ELECTRON_RUN_AS_NODE: '1',
      BGW_PORT: String(port),
      // Installed, finished videos go to the user's Videos folder and the
      // cover cache to AppData. A render that lands inside the install
      // directory is somewhere nobody looks, and a cache that lives there is
      // one an update can wipe. A checkout keeps using out/ and public/, so the
      // dev flow is unchanged.
      ...(app.isPackaged
        ? {
            BGW_OUT_DIR: path.join(app.getPath('videos'), 'Board Game Wrapped'),
            BGW_PUBLIC_DIR: userPublicDir(),
            // settings.json lives with the rest of the user's data, not in the
            // install directory an update may replace.
            BGW_CONFIG_DIR: app.getPath('userData'),
          }
        : {}),
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  });

  child.stdout.on('data', (d) => process.stdout.write(`[server] ${d}`));
  child.stderr.on('data', (d) => process.stderr.write(`[server] ${d}`));
  child.on('exit', (code) => {
    child = null;
    // A server that dies takes the window with it; a window with no service
    // behind it can only show errors.
    if (code !== 0 && !app.isQuitting) {
      dialog.showErrorBox(
        'Board Game Wrapped',
        `The render service stopped unexpectedly (exit code ${code}).`,
      );
    }
  });
};

const createWindow = (port) => {
  window = new BrowserWindow({
    width: 1400,
    height: 950,
    minWidth: 1024,
    backgroundColor: '#12140f',
    title: 'Board Game Wrapped',
    autoHideMenuBar: true,
    show: false,
    webPreferences: {
      // The page is our own built UI and talks to its own localhost service.
      // It needs no Node access, so it does not get any — the preload hands it
      // one function and nothing else.
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, 'preload.cjs'),
    },
  });

  window.once('ready-to-show', () => window.show());
  window.loadURL(`http://127.0.0.1:${port}/`);

  // Anything that is not this app opens in the real browser rather than in a
  // chromeless window the user cannot navigate.
  window.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: 'deny' };
  });
};

/**
 * Check GitHub for a newer release, and install it on quit if there is one.
 *
 * Deliberately quiet: it never interrupts, never blocks startup, and a failed
 * check is not worth a dialog — this is a local tool, and being unable to reach
 * GitHub is not a problem the user needs to hear about mid-session.
 *
 * Only in a packaged build. Running from a checkout, git is the update
 * mechanism.
 */
const checkForUpdates = () => {
  if (!app.isPackaged) return;
  try {
    const { autoUpdater } = require('electron-updater');
    autoUpdater.autoDownload = true;
    autoUpdater.autoInstallOnAppQuit = true;
    autoUpdater.on('error', (err) => console.error('[update]', err?.message ?? err));
    autoUpdater.on('update-available', (i) => console.log('[update] found', i?.version));
    autoUpdater.on('update-downloaded', (i) => {
      console.log('[update] ready, installs on quit:', i?.version);
      if (window) {
        // Said in the title bar rather than a modal: nothing is interrupted,
        // and the app is already usable.
        window.setTitle('Board Game Wrapped — update ready, restart to apply');
      }
    });
    autoUpdater.checkForUpdates().catch(() => undefined);
  } catch {
    // electron-updater not installed, or no publish config. Not fatal: the app
    // works, it just will not update itself.
  }
};

// The page cannot be given a filesystem path by a browser, so the shell asks
// for one on its behalf. The only privileged thing the UI can do.
ipcMain.handle('bgw:choose-folder', async (_event, current) => {
  const result = await dialog.showOpenDialog({
    title: 'Where should videos be saved?',
    defaultPath: current || app.getPath('videos'),
    properties: ['openDirectory', 'createDirectory'],
  });
  return result.canceled ? null : (result.filePaths[0] ?? null);
});

app.whenReady().then(async () => {
  const port = await freePort();
  if (app.isPackaged) seedFonts(userPublicDir());
  startServer(port);

  if (!(await waitForServer(port))) {
    dialog.showErrorBox(
      'Board Game Wrapped',
      'The render service did not start. Try launching the app again.',
    );
    app.quit();
    return;
  }

  createWindow(port);
  checkForUpdates();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow(port);
  });
});

/**
 * Stop the service, and everything it started.
 *
 * `child.kill()` alone was not enough. It does end the service — on Windows it
 * terminates unconditionally — but the headless Chrome a render opens is a
 * child of the *service*, not of this process, and Windows does not cascade a
 * kill down the tree. Quitting mid-render left a `headless_shell.exe` behind
 * holding a few hundred megabytes until somebody found it in Task Manager.
 *
 * So this asks first and kills second:
 *
 *  1. `POST /shutdown`, which closes the browser the same way Cancel does and
 *     then exits. A signal would not do: Windows delivers no SIGTERM, and a
 *     handler for one never runs.
 *  2. Wait for the process to actually go, briefly.
 *  3. Kill the whole tree anyway. A service wedged badly enough to ignore step
 *     one is exactly the case where its children need collecting, and by this
 *     point there is nothing left to be graceful about.
 */
const GRACEFUL_MS = 4000;

const ask = (port) =>
  fetch(`http://127.0.0.1:${port}/api/shutdown`, {
    method: 'POST',
    signal: AbortSignal.timeout(GRACEFUL_MS),
  }).catch(() => undefined);

const waitForExit = (proc, timeoutMs) =>
  new Promise((resolve) => {
    if (proc.exitCode !== null || proc.signalCode !== null) return resolve(true);
    const timer = setTimeout(() => resolve(false), timeoutMs);
    proc.once('exit', () => {
      clearTimeout(timer);
      resolve(true);
    });
  });

const killTree = (proc) =>
  new Promise((resolve) => {
    if (process.platform !== 'win32') {
      proc.kill('SIGKILL');
      return resolve();
    }
    // /T takes the children with it, which is the entire point.
    execFile('taskkill', ['/pid', String(proc.pid), '/T', '/F'], () => resolve());
  });

const stopServer = async () => {
  app.isQuitting = true;
  const proc = child;
  const port = servicePort;
  child = null;
  if (!proc) return;

  if (port) await ask(port);
  if (await waitForExit(proc, GRACEFUL_MS)) return;

  console.warn('[server] did not stop when asked; killing the process tree');
  await killTree(proc);
  await waitForExit(proc, 2000);
};

/*
  Quit is held open until the service is down.

  `before-quit` is the only hook that can still defer the exit, so the cleanup
  runs there and `app.exit` finishes the job — it skips the quit events, which
  is what stops this from re-entering itself.
*/
let quitting = false;

app.on('before-quit', (event) => {
  if (quitting) return;
  quitting = true;
  if (!child) return;

  event.preventDefault();
  stopServer().finally(() => app.exit(0));
});

app.on('window-all-closed', () => app.quit());
