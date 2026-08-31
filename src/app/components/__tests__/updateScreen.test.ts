import { describe, expect, it } from 'vitest';
import { describeInstall } from '../UpdateScreen';

/**
 * The screen cannot narrate the whole update — once the installer has control
 * there is no window of ours left to draw in. So the part worth testing is
 * that it says what is about to happen *before* it happens, and that the one
 * step it cannot recover from offers a way out instead of a spinner.
 */
describe('describeInstall', () => {
  it('says what is being waited for while the service winds down', () => {
    const copy = describeInstall('stopping', null);
    expect(copy.status).toBe('Finishing what was running…');
    expect(copy.busy).toBe(true);
  });

  /* The load-bearing line. The window is about to vanish for as long as NSIS
     takes, and a window that disappears after saying it will is an update —
     one that disappears in silence is a crash. */
  it('warns that the window will close before it closes', () => {
    const copy = describeInstall('launching', null);
    expect(copy.detail).toContain('close');
    expect(copy.detail).toContain('open again');
    expect(copy.busy).toBe(true);
  });

  it('treats an unknown step as the first one rather than showing nothing', () => {
    expect(describeInstall(null, null)).toEqual(describeInstall('stopping', null));
  });

  describe('a failure stops moving', () => {
    it('reports the reason it was given', () => {
      const copy = describeInstall('failed', 'ENOENT: no installer');
      expect(copy.detail).toBe('ENOENT: no installer');
      // Not busy is what puts the way out on screen and takes the bar off it.
      expect(copy.busy).toBe(false);
    });

    it('still says something reassuring when there is no reason', () => {
      const copy = describeInstall('failed', null);
      expect(copy.detail).toContain('Nothing was changed');
      expect(copy.busy).toBe(false);
    });
  });
});
