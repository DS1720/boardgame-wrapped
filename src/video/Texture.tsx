import { AbsoluteFill } from 'remotion';
import type { TextureId, ThemeColor } from '@/theme/types';
import { isDark, withAlpha } from '@/theme/color';

/**
 * The theme's ground treatment.
 *
 * Each texture is drawn from the theme's own tokens, so it belongs to whatever
 * palette it lands in. Everything is a CSS gradient rather than an image: no
 * asset to prefetch, and it scales to the 1080×1920 frame exactly.
 *
 * Step 7 builds the *signature* elements (die-cut, tally marks, drifting light
 * pool) on top of these. A texture is the paper; a signature is what is printed
 * on it.
 */
export const Texture: React.FC<{ texture: TextureId; color: ThemeColor }> = ({ texture, color }) => {
  if (texture === 'none') return null;

  if (texture === 'grain') {
    return (
      <AbsoluteFill
        style={{
          // Fine crosshatch, near-invisible individually, reads as tooth.
          backgroundImage: `repeating-linear-gradient(0deg, ${withAlpha(color.ink, 0.035)} 0 1px, transparent 1px 3px),
             repeating-linear-gradient(90deg, ${withAlpha(color.ink, 0.03)} 0 1px, transparent 1px 3px)`,
          pointerEvents: 'none',
        }}
      />
    );
  }

  if (texture === 'paper') {
    return (
      <AbsoluteFill
        style={{
          backgroundImage: `repeating-linear-gradient(0deg, ${withAlpha(color.ink, 0.045)} 0 1px, transparent 1px 4px),
             radial-gradient(120% 80% at 50% 0%, ${withAlpha(color.ink, 0.06)} 0%, transparent 60%)`,
          pointerEvents: 'none',
        }}
      />
    );
  }

  // lamp: a warm pool centred above the middle, everything outside falling off.
  return (
    <AbsoluteFill
      style={{
        backgroundImage: `radial-gradient(58% 38% at 50% 38%, ${withAlpha(color.accent, 0.22)} 0%, ${withAlpha(color.accent, 0.08)} 45%, transparent 72%)`,
        pointerEvents: 'none',
      }}
    />
  );
};

/**
 * A vignette, on dark themes only.
 *
 * On a dark ground it pulls the corners down and holds the eye at the centre,
 * which is where every slide puts its number. On a light theme the same overlay
 * reads as dirt on the lens, so it is simply not drawn — `isDark` decides, not
 * the theme id, so a random dark theme gets one too.
 */
export const Vignette: React.FC<{ color: ThemeColor }> = ({ color }) => {
  if (!isDark(color.bg)) return null;

  return (
    <AbsoluteFill
      aria-hidden
      style={{
        // Transparent well past the safe margin, so it never darkens content —
        // only the frame edges outside it.
        //
        // Strength set by the plan's mirror test: at 0.28 it was invisible when
        // removed, which by that rule means it should not have been there at
        // all. This is the point where it does something.
        backgroundImage: `radial-gradient(72% 54% at 50% 47%, transparent 52%, rgb(0 0 0 / 0.42) 100%)`,
        pointerEvents: 'none',
      }}
    />
  );
};
