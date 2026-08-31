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

/* -------------------------------------------------------------------------- */
/* The port, and why it has to be the same one every time                      */
/* -------------------------------------------------------------------------- */

/**
 * The port the window is served from, remembered between launches.
 *
 * This started as `listen(0)` — any free port — on the reasoning that a
 * hardcoded 4000 would collide with somebody running `npm run server` in a
 * checkout. That reasoning is still right, and the conclusion was still wrong,
 * because **the page's origin includes its port**.
 *
 * A new port every launch is a new origin every launch, and `localStorage` is
 * partitioned by origin. So the slide arrangement, the theme and the whole
 * session were not "lost on update" — they were lost on *every start*, and the
 * previous ones were still sitting in the profile under origins nothing would
 * ever load again. Measured on this machine before the fix: eight distinct
 * `http://127.0.0.1:<port>` origins in one Local Storage database.
 *
 * So: prefer the port used last time, fall back to a fixed default, and only
 * then take whatever is going. The last two are the rare paths, and both are
 * recorded so the *next* launch is stable again.
 */
const PORT_FILE = () => path.join(app.getPath('userData'), 'port.json');

/** Far from 4000, so a checkout's `npm run server` cannot take it. */
const DEFAULT_PORT = 47615;

/** Whether we can actually bind this port right now. */
const portFree = (port) =>
  new Promise((resolve) => {
    const probe = net.createServer();
    probe.unref();
    probe.on('error', () => resolve(false));
    probe.listen(port, '127.0.0.1', () => probe.close(() => resolve(true)));
  });

/** Any port the OS will give us. The last resort. */
const anyPort = () =>
  new Promise((resolve, reject) => {
    const probe = net.createServer();
    probe.unref();
    probe.on('error', reject);
    probe.listen(0, '127.0.0.1', () => {
      const { port } = probe.address();
      probe.close(() => resolve(port));
    });
  });

const rememberedPort = () => {
  try {
    const { port } = JSON.parse(fs.readFileSync(PORT_FILE(), 'utf8'));
    // Anything outside the ephemeral range is a value we could have written.
    return Number.isInteger(port) && port > 1024 && port < 65536 ? port : null;
  } catch {
    return null;
  }
};

const rememberPort = (port) => {
  try {
    fs.writeFileSync(PORT_FILE(), JSON.stringify({ port }, null, 2));
  } catch (err) {
    // Not fatal — it costs this session's stored state, not the app.
    console.error('[port] could not be remembered:', err?.message ?? err);
  }
};

/**
 * The port to serve on, stable across launches wherever that is possible.
 *
 * In a checkout nothing is remembered and nothing is written: `npm run
 * app:start` is a development run, and it has no stored state worth keeping
 * stable at the cost of possibly taking the installed copy's port.
 */
const choosePort = async () => {
  if (!app.isPackaged) return anyPort();

  for (const candidate of [rememberedPort(), DEFAULT_PORT]) {
    if (candidate && (await portFree(candidate))) {
      rememberPort(candidate);
      return candidate;
    }
  }

  // Both taken. Something else is on the default and the remembered one is
  // gone; take what we can get and remember it, so this is a one-off rather
  // than a new origin every launch from here on.
  const fallback = await anyPort();
  console.warn(`[port] ${DEFAULT_PORT} unavailable; using ${fallback}`);
  rememberPort(fallback);
  return fallback;
};

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

/* -------------------------------------------------------------------------- */
/* Updates                                                                     */
/* -------------------------------------------------------------------------- */

/**
 * What the UI is told about the update, and the only thing it is told.
 *
 * Held here rather than only pushed, because the events that matter fire
 * during startup — `checkForUpdates` runs the moment the window is created,
 * and a `checking` event sent before the page has mounted its listener is an
 * event nobody hears. The renderer asks for this on mount and subscribes for
 * the rest, so it can never miss the state it arrived in.
 *
 * `phase` is the whole vocabulary:
 *   unsupported  running from a checkout, or electron-updater is not there
 *   idle         checked, nothing newer
 *   checking     asking GitHub
 *   downloading  found one, pulling it down (percent is meaningful here)
 *   ready        downloaded, waiting for a restart
 *   installing   the restart is under way (`step` is meaningful here)
 *   error        the check or the download failed
 *
 * `installing` is the one the page clears its whole window for. Everything
 * else is news reported in a strip; that one is the app being taken apart
 * underneath the page, and it used to happen in complete silence — the window
 * simply vanished for as long as NSIS took, and the only way to know it had
 * worked was to notice the version had changed.
 */
