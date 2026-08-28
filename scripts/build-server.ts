/**
 * Bundle the render service into one file the desktop shell can run.
 *
 * The service is TypeScript with `@/…` aliases and extensionless imports, which
 * Node cannot run directly — in development `tsx` handles that. The packaged
 * app has no tsx, so esbuild does the same job ahead of time and writes a
 * single CommonJS file.
 *
 * **Native and dynamic packages stay external.** `@remotion/renderer` ships
 * platform binaries (the compositor, and ffmpeg's DLLs beside it) and
 * `@remotion/bundler` runs webpack, which resolves modules at runtime by
 * looking at real directories on disk. Bundling either produces a file that
 * builds cleanly and fails on the first render — the worst place to find out.
 */
import { build } from 'esbuild';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

await build({
  entryPoints: [path.join(ROOT, 'server', 'index.ts')],
  // One level below the root, exactly where `server/index.ts` sat: the service
  // resolves `out/`, `public/` and `src/video/index.ts` relative to its own
  // file, and those paths have to keep meaning the same thing.
  outfile: path.join(ROOT, 'build', 'server.cjs'),
  bundle: true,
  platform: 'node',
  target: 'node20',
  // CommonJS, so it runs under `electron --run-as-node` with no ESM flags and
  // no package.json "type" needed beside it.
  format: 'cjs',
  external: [
    '@remotion/renderer',
    '@remotion/bundler',
    '@remotion/cli',
    'remotion',
    'react',
    'react-dom',
    'express',
    'node-vibrant',
    'esbuild',
    'webpack',
  ],
  // The source computes its own directory from `import.meta.url`, which does
  // not exist in CommonJS. This is the same value, spelled the CJS way.
  define: { 'import.meta.url': '__IMPORT_META_URL__' },
  // `define` only accepts an identifier or a literal, so the real expression is
  // declared once at the top of the bundle and `import.meta.url` maps to it.
  banner: {
    js: 'const __IMPORT_META_URL__ = require("node:url").pathToFileURL(__filename).href;',
  },
  logLevel: 'info',
});

console.log('built build/server.cjs');
