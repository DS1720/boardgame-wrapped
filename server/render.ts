/**
 * The render service (Node only).
 *
 * Bundles the composition once, then renders one video at a time into `out/`.
 * The bundle is the expensive part — a few seconds of webpack — so it is built
 * on the first render and reused for every one after.
 */
import { execFile } from 'node:child_process';
import { existsSync, mkdirSync } from 'node:fs';
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
import { PUBLIC_DIR } from './boxart';
import { getOutDir } from './settings';
import { slugify } from '../src/shared/format';
import type { Track } from '../src/shared/audio';
import type { WrappedStats } from '../src/stats/types';
import type { Theme } from '../src/theme/types';
import type { SlideBarOverrides, TimelineSlideId } from '../src/video/timeline';

const here = path.dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = path.resolve(here, '..');
/**
 * Where finished videos land, asked fresh every time.
 *
 * Not a constant: the folder is settable from the app, so a value captured at
 * import time would keep sending renders to the old place until the service was
 * restarted. `out/` in a checkout, the user's Videos folder in the desktop
 * build, or wherever they have chosen.
 *
 * Only the *output* moves. Box art, audio and fonts stay under `public/`,
 * because `staticFile()` resolves against the bundle's public directory and
 * moving them would mean every cover was missing from the render.
 */
export { getOutDir } from './settings';
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
  /**
   * Per-slide lengths chosen in the UI.
   *
   * Sent with the cut rather than folded into it, because the two answer
   * different questions — which slides, and for how long — and a render that
   * took one from the request and the other from the defaults would come out a
   * different length from the preview it was started from.
   */
  bars?: SlideBarOverrides | null;
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
    // `staticFile()` resolves against whatever the bundle was given here, so it
    // has to agree with the directory the service serves and the prefetch
    // writes to. Disagree and every cover is missing from the render while
    // being present in the preview.
    publicDir: PUBLIC_DIR,
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
  /**
   * Stop the render, and resolve once its browser is actually gone.
   *
   * The promise matters for shutdown and nowhere else: the two HTTP callers
   * ignore it, because a person pressing Cancel wants the slot free now and
   * does not care when Chrome finishes exiting. A process on its way out does
   * care — it is the last moment anything can close that browser.
   */
  cancel: () => Promise<void>;
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
    bars: input.bars ?? null,
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
  /** Set by `cancel`, so a second caller can await the same close. */
  let closing: Promise<void> | null = null;

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
  const cancel = (): Promise<void> => {
    if (cancelled) return closing ?? Promise.resolve();
    cancelled = true;
    progress.phase = 'cancelled';
    progress.error = null;
    cancelSignal.cancel();

    const open = browser;
    browser = null;
    closing = open ? open.close({ silent: true }).catch(() => undefined) : Promise.resolve();

    releaseCancelled();
    return closing;
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

      // Read here, not at import: the folder is settable while the service
      // is running, and a captured value would keep writing to the old one.
      const outDir = getOutDir();
      await mkdir(outDir, { recursive: true });
      const outputFile = path.join(outDir, outputFileName(input));

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

/** A reveal that could not happen, with the reason the UI should show. */
export class RevealError extends Error {}

/**
 * True when `target` is inside `dir`, or is `dir` itself.
 *
 * `path.relative` rather than `startsWith`, for two reasons: `startsWith` also
 * matches a sibling folder whose name merely begins the same way — `out-old`
 * against `out` — and it compares case-sensitively, which on Windows makes
 * `C:\Users` and `c:\users` two different places.
 *
 * Pure and exported so the guard can be tested without touching the disk.
 */
export const isInside = (dir: string, target: string): boolean => {
  const rel = path.relative(path.resolve(dir), path.resolve(target));
  return rel === '' || (!rel.startsWith('..') && !path.isAbsolute(rel));
};

/**
 * Open the output folder with the rendered file selected.
 *
 * The path is never passed through a shell — `execFile` takes an argument
 * array, so a filename cannot become a command however it is spelled.
 *
 * Rejects with a `RevealError` rather than resolving quietly when there is
 * nothing to show: a button that does nothing and says nothing is the hardest
 * kind of failure to report.
 */
/**
 * Open the output folder itself, with nothing selected.
 *
 * What the button does before anything has been rendered. "Where do my videos
 * go" is a question people have *before* they have any, and a button that only
 * appears once one exists cannot answer it.
 */
export const openOutputFolder = (): Promise<void> => {
  const dir = getOutDir();
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  return new Promise((resolve) => {
    const [command, args]: [string, string[]] =
      process.platform === 'win32'
        ? ['explorer.exe', [`"${dir}"`]]
        : process.platform === 'darwin'
          ? ['open', [dir]]
          : ['xdg-open', [dir]];
    execFile(
      command,
      args,
      process.platform === 'win32' ? { windowsVerbatimArguments: true } : {},
      () => resolve(),
    );
  });
};

export const revealInFolder = (file: string): Promise<void> => {
  const target = path.resolve(file);
  const outDir = getOutDir();
  // Refuse anything outside the output folder: this is reachable from an HTTP
  // route, and the folder is now user-chosen rather than fixed. It also catches
  // the honest case — a file rendered before the folder was changed.
  if (!isInside(outDir, target)) {
    return Promise.reject(
      new RevealError(`${target} is not in the output folder (${outDir}), so it cannot be shown.`),
    );
  }

  // A file that has been moved or deleted since it was rendered still has a
  // folder worth opening. Only when that has gone too is there nothing to do.
  const found = existsSync(target);
  const dir = path.dirname(target);
  if (!found && !existsSync(dir)) {
    return Promise.reject(new RevealError(`${target} is no longer there.`));
  }

  return new Promise((resolve) => {
    if (process.platform === 'win32') {
      /*
        explorer.exe wants `/select,"C:\path with spaces\file.mp4"` — the quotes
        around the path only, never around the whole argument.

        Node quotes any argument containing a space, which turns the array form
        into `"/select,C:\path with spaces\file.mp4"`. Explorer does not parse
        that: it opens the default folder, or nothing at all, without an error.
        That is exactly what "Show in folder does nothing" was. And both of this
        app's output folders have a space in their path — `Board Game Wrapped`
        in the desktop build, `Boardgame wrapped` in a checkout — so this was
        the normal case, not an edge one.

        `windowsVerbatimArguments` hands the command line over unquoted, so the
        quotes written here are the only ones there are. A Windows path cannot
        contain a double quote, so there is nothing to escape.
      */
      const arg = found ? `/select,"${target}"` : `"${dir}"`;
      // explorer.exe exits non-zero even when it worked, so the result is ignored.
      execFile('explorer.exe', [arg], { windowsVerbatimArguments: true }, () => resolve());
      return;
    }

    const [command, args]: [string, string[]] =
      process.platform === 'darwin'
        ? ['open', found ? ['-R', target] : [dir]]
        : ['xdg-open', [dir]];

    execFile(command, args, () => resolve());
  });
};
