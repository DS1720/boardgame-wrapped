/**
 * The render service (Node only).
 *
 * Bundles the composition once, then renders one video at a time into `out/`.
 * The bundle is the expensive part — a few seconds of webpack — so it is built
 * on the first render and reused for every one after.
 */
import { execFile } from 'node:child_process';
import { mkdir, stat } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { bundle } from '@remotion/bundler';
import {
  makeCancelSignal,
  openBrowser,
  renderMedia,
  renderStill,
  selectComposition,
} from '@remotion/renderer';
import { withProjectAliases } from '../remotion.webpack';
import { slugify } from '../src/shared/format';
import type { Track } from '../src/shared/audio';
import type { WrappedStats } from '../src/stats/types';
import type { Theme } from '../src/theme/types';
import type { TimelineSlideId } from '../src/video/timeline';

const here = path.dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = path.resolve(here, '..');
export const OUT_DIR = path.resolve(PROJECT_ROOT, 'out');
const ENTRY = path.resolve(PROJECT_ROOT, 'src', 'video', 'index.ts');

/**
 * Matches the CLI settings in remotion.config.ts, so both produce the same file.
 *
 * `colorSpace` is the one that does the work. Left at its default, a 1080x1920
 * render came out tagged `bt470bg` — SD PAL — with full-range JPEG levels, which
 * ffprobe reports as `yuvj420p`. A player honouring those tags converts the
 * colours wrongly.
 *
 * Setting `bt709` fixes the whole chain: the output becomes true `yuv420p` at
 * limited range with HD primaries. `pixelFormat` alone did not achieve this —
 * the colour space is what drives the conversion.
 */
export const RENDER_SETTINGS = {
  codec: 'h264',
  crf: 18,
  imageFormat: 'jpeg',
  pixelFormat: 'yuv420p',
  colorSpace: 'bt709',
} as const;

export class RenderError extends Error {}

export interface RenderInput {
  stats: WrappedStats;
  theme: Theme | null;
  track: Track | null;
  /** The ordered cut. Named `slides` in the request, per the plan. */
  slides: TimelineSlideId[] | null;
}

export interface RenderProgress {
  phase: 'bundling' | 'preparing' | 'rendering' | 'encoding' | 'still' | 'done' | 'failed' | 'cancelled';
  /** 0–1 across the whole job, not just the frame pass. */
  progress: number;
  renderedFrames: number;
  encodedFrames: number;
  totalFrames: number;
  outputFile: string | null;
  /** The square still written beside the video, or null if it could not be made. */
  stillFile: string | null;
  bytes: number | null;
  error: string | null;
}

/* -------------------------------------------------------------------------- */
/* Naming                                                                      */
/* -------------------------------------------------------------------------- */

/**
 * `out/<player>-<range>-<theme>.mp4`, with every part slugified.
 *
 * Names in this dataset contain umlauts, spaces, brackets and one trailing
 * space; range labels contain arrows. None of that belongs in a filename, and
 * on Windows some of it cannot be in one.
 */
export const outputFileName = (input: RenderInput): string => {
  const parts = [
    slugify(input.stats.playerName),
    slugify(input.stats.rangeLabel),
    slugify(input.theme?.name ?? 'theme'),
  ].filter(Boolean);
  return `${parts.join('-')}.mp4`;
};

/* -------------------------------------------------------------------------- */
/* Bundle                                                                      */
/* -------------------------------------------------------------------------- */

let bundlePromise: Promise<string> | null = null;

/**
 * Build the bundle once and hand the same one to every render.
 *
 * A failed bundle clears the cache rather than poisoning it, so fixing the
 * problem and rendering again does not need a server restart.
 */
export const getBundle = async (onProgress?: (percent: number) => void): Promise<string> => {
  bundlePromise ??= bundle({
    entryPoint: ENTRY,
    webpackOverride: withProjectAliases,
    onProgress: (percent) => onProgress?.(percent),
  }).catch((err) => {
    bundlePromise = null;
    throw err;
  });
  return bundlePromise;
};

