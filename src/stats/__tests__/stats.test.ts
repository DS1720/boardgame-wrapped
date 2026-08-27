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
  it('requires five head-to-head plays before naming a nemesis', () => {
    // The fixture's rivalries are all shorter than five games, so nobody
    // qualifies. The bar is higher than it was because the ranking is now a
    // rate: two losses from two games is a 100% loss rate and means nothing.
    expect(pick(1, 'nemesis')).toBeUndefined();
    expect(pick(3, 'nemesis')).toBeUndefined();
  });

  it('ranks a nemesis by loss rate, not by how often you play them', () => {
    const raw = smallExport();
    raw.games = [game(12, 'Duel')];
    // Ana plays Ben eight times and loses three; she plays Cid six times and
    // loses five. Ben is the more frequent opponent, Cid is the nemesis.
    raw.plays = [
      ...Array.from({ length: 3 }, (_, i) =>
        play(`2026-02-0${i + 1} 20:00:00`, 12, [score(1), score(2, { winner: true })]),
      ),
      ...Array.from({ length: 5 }, (_, i) =>
        play(`2026-03-0${i + 1} 20:00:00`, 12, [score(1, { winner: true }), score(2)]),
      ),
      ...Array.from({ length: 5 }, (_, i) =>
        play(`2026-04-0${i + 1} 20:00:00`, 12, [score(1), score(3, { winner: true })]),
      ),
      play('2026-04-06 20:00:00', 12, [score(1, { winner: true }), score(3)]),
    ];

    const nem = buildWrappedStats(buildDataset(raw), 1, range2026, ALL).stats.find(
      (x) => x.id === 'nemesis',
    );
    expect(nem?.id).toBe('nemesis');
    if (nem?.id !== 'nemesis') return;
    expect(nem.name).toBe('Cid');
    expect(nem.lossesTo).toBe(5);
    expect(nem.headToHead).toBe(6);
    expect(nem.lossRate).toBeCloseTo(5 / 6);
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
