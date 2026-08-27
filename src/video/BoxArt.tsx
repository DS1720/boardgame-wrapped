import { Img, staticFile, useCurrentFrame, useVideoConfig } from 'remotion';
import { boxArtSrc, fallbackHue, type BoxArtEntry } from '@/shared/boxart';
import { useFont, useTheme } from '@/theme/ThemeContext';
import type { ThemeColor } from '@/theme/types';
import { BOX_ART } from './config';

/**
 * Box art rendering.
 *
 * Two rules, applied everywhere: a cover is always cropped to a fixed shape
 * with object-fit: cover (never letterboxed), and it always uses the single
 * radius token. A game with no art gets a typeset tile that is meant to read as
 * a design decision rather than a hole.
 *
 * Colors and type come from the theme by default, so a caller normally passes
 * nothing. The overrides exist for the rare slide that needs a tile in a
 * different register than its surroundings.
 */

export type TileColors = Pick<ThemeColor, 'surface' | 'ink' | 'inkMuted'>;

/* -------------------------------------------------------------------------- */
/* Fallback tile                                                               */
/* -------------------------------------------------------------------------- */

/**
 * Below this a name stops being readable at a glance on a phone. A name long
 * enough to need less than this wraps instead — break-word takes over rather
 * than shrinking the type into nothing.
 */
export const MIN_DISPLAY_PX = 18;

/** Rough advance width per character, as a fraction of font size, for a bold sans face. */
const CHAR_WIDTH = 0.62;

/**
 * Fit a game name into the tile.
 *
 * Two constraints, whichever bites harder: the whole name against the tile's
 * width budget, and the single longest word against it — a name that is one
 * 30-character word cannot be solved by wrapping.
 */
export const displaySize = (name: string, width: number): number => {
  const budget = width * 0.82;
  const longestWord = name.split(/\s+/).reduce((max, word) => Math.max(max, word.length), 0);
  const byLength = budget / Math.max(6, name.length * 0.42);
  const byWord = budget / Math.max(3, longestWord * CHAR_WIDTH);
  return Math.max(MIN_DISPLAY_PX, Math.min(width * 0.2, byLength, byWord));
};

export interface FallbackTileProps {
  name: string;
  width: number;
  height: number;
  colors?: TileColors;
  fontFamily?: string;
}

/**
 * The tile shown for a game with no cover art. Its hue is derived from the game
 * name, so two art-less games never look like the same missing image, and the
 * same game always looks the same in the preview and in a CLI render.
 */
export const FallbackTile: React.FC<FallbackTileProps> = ({
  name,
  width,
  height,
  colors,
  fontFamily,
}) => {
  const theme = useTheme();
  const displayFont = useFont('display');
  const tile = colors ?? theme.color;
  const hue = fallbackHue(name);
  const size = displaySize(name, width);

  return (
    <div
      style={{
        width,
        height,
        borderRadius: BOX_ART.radius,
        overflow: 'hidden',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: width * 0.1,
        boxSizing: 'border-box',
        textAlign: 'center',
        background: `linear-gradient(155deg, hsl(${hue} 34% 26%) 0%, hsl(${hue} 38% 15%) 100%)`,
        // A hairline lift so the tile still reads as an object on a dark ground.
        boxShadow: `inset 0 0 0 2px hsl(${hue} 30% 38% / 0.55)`,
        color: tile.ink,
        fontFamily: fontFamily ?? (displayFont.fontFamily as string),
      }}
    >
      <span
        style={{
          fontSize: size,
          lineHeight: 1.05,
          fontWeight: displayFont.fontWeight ?? 700,
          fontStretch: displayFont.fontStretch,
          letterSpacing: -0.5,
          wordBreak: 'break-word',
          textWrap: 'balance',
        }}
      >
        {name}
      </span>
    </div>
  );
};

/* -------------------------------------------------------------------------- */
/* Box art                                                                     */
/* -------------------------------------------------------------------------- */

export interface BoxArtProps {
  /** Manifest entry for this game. Null, or an entry with no file, renders the fallback. */
  entry: BoxArtEntry | null | undefined;
  /** Used by the fallback tile when there is no entry at all. */
  name: string;
  width: number;
  height: number;
  colors?: TileColors;
  fontFamily?: string;
}

