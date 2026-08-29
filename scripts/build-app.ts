/**
 * Build the Windows app: UI, service, installer, in one command.
 *
 * The only interesting part is *where* it writes. electron-builder extracts
 * Electron into `<output>/win-unpacked.tmp` and then renames that directory —
 * and on a folder OneDrive is syncing, the rename fails with `EPERM` every
 * time, because something else is holding a handle while the sync runs. The
 * project's own `release/` is inside `Documents`, which is exactly such a
 * folder on a default Windows install, so the obvious place to build is the one
 * place that cannot work.
 *
 * So the output goes outside the synced tree by default, and the script prints
 * where it put the installer rather than leaving that to be guessed.
 */
import { spawnSync } from 'node:child_process';
import { existsSync, readdirSync, statSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

/** Override with BGW_RELEASE_DIR to build somewhere else. */
const OUTPUT =
  process.env.BGW_RELEASE_DIR ?? path.join(os.homedir(), 'BoardGameWrapped-build');

const run = (label: string, command: string, args: string[]) => {
  console.log(`\n▸ ${label}`);
  const result = spawnSync(command, args, {
    cwd: ROOT,
    stdio: 'inherit',
    shell: process.platform === 'win32',
    // The parent may be an Electron process running as Node. Passing that down
    // makes electron-builder's own Electron launch behave as a bare Node
    // process and the packaging step fails in a way that reads like a bug.
    env: { ...process.env, ELECTRON_RUN_AS_NODE: undefined } as NodeJS.ProcessEnv,
  });
  if (result.status !== 0) {
    console.error(`\n${label} failed.`);
    process.exit(result.status ?? 1);
  }
};

run('Building the UI', 'npx', ['vite', 'build']);
run('Bundling the render service', 'npx', ['tsx', 'scripts/build-server.ts']);
run('Packaging the Windows app', 'npx', [
  'electron-builder',
  '--win',
  `-c.directories.output=${OUTPUT.replace(/\\/g, '/')}`,
]);

/*
  The newest installer, not the first one alphabetically.

  Earlier versions accumulate in this folder, and `find` returned whichever
  sorted first — so a fresh 0.2.0 build proudly announced the 0.1.0 installer
  sitting beside it, which is the one path in this script anybody actually
  reads.
*/
const installer = existsSync(OUTPUT)
  ? readdirSync(OUTPUT)
      .filter((f) => f.endsWith('.exe') && f.includes('Setup'))
      .map((f) => ({ f, at: statSync(path.join(OUTPUT, f)).mtimeMs }))
      .sort((a, b) => b.at - a.at)[0]?.f
  : undefined;

console.log('\n' + '─'.repeat(64));
if (installer) {
  console.log('Installer:', path.join(OUTPUT, installer));
} else {
  console.log('Built into:', OUTPUT);
}
console.log('Portable folder:', path.join(OUTPUT, 'win-unpacked'));
console.log('─'.repeat(64) + '\n');
