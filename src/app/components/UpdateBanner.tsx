import { useCallback, useEffect, useState } from 'react';
import { shell, type UpdateStatus } from '../shell';

/**
 * What the app is doing about updating itself.
 *
 * There was nothing here before, and updating was correspondingly invisible: a
 * 169 MB installer came down in the background and the only sign of it was the
 * *title bar* changing — the one part of a window nobody reads. The first time
 * anybody knew an update existed was when the app restarted as a different
 * version.
 *
 * So this says what is happening, where it will be seen, and gives the one
 * action worth offering. It is deliberately a strip above the header rather
 * than a modal: an update is never urgent enough to interrupt a render, and a
 * dialog over a half-configured video is worse than no news at all.
 *
 * In a browser `window.bgw` is absent and this renders nothing, which is why
 * `npm run dev` never shows it.
 */

/** What a phase says, and whether it is worth saying at all. */
export interface UpdateCopy {
  /** The line shown. Null means render nothing. */
  message: string | null;
  /** Show the determinate progress bar. */
  showProgress: boolean;
  /** Offer "Restart and install". */
  canInstall: boolean;
  /** Offer "Check again" — only where a check is not already running. */
  canCheck: boolean;
  tone: 'info' | 'ready' | 'error';
}

const SILENT: UpdateCopy = {
  message: null,
  showProgress: false,
  canInstall: false,
  canCheck: false,
  tone: 'info',
};

/**
 * Turn a status into what the strip says.
 *
 * Pure, and separate from the component, because the interesting part is which
 * states are worth interrupting for and which are not — and that is a decision
 * to test rather than to read off a render.
 *
 * `manual` is the whole reason this is not a lookup table. An automatic check
 * that finds nothing must say nothing: a bar reading "you are up to date" on
 * every single launch is noise attached to a non-event. The same result *asked
 * for* by pressing a button is an answer somebody is waiting for, and silence
 * there reads as a broken button.
 */
export const describeUpdate = (status: UpdateStatus, manual: boolean): UpdateCopy => {
  const version = status.version ? `Version ${status.version}` : 'An update';

  switch (status.phase) {
    case 'unsupported':
      return SILENT;

    case 'checking':
      return manual
        ? { ...SILENT, message: 'Checking for updates…', tone: 'info' }
        : SILENT;

    case 'idle':
      return manual
        ? {
            message: 'Board Game Wrapped is up to date.',
            showProgress: false,
            canInstall: false,
            canCheck: true,
            tone: 'info',
          }
        : SILENT;

    case 'downloading':
      return {
        message: `${version} is downloading… ${status.percent}%`,
        showProgress: true,
        canInstall: false,
        canCheck: false,
        tone: 'info',
      };

    case 'ready':
      return {
        message: `${version} is ready to install.`,
        showProgress: false,
        canInstall: true,
        canCheck: false,
        tone: 'ready',
      };

    case 'error':
      // Only ever shown for a check somebody asked for. Failing to reach
      // GitHub is not a problem a local video tool needs to raise on its own.
      return manual
        ? {
            message: `Could not check for updates. ${status.error ?? ''}`.trim(),
            showProgress: false,
            canInstall: false,
            canCheck: true,
            tone: 'error',
          }
        : SILENT;

    default:
      return SILENT;
  }
};

export const UpdateBanner: React.FC = () => {
  const [status, setStatus] = useState<UpdateStatus | null>(null);
  /** True once the user has pressed the button, so quiet states become loud. */
  const [manual, setManual] = useState(false);
  const [installing, setInstalling] = useState(false);

  useEffect(() => {
    const api = shell();
    if (!api?.onUpdateStatus) return;
    // Asked for as well as subscribed to: the check runs at startup and its
    // first events fire before this ever mounts.
    void api.updateStatus?.().then(setStatus).catch(() => undefined);
    return api.onUpdateStatus(setStatus);
  }, []);

  const check = useCallback(() => {
    setManual(true);
    void shell()?.checkForUpdates?.().then(setStatus).catch(() => undefined);
  }, []);

  const install = useCallback(() => {
    setInstalling(true);
    // No .then: a successful install quits the app, so nothing here runs again.
    void shell()?.installUpdate?.().catch(() => setInstalling(false));
  }, []);

  if (!status) return null;
  const copy = describeUpdate(status, manual);

  /* Nothing to report. In the desktop app that still leaves one thing worth
     offering — a way to ask — because "is this the latest version?" is a
     question people have before an update exists, not after. */
  if (!copy.message) {
    if (status.phase === 'unsupported' || !shell()?.checkForUpdates) return null;
    return (
      <div className="update-quiet">
        <button className="link" type="button" onClick={check}>
          Check for updates
        </button>
      </div>
    );
  }

  return (
    <div className={`update-banner update-${copy.tone}`} role="status" aria-live="polite">
      <div className="update-text">
        <p>{copy.message}</p>
        {copy.showProgress && (
          <div
            className="bar"
            role="progressbar"
            aria-valuenow={status.percent}
            aria-valuemin={0}
            aria-valuemax={100}
          >
            <span style={{ width: `${status.percent}%` }} />
          </div>
        )}
      </div>

      <div className="update-actions">
        {copy.canCheck && (
          <button className="link" type="button" onClick={check}>
            Check again
          </button>
        )}
        {copy.canInstall && (
          <button type="button" onClick={install} disabled={installing}>
            {installing ? 'Restarting…' : 'Restart and install'}
          </button>
        )}
      </div>
    </div>
  );
};
