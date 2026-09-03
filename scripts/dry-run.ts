/**
 * Dump the stats JSON for one player without rendering anything.
 *
 *   npx tsx scripts/dry-run.ts <export.json> <playerName> [year|from:to]
 *
 * Use this to sanity-check numbers against the BG Stats app itself before
 * trusting a rendered video.
 */
import { readFileSync } from 'node:fs';
import { parseExportText } from '../src/ingest/parse';
import { allTimeRange, makeRange, playersInPlays, playsInRange, yearRange } from '../src/ingest/select';
import { buildWrappedStats, MODULES } from '../src/stats/index';
import { readBggManifest } from '../server/bgg';
import { indexOf } from '../src/shared/bgg';

const [file, playerName, rangeArg = 'all'] = process.argv.slice(2);
if (!file || !playerName) {
  console.error('usage: tsx scripts/dry-run.ts <export.json> <playerName> [year|from:to|all]');
  process.exit(1);
}

const dataset = parseExportText(readFileSync(file, 'utf8'));

const range = (() => {
  if (rangeArg === 'all') return allTimeRange(dataset);
  if (/^\d{4}$/.test(rangeArg)) return yearRange(Number(rangeArg));
  const [from, to] = rangeArg.split(':');
  return makeRange(new Date(from), new Date(to), `${from} → ${to}`);
})();

const inRange = playsInRange(dataset.plays, range);
const player = playersInPlays(inRange).find(
  (p) => p.name.trim().toLowerCase() === playerName.trim().toLowerCase(),
);
if (!player) {
  console.error(`No player "${playerName}" in that range. Candidates:`);
  console.error(playersInPlays(inRange).slice(0, 15).map((p) => `  ${p.name} (${p.playCount})`).join('\n'));
  process.exit(1);
}

/*
  The credit manifest, if the prefetch has been run. Read from disk rather than
  over HTTP so a dry run needs no service — and an absent manifest simply means
  the five credit modules return null, which is what they should do.
*/
const bgg = indexOf(await readBggManifest());

const stats = buildWrappedStats(dataset, player.id, range, MODULES.map((m) => m.id), null, bgg);
console.log(JSON.stringify(stats, null, 2));
