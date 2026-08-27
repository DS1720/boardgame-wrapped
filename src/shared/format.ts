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

export const toDayKey = (d: Date): string =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(
    d.getDate(),
  ).padStart(2, '0')}`;

/** Sanitize a player name for use in an output filename. */
export const slugify = (s: string): string =>
  s
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .toLowerCase() || 'player';

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
