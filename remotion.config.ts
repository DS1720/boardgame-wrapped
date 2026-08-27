import { Config } from '@remotion/cli/config';
import { withProjectAliases } from './remotion.webpack';

Config.setVideoImageFormat('jpeg');
Config.setCodec('h264');
Config.setCrf(18);
// Kept in step with RENDER_SETTINGS in server/render.ts.
Config.setPixelFormat('yuv420p');
Config.setOverwriteOutput(true);

// Shared with the render service so the CLI and the app bundle identically.
Config.overrideWebpackConfig(withProjectAliases);
