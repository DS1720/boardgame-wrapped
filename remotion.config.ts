import { Config } from '@remotion/cli/config';
import path from 'node:path';

Config.setVideoImageFormat('jpeg');
Config.setCodec('h264');
Config.setCrf(18);
Config.setOverwriteOutput(true);

// Remotion bundles with its own webpack, so the "@" alias from tsconfig/vite
// has to be repeated here. Without it, any runtime (non-type) import of
// "@/..." inside src/video fails to resolve at bundle time.
Config.overrideWebpackConfig((current) => ({
  ...current,
  resolve: {
    ...current.resolve,
    alias: {
      ...current.resolve?.alias,
      '@': path.resolve(process.cwd(), 'src'),
    },
  },
}));