let updateStatus = { phase: 'unsupported', version: null, percent: 0, error: null, step: null };

/** Whether an installer is downloaded and waiting for somebody to say yes. */
let updateReady = false;
/** Set once the installer has been handed control, so it is never run twice. */
let installing = false;
/** Kept so the install handler can run without a second require(). */
let updater = null;

/**
 * Set on the first pass through `before-quit`, so the second pass - the one
 * `quitAndInstall` triggers - is let straight through rather than deferred
 * again. Declared here rather than beside the quit handler because the install
 * handler sets it too, and a binding used above its own declaration is a trap
 * waiting for somebody to reorder the file.
 */
let quitting = false;

/**
 * Publish the status to the page, and remember it.
 *
 * The window may not exist yet, or may be mid-reload. Both are ordinary, and
 * neither is worth guarding at every call site — the stored copy is what makes
 * a dropped send harmless.
 */
const setUpdateStatus = (patch) => {
  // A step belongs to the phase that set it. Carrying one across a phase change
  // is how a screen ends up describing something that stopped happening.
  const step = 'step' in patch ? patch.step : patch.phase ? null : updateStatus.step;
  updateStatus = { ...updateStatus, ...patch, step };
  if (window && !window.isDestroyed()) {
    window.webContents.send('bgw:update', updateStatus);
  }
};

/**
 * Check GitHub for a newer release.
 *
 * Still never interrupts and never blocks startup — but it is no longer
 * silent. It used to say the one thing it had to say in the *title bar*, which
 * is the one part of the window nobody reads, and said nothing at all while a
 * 169 MB installer came down. Everything now goes to the page, which has room
 * to say what is happening and a button to act on it.
 *
 * Only in a packaged build. Running from a checkout, git is the update
 * mechanism.
 */
const checkForUpdates = ({ manual = false } = {}) => {
  if (!app.isPackaged) {
    setUpdateStatus({ phase: 'unsupported', error: null });
    return;
  }
  try {
    if (!updater) {
      const { autoUpdater } = require('electron-updater');
      updater = autoUpdater;
      updater.autoDownload = true;
      // Nothing installs itself on the way out. Two reasons, and either would
      // be enough: the hook listens for the `quit` event, which `app.exit()`
      // on the shutdown path does not emit — so it would promise an install
      // that never happened — and an update applied without being asked for is
      // one the popup's "Later" would have been lying about.
      updater.autoInstallOnAppQuit = false;

      updater.on('checking-for-update', () => setUpdateStatus({ phase: 'checking', error: null }));
      updater.on('update-not-available', () => setUpdateStatus({ phase: 'idle', error: null }));
      updater.on('update-available', (i) => {
        console.log('[update] found', i?.version);
        setUpdateStatus({ phase: 'downloading', version: i?.version ?? null, percent: 0 });
      });
      updater.on('download-progress', (p) => {
        setUpdateStatus({ phase: 'downloading', percent: Math.round(p?.percent ?? 0) });
      });
      updater.on('update-downloaded', (i) => {
        console.log('[update] ready, installs on restart:', i?.version);
        updateReady = true;
        setUpdateStatus({ phase: 'ready', version: i?.version ?? null, percent: 100 });
      });
      updater.on('error', (err) => {
        const message = err?.message ?? String(err);
        console.error('[update]', message);
        // A failed check is background noise on a local tool; a failure the
        // user asked for by pressing the button is an answer they are waiting
        // for. Same event, two different things to do with it.
        setUpdateStatus({ phase: 'error', error: message });
      });
    }
    setUpdateStatus({ phase: 'checking', error: null });
    updater.checkForUpdates().catch((err) => {
      setUpdateStatus({ phase: 'error', error: err?.message ?? String(err) });
    });
  } catch (err) {
    // electron-updater not installed, or no publish config. Not fatal: the app
    // works, it just will not update itself.
    setUpdateStatus({ phase: 'unsupported', error: manual ? String(err) : null });
  }
};

/** The page asks for this on mount, so it never misses an early event. */
ipcMain.handle('bgw:update-state', () => updateStatus);

/** The "Check for updates" button. */
ipcMain.handle('bgw:check-updates', () => {
  checkForUpdates({ manual: true });
  return updateStatus;
});

/**
 * How long to wait for our own exit before forcing it.
 *
 * `quitAndInstall` spawns the installer and then quits us. If for any reason it
 * does not, the window would sit on the updating screen forever — and by this
 * point the installer is already running and waiting for this process to let go
 * of the directory it is about to replace.
 */
