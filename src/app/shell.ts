/**
 * What the desktop shell offers the page, and what the page assumes about it.
 *
 * `window.bgw` is put there by [electron/preload.cjs](../../electron/preload.cjs)
 * and is **absent in a browser** — that is the normal case for `npm run dev`,
 * not an error. So every member is optional and every caller checks. Declaring
 * the shape in one module rather than at each use site is what stops two
 * components from disagreeing about it: TypeScript merges `declare global`
 * blocks, and two of them describing `bgw` differently is a compile error that
 * only appears once both files are in the same build.
 */

/** Where an update has got to. Mirrors the phases in `electron/main.cjs`. */
export type UpdatePhase =
  /** Not a packaged build, or electron-updater is missing. Say nothing. */
  | 'unsupported'
  /** Checked, and this is the newest version. */
  | 'idle'
  | 'checking'
  | 'downloading'
  /** Downloaded and waiting for a restart. */
  | 'ready'
  | 'error';

export interface UpdateStatus {
  phase: UpdatePhase;
  /** The version being downloaded or waiting to install. */
  version: string | null;
  /** 0–100. Only meaningful while downloading. */
  percent: number;
  error: string | null;
}

export interface Shell {
  chooseFolder?: (current: string) => Promise<string | null>;
  updateStatus?: () => Promise<UpdateStatus>;
  onUpdateStatus?: (callback: (status: UpdateStatus) => void) => () => void;
  checkForUpdates?: () => Promise<UpdateStatus>;
  installUpdate?: () => Promise<boolean>;
}

declare global {
  interface Window {
    bgw?: Shell;
  }
}

/** The shell, or undefined in a browser and under SSR. */
export const shell = (): Shell | undefined =>
  typeof window === 'undefined' ? undefined : window.bgw;
