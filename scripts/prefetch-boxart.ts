/**
 * Download every game's box art and build the manifest, without the UI.
 *
 *   npx tsx scripts/prefetch-boxart.ts <export.json> [--concurrency 6] [--dir public/boxart] [--force]
 *
 * Safe to re-run: covers already on disk are not downloaded again. Interrupt it
 * with Ctrl-C and run it again; it picks up where it stopped.
 */
import { prefetchBoxArt, DEFAULT_DIR } from '../server/boxart';
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
  console.error('usage: tsx scripts/prefetch-boxart.ts <export.json> [--concurrency 6] [--dir public/boxart] [--force]');
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

const mb = (bytes: number) => `${(bytes / 1024 / 1024).toFixed(1)} MB`;
const started = Date.now();
let lastLine = 0;

const summary = await prefetchBoxArt({
  games: raw.games,
  dir: flag('dir') ?? DEFAULT_DIR,
  concurrency: Number(flag('concurrency') ?? 6),
  force: flags.has('force'),
  signal: controller.signal,
  onProgress: (p) => {
    // Throttled so the progress line does not dominate the run's own cost.
    const now = Date.now();
    if (now - lastLine < 100 && p.done < p.total) return;
    lastLine = now;
    const pct = String(Math.floor((p.done / p.total) * 100)).padStart(3);
    process.stdout.write(
      `\r${pct}%  ${p.done}/${p.total}  new ${p.downloaded}  cached ${p.skipped}  no-art ${p.fallback}  failed ${p.failed}   `,
    );
  },
});

process.stdout.write('\n');
console.log(`Downloaded ${summary.downloaded} covers (${mb(summary.bytes)}) in ${((Date.now() - started) / 1000).toFixed(1)}s`);
console.log(`Reused ${summary.skipped}, fallback tiles ${summary.fallback}, failed ${summary.failed}`);
console.log(`Manifest: ${summary.manifestPath}`);

if (summary.errors.length > 0) {
  console.log('\nFailures:');
  for (const e of summary.errors) console.log(`  ${e.name} (#${e.gameId}): ${e.message}`);
  process.exit(1);
}
