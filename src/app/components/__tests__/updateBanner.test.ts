import { describe, expect, it } from 'vitest';
import { describeUpdate } from '../UpdateBanner';
import type { UpdatePhase, UpdateStatus } from '../../shell';

/**
 * The interesting part of the banner is not what it looks like, it is which
 * states are worth interrupting for. An automatic check that finds nothing has
 * to be silent — a bar reading "up to date" on every launch is a notification
 * attached to a non-event — while the same result asked for by pressing a
 * button has to answer, or the button looks broken.
 */

const status = (over: Partial<UpdateStatus> = {}): UpdateStatus => ({
  phase: 'idle',
  version: null,
  percent: 0,
  error: null,
  step: null,
  ...over,
});

describe('describeUpdate', () => {
  describe('an automatic check stays quiet', () => {
    it.each<UpdatePhase>(['unsupported', 'idle', 'checking', 'installing', 'error'])(
      'says nothing in %s',
      (phase) => {
        expect(describeUpdate(status({ phase, error: 'nope' }), false).message).toBeNull();
      },
    );

    it('never offers anything alongside silence', () => {
      const copy = describeUpdate(status({ phase: 'idle' }), false);
      expect(copy.canInstall).toBe(false);
      expect(copy.canCheck).toBe(false);
      expect(copy.showProgress).toBe(false);
    });
  });

  describe('a check the user asked for always answers', () => {
    it('confirms there is nothing newer', () => {
      const copy = describeUpdate(status({ phase: 'idle' }), true);
      expect(copy.message).toBe('Board Game Wrapped is up to date.');
      expect(copy.canCheck).toBe(true);
      expect(copy.canInstall).toBe(false);
    });

    it('says it is checking', () => {
      expect(describeUpdate(status({ phase: 'checking' }), true).message).toBe(
        'Checking for updates…',
      );
    });

    it('reports a failure with its reason, and offers a retry', () => {
      const copy = describeUpdate(status({ phase: 'error', error: 'getaddrinfo ENOTFOUND' }), true);
      expect(copy.message).toContain('getaddrinfo ENOTFOUND');
      expect(copy.tone).toBe('error');
      expect(copy.canCheck).toBe(true);
    });

    it('does not leave a dangling space when there is no reason', () => {
      const copy = describeUpdate(status({ phase: 'error', error: null }), true);
      expect(copy.message).toBe('Could not check for updates.');
    });
  });

  describe('a download speaks up either way', () => {
    it.each([true, false])('reports progress when manual=%s', (manual) => {
      const copy = describeUpdate(status({ phase: 'downloading', version: '0.2.3', percent: 42 }), manual);
      expect(copy.message).toBe('Version 0.2.3 is downloading… 42%');
      expect(copy.showProgress).toBe(true);
      // Nothing to install until it has landed.
      expect(copy.canInstall).toBe(false);
    });

    it('falls back to a generic subject when the version is unknown', () => {
      const copy = describeUpdate(status({ phase: 'downloading', version: null, percent: 5 }), false);
      expect(copy.message).toBe('An update is downloading… 5%');
    });
  });

  describe('a downloaded update is the one state with an action', () => {
    it.each([true, false])('offers the restart when manual=%s', (manual) => {
      const copy = describeUpdate(status({ phase: 'ready', version: '0.2.3', percent: 100 }), manual);
      expect(copy.message).toBe('Version 0.2.3 is ready to install.');
      expect(copy.canInstall).toBe(true);
      expect(copy.tone).toBe('ready');
      // A progress bar pinned at 100% is a bar saying nothing.
      expect(copy.showProgress).toBe(false);
    });

    /* The popup exists because this state asks a question and every other one
       only reports. If a second phase ever raised a modal, an update coming
       down in the background would throw a dialog over somebody's render —
       which is the thing the strip was built to avoid. */
    it.each([true, false])('is the only state worth a popup, manual=%s', (manual) => {
      expect(describeUpdate(status({ phase: 'ready', version: '0.2.3' }), manual).modal).toBe(true);
    });
  });

  it.each<UpdatePhase>(['unsupported', 'idle', 'checking', 'downloading', 'installing', 'error'])(
    'never raises a popup in %s',
    (phase) => {
      expect(describeUpdate(status({ phase, error: 'nope' }), true).modal).toBe(false);
      expect(describeUpdate(status({ phase, error: 'nope' }), false).modal).toBe(false);
    },
  );

  /* The screen has the whole window while an update installs. A strip
     underneath it would be a second, quieter account of the same thing. */
  it('says nothing while installing, however it was asked', () => {
    expect(describeUpdate(status({ phase: 'installing', step: 'stopping' }), true).message).toBeNull();
    expect(describeUpdate(status({ phase: 'installing', step: 'stopping' }), false).message).toBeNull();
  });

  /* `unsupported` is what a browser reports, and `npm run dev` is a browser.
     It has to stay silent even when the user pressed the button, because in
     that build there is no button to press. */
  it('stays silent when the shell cannot update, however it was asked', () => {
    expect(describeUpdate(status({ phase: 'unsupported' }), true).message).toBeNull();
    expect(describeUpdate(status({ phase: 'unsupported' }), false).message).toBeNull();
  });
});
