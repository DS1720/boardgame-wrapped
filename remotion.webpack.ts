import path from 'node:path';
import type { WebpackOverrideFn } from '@remotion/bundler';

/**
 * The `@` alias, for Remotion's own webpack.
 *
 * Remotion bundles with its own webpack and knows nothing about tsconfig paths,
 * so the alias has to be repeated for it. This lives in its own file because
 * there are two callers — the CLI through `remotion.config.ts`, and the render
 * service through `bundle()` — and a version that only fixed one of them would
 * fail exactly where it is hardest to notice: a render that works from the
 * command line and not from the app, or the reverse.
 */
export const withProjectAliases: WebpackOverrideFn = (current) => ({
  ...current,
  resolve: {
    ...current.resolve,
    alias: {
      ...current.resolve?.alias,
      '@': path.resolve(process.cwd(), 'src'),
    },
  },
});
