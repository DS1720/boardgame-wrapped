import { describe, expect, it } from 'vitest';
import { buildDataset, IngestError, parseExportText } from '../parse';
import { smallExport } from '@/stats/__tests__/fixtures';

describe('buildDataset', () => {
  it('normalizes the fixture and drops ignored plays', () => {
    const ds = buildDataset(smallExport());
    expect(ds.plays).toHaveLength(5);
    expect(ds.counts.ignored).toBe(1);
    expect(ds.counts.players).toBe(3);
    expect(ds.counts.games).toBe(3);
  });

  it('resolves a game name for every play', () => {
    const ds = buildDataset(smallExport());
    for (const play of ds.plays) expect(play.gameName).not.toBe('');
    expect(ds.plays.every((p) => p.gameName !== undefined)).toBe(true);
  });

  it('sorts plays oldest first', () => {
    const ds = buildDataset(smallExport());
    const times = ds.plays.map((p) => p.date.getTime());
    expect([...times].sort((a, b) => a - b)).toEqual(times);
  });

  it('keeps late-night plays on their local calendar day', () => {
    const ds = buildDataset(smallExport());
    const late = ds.plays.find((p) => p.hour === 23)!;
    expect(late.day).toBe('2026-04-02');
  });

  it('handles a game with no box art without throwing', () => {
    const raw = smallExport();
    raw.games[0].urlImage = '';
    const ds = buildDataset(raw);
    expect(ds.plays.find((p) => p.gameId === 10)!.boxArt).toBeNull();
  });

  it('names the missing keys when the file is not a BG Stats export', () => {
    expect(() => buildDataset({ hello: 'world' })).toThrow(IngestError);
    expect(() => buildDataset({ hello: 'world' })).toThrow(/plays/);
  });

  it('rejects truncated JSON with a readable message', () => {
    expect(() => parseExportText('{"plays": [')).toThrow(/not valid JSON/);
  });

  it('rejects an export with no usable plays', () => {
    const raw = smallExport();
    raw.plays = raw.plays.map((p) => ({ ...p, ignored: true }));
    expect(() => buildDataset(raw)).toThrow(/no usable plays/);
  });
});
