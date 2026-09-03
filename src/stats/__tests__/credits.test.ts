import { describe, expect, it } from 'vitest';
import { buildDataset } from '@/ingest/parse';
import { yearRange } from '@/ingest/select';
import {
  FORMAT_CATEGORIES,
  PLACEHOLDER_CREDITS,
  creditsOf,
  indexOf,
  isThemeCategory,
  parseDesignerField,
  type BggEntry,
  type BggIndex,
} from '@/shared/bgg';
import { buildWrappedStats, MODULES } from '../index';
import { MAX_CREDIT_EXAMPLES, MIN_CREDIT_COVERAGE } from '../modules/credits';
import type { CreditStatId, SlideId, Stat } from '../types';
import { bggFixture, game, play, score, smallExport } from './fixtures';

const ALL: SlideId[] = MODULES.map((m) => m.id);
const range2026 = yearRange(2026);
const ds = buildDataset(smallExport());

const creditsFor = <T extends CreditStatId>(id: T, bgg: BggIndex | null, playerId = 1) =>
  buildWrappedStats(ds, playerId, range2026, ALL, null, bgg).stats.find((s) => s.id === id) as
    | Extract<Stat, { id: T }>
    | undefined;

const names = (stat: { entries: Array<{ name: string }> } | undefined) =>
  stat?.entries.map((e) => e.name) ?? [];

/*
  Player 1 (Ana) plays Azul 3x, Cascadia 1x, Pandemic 1x.

  So in the fixture's credits, "Shared Designer" is on Azul and Cascadia — four
  plays across two games — while "Azul Only" is on one game with three plays.
  That is the pair the eligibility filter exists to separate: more plays, fewer
  games, and it is the one that has to lose.
*/

describe('the credit modules need a BGG index', () => {
  it('returns null for all five when nothing has been prefetched', () => {
    for (const id of ['topThemes', 'topMechanics', 'topDesigners', 'topArtists', 'topPublishers'] as const) {
      // Designers is the exception: the export's own field still feeds it, and
      // this fixture's games carry no `designers` string, so it is null too.
      expect(creditsFor(id, null)).toBeUndefined();
    }
  });

  it('drops a play whose game was never fetched from coverage', () => {
    // Azul missing is 3 of Ana's 5 plays — 40% coverage, under the floor.
    const partial: BggIndex = new Map(bggFixture());
    partial.delete(1010);
    expect(creditsFor('topMechanics', partial)).toBeUndefined();
  });

  it('computes when coverage clears the floor', () => {
    const partial: BggIndex = new Map(bggFixture());
    partial.delete(1012); // Pandemic is 1 of 5 plays — 80% coverage.
    const stat = creditsFor('topMechanics', partial)!;
    expect(stat.coverage).toBeGreaterThanOrEqual(MIN_CREDIT_COVERAGE);
    expect(stat.coverage).toBeCloseTo(0.8);
  });
});

describe('ranking is by plays, filtered by distinct games', () => {
  it('ranks mechanics by plays with no games filter', () => {
    const stat = creditsFor('topMechanics', bggFixture())!;
    /*
      Tile Placement is on Azul (3 plays) and Cascadia (1) = 4. The other three
      have one play each and order by first appearance — Azul, then Cascadia,
      then Pandemic. "Solo Only" survives on a single game because mechanics
      take no distinct-games filter.
    */
    expect(names(stat)).toEqual(['Tile Placement', 'Set Collection', 'Solo Only', 'Cooperative Game']);
    expect(stat.entries[0].plays).toBe(4);
    expect(stat.entries[0].games).toBe(2);
  });

  it('drops a designer who only appears in one game, however many plays', () => {
    const stat = creditsFor('topDesigners', bggFixture())!;
    // "Azul Only" has three plays — more than most — and is still excluded,
    // because a name from a single game is that game's credits restated.
    expect(names(stat)).not.toContain('Azul Only');
    expect(names(stat)).toContain('Shared Designer');
  });

  it('returns null when fewer than two names survive the filter', () => {
    // Only "Shared Publisher" spans two games, so the list is one long.
    expect(creditsFor('topPublishers', bggFixture())).toBeUndefined();
  });

  it('reports plays and distinct games separately', () => {
    const stat = creditsFor('topDesigners', bggFixture())!;
    const shared = stat.entries.find((e) => e.name === 'Shared Designer')!;
    expect(shared.plays).toBe(4);
    expect(shared.games).toBe(2);
  });
});

