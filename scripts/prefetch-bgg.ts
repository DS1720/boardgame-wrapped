/**
 * Fetch every game's BGG credits and build the manifest, without the UI.
 *
 *   npx tsx scripts/prefetch-bgg.ts <export.json> [--concurrency 4] [--dir public/bgg] [--force]
 *
 * Safe to re-run: games already in the manifest are not fetched again, and a
 * game that failed last time is. Interrupt it with Ctrl-C and run it again.
 */
import { prefetchBgg, DEFAULT_BGG_DIR } from '../server/bgg';
import { readFileSync } from 'node:fs';
import type { RawExport } from '../src/shared/types';

const BOOLEAN_FLAGS = new Set(['force']);

const argv = process.argv.slice(2);
const flags = new Map<string, string>();
const positionals: string[] = [];
for (let i = 0; i < argv.length; i += 1) {
  const arg = argv[i];
  if (arg.startsWith('--')) {
    const name = arg.slice(2);
    // Boolean flags take no value, so they must not swallow the export path.
    if (BOOLEAN_FLAGS.has(name)) {
      flags.set(name, 'true');
    } else {
      flags.set(name, argv[i + 1] ?? '');
      i += 1;
    }
  } else {
    positionals.push(arg);
  }
}
const flag = (name: string): string | undefined => flags.get(name) || undefined;

const file = positionals[0];
if (!file) {
  console.error('usage: tsx scripts/prefetch-bgg.ts <export.json> [--concurrency 4] [--dir public/bgg] [--force]');
  process.exit(1);
}

const raw = JSON.parse(readFileSync(file, 'utf8')) as RawExport;
if (!Array.isArray(raw.games)) {
  console.error('That file has no games[] — is it a BG Stats export?');
  process.exit(1);
}

const controller = new AbortController();
process.on('SIGINT', () => {
  console.log('\nStopping — re-run to resume.');
  controller.abort();
});

const started = Date.now();
let lastLine = 0;

const summary = await prefetchBgg({
  games: raw.games,
  dir: flag('dir') ?? DEFAULT_BGG_DIR,
  concurrency: Number(flag('concurrency') ?? 4),
  force: flags.has('force'),
  signal: controller.signal,
  onProgress: (p) => {
    const now = Date.now();
    if (now - lastLine < 100 && p.done < p.total) return;
    lastLine = now;
    const pct = String(Math.floor((p.done / p.total) * 100)).padStart(3);
    process.stdout.write(
      `\r${pct}%  ${p.done}/${p.total}  new ${p.fetched}  cached ${p.skipped}  failed ${p.failed}   `,
    );
  },
});

process.stdout.write('\n');
console.log(`Fetched ${summary.fetched} games in ${((Date.now() - started) / 1000).toFixed(1)}s`);
console.log(`Reused ${summary.skipped}, failed ${summary.failed}`);
console.log(`Manifest: ${summary.manifestPath}`);

if (summary.errors.length > 0) {
  console.log('\nFailures:');
  for (const e of summary.errors) console.log(`  ${e.name} (#${e.bggId}): ${e.message}`);
  process.exit(1);
}
