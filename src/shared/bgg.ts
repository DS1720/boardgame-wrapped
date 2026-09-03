/**
 * BGG game metadata: shared types and pure helpers.
 *
 * The BG Stats export carries a game's designers and nothing else about who
 * made it or what it is — no mechanics, no categories, no publisher, no artist.
 * Verified across both real exports: grepping for those words returns nothing.
 * So the five credit slides need a second source, joined on `bggId`, which is
 * present on 99% of plays.
 *
 * Everything here is dependency-free and runs in both the browser and Node, so
 * the prefetch engine (server) and the stats layer agree on one shape. Anything
 * that touches the filesystem or the network lives in server/bgg.ts.
 *
 * **This manifest is a stats-layer input, not a render-time asset.** Box art is
 * fetched by Remotion through `staticFile()` while frames are being drawn; this
 * is read once in the browser, folded into `WrappedStats`, and the finished
 * stats object is what reaches the renderer. No slide, and no part of
 * `bundle()`, ever sees it.
 */

export interface BggEntry {
  bggId: number;
  /** BGG's own name for the game, kept for debugging a bad join. */
  name: string;
  mechanics: string[];
  categories: string[];
  designers: string[];
  artists: string[];
  /**
   * The game's **original** publisher, and only that one.
   *
   * BGG lists every localization partner — 13.7 per game across the real
   * library — so a raw tally is a ranking of who translates the most games.
   * Measured, the top four were MINDOK, Kaissa, MIPL and Gémklub: Czech, Greek,
   * Polish and Hungarian localizers, none of whom anyone at the table would
   * name. The first entry is the original publisher (Faraway → Catch Up Games,
   * Flip 7 → The Op, The Gang → KOSMOS, Brass → Roxley), so the narrowing
   * happens here, at fetch time, and the long list never reaches the stats.
   */
  publisher: string | null;
  fetchedAt: string;
  /**
   * Why this game could not be fetched. Kept rather than omitted so a re-run
   * retries only the failures instead of the whole library.
   */
  error?: string;
}

export interface BggManifest {
  version: 1;
  generatedAt: string;
  /** Keyed by bggId as a string, because JSON has no numeric keys. */
  entries: Record<string, BggEntry>;
}

/** What the stats layer is handed: bggId → entry, with failures already dropped. */
export type BggIndex = Map<number, BggEntry>;

export const BGG_MANIFEST_VERSION = 1 as const;
export const BGG_MANIFEST_FILE = 'manifest.json';
/** Relative to the public dir, so the browser can fetch it and Node can write it. */
export const BGG_DIR = 'bgg';

export const emptyBggManifest = (): BggManifest => ({
  version: BGG_MANIFEST_VERSION,
  generatedAt: new Date().toISOString(),
  entries: {},
});

/**
 * Turn a manifest into the index the stats layer reads.
 *
 * Entries that failed to fetch are dropped rather than kept as empty ones: an
 * entry with no credits and an entry that was never fetched mean different
 * things to the coverage guard, and only the second should count against it.
 */
export const indexOf = (manifest: BggManifest | null | undefined): BggIndex => {
  const index: BggIndex = new Map();
  for (const entry of Object.values(manifest?.entries ?? {})) {
    if (!entry || entry.error) continue;
    index.set(entry.bggId, entry);
  }
  return index;
};

/* -------------------------------------------------------------------------- */
/* Credit names                                                                */
/* -------------------------------------------------------------------------- */

/**
 * Names BGG uses where there is no person to name.
 *
 * These are not people and must never rank. `(Unknown)` is the one that proves
 * the point: as a primary publisher it appears on four of the real library's
 * games, which was enough to rank it **first** on a game-weighted list.
 */
export const PLACEHOLDER_CREDITS = new Set([
  '(Uncredited)',
  '(Unknown)',
  '(Public Domain)',
  '(Web published)',
  '(Self-Published)',
  '(Inhouse Art)',
]);

export const isRealCredit = (name: string): boolean =>
  name.trim().length > 0 && !PLACEHOLDER_CREDITS.has(name.trim());

/**
 * Split the export's own `designers` string into names.
 *
 * This is the offline fallback for the designer slide: `RawGame.designers` is
 * the one credit BG Stats actually exports, and it covers 98.1% of plays. So
 * that slide keeps working with no manifest and no network at all.
 *
 * Comma-separated, and safe to split that way — the real library's worst cases
 * are parenthetical alternates that carry no comma of their own
 * ("Elizabeth J. Magie (Phillips)", "Kei Kajino (梶野 桂)").
 */
export const parseDesignerField = (raw: string | null | undefined): string[] =>
  (raw ?? '')
    .split(',')
    .map((name) => name.trim())
    .filter(isRealCredit);

/* -------------------------------------------------------------------------- */
/* Themes                                                                      */
/* -------------------------------------------------------------------------- */

/**
 * BGG categories that describe a game's *form*, not its *subject*.
 *
 * The themes slide asks what a year was about, and unfiltered the answer is
 * "Card Game" for everybody — it is on 106 of the 229 games in the real library
 * and takes a fifth of all category mass. So formats, components, activities
 * and audience ratings are dropped, and what is left is what a person would
 * call a theme.
 *
 * The line drawn is subject versus not-subject, which is why "Movies / TV /
 * Radio theme", "Novel-based", "Video Game Theme" and "Humor" all stay: they
 * say what a game is *about*. "Puzzle", "Word Game" and "Action / Dexterity"
 * go, because they say what you *do*.
 *
 * Genres that sit between the two — Deduction, Bluffing, Negotiation — are
 * kept. They read as a theme on the slide, and dropping them would empty the
 * list for the party-heavy players who most need it: Tina's filtered top five
 * leads with Deduction 39.
 *
 * Exported and tested, so changing the line is one edit rather than a rewrite.
 */
