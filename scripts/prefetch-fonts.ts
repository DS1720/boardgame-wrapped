/**
 * Mirror the curated fonts into public/fonts.
 *
 *   npx tsx scripts/prefetch-fonts.ts [--force]
 *
 * Run once. After this, renders and the preview both read fonts from local
 * disk, so a render needs no network and the Player and the CLI show the same
 * typography.
 */
import { prefetchFonts } from '../server/fonts';

const force = process.argv.includes('--force');
const mb = (bytes: number) => `${(bytes / 1024 / 1024).toFixed(2)} MB`;

const summary = await prefetchFonts({
  force,
  onProgress: (done, total, label) => {
    process.stdout.write(`\r${String(done).padStart(2)}/${total}  ${label.padEnd(24)}`);
  },
});

process.stdout.write('\n');
console.log(`${summary.faces} faces across ${summary.families} families`);
console.log(`Downloaded ${summary.downloaded} (${mb(summary.bytes)}), reused ${summary.skipped}`);
console.log(`Manifest: ${summary.manifestPath}`);

if (summary.errors.length > 0) {
  console.log('\nFailures:');
  for (const e of summary.errors) console.log(`  ${e.spec}: ${e.message}`);
  process.exit(1);
}
