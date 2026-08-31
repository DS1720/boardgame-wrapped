import { useEffect, useRef } from 'react';

/**
 * The one update state worth stopping for.
 *
 * Everything else about updating stays in the strip above the header —
 * checking, downloading, "you are up to date" — because none of it asks
 * anything of the user. A *downloaded* update does: it is finished, it is
 * sitting on disk, and the only thing between it and being installed is a
 * decision nobody was ever shown. That one was being made in a 14px line at
 * the top of the window, next to a render somebody was watching, and it was
 * routinely missed.
 *
 * So this is a real modal, and the two things it offers are the two answers:
 * restart into it now, or not now. "Not now" is remembered for **this run of
 * the app only** — the dismissal lives in React state and nothing writes it
 * anywhere — so the next launch that still finds an update waiting asks again.
 * A reminder that can be turned off permanently by accident is a reminder that
 * stops working.
 *
 * Native `<dialog>` rather than a hand-rolled overlay: `showModal()` brings the
 * focus trap, the top layer, the backdrop and Escape-to-close with it, and all
 * four are things a div gets wrong quietly.
 */
export interface UpdateDialogProps {
  /** The line the strip would have shown, so both say the same thing. */
  message: string;
  /** True once the restart has been asked for; the app is on its way out. */
  installing: boolean;
  onInstall: () => void;
  onDismiss: () => void;
}

export const UpdateDialog: React.FC<UpdateDialogProps> = ({
  message,
  installing,
  onInstall,
  onDismiss,
}) => {
  const ref = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const el = ref.current;
    // `showModal` is absent under jsdom, which is the only place this renders
    // without a real top layer to be promoted into.
    if (el && !el.open) el.showModal?.();
  }, []);

  return (
    <dialog
      ref={ref}
      className="update-dialog"
      aria-labelledby="update-dialog-title"
      /* Escape and the button both end up here, so there is one dismissal path
         rather than two that have to agree. */
      onClose={onDismiss}
      onCancel={(event) => {
        // Mid-restart there is nothing left to decide, and a dialog that
        // vanished while the app was closing would look like a cancel.
        if (installing) event.preventDefault();
      }}
    >
      <h2 id="update-dialog-title">Update available</h2>
      <p>{message}</p>
      <p className="muted">
        Board Game Wrapped will close and reopen on the new version. Any render in progress is
        stopped first.
      </p>

      <div className="update-dialog-actions">
        <button className="link" type="button" onClick={() => ref.current?.close()} disabled={installing}>
          Later
        </button>
        <button type="button" className="update-install" onClick={onInstall} disabled={installing} autoFocus>
          {installing ? 'Restarting…' : 'Restart and update'}
        </button>
      </div>
    </dialog>
  );
};