describe('placeholders and formats never rank', () => {
  it('filters (Uncredited) out of the artist list', () => {
    const stat = creditsFor('topArtists', bggFixture())!;
    expect(names(stat)).not.toContain('(Uncredited)');
  });

  it('filters format categories out of the themes list', () => {
    const stat = creditsFor('topThemes', bggFixture())!;
    // Azul is tagged "Abstract Strategy" and Cascadia "Card Game" — both are
    // formats, and both would otherwise outrank the real themes.
    expect(names(stat)).not.toContain('Abstract Strategy');
    expect(names(stat)).not.toContain('Card Game');
    expect(names(stat)).toEqual(['Fantasy', 'Animals', 'Medical']);
  });

  it('keeps categories that name a subject rather than a form', () => {
    // The line is subject versus not-subject, so these stay however
    // format-adjacent they look.
    for (const theme of ['Movies / TV / Radio theme', 'Novel-based', 'Video Game Theme', 'Humor']) {
      expect(isThemeCategory(theme)).toBe(true);
    }
    for (const format of ['Card Game', 'Puzzle', 'Word Game', 'Action / Dexterity', 'Dice']) {
      expect(isThemeCategory(format)).toBe(false);
    }
  });

  it('treats every placeholder as not a credit', () => {
    for (const placeholder of PLACEHOLDER_CREDITS) {
      expect(isThemeCategory(placeholder)).toBe(false);
    }
  });
});

describe('publishers are the original one only', () => {
  const entry = (publisher: string | null): BggEntry => ({
    bggId: 1,
    name: 'x',
    mechanics: [],
    categories: [],
    designers: [],
    artists: [],
    publisher,
    fetchedAt: '',
  });

  it('reads exactly the stored publisher', () => {
    // The narrowing to `boardgamepublisher[0]` happens at fetch time, so by the
    // time the stats layer sees an entry there is only ever one.
    expect(creditsOf(entry('Catch Up Games'), 'publishers')).toEqual(['Catch Up Games']);
    expect(creditsOf(entry(null), 'publishers')).toEqual([]);
    expect(creditsOf(entry('(Unknown)'), 'publishers')).toEqual([]);
  });
});

describe('the row cover', () => {
  it('names a game that actually carries the credit', () => {
    const stat = creditsFor('topMechanics', bggFixture())!;
    const tile = stat.entries.find((e) => e.name === 'Tile Placement')!;
    expect(['Azul', 'Cascadia']).toContain(tile.topGame.name);
  });

  it('does not repeat a cover across rows', () => {
    // Four of Tina's five top mechanics are led by the same game in the real
    // export. Five copies of one cover reads as a bug, so a lower row takes its
    // next-best game instead.
    const stat = creditsFor('topMechanics', bggFixture())!;
    const covers = stat.entries.map((e) => e.topGame.gameId);
    // The fixture only has three games, so four rows cannot all differ. What
    // the rule guarantees is that no cover repeats until they have run out.
    expect(new Set(covers).size).toBe(Math.min(covers.length, 3));
  });
});

