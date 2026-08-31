import { describe, expect, it } from 'vitest';
import {
  displayNameFor,
  isRenamed,
  MAX_PLAYER_NAME,
  MAX_PLAYER_NAME_RAW,
  overrideFor,
  parsePlayerNames,
  rawFor,
  setPlayerName,
} from '../playerNames';

/**
 * The map is sparse and it arrives from `localStorage`, so the two things
 * worth testing are that blank never becomes an entry and that a malformed
 * store cannot cost somebody the names they did type.
 */

describe('setPlayerName', () => {
  it('stores a name against the player id, as a string key', () => {
    expect(setPlayerName({}, 4, 'Tinchen')).toEqual({ '4': 'Tinchen' });
  });

  it('clears the entry when the field is emptied, rather than storing blank', () => {
    expect(setPlayerName({ '4': 'Tinchen' }, 4, '')).toEqual({});
  });

  it('leaves the other players alone', () => {
    expect(setPlayerName({ '4': 'Tinchen', '9': 'Bo' }, 4, '')).toEqual({ '9': 'Bo' });
  });

  it('does not mutate the map it was given', () => {
    const before = { '4': 'Tinchen' };
    setPlayerName(before, 9, 'Bo');
    expect(before).toEqual({ '4': 'Tinchen' });
  });

  it('caps a paste rather than storing whatever arrived', () => {
    const long = 'x'.repeat(MAX_PLAYER_NAME_RAW + 400);
    expect(setPlayerName({}, 4, long)['4']).toHaveLength(MAX_PLAYER_NAME_RAW);
  });
});

describe('parsePlayerNames', () => {
  it('keeps a well-formed map', () => {
    expect(parsePlayerNames({ '4': 'Tinchen' })).toEqual({ '4': 'Tinchen' });
  });

  it.each([null, undefined, 'nope', 42, ['4', 'Tinchen']])('answers {} for %s', (raw) => {
    expect(parsePlayerNames(raw)).toEqual({});
  });

  it('drops bad entries one at a time rather than the whole map', () => {
    expect(
      parsePlayerNames({ '4': 'Tinchen', notAnId: 'Bo', '9': 42, '12': '' }),
    ).toEqual({ '4': 'Tinchen' });
  });

  /* A field holding only spaces is somebody mid-way through typing, not a
     malformed entry — it survives a reload, and `overrideFor` still answers
     null for it, so nothing downstream can see a whitespace name. */
  it('keeps a whitespace-only field but yields no name from it', () => {
    const parsed = parsePlayerNames({ '15': '  ' });
    expect(parsed).toEqual({ '15': '  ' });
    expect(overrideFor(parsed, 15)).toBeNull();
  });

  it('accepts a negative id, because nothing promises they are positive', () => {
    expect(parsePlayerNames({ '-3': 'Bo' })).toEqual({ '-3': 'Bo' });
  });

  it('caps a value that arrived oversized from storage', () => {
    const parsed = parsePlayerNames({ '4': 'x'.repeat(5000) });
    expect(parsed['4']).toHaveLength(MAX_PLAYER_NAME_RAW);
  });

  it('keeps a value left mid-word, trailing space and all', () => {
    expect(parsePlayerNames({ '4': 'Tina ' })).toEqual({ '4': 'Tina ' });
  });
});

describe('reading a name back', () => {
  it('falls back to the export name when nothing was typed', () => {
    expect(displayNameFor({}, 4, 'Tina')).toBe('Tina');
    expect(overrideFor({}, 4)).toBeNull();
  });

  it('prefers what was typed', () => {
    expect(displayNameFor({ '4': 'Tinchen' }, 4, 'Tina')).toBe('Tinchen');
  });

  it('does not confuse one player with another', () => {
    expect(displayNameFor({ '4': 'Tinchen' }, 9, 'Bo')).toBe('Bo');
  });

  /* Typing the name that was already there is not a rename, and reporting it
     as one would put "Tina (Tina)" in the list. */
  it('is not a rename when the override matches the real name', () => {
    expect(isRenamed({ '4': 'Tina' }, 4, 'Tina')).toBe(false);
    expect(displayNameFor({ '4': 'Tina' }, 4, 'Tina')).toBe('Tina');
  });

  it('is a rename when it differs', () => {
    expect(isRenamed({ '4': 'Tinchen' }, 4, 'Tina')).toBe(true);
  });

  it('is not a rename when nothing was typed', () => {
    expect(isRenamed({}, 4, 'Tina')).toBe(false);
  });
});

describe('spaces in the field', () => {
  /*
    `setPlayerName` runs on every keystroke. Trimming there deleted a trailing
    space the instant it was typed, so the field fought anybody trying to write
    two words. What is stored is now exactly what is in the box; what the app
    uses is trimmed on the way out.
  */
  it('keeps a trailing space so a second word can be typed', () => {
    expect(setPlayerName({}, 4, 'Tina ')).toEqual({ '4': 'Tina ' });
  });

  it('keeps several trailing spaces', () => {
    expect(setPlayerName({}, 4, 'Tina     ')['4']).toBe('Tina     ');
  });

  it('hands the field back exactly what was typed', () => {
    const overrides = setPlayerName({}, 4, 'Tina ');
    expect(rawFor(overrides, 4)).toBe('Tina ');
  });

  it('gives the field an empty string when nothing was typed', () => {
    expect(rawFor({}, 4)).toBe('');
  });

  it('keeps spaces inside a name, which are part of it', () => {
    expect(overrideFor(setPlayerName({}, 4, 'Tina B'), 4)).toBe('Tina B');
  });

  describe('but the app never sees them', () => {
    it('trims what the video and the filename get', () => {
      expect(overrideFor(setPlayerName({}, 4, 'Tinchen  '), 4)).toBe('Tinchen');
      expect(overrideFor(setPlayerName({}, 4, '  Tinchen'), 4)).toBe('Tinchen');
    });

    it('trims the name shown in the list', () => {
      const overrides = setPlayerName({}, 4, 'Tinchen ');
      expect(displayNameFor(overrides, 4, 'Tina')).toBe('Tinchen');
    });

    it('does not call a trailing space a rename', () => {
      expect(isRenamed(setPlayerName({}, 4, 'Tina '), 4, 'Tina')).toBe(false);
    });

    it('treats a field holding only spaces as no override at all', () => {
      const overrides = setPlayerName({}, 4, '   ');
      expect(overrideFor(overrides, 4)).toBeNull();
      expect(displayNameFor(overrides, 4, 'Tina')).toBe('Tina');
      expect(isRenamed(overrides, 4, 'Tina')).toBe(false);
      // Still in the box, because somebody is mid-way through typing it.
      expect(rawFor(overrides, 4)).toBe('   ');
    });

    it('caps the used name well below the raw field limit', () => {
      const long = 'x'.repeat(MAX_PLAYER_NAME + 40);
      expect(overrideFor(setPlayerName({}, 4, long), 4)).toHaveLength(MAX_PLAYER_NAME);
    });
  });
});
