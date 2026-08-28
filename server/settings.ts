/**
 * Settings that outlive a session (Node only).
 *
 * There is exactly one so far — where finished videos go — and it is here
 * rather than in an env var because the user sets it from the app, not from a
 * shell. The env vars stay: they are what the desktop shell uses to say where
 * the *defaults* are, and a value chosen in the UI overrides them.
 *
 * Written next to the app's other user data, never inside the install
 * directory: an update is entitled to replace the program's own files.
 */
import { existsSync, mkdirSync, readFileSync, unlinkSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = path.resolve(here, '..');

/** Where settings.json lives. The desktop build points this at AppData. */
const CONFIG_DIR = process.env.BGW_CONFIG_DIR
  ? path.resolve(process.env.BGW_CONFIG_DIR)
  : PROJECT_ROOT;

const FILE = path.join(CONFIG_DIR, 'settings.json');

/** Where videos go when nobody has chosen anything. */
export const defaultOutDir = (): string =>
  process.env.BGW_OUT_DIR
    ? path.resolve(process.env.BGW_OUT_DIR)
    : path.resolve(PROJECT_ROOT, 'out');

interface Settings {
  /** Absolute. Null means "use the default", which is not the same as a stale copy of it. */
  outDir: string | null;
}

let cache: Settings | null = null;

const read = (): Settings => {
  if (cache) return cache;
  try {
    const raw = JSON.parse(readFileSync(FILE, 'utf8')) as Partial<Settings>;
    cache = { outDir: typeof raw.outDir === 'string' && raw.outDir ? raw.outDir : null };
  } catch {
    // Missing or corrupt: the defaults are always a valid answer, and losing a
    // folder preference is not worth failing to start over.
    cache = { outDir: null };
  }
  return cache;
};

const write = (next: Settings): void => {
  cache = next;
  mkdirSync(CONFIG_DIR, { recursive: true });
  writeFileSync(FILE, JSON.stringify(next, null, 2));
};

/** Where videos go right now. */
export const getOutDir = (): string => read().outDir ?? defaultOutDir();

/** True when the user has chosen a folder rather than accepting the default. */
export const isCustomOutDir = (): boolean => read().outDir !== null;

export class SettingsError extends Error {}

/**
 * Choose a folder for finished videos, or pass null to go back to the default.
 *
 * The folder is created if it does not exist and then written to, because a
 * path that looks fine and fails at the end of a two-minute render is the worst
 * possible time to find out it was not writable.
 */
export const setOutDir = (dir: string | null): string => {
  if (dir === null || dir.trim() === '') {
    write({ outDir: null });
    return getOutDir();
  }

  const target = path.resolve(dir.trim());
  if (!path.isAbsolute(target)) {
    throw new SettingsError('Give a full path, for example C:\\Users\\you\\Videos.');
  }

  try {
    mkdirSync(target, { recursive: true });
    // Prove it, rather than trusting that a directory that exists can be
    // written to — a network share or a protected folder can be neither.
    const probe = path.join(target, '.bgw-write-test');
    writeFileSync(probe, '');
    if (existsSync(probe)) unlinkSync(probe);
  } catch (err) {
    throw new SettingsError(
      `Cannot write to that folder: ${err instanceof Error ? err.message : String(err)}`,
    );
  }

  write({ outDir: target });
  return target;
};
