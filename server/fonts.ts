/**
 * Font mirror (Node only).
 *
 * Downloads the curated font files from Google's CDN into public/fonts once, so
 * that renders — and the Player preview — read them off local disk. Without
 * this, `@remotion/google-fonts` would fetch from fonts.gstatic.com during
 * every render, which breaks step 5's offline guarantee and makes step 6's
 * "identical in Player and CLI" test a matter of luck.
 */
import { mkdir, readdir, readFile, rename, unlink, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  emptyFontManifest,
  FONT_MANIFEST_FILE,
  FONT_MANIFEST_VERSION,
  WANTED_SUBSETS,
  type FontFace,
  type FontManifest,
} from '../src/shared/fonts';
import { uniqueFontSpecs, type FontSpec } from '../src/theme/fonts';

const here = path.dirname(fileURLToPath(import.meta.url));
export const FONT_DIR = path.resolve(here, '..', 'public', 'fonts');

/**
 * Google serves woff2 only to user agents it believes support it. Without a
 * modern UA it falls back to ttf, which is several times larger.
 */
const UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

export interface FontPrefetchSummary {
  families: number;
  faces: number;
  downloaded: number;
  skipped: number;
  bytes: number;
  errors: Array<{ spec: string; message: string }>;
  manifestPath: string;
}

/** `/* latin *​/ @font-face { ... }` — the subset name always precedes its block. */
const FACE_BLOCK = /\/\*\s*([\w-]+)\s*\*\/\s*@font-face\s*\{([^}]+)\}/g;

const field = (body: string, name: string): string | undefined =>
  new RegExp(`${name}:\\s*([^;]+);`).exec(body)?.[1]?.trim();

const slug = (value: string): string =>
  value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');

export interface ParsedFace {
  face: Omit<FontFace, 'file'>;
  url: string;
  file: string;
}

/**
 * Turn a Google Fonts CSS response into the faces worth keeping.
 * Exported for tests: parsing this CSS is the part most likely to drift.
 */
export const parseFontCss = (css: string, spec: FontSpec): ParsedFace[] => {
  const out: ParsedFace[] = [];
  for (const match of css.matchAll(FACE_BLOCK)) {
    const [, subset, body] = match;
    if (!WANTED_SUBSETS.includes(subset)) continue;

    const url = /url\((https:[^)]+\.woff2)\)/.exec(body)?.[1];
    const family = field(body, 'font-family')?.replace(/['"]/g, '');
    if (!url || !family) continue;

    const weight = field(body, 'font-weight') ?? '400';
    const style = field(body, 'font-style') ?? 'normal';
    const stretch = field(body, 'font-stretch');

    out.push({
      face: {
        family,
        weight,
        style,
        ...(stretch ? { stretch } : {}),
        unicodeRange: field(body, 'unicode-range'),
        subset,
      },
      url,
      file: `${slug(family)}-${slug(weight)}-${style}-${subset}.woff2`,
    });
  }
  return out;
};

export const readFontManifest = async (dir: string): Promise<FontManifest> => {
  try {
    const parsed = JSON.parse(await readFile(path.join(dir, FONT_MANIFEST_FILE), 'utf8')) as FontManifest;
    if (parsed?.version !== FONT_MANIFEST_VERSION || !Array.isArray(parsed.faces)) {
      return emptyFontManifest();
    }
    return parsed;
  } catch {
    return emptyFontManifest();
  }
};

export interface FontPrefetchOptions {
  dir?: string;
  specs?: FontSpec[];
  force?: boolean;
  onProgress?: (done: number, total: number, label: string) => void;
  fetchImpl?: typeof fetch;
}

export const prefetchFonts = async ({
  dir = FONT_DIR,
  specs = uniqueFontSpecs(),
  force = false,
  onProgress,
  fetchImpl = fetch,
}: FontPrefetchOptions = {}): Promise<FontPrefetchSummary> => {
  await mkdir(dir, { recursive: true });

  const onDisk = new Set(await readdir(dir).catch(() => [] as string[]));
  // Sweep partials from an interrupted run, same rule as box art.
  await Promise.all(
    [...onDisk]
      .filter((name) => name.endsWith('.part'))
      .map(async (name) => {
        await unlink(path.join(dir, name)).catch(() => {});
        onDisk.delete(name);
      }),
  );

  const faces: FontFace[] = [];
  const errors: FontPrefetchSummary['errors'] = [];
  let downloaded = 0;
  let skipped = 0;
  let bytes = 0;
  let done = 0;

  for (const spec of specs) {
    try {
      const res = await fetchImpl(
        `https://fonts.googleapis.com/css2?family=${spec.googleSpec}&display=block`,
        { headers: { 'user-agent': UA } },
      );
      if (!res.ok) throw new Error(`HTTP ${res.status} for ${spec.googleSpec}`);
      const parsed = parseFontCss(await res.text(), spec);
      if (parsed.length === 0) throw new Error('no usable faces in the stylesheet');

      for (const { face, url, file } of parsed) {
        if (!force && onDisk.has(file)) {
          skipped += 1;
        } else {
          const fileRes = await fetchImpl(url);
          if (!fileRes.ok) throw new Error(`HTTP ${fileRes.status} for ${file}`);
          const buffer = Buffer.from(await fileRes.arrayBuffer());
          // woff2 files start with "wOF2"; anything else is not a font.
          if (buffer.subarray(0, 4).toString('ascii') !== 'wOF2') {
            throw new Error(`${file} is not a woff2 file`);
          }
          const part = path.join(dir, `${file}.part`);
          await writeFile(part, buffer);
          await rename(part, path.join(dir, file));
          onDisk.add(file);
          downloaded += 1;
          bytes += buffer.length;
        }
        faces.push({ ...face, file });
      }
    } catch (err) {
      errors.push({ spec: spec.googleSpec, message: err instanceof Error ? err.message : String(err) });
    } finally {
      done += 1;
      onProgress?.(done, specs.length, spec.label);
    }
  }

  const manifest: FontManifest = {
    version: FONT_MANIFEST_VERSION,
    generatedAt: new Date().toISOString(),
    faces,
  };
  const manifestPath = path.join(dir, FONT_MANIFEST_FILE);
  await writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, 'utf8');

  return { families: specs.length, faces: faces.length, downloaded, skipped, bytes, errors, manifestPath };
};