/** Drop the cached bundle. The next render rebuilds it. */
export const invalidateBundle = (): void => {
  bundlePromise = null;
};

/* -------------------------------------------------------------------------- */
/* Render                                                                      */
/* -------------------------------------------------------------------------- */

export interface RenderJob {
  id: string;
  progress: RenderProgress;
  cancel: () => void;
  done: Promise<void>;
}

/** The handle `openBrowser` hands back, named without reaching into a deep import. */
type RenderBrowser = Awaited<ReturnType<typeof openBrowser>>;

const emptyProgress = (): RenderProgress => ({
  phase: 'bundling',
  progress: 0,
  renderedFrames: 0,
  encodedFrames: 0,
  totalFrames: 0,
  outputFile: null,
  stillFile: null,
  bytes: null,
  error: null,
});

/**
 * Render one video.
 *
 * `selectComposition` is what resolves `calculateMetadata`, so the duration
 * comes from the same `planTimeline` call the preview uses rather than being
 * computed twice.
 */
export const startRender = (input: RenderInput): RenderJob => {
  const progress = emptyProgress();
  const cancelSignal = makeCancelSignal();
  const id = `${Date.now().toString(36)}`;

  const inputProps = {
    stats: input.stats,
    theme: input.theme,
    track: input.track,
    cut: input.slides,
  };

  /**
   * The browser this job renders in.
   *
   * Opened here rather than left to `renderMedia`, because a cancelled job has
   * to be able to close it. Remotion's own instance is not reachable from the
   * outside, and on the cancel path nothing ever releases it.
   */
  let browser: RenderBrowser | null = null;
  let cancelled = false;

  // Settles the instant cancel is requested. See `cancel` for why `done`
  // cannot simply wait on the render promise.
  let releaseCancelled: () => void = () => undefined;
  const cancelledSettled = new Promise<void>((resolve) => {
    releaseCancelled = resolve;
  });

  /**
   * Stop the render and release the slot at once.
   *
   * `cancelSignal.cancel()` does stop Remotion rendering frames — the counter
   * freezes on the spot — but the `renderMedia` promise then **never settles**:
   * it neither resolves nor rejects, so the job sat in `rendering` forever.
   * That is what held the single-render slot until the server was restarted,
   * and it leaked the headless Chrome along with it.
   *
   * So the phase moves here rather than in the catch, `done` is settled here,
   * and the browser is closed here. Everything after this point checks
   * `cancelled` before touching `progress`, so a late callback from a render
   * that is still unwinding cannot move the job back out of `cancelled`.
   */
  const cancel = () => {
    if (cancelled) return;
    cancelled = true;
    progress.phase = 'cancelled';
    progress.error = null;
    cancelSignal.cancel();

    const closing = browser;
    browser = null;
    void closing?.close({ silent: true }).catch(() => undefined);

    releaseCancelled();
  };

  const work = (async () => {
    try {
      const serveUrl = await getBundle((percent) => {
        if (cancelled) return;
        // Bundling is the first slice of the job, not a separate wait.
        progress.progress = percent * 0.1;
      });
      if (cancelled) return;

      browser = await openBrowser('chrome');
      // Cancel can land while the browser is still opening, and then nothing
      // else holds a reference with which to close it.
      if (cancelled) {
        const opened = browser;
        browser = null;
        await opened?.close({ silent: true }).catch(() => undefined);
        return;
      }

      progress.phase = 'preparing';
      const composition = await selectComposition({
        serveUrl,
        id: 'Wrapped',
        inputProps,
        puppeteerInstance: browser,
      });
      if (cancelled) return;

      progress.totalFrames = composition.durationInFrames;
      progress.phase = 'rendering';

      await mkdir(OUT_DIR, { recursive: true });
      const outputFile = path.join(OUT_DIR, outputFileName(input));

      await renderMedia({
        composition,
        serveUrl,
        codec: RENDER_SETTINGS.codec,
        crf: RENDER_SETTINGS.crf,
        imageFormat: RENDER_SETTINGS.imageFormat,
        pixelFormat: RENDER_SETTINGS.pixelFormat,
        colorSpace: RENDER_SETTINGS.colorSpace,
        outputLocation: outputFile,
        inputProps,
        puppeteerInstance: browser,
        cancelSignal: cancelSignal.cancelSignal,
        onProgress: ({ renderedFrames, encodedFrames, progress: ratio }) => {
          if (cancelled) return;
          progress.renderedFrames = renderedFrames;
          progress.encodedFrames = encodedFrames;
          // The remaining 90% of the bar belongs to the render itself.
          progress.progress = 0.1 + ratio * 0.9;
          progress.phase = encodedFrames > 0 && renderedFrames >= composition.durationInFrames
            ? 'encoding'
            : 'rendering';
        },
      });
      if (cancelled) return;

      progress.outputFile = outputFile;
      progress.bytes = (await stat(outputFile)).size;

      // The square is seconds of work next to a minute of video, so it is
      // always made — but never at the cost of the video. A still that fails
      // leaves the MP4 exactly as it was.
      progress.phase = 'still';
      try {
        const stillFile = outputFile.replace(/\.mp4$/, '.png');
        const square = await selectComposition({
          serveUrl,
          id: 'Square',
          inputProps,
          puppeteerInstance: browser ?? undefined,
        });
        await renderStill({
          composition: square,
          serveUrl,
          output: stillFile,
          inputProps,
          imageFormat: 'png',
          puppeteerInstance: browser ?? undefined,
          cancelSignal: cancelSignal.cancelSignal,
        });
        progress.stillFile = stillFile;
      } catch {
        // Not worth failing the render over, and not worth a message either:
        // the video is what was asked for.
      }

      if (cancelled) return;

      progress.progress = 1;
      progress.phase = 'done';
    } catch (err) {
      // A cancel that does surface as a thrown error is not a failure to
      // report, and the phase is already right.
      if (cancelled) return;
      const message = err instanceof Error ? err.message : String(err);
      if (/cancel/i.test(message)) {
        progress.phase = 'cancelled';
        return;
      }
      progress.phase = 'failed';
      // The real message, not a generic one: a webpack error names the file and
      // line, and replacing that with "render failed" throws away the fix.
      progress.error = message;
    } finally {
      const opened = browser;
      browser = null;
      await opened?.close({ silent: true }).catch(() => undefined);
    }
  })();

  // Whichever comes first. A cancelled render's promise never settles, so
  // anything awaiting this job — the batch queue above all — would wait on
  // `work` alone for the life of the process.
  const done = Promise.race([work, cancelledSettled]);

  return { id, progress, cancel, done };
};

/* -------------------------------------------------------------------------- */
/* Reveal in the file manager                                                  */
/* -------------------------------------------------------------------------- */

/**
 * Open the output folder with the rendered file selected.
 *
 * The path is never passed through a shell — `execFile` takes an argument
 * array, so a filename cannot become a command however it is spelled.
 */
export const revealInFolder = (file: string): Promise<void> =>
  new Promise((resolve) => {
    const target = path.resolve(file);
    // Refuse anything outside out/: this is reachable from an HTTP route.
    if (!target.startsWith(OUT_DIR)) {
      resolve();
      return;
    }

    const [command, args] =
      process.platform === 'win32'
        ? ['explorer.exe', [`/select,${target}`]]
        : process.platform === 'darwin'
          ? ['open', ['-R', target]]
          : ['xdg-open', [path.dirname(target)]];

    // explorer.exe exits non-zero even when it worked, so the result is ignored.
    execFile(command, args, () => resolve());
  });
