/**
 * The only bridge between the page and the shell.
 *
 * A web page cannot be handed a filesystem path — that is a deliberate browser
 * rule, and it is why the output folder is a text field in a browser. In the
 * desktop app there is no reason to make somebody type a path they can point
 * at, so this exposes exactly one thing: a native folder picker.
 *
 * `contextBridge`, not `nodeIntegration`. The page gets one function that
 * returns a string, and no access to Node beyond it.
 */
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('bgw', {
  /** Opens the folder dialog. Resolves to null when it is cancelled. */
  chooseFolder: (current) => ipcRenderer.invoke('bgw:choose-folder', current),
});
