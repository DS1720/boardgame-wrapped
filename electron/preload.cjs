/**
 * The only bridge between the page and the shell.
 *
 * A web page cannot be handed a filesystem path, and it cannot restart the
 * program it is running inside — both are deliberate browser rules, and both
 * are things the desktop app has a good reason to do. So this exposes a short,
 * fixed list of them and nothing else.
 *
 * `contextBridge`, not `nodeIntegration`. The page gets these functions and no
 * access to Node beyond them. Everything here is optional on the page's side:
 * in a browser `window.bgw` is simply absent, and the UI checks rather than
 * assumes.
 */
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('bgw', {
  /** Opens the folder dialog. Resolves to null when it is cancelled. */
  chooseFolder: (current) => ipcRenderer.invoke('bgw:choose-folder', current),

  /**
   * The current update status.
   *
   * Asked for on mount rather than waited for: the check runs at startup and
   * its first events fire before the page has finished loading, so a listener
   * alone would miss them.
   */
  updateStatus: () => ipcRenderer.invoke('bgw:update-state'),

  /** Subscribe to status changes. Returns an unsubscribe function. */
  onUpdateStatus: (callback) => {
    const listener = (_event, status) => callback(status);
    ipcRenderer.on('bgw:update', listener);
    return () => ipcRenderer.removeListener('bgw:update', listener);
  },

  /** Ask GitHub now, rather than waiting for the next launch. */
  checkForUpdates: () => ipcRenderer.invoke('bgw:check-updates'),

  /** Stop the service, run the installer, come back on the new version. */
  installUpdate: () => ipcRenderer.invoke('bgw:install-update'),

  /** Leave the failed-install screen and go back to the app. */
  clearInstallError: () => ipcRenderer.invoke('bgw:clear-install-error'),
});
