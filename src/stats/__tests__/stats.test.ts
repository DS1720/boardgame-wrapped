import { describe, expect, it } from 'vitest';
import { buildDataset } from '@/ingest/parse';
import { yearRange } from '@/ingest/select';
import { buildWrappedStats, CORE_SLIDES, MODULES } from '../index';
import type { SlideId, Stat } from '../types';
import { game, play, score, smallExport } from './fixtures';

const ds = buildDataset(smallExport());
const range2026 = yearRange(2026);
const ALL: SlideId[] = MODULES.map((m) => m.id);

const statsFor = (playerId: number, enabled: SlideId[] = ALL) =>
  buildWrappedStats(ds, playerId, range2026, enabled);

const pick = <T extends Stat['id']>(playerId: number, id: T) =>
  statsFor(playerId).stats.find((s) => s.id === id) as Extract<Stat, { id: T }> | undefined;

describe('core stats on a hand-checked fixture', () => {
  it('counts plays, nights and distinct games', () => {
    const s = pick(1, 'totalPlays')!;
    expect(s.plays).toBe(5);
    expect(s.nights).toBe(4);
    expect(s.distinctGames).toBe(3);
  });

  it('finds the most played game', () => {
    const s = pick(1, 'topGame')!;
    expect(s.game.name).toBe('Azul');
    expect(s.plays).toBe(3);
  });

  it('builds a top five in descending order', () => {
    const s = pick(1, 'topFive')!;
    expect(s.games.map((g) => g.name)).toEqual(['Azul', 'Cascadia', 'Pandemic']);
    expect(s.games[0].plays).toBe(3);
  });

  it('excludes cooperative games from win rate', () => {
    const s = pick(1, 'winRate')!;
    expect(s.wins).toBe(2);
    expect(s.losses).toBe(2);
    expect(s.ratio).toBe(0.5);
    expect(s.coopOnly).toBe(false);
  });

  it('finds the most frequent co-player', () => {
    const s = pick(1, 'topCoPlayer')!;
    expect(s.name).toBe('Ben');
    expect(s.shared).toBe(4);
  });

  it('counts games learned from newPlayer flags', () => {
    const s = pick(1, 'gamesLearned')!;
    expect(s.count).toBe(1);
    expect(s.games[0].name).toBe('Azul');
  });

  it('counts locations in nights and breaks ties by earliest visit', () => {
    const s = pick(1, 'topLocation')!;
    expect(s.name).toBe('Kitchen table');
    expect(s.nights).toBe(2);
  });
});

describe('guard rails', () => {
  it('requires three head-to-head plays before naming a nemesis', () => {
    expect(pick(1, 'nemesis')!.name).toBe('Ben');
    expect(pick(1, 'nemesis')!.lossesTo).toBe(2);
    // Cid only faced Ana in one competitive play, so Cid is never the nemesis.
    expect(pick(3, 'nemesis')).toBeUndefined();
  });

  it('does not divide by zero when every play is cooperative', () => {
    const raw = smallExport();
    raw.games = [game(12, 'Pandemic', { cooperative: true })];
    raw.plays = [
      play('2026-01-01 20:00:00', 12, [score(1, { winner: true }), score(2, { winner: true })]),
    ];
    const coopDs = buildDataset(raw);
    const s = buildWrappedStats(coopDs, 1, range2026, ALL).stats.find((x) => x.id === 'winRate');
    expect(s).toBeDefined();
    expect((s as Extract<Stat, { id: 'winRate' }>).coopOnly).toBe(true);
    expect((s as Extract<Stat, { id: 'winRate' }>).ratio).toBe(1);
  });

  it('omits a streak slide when the best streak is a single win', () => {
    expect(pick(1, 'longestWinStreak')).toBeUndefined();
  });

  it('skips the score slide when the player has no numeric scores', () => {
    expect(pick(1, 'highestScore')!.score).toBe(88);
    expect(pick(3, 'highestScore')).toBeUndefined();
  });

  it('omits the night-owl slide below ten plays', () => {
    expect(pick(1, 'nightOwl')).toBeUndefined();
  });

  it('returns no stats at all for a player with no plays in range', () => {
    const empty = buildWrappedStats(ds, 999, range2026, ALL);
    expect(empty.stats).toHaveLength(0);
    expect(empty.thin).toBe(true);
  });

  it('never throws for any player and any module', () => {
    for (const playerId of [1, 2, 3, 999]) {
      for (const module of MODULES) {
        expect(() => buildWrappedStats(ds, playerId, range2026, [module.id])).not.toThrow();
      }
    }
  });
});

describe('determinism', () => {
  it('produces byte-identical output on repeated runs', () => {
    const a = JSON.stringify(statsFor(1));
    const b = JSON.stringify(statsFor(1));
    expect(a).toBe(b);
  });

  it('emits slides in the declared order', () => {
    const order = statsFor(1, CORE_SLIDES).stats.map((s) => s.id);
    const expected = MODULES.filter((m) => CORE_SLIDES.includes(m.id)).map((m) => m.id);
    expect(order).toEqual(expected.filter((id) => order.includes(id)));
  });

  it('counts a participant with a null score toward total plays', () => {
    // Ana's Cascadia and Pandemic plays carry no score but must still count.
    expect(pick(1, 'totalPlays')!.plays).toBe(5);
  });
});