describe('determinism', () => {
  it('produces the same order twice, including through a tie', () => {
    const a = creditsFor('topMechanics', bggFixture())!;
    const b = creditsFor('topMechanics', bggFixture())!;
    expect(names(a)).toEqual(names(b));
  });

  it('breaks a tie by first appearance, not by insertion order', () => {
    // "Set Collection" and "Cooperative Game" are both on one game each; Azul
    // is played before Pandemic, so Set Collection comes first — and it stays
    // first when the index is built in the opposite order.
    const forward = creditsFor('topMechanics', bggFixture())!;
    const reversed: BggIndex = new Map([...bggFixture()].reverse());
    const backward = creditsFor('topMechanics', reversed)!;
    expect(names(forward)).toEqual(names(backward));
  });
});

describe('the export is a fallback source for designers only', () => {
  const withDesigners = () => {
    const raw = smallExport();
    raw.games = [
      game(10, 'Azul', { designers: 'Michael Kiesling, Reinhard Staupe, (Uncredited)' }),
      game(11, 'Cascadia', { designers: 'Randy Flynn, Michael Kiesling' }),
      game(12, 'Pandemic', { cooperative: true, designers: 'Reinhard Staupe, Matt Leacock' }),
    ];
    return buildDataset(raw);
  };

  it('ranks designers with no BGG index at all', () => {
    const stats = buildWrappedStats(withDesigners(), 1, range2026, ALL, null, null);
    const stat = stats.stats.find((s) => s.id === 'topDesigners') as
      | Extract<Stat, { id: 'topDesigners' }>
      | undefined;
    /*
      Kiesling is on Azul (3 plays) and Cascadia (1); Staupe on Azul and
      Pandemic. Both span two games at four plays, so both are eligible and the
      tie falls to the alphabetical step of `rank`. "(Uncredited)" on Azul is
      dropped rather than counted as a third designer.
    */
    expect(names(stat)).toEqual(['Michael Kiesling', 'Reinhard Staupe']);
    expect(stat!.entries[0].games).toBe(2);
  });

  it('still returns null when only one export designer spans two games', () => {
    const raw = smallExport();
    raw.games = [
      game(10, 'Azul', { designers: 'Michael Kiesling' }),
      game(11, 'Cascadia', { designers: 'Michael Kiesling' }),
      game(12, 'Pandemic', { cooperative: true, designers: 'Matt Leacock' }),
    ];
    const stats = buildWrappedStats(buildDataset(raw), 1, range2026, ALL, null, null);
    expect(stats.stats.find((s) => s.id === 'topDesigners')).toBeUndefined();
  });

  it('does not invent the other four from the export', () => {
    const ds2 = withDesigners();
    for (const id of ['topThemes', 'topMechanics', 'topArtists', 'topPublishers'] as const) {
      expect(
        buildWrappedStats(ds2, 1, range2026, ALL, null, null).stats.find((s) => s.id === id),
      ).toBeUndefined();
    }
  });

  it('splits the export field on commas and drops placeholders', () => {
    expect(parseDesignerField('Michael Kiesling, Reinhard Staupe')).toEqual([
      'Michael Kiesling',
      'Reinhard Staupe',
    ]);
    expect(parseDesignerField('(Uncredited)')).toEqual([]);
    expect(parseDesignerField('')).toEqual([]);
    expect(parseDesignerField(undefined)).toEqual([]);
    // Parenthetical alternates carry no comma of their own.
    expect(parseDesignerField('Charles Darrow, Elizabeth J. Magie (Phillips)')).toEqual([
      'Charles Darrow',
      'Elizabeth J. Magie (Phillips)',
    ]);
  });
});

describe('the manifest index', () => {
  it('drops entries that failed to fetch', () => {
    const index = indexOf({
      version: 1,
      generatedAt: '',
      entries: {
        '1': {
          bggId: 1,
          name: 'ok',
          mechanics: [],
          categories: [],
          designers: [],
          artists: [],
          publisher: null,
          fetchedAt: '',
        },
        '2': {
          bggId: 2,
          name: 'broken',
          mechanics: [],
          categories: [],
          designers: [],
          artists: [],
          publisher: null,
          fetchedAt: '',
          error: 'HTTP 500',
        },
      },
    });
    // A failed entry and a game with genuinely no artists mean different things
    // to the coverage guard, and only the first should count against it.
    expect([...index.keys()]).toEqual([1]);
  });

  it('answers an empty index for a missing manifest', () => {
    expect(indexOf(null).size).toBe(0);
    expect(indexOf(undefined).size).toBe(0);
  });
});