export const FORMAT_CATEGORIES = new Set([
  'Card Game',
  'Party Game',
  'Expansion for Base-game',
  'Dice',
  'Abstract Strategy',
  'Action / Dexterity',
  'Real-time',
  'Word Game',
  'Number',
  'Math',
  'Memory',
  'Trivia',
  'Puzzle',
  'Educational',
  "Children's Game",
  'Print & Play',
  'Electronic',
  'Miniatures',
  'Game System',
  'Mature / Adult',
  'Book',
]);

export const isThemeCategory = (name: string): boolean =>
  isRealCredit(name) && !FORMAT_CATEGORIES.has(name.trim());

/* -------------------------------------------------------------------------- */
/* Reading one field off an entry                                              */
/* -------------------------------------------------------------------------- */

/** Which credit a stat module is counting. */
export type CreditField = 'mechanics' | 'themes' | 'publishers' | 'designers' | 'artists';

/**
 * The names one game contributes to one field, already filtered.
 *
 * Publishers is the single original publisher rather than a list, and themes is
 * categories minus the formats — both narrowings live here so no caller can
 * forget one.
 */
export const creditsOf = (entry: BggEntry | undefined, field: CreditField): string[] => {
  if (!entry) return [];
  switch (field) {
    case 'mechanics':
      return entry.mechanics.filter(isRealCredit);
    case 'themes':
      return entry.categories.filter(isThemeCategory);
    case 'publishers':
      return entry.publisher && isRealCredit(entry.publisher) ? [entry.publisher] : [];
    case 'designers':
      return entry.designers.filter(isRealCredit);
    case 'artists':
      return entry.artists.filter(isRealCredit);
  }
};

/* -------------------------------------------------------------------------- */
/* Progress estimation                                                         */
/* -------------------------------------------------------------------------- */

/** What the panel knows about a run in flight. */
export interface BggProgressSample {
  done: number;
  total: number;
  /** Items that needed a network round trip. The only ones that cost time. */
  fetched: number;
  elapsedMs: number;
}

/**
 * Fetches that must land before an estimate is offered.
 *
 * The first tick or two are meaningless. Four workers start at once, so `done`
 * jumps straight to four in whatever the first request happened to take — and
 * that request pays for DNS and the TLS handshake, which none of the 226 after
 * it do. Measured on the real library, an estimate offered at four fetches read
 * "about 50 seconds left" for a job that took 21.5s; by eight it has converged.
 *
 * Held deliberately low all the same: on a small library this is a real share
 * of the run, and a couple of seconds of silence is better than a couple of
 * seconds of a wrong number.
 */
export const ETA_WARMUP_FETCHES = 8;

/**
 * Seconds left, or null when there is nothing honest to say yet.
 *
 * **Cached items are not the same cost as fetched ones**, and a naive
 * `elapsed / done` estimate is badly wrong because of it. A re-run with 200
 * games already in the manifest and 27 new ones flies through the cached
 * two hundred in under a second, so the rate measured over *all* items says
 * "one second left" — and then the run spends half a minute on the rest, with
 * the estimate climbing the whole way.
 *
 * So the rate is measured per **fetch**, and the remaining fetches are
 * projected by assuming the cached/fetched mix seen so far continues. That is
 * right for a fresh run (everything is a fetch), right for a fully cached one
 * (no fetches, so nothing to wait for), and self-correcting for a mixed one.
 */
export const estimateRemainingSeconds = ({
  done,
  total,
  fetched,
  elapsedMs,
}: BggProgressSample): number | null => {
  const remaining = total - done;
  if (remaining <= 0) return 0;
  if (done <= 0 || elapsedMs <= 0) return null;
  // Nothing has been fetched yet: either everything is cached, in which case
  // there is no wait to describe, or the first fetch has not landed.
  if (fetched < ETA_WARMUP_FETCHES) return fetched === done ? null : 0;

  const secondsPerFetch = elapsedMs / 1000 / fetched;
  const projectedFetches = remaining * (fetched / done);
  return projectedFetches * secondsPerFetch;
};

/**
 * The estimate, worded.
 *
 * Rounded coarsely on purpose. A figure ticking down second by second invites
 * someone to check it against a clock, and this is a projection from an average
 * rate rather than a measurement — "about half a minute" is both more honest
 * and less distracting than "27s".
 */
export const formatEta = (seconds: number | null): string | null => {
  if (seconds === null) return null;
  if (seconds < 5) return 'almost done';
  // Cut over at 55 rather than 60, or rounding to the nearest five produces
  // "about 60 seconds left" one tick before "about a minute left".
  if (seconds < 55) return `about ${Math.max(5, Math.round(seconds / 5) * 5)} seconds left`;
  if (seconds < 75) return 'about a minute left';
  if (seconds < 105) return 'about a minute and a half left';
  /*
    Straight to whole minutes from here.

    Rounding to half minutes first and then to whole ones double-rounds: 140
    seconds is 2.33 minutes, which becomes 2.5 and then 3 — a full minute more
    than the estimate. The half-minute wording only exists for the one step
    below this, and that step is spelled out above.
  */
  return `about ${Math.round(seconds / 60)} minutes left`;
};
