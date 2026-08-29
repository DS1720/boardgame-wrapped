export const formatNumber = (n: number): string =>
  new Intl.NumberFormat('de-AT').format(n);

export const formatPercent = (ratio: number): string =>
  `${Math.round(ratio * 100)}%`;

export const formatDay = (day: string): string => {
  const d = parseLocalDate(`${day} 12:00:00`);
  return new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'long' }).format(d);
};

/**
 * BG Stats writes local wall-clock timestamps with no zone.
 * Parsing with the native Date constructor would treat some of them as UTC,
 * which shifts late-night plays onto the wrong calendar day.
 */
export const parseLocalDate = (raw: string): Date => {
  const m = raw.match(/^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2}):(\d{2})/);
  if (!m) return new Date(NaN);
  const [, y, mo, d, h, mi, s] = m;
  return new Date(+y, +mo - 1, +d, +h, +mi, +s);
};

/**
 * A "YYYY-MM-DD" day key as a local date at midnight.
 *
 * `parseLocalDate` deliberately refuses this — it parses a play's timestamp,
 * and a string with no time in it is not one, so it answers an invalid Date
 * rather than guessing. That is the right behaviour and it is also a trap:
 * the stats carry *day keys* wherever the time of day is not part of the fact,
 * and feeding one to the timestamp parser fails silently. It cost the
 * first-and-last slide its span line, which computed NaN and rendered nothing.
 */
export const parseDayKey = (day: string): Date => {
  const m = day.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return new Date(NaN);
  const [, y, mo, d] = m;
  return new Date(+y, +mo - 1, +d);
};

/** Whole days from one day key to another, or null if either is not one. */
export const daysBetween = (from: string, to: string): number | null => {
  const a = parseDayKey(from);
  const b = parseDayKey(to);
  if (Number.isNaN(a.getTime()) || Number.isNaN(b.getTime())) return null;
  // Rounded, not floored: the two dates are local midnights, and a daylight
  // saving change in between makes the difference 23 or 25 hours short of a
  // whole number of days.
  return Math.round((b.getTime() - a.getTime()) / 86_400_000);
};

export const toDayKey = (d: Date): string =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(
    d.getDate(),
  ).padStart(2, '0')}`;

/**
 * Letters that carry no combining accent, so NFD leaves them whole and the
 * strip below simply deletes them.
 *
 * Without this, "Gro\u00df" slugified to "gro" and "Stra\u00dfe" \u2014 a real location in
 * this dataset \u2014 to "stra-e".
 */
const TRANSLITERATE: Array<[RegExp, string]> = [
  [/\u00df/g, 'ss'],
  [/\u00e6/gi, 'ae'],
  [/\u0153/gi, 'oe'],
  [/\u00f8/gi, 'o'],
  [/[\u0111\u00f0]/gi, 'd'],
  [/\u00fe/gi, 'th'],
  [/\u0142/gi, 'l'],
];

/** Sanitize a name for use in an output filename. */
export const slugify = (s: string): string => {
  const transliterated = TRANSLITERATE.reduce(
    (text, [pattern, replacement]) => text.replace(pattern, replacement),
    s,
  );
  return (
    transliterated
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-zA-Z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .toLowerCase() || 'player'
  );
};

/**
 * A duration in minutes, rendered for a caption.
 *
 * Hours once there is at least one, because "6,847 minutes" is a number nobody
 * can picture.
 */
export const formatDuration = (minutes: number): string => {
  if (minutes < 60) return `${Math.round(minutes)} min`;
  const hours = minutes / 60;
  return hours < 10 ? `${hours.toFixed(1)} h` : `${formatNumber(Math.round(hours))} h`;
};

/** Days, to one decimal. Used to make a large number of hours imaginable. */
export const formatDays = (minutes: number): string => (minutes / 60 / 24).toFixed(1);
