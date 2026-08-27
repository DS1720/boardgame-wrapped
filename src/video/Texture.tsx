import { AbsoluteFill } from 'remotion';
import type { TextureId, ThemeColor } from '@/theme/types';
import { withAlpha } from '@/theme/color';

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
