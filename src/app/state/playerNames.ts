/**
 * Names typed by hand, shown in the video instead of the one in the export.
 *
 * BG Stats holds whatever somebody typed when they first added a player —
 * a surname, an abbreviation, a phone's autocorrect. The video says that name
 * in the intro, prints it on the square and puts it in the filename, and it is
 * the one piece of text in the whole video addressed *to* a person. So it is
 * worth being able to fix without editing the export.
 *
 * Stored **sparsely**, for the same reason slide lengths are: an entry exists
 * only where somebody typed one. Clearing the field removes the entry rather
 * than storing an empty string, so "no override" and "override set to nothing"
 * can never be two different states.
 *
 * Keyed by player id as a string, because that is what a JSON object gives
 * back — writing `Record<number, string>` would be a type that lies about what
 * survives a round trip through `localStorage`.
 */

export type PlayerNameOverrides = Record<string, string>;

/**
 * The longest **name** that will be used.
 *
 * Applied to the trimmed value, not to what is in the box: trailing spaces are
 * something you type on the way to the next word, and a cap that counted them
 * would start eating characters off the front of a name while somebody was
 * still typing it.
 */
export const MAX_PLAYER_NAME = 60;

/**
 * The longest raw field value that will be stored.
 *
 * A storage boundary rather than a rule about names — this map goes through
 * `localStorage`, and something has to stop a paste of a megabyte. Set far
 * enough above `MAX_PLAYER_NAME` that nobody types into it.
 */
export const MAX_PLAYER_NAME_RAW = 200;

/**
 * The name as the app will use it: trimmed, capped, blank treated as absent.
 *
 * Everything downstream goes through here — the video, the filename, the
 * `(alias)` in the two lists — so there is exactly one answer to "what is this
 * person called" and no caller has to remember to trim.
 */
const usable = (value: unknown): string | null => {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim().slice(0, MAX_PLAYER_NAME);
  return trimmed.length > 0 ? trimmed : null;
};

/**
 * Validate a stored map before trusting it.
 *
 * Bad entries are dropped one at a time rather than the map being discarded:
 * one corrupt key should not cost somebody the other twenty names they typed.
 * The raw value is kept as it was typed, so a field left mid-word — trailing
 * space and all — comes back the way it was left.
 */
export const parsePlayerNames = (raw: unknown): PlayerNameOverrides => {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return {};
  const out: PlayerNameOverrides = {};
  for (const [key, value] of Object.entries(raw as Record<string, unknown>)) {
    // Keys are player ids. Anything else came from somewhere this did not.
    if (!/^-?\d+$/.test(key)) continue;
    if (typeof value !== 'string' || value.length === 0) continue;
    out[key] = value.slice(0, MAX_PLAYER_NAME_RAW);
  }
  return out;
};

/**
 * Set or clear one player's name.
 *
 * **Stores the field verbatim**, trailing spaces included. Trimming here was
 * the obvious thing to do and it was wrong: this runs on every keystroke, so
 * a trailing space was deleted the instant it was typed and the field fought
 * anybody trying to write two words. What is stored is what is in the box;
 * what the app *uses* is `overrideFor`, which trims.
 *
 * Only a genuinely empty field clears the entry. A field holding nothing but
 * spaces is still being typed into, and `overrideFor` already answers null for
 * it, so nothing downstream can see a whitespace name.
 */
export const setPlayerName = (
  overrides: PlayerNameOverrides,
  playerId: number,
  value: string,
): PlayerNameOverrides => {
  const next = { ...overrides };
  const raw = value.slice(0, MAX_PLAYER_NAME_RAW);
  if (raw.length > 0) next[String(playerId)] = raw;
  else delete next[String(playerId)];
  return next;
};

/**
 * Exactly what is in the field, for the field.
 *
 * The one accessor that does not trim — a controlled input has to be handed
 * back what was typed into it, or the caret jumps.
 */
export const rawFor = (overrides: PlayerNameOverrides, playerId: number): string =>
  overrides[String(playerId)] ?? '';

/**
 * The name to use for this player, or null.
 *
 * Trimmed and capped — this is the boundary between "what is in the box" and
 * "what the app does with it". A field holding only spaces answers null, so a
 * half-typed name never reaches the video or a filename.
 */
export const overrideFor = (
  overrides: PlayerNameOverrides,
  playerId: number,
): string | null => usable(overrides[String(playerId)]);

/**
 * The name to show: the override if there is one, otherwise the real one.
 *
 * An override that matches the real name is not an override — it is somebody
 * typing what was already there, and reporting it as a rename would put
 * "Tina (Tina)" in the list.
 */
export const displayNameFor = (
  overrides: PlayerNameOverrides,
  playerId: number,
  actual: string,
): string => overrideFor(overrides, playerId) ?? actual;

/** True when this player's name is being replaced by a different one. */
export const isRenamed = (
  overrides: PlayerNameOverrides,
  playerId: number,
  actual: string,
): boolean => {
  const override = overrideFor(overrides, playerId);
  return override !== null && override !== actual;
};
