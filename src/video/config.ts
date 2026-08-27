/**
 * Mobile format. Everything in this project targets a phone screen:
 * 1080 x 1920, 9:16, 30fps — the same frame as an Instagram Story or a
 * TikTok/Reels upload. Do not add a landscape composition; a second aspect
 * ratio would double the layout work in every slide.
 */
export const VIDEO = {
  width: 1080,
  height: 1920,
  fps: 30,
  /**
   * Keep everything that matters inside this margin. Story UI (profile chip at
   * the top, reply bar at the bottom) covers roughly the outer 10% on most
   * phones.
   */
  safeMargin: 120,
} as const;

export const barsToFrames = (bars: number, bpm: number, fps: number = VIDEO.fps): number =>
  Math.round((60 / bpm) * 4 * fps * bars);

/**
 * Box art rendering. One radius, one crop rule, used by every slide.
 *
 * Covers arrive at wildly different aspect ratios, so they are always cropped
 * to a fixed shape with object-fit: cover. Letterboxing a box would make the
 * slide look broken; cropping it never does.
 */
export const BOX_ART = {
  radius: 28,
  /**
   * Hero slides put a blurred, darkened copy of the same cover behind it.
   *
   * The darkening has to be heavy: a pale cover (Faraway's is cream) blurs to a
   * light grey that washes out the foreground box and any text over it. Tuned
   * against the palest cover in the export rather than an average one.
   */
  heroBlurPx: 64,
  heroBackdropOpacity: 0.62,
  heroBackdropScale: 1.25,
} as const;
