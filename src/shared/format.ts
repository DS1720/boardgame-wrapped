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
