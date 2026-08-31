import { useCallback, useEffect, useState, type ReactNode } from 'react';
import { shell, type UpdateStatus } from '../shell';
import { UpdateBanner, describeUpdate } from './UpdateBanner';
import { UpdateDialog } from './UpdateDialog';
import { UpdateScreen } from './UpdateScreen';

/**
 * Everything the app says about updating itself, and the one place that knows
 * where it has got to.
 *
 * There are three surfaces and they escalate, which is the whole design:
 *
 *  - a **strip** above the header while an update is only news — checking,
 *    downloading, up to date. None of it asks anything, so none of it earns
 *    more than a line.
 *  - a **dialog** once one is downloaded, because that is the only state that
 *    asks a question, and asked in a 14px line it was not being read.
 *  - the **whole window** once the user says yes, because from that point the
 *    app is being taken apart underneath the page.
 *
 * One subscription feeds all three. Two components listening to the same IPC
 * channel would be two things that could disagree about which state the update
 * is in, and the last of the three is a screen the other two must not be
 * rendering behind.
 */
export const UpdateSurface: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [status, setStatus] = useState<UpdateStatus | null>(null);
  /** True once the user has pressed Check, so quiet states become loud. */
  const [manual, setManual] = useState(false);
  /** Bridges the click and the first `installing` push from the shell. */
  const [installing, setInstalling] = useState(false);
  /**
   * The version whose popup has been waved away, and nothing more.
   *
   * React state rather than localStorage: "Later" has to mean *later*, not
   * *never*, and a dismissal that outlived the run of the app it happened in
   * would silence the next launch too. Keyed by version rather than a boolean,
   * so a newer release still asks — dismissing 0.2.4 is not an answer about
   * 0.2.5.
   */
  const [dismissed, setDismissed] = useState<string | null>(null);

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
    // No .then on the success path: the app quits, so nothing here runs again.
    // A rejection means it never started, and the shell has already put the
    // service back — all that is left is to let the button work again.
    void shell()
      ?.installUpdate?.()
      .catch(() => setInstalling(false));
  }, []);

  const dismissError = useCallback(() => {
    setInstalling(false);
    void shell()
      ?.clearInstallError?.()
      .then(setStatus)
      .catch(() => undefined);
  }, []);

  if (!status) return <>{children}</>;

  /* The app is being dismantled, so there is nothing behind this worth
     rendering: every panel under it polls a render service that is on its way
     down, and a half-live control column under a full-screen message is a
     worse thing to leave on screen than no control column at all. */
  if (status.phase === 'installing') {
    return (
      <UpdateScreen
        status={status}
        onDismissError={() => {
          // A failed install is the one way back out of here, and the popup
          // must not immediately re-ask what was just answered.
          setDismissed(status.version ?? '');
          dismissError();
        }}
      />
    );
  }

  const copy = describeUpdate(status, manual);
  /* Dismissing leaves the strip behind rather than nothing at all: the update
     is still waiting, and taking away every way to start it until the next
     launch would be a worse answer than the one the user gave. */
  const popup = copy.modal && dismissed !== (status.version ?? '');

  return (
    <>
      {popup && copy.message && (
        <UpdateDialog
          message={copy.message}
          installing={installing}
          onInstall={install}
          onDismiss={() => setDismissed(status.version ?? '')}
        />
      )}
      <UpdateBanner
        status={status}
        manual={manual}
        installing={installing}
        onCheck={check}
        onInstall={install}
      />
      {children}
    </>
  );
};
