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

export const barsToFrames = (bars: number, bpm: number, fps = VIDEO.fps): number =>
  Math.round((60 / bpm) * 4 * fps * bars);
