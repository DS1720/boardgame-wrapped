import type { InstallStep, UpdateStatus } from '../shell';

/**
 * The whole window, for as long as the restart lasts.
 *
 * Pressing **Restart and update** used to be the last thing that visibly
 * happened. The service was stopped — which takes up to eight seconds on its
 * own, and longer with a render to unwind — the window closed, NSIS ran
 * silently, and the app came back some time later on a different version. None
 * of that was reported, so the honest reading of it from the outside was that
 * the app had crashed.
 *
 * So the app is replaced rather than covered: everything behind this is
 * talking to a render service that is being shut down, and a half-live control
 * panel under a dialog is a worse thing to leave on screen than nothing.
 *
 * It cannot narrate the whole update. Once the installer has control there is
 * no window of ours left to draw in — which is the reason the copy has to say
 * what is about to happen *before* it happens. A window that disappears after
 * being told it will is an update; one that disappears in silence is a crash.
 */

export interface InstallCopy {
  /** What is happening now. */
  status: string;
  /** What happens next, so nothing after this is a surprise. */
  detail: string;
  /** A step that is still moving, versus one that has stopped. */
  busy: boolean;
}

/**
 * Pure, and tested, because the load-bearing part is `launching`'s detail
 * line: it is the only warning the user gets that the window is about to
 * vanish, and it has to be on screen before it does.
 */
export const describeInstall = (step: InstallStep | null, error: string | null): InstallCopy => {
  switch (step) {
    case 'failed':
      return {
        status: 'The update could not be started.',
        detail: error ?? 'Nothing was changed, and the app is still on this version.',
        busy: false,
      };

    case 'launching':
      return {
        status: 'Starting the installer…',
        detail:
          'Board Game Wrapped will close while it updates, then open again on its own. This usually takes under a minute.',
        busy: true,
      };

    case 'stopping':
    default:
      return {
        status: 'Finishing what was running…',
        detail: 'Any render still going is being stopped first, so nothing is left half-written.',
        busy: true,
      };
  }
};

export interface UpdateScreenProps {
  status: UpdateStatus;
  /** Dismiss the failure and go back to the app. */
  onDismissError: () => void;
}

export const UpdateScreen: React.FC<UpdateScreenProps> = ({ status, onDismissError }) => {
  const copy = describeInstall(status.step, status.error);

  return (
    <div className="update-screen" role="status" aria-live="polite">
      <div className="update-screen-inner">
        <p className="update-screen-eyebrow">Board Game Wrapped</p>
        <h1>{status.version ? `Updating to version ${status.version}` : 'Updating'}</h1>

        {/* Indeterminate: the installer does not report progress back to us, and
            a bar that invented a percentage would be worse than one that only
            says something is still happening. */}
        {copy.busy && (
          <div className="update-screen-bar" aria-hidden="true">
            <span />
          </div>
        )}

        <p className="update-screen-status">{copy.status}</p>
        <p className="update-screen-detail">{copy.detail}</p>

        {!copy.busy && (
          <button type="button" className="update-install" onClick={onDismissError}>
            Back to the app
          </button>
        )}
      </div>
    </div>
  );
};