describe('the format blocklist', () => {
  it('has no overlap with the placeholder list', () => {
    for (const name of FORMAT_CATEGORIES) expect(PLACEHOLDER_CREDITS.has(name)).toBe(false);
  });
});

/* Keeps the fixture import honest — `play` and `score` build the export above. */
void play;
void score;

describe('the hero credit slides', () => {
  const heroFor = <T extends 'topTheme' | 'topMechanic'>(id: T, bgg: BggIndex | null, playerId = 1) =>
    buildWrappedStats(ds, playerId, range2026, ALL, null, bgg).stats.find((s) => s.id === id) as
      | Extract<Stat, { id: T }>
      | undefined;

  it('names the credit at the top of its own list', () => {
    // The hero and the list share one tally, so they can never disagree about
    // who won — which would be the worst possible bug on two adjacent slides.
    const hero = heroFor('topMechanic', bggFixture())!;
    const list = creditsFor('topMechanics', bggFixture())!;
    expect(hero.name).toBe(list.entries[0].name);
    expect(hero.plays).toBe(list.entries[0].plays);
  });

  it('carries the games that earned it, most played first', () => {
    const hero = heroFor('topMechanic', bggFixture())!;
    // Tile Placement is on Azul (3 plays) and Cascadia (1).
    expect(hero.name).toBe('Tile Placement');
    expect(hero.examples.map((g) => g.name)).toEqual(['Azul', 'Cascadia']);
    expect(hero.examples[0].plays).toBe(3);
    expect(hero.games).toBe(2);
  });

  it('never shows more than the grid holds', () => {
    const hero = heroFor('topMechanic', bggFixture())!;
    expect(hero.examples.length).toBeLessThanOrEqual(MAX_CREDIT_EXAMPLES);
    // The honest total stays on the stat even when the grid is capped, so the
    // caption can say "across 13 games" while showing six.
    expect(hero.games).toBeGreaterThanOrEqual(hero.examples.length);
  });

  it('says nothing when the leader came from a single game', () => {
    /*
      The slide's whole job is "and here are the games". A theme carried by one
      game has nothing to show and is that game again under another name.
    */
    const single: BggIndex = new Map([
      [
        1010,
        {
          bggId: 1010,
          name: 'Azul',
          mechanics: ['Tile Placement'],
          categories: ['Fantasy'],
          designers: [],
          artists: [],
          publisher: null,
          fetchedAt: '',
        },
      ],
      [
        1011,
        {
          bggId: 1011,
          name: 'Cascadia',
          mechanics: [],
          categories: [],
          designers: [],
          artists: [],
          publisher: null,
          fetchedAt: '',
        },
      ],
      [
        1012,
        {
          bggId: 1012,
          name: 'Pandemic',
          mechanics: [],
          categories: [],
          designers: [],
          artists: [],
          publisher: null,
          fetchedAt: '',
        },
      ],
    ]);
    expect(heroFor('topMechanic', single)).toBeUndefined();
  });

  it('needs an index like the lists do', () => {
    expect(heroFor('topTheme', null)).toBeUndefined();
    expect(heroFor('topMechanic', null)).toBeUndefined();
  });

  it('drops format categories from the theme hero too', () => {
    // Azul's "Abstract Strategy" and Cascadia's "Card Game" outrank the real
    // themes on raw counts, and neither says what a year was about.
    const hero = heroFor('topTheme', bggFixture());
    if (hero) {
      expect(hero.name).not.toBe('Abstract Strategy');
      expect(hero.name).not.toBe('Card Game');
    }
  });
});
