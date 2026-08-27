/**
 * Box art: shared types and pure helpers.
 *
 * Everything here is dependency-free and runs in both the browser and Node, so
 * the prefetch engine (server) and the slides (Remotion) agree on one shape.
 * Anything that touches the filesystem or the network lives in server/boxart.ts.
 */

/** Image formats we are willing to store. */
export type BoxArtFormat = 'png' | 'jpg' | 'webp' | 'gif';

export interface Swatches {
  vibrant: string | null;
  darkVibrant: string | null;
  lightVibrant: string | null;
  muted: string | null;
  darkMuted: string | null;
  lightMuted: string | null;
}

export interface BoxArtEntry {
  gameId: number;
  name: string;
  bggId: number;
  /** Filename inside public/boxart, or null when this game has no art and must use the fallback tile. */
  file: string | null;
  /** The URL it came from, kept so a re-run can tell "same art" from "art changed". */
  source: string | null;
  bytes: number | null;
  swatches: Swatches | null;
  /** The one color a slide should use as its accent. Null for fallback entries. */
  dominant: string | null;
  /** Hue of `dominant` in degrees, so step 6 can derive a whole palette from it. */
  hue: number | null;
}

export interface BoxArtManifest {
  version: 1;
  generatedAt: string;
  /** Keyed by gameId as a string, because JSON has no numeric keys. */
  entries: Record<string, BoxArtEntry>;
}

export const MANIFEST_VERSION = 1 as const;
export const MANIFEST_FILE = 'manifest.json';

export const emptyManifest = (): BoxArtManifest => ({
  version: MANIFEST_VERSION,
  generatedAt: new Date().toISOString(),
  entries: {},
});

/* -------------------------------------------------------------------------- */
/* Format detection                                                            */
/* -------------------------------------------------------------------------- */

const BY_CONTENT_TYPE: Record<string, BoxArtFormat> = {
  'image/png': 'png',
  'image/jpeg': 'jpg',
  'image/jpg': 'jpg',
  'image/webp': 'webp',
  'image/gif': 'gif',
};

/**
 * BGG serves a mix of PNG and JPEG and the URL extension lies often enough that
 * it cannot be trusted. Content-type comes first; `formatFromMagic` is the
 * authority when the header is generic.
 */
export const formatFromContentType = (raw: string | null | undefined): BoxArtFormat | null => {
  if (!raw) return null;
  const type = raw.split(';')[0].trim().toLowerCase();
  return BY_CONTENT_TYPE[type] ?? null;
};

const startsWith = (bytes: Uint8Array, sig: number[], offset = 0): boolean =>
  sig.every((b, i) => bytes[offset + i] === b);

/**
 * Read the format out of the bytes themselves. This is what keeps test case 5
 * honest: a file only lands in public/boxart if its magic bytes say it is a
 * real image, so an HTML error page saved as .png can never happen.
 */
export const formatFromMagic = (bytes: Uint8Array): BoxArtFormat | null => {
  if (bytes.length < 12) return null;
  if (startsWith(bytes, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) return 'png';
  if (startsWith(bytes, [0xff, 0xd8, 0xff])) return 'jpg';
  if (startsWith(bytes, [0x47, 0x49, 0x46, 0x38])) return 'gif';
  if (startsWith(bytes, [0x52, 0x49, 0x46, 0x46]) && startsWith(bytes, [0x57, 0x45, 0x42, 0x50], 8))
    return 'webp';
  return null;
};

/**
 * The format a downloaded body will be stored as, or null to reject it.
 *
 * Magic bytes are the only authority. The header is deliberately *not* a
 * fallback: a host that serves an HTML error page under `content-type:
 * image/png` is exactly the case this has to catch, and trusting the header
 * there would put an unopenable file on disk.
 */
export const resolveFormat = (bytes: Uint8Array): BoxArtFormat | null => formatFromMagic(bytes);

/**
 * Why a body was rejected, phrased for a human reading a failure list.
 * The header is useful here even though it cannot be trusted for storage.
 */
export const rejectionReason = (contentType: string | null | undefined, bytes: Uint8Array): string => {
  const claimed = formatFromContentType(contentType);
  const type = contentType?.split(';')[0].trim() || 'no content-type';
  return claimed
    ? `served as ${type} but the bytes are not a readable image`
    : `served as ${type}, which is not an image`;
};

export const fileNameFor = (gameId: number, format: BoxArtFormat): string => `${gameId}.${format}`;

/* -------------------------------------------------------------------------- */
/* Color                                                                       */
/* -------------------------------------------------------------------------- */

/**
 * Which swatch a slide should treat as "the color of this box".
 *
 * Vibrant first because it is the color a person would name if you showed them
 * the box. The fallbacks walk outward from there so that even a washed-out or
 * near-monochrome cover yields something usable rather than null.
 */
export const pickDominant = (s: Swatches | null): string | null =>
  s?.vibrant ?? s?.lightVibrant ?? s?.darkVibrant ?? s?.muted ?? s?.darkMuted ?? s?.lightMuted ?? null;

export const parseHex = (hex: string): { r: number; g: number; b: number } | null => {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
  if (!m) return null;
  const n = parseInt(m[1], 16);
  return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 };
};

/** Hue in degrees [0, 360). Returns null for unparseable or fully desaturated input. */
export const hueOf = (hex: string): number | null => {
  const rgb = parseHex(hex);
  if (!rgb) return null;
  const r = rgb.r / 255;
  const g = rgb.g / 255;
  const b = rgb.b / 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const delta = max - min;
  if (delta === 0) return null; // grey has no hue to speak of
  let h: number;
  if (max === r) h = ((g - b) / delta) % 6;
  else if (max === g) h = (b - r) / delta + 2;
  else h = (r - g) / delta + 4;
  h *= 60;
  return h < 0 ? h + 360 : h;
};

/* -------------------------------------------------------------------------- */
/* Fallback tiles                                                              */
/* -------------------------------------------------------------------------- */

/**
 * A stable hash of the game name, used to give art-less games different
 * fallback hues. Deterministic: the same game always gets the same tile, in the
 * browser preview and in a CLI render alike.
 */
export const hashName = (name: string): number => {
  let h = 2166136261;
  for (let i = 0; i < name.length; i += 1) {
    h ^= name.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
};

/**
 * Hue for a fallback tile, avoiding the muddy 45°-65° band for the same reason
 * step 6's random themes do: those yellows read as a mistake rather than a
 * choice.
 */
export const fallbackHue = (name: string): number => {
  const h = hashName(name) % 340;
  return h < 45 ? h : h + 20;
};

/** Where a slide should load this entry's image from. Null means render the fallback tile. */
export const boxArtSrc = (entry: BoxArtEntry | null | undefined): string | null =>
  entry?.file ? `boxart/${entry.file}` : null;