const INSTALL_EXIT_MS = 10_000;

/**
 * Put the app back together after an install that never started.
 *
 * The service has already been stopped by then, so the page is a UI talking to
 * nothing: every poll fails, a render cannot be started, and the window looks
 * alive while being useless. That is a worse state than the one the user was
 * in before they pressed the button, so it is undone rather than reported.
 */
const recoverFromFailedInstall = async (err) => {
  const message = err?.message ?? String(err);
  console.error('[update] install did not start:', message);

  installing = false;
  quitting = false;
  // Set by `stopServer` on the way in. Left true, a service that later died
  // for real would do it without saying anything.
  app.isQuitting = false;

  let restored = false;
  try {
    startServer(servicePort);
    restored = await waitForServer(servicePort);
  } catch (restartErr) {
    console.error('[update] service did not come back:', restartErr?.message ?? restartErr);
  }

  setUpdateStatus({
    phase: 'installing',
    step: 'failed',
    error: restored
      ? message
      : `${message} — and the render service did not come back. Restart the app.`,
  });
};

/**
 * Restart into the new version.
 *
 * The service is stopped first, deliberately and before the installer is
 * spawned: NSIS is about to overwrite the very directory the render service is
 * running out of, and a headless Chrome still holding files in it is how an
 * update half-applies.
 *
 * Every stage of that is now published as it happens. It is not decoration:
 * `stopServer` waits up to eight seconds for a render to unwind, and the whole
 * of it used to be spent behind a window that had already gone.
 */
ipcMain.handle('bgw:install-update', async () => {
  if (!updateReady || installing) return false;
  installing = true;

  // The page swaps the whole app for the updating screen on this phase, so it
  // has to land before anything slow starts rather than after.
  setUpdateStatus({ phase: 'installing', step: 'stopping', error: null });
  await stopServer();

  // The service is already down and the installer is about to take over, so
  // the `before-quit` cleanup has nothing left to do. Saying so here is what
  // keeps it from deferring a quit it cannot improve.
  quitting = true;
  setUpdateStatus({ phase: 'installing', step: 'launching' });

  try {
    // Silent, because this installer is the assisted kind: run with its own UI
    // it would ask where to install and wait to be clicked through, which is
    // not what "Restart and update" promised. isForceRunAfter is what brings
    // the app back on the far side — the user asked for a restart, not a quit.
    updater.quitAndInstall(true, true);
  } catch (err) {
    await recoverFromFailedInstall(err);
    return false;
  }

  setTimeout(() => app.exit(0), INSTALL_EXIT_MS);
  return true;
});

/** Leave the failed-install screen. The service is back up by this point. */
ipcMain.handle('bgw:clear-install-error', () => {
  if (updateStatus.step === 'failed') {
    // Back to where the button was, so a second attempt is one click away.
    setUpdateStatus({ phase: 'ready', step: null, error: null });
  }
  return updateStatus;
});

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

/*
  One copy at a time.

  Two instances cannot both hold the stable port, and the loser would fall back
  to a random one — a window with an empty slide arrangement and a default
  theme, which looks exactly like the state loss this is here to prevent. It
  also stops two render services and two headless Chromes fighting over one
  output folder. A second launch raises the window that is already open, which
  is what double-clicking the icon is asking for anyway.
*/
if (app.isPackaged && !app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on('second-instance', () => {
    if (!window || window.isDestroyed()) return;
    if (window.isMinimized()) window.restore();
    window.focus();
  });

  start();
}

async function start() {
  await app.whenReady();
  const port = await choosePort();
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
}

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
  Quit is held open until the service is down, and that is now all it is for.

  `before-quit` is the only hook that can still defer the exit, so the cleanup
  runs there. The second pass through — the one `quitAndInstall` triggers — is
  let straight through by the `quitting` guard, which is what stops this from
  re-entering itself.

  It used to install a waiting update on the way out as well, whether or not
  anybody had been asked. That made the popup's "Later" a lie — dismiss the
  update, close the app, and it was applied anyway — and it meant the dialog
  could never come back on the next launch, because by then there was nothing
  left to install. So `quitAndInstall` has exactly one caller: the
  `bgw:install-update` handler, behind the *Restart and update* button.
  Dismissing defers to the next launch, where the check runs again, finds the
  same release waiting, and asks again.
*/

app.on('before-quit', (event) => {
  if (quitting) return;
  quitting = true;
  if (!child) return;

  event.preventDefault();
  stopServer().finally(() => app.exit(0));
});

app.on('window-all-closed', () => app.quit());