/**
 * One cover, cropped to the given box. Renders the fallback tile when the game
 * has no stored art, so callers never have to branch on it.
 */
export const BoxArt: React.FC<BoxArtProps> = ({ entry, name, width, height, colors, fontFamily }) => {
  const theme = useTheme();
  const tile = colors ?? theme.color;
  const src = boxArtSrc(entry);
  if (!src) {
    return (
      <FallbackTile
        name={entry?.name ?? name}
        width={width}
        height={height}
        colors={colors}
        fontFamily={fontFamily}
      />
    );
  }

  return (
    // Remotion's `<Img>`, not a plain `<img>`: it holds the render until the
    // file has actually decoded. With a bare tag a still can capture before the
    // cover arrives — the square came out with two of six games blank, and a
    // still has no later frame to correct itself on.
    <Img
      src={staticFile(src)}
      alt={entry?.name ?? name}
      width={width}
      height={height}
      style={{
        width,
        height,
        objectFit: 'cover',
        borderRadius: BOX_ART.radius,
        display: 'block',
        backgroundColor: tile.surface,
      }}
    />
  );
};

/* -------------------------------------------------------------------------- */
/* Hero                                                                        */
/* -------------------------------------------------------------------------- */

export interface BoxArtHeroProps extends BoxArtProps {
  /** Fills the frame behind the cover with a blurred, darkened copy of it. */
  backdrop?: boolean;
  /**
   * Float the cover slowly for as long as it is on screen.
   *
   * The hero is the largest thing in the frame and it holds for four bars; sat
   * perfectly still it makes the whole video look paused between counts.
   */
  drift?: boolean;
}

/**
 * The hero treatment: the cover large in the foreground over a blurred and
 * darkened copy of itself. It gives every slide a ground colored by its own
 * artwork without needing a per-game background asset.
 *
 * The backdrop is the same file, so it costs no extra download.
 */
export const BoxArtHero: React.FC<BoxArtHeroProps> = ({
  entry,
  name,
  width,
  height,
  colors,
  fontFamily,
  backdrop = true,
  drift = true,
}) => {
  const theme = useTheme();
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const src = boxArtSrc(entry);

  // Slow enough that it is felt rather than watched: a full cycle takes about
  // nine seconds, longer than the slide itself, so it never visibly repeats.
  const t = (frame / fps) * 0.7;
  const float = drift ? Math.sin(t) * 10 : 0;
  const sway = drift ? Math.cos(t * 0.73) * 6 : 0;
  const breathe = drift ? 1 + Math.sin(t * 0.51) * 0.012 : 1;

  return (
    <div style={{ position: 'relative', width: '100%', height: '100%' }}>
      {backdrop && src ? (
        <div
          aria-hidden
          style={{
            position: 'absolute',
            inset: 0,
            overflow: 'hidden',
            // Scaled up so the blur never pulls the frame edges in.
            transform: `scale(${BOX_ART.heroBackdropScale})`,
          }}
        >
          <Img
            src={staticFile(src)}
            alt=""
            style={{
              width: '100%',
              height: '100%',
              objectFit: 'cover',
              filter: `blur(${BOX_ART.heroBlurPx}px) saturate(1.2)`,
            }}
          />
          <div
            style={{
              position: 'absolute',
              inset: 0,
              // The theme's ground, not the tile surface: this backdrop is the
              // slide falling away behind the box, not a card behind it.
              backgroundColor: theme.color.bg,
              opacity: BOX_ART.heroBackdropOpacity,
            }}
          />
        </div>
      ) : null}

      <div
        style={{
          position: 'relative',
          width: '100%',
          height: '100%',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <div
          style={{
            filter: 'drop-shadow(0 24px 48px rgb(0 0 0 / 0.45))',
            transform: `translate(${sway}px, ${float}px) scale(${breathe})`,
          }}
        >
          <BoxArt
            entry={entry}
            name={name}
            width={width}
            height={height}
            colors={colors}
            fontFamily={fontFamily}
          />
        </div>
      </div>
    </div>
  );
};
