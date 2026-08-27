# CLAUDE.md

Guidance for Claude Code working in this repository.

## What this is

A **local-only** Spotify-Wrapped-style video generator for
[BG Stats](https://www.bgstatsapp.com/) JSON exports. Drop an export in, pick a
player and a date range, get a personalized vertical video. Nothing is uploaded;
no account, no cloud, no network calls beyond box-art prefetch (step 5) and
localhost.

`boardgame-wrapped-plan.md` is the spec. It defines 12 steps; steps 1–4 are
built and tested, 5–12 are not started. Treat it as the source of truth for
scope and for what each remaining step must do.

## Setup and commands

`node_modules` is **not installed** in a fresh clone — run `npm install` first
or every command below except the `npx tsx` one will fail.

```bash
npm install
npm run dev          # UI on http://localhost:5173
npm run server       # render service on http://localhost:4000 (stub until step 10)
npm test             # vitest, 29 tests
npm run typecheck    # tsc --noEmit
npm run video:studio # Remotion Studio
npm run video:render # renders out/test.mp4
```

### Dry-run: check stats without rendering

```bash
npx tsx scripts/dry-run.ts <path-to-export.json> <playerName> [year|from:to|all]
```

The first argument is a **filesystem path, not a name**. There is no
`export.json` in the repo and there should not be — exports contain personal
data and are gitignored by intent. Dario's export currently lives at
`data/BGStatsExport-260826181645.json` (gitignored, not committed):

```bash
npx tsx scripts/dry-run.ts "data/BGStatsExport-260826181645.json" Tina 2026
npx tsx scripts/dry-run.ts "data/BGStatsExport-260826181645.json" Tina 2025-05-01:2025-06-30
```

Known-good regression baseline — **Tina / 2026** must produce: 233 plays,
73 nights, 71 distinct games, top game Faraway 21×, 61 wins in 222 competitive
plays. If a change moves these numbers, the change is wrong until proven
otherwise.

## Architecture

Four layers, and the boundaries between them are the point:

| Path | Role | Rule |
|---|---|---|
| [src/ingest/](src/ingest/) | Parse + normalize the raw export, select player/range | Raw shapes stay here; nothing downstream sees `RawPlay` |
| [src/stats/](src/stats/) | Pure stat modules → `WrappedStats` JSON | No React, no rendering, no I/O — fully unit-testable |
| [src/video/](src/video/) | Remotion composition, consumes `WrappedStats` | Reads stats; never computes them |
| [src/app/](src/app/) | Vite React UI: drop zone, pickers, inspector | Orchestrates the other three |

[server/index.ts](server/index.ts) is a small Express render service (localhost
only). [scripts/dry-run.ts](scripts/dry-run.ts) bypasses the UI entirely and
runs ingest → stats straight to stdout.

`@/*` is aliased to `src/*` in tsconfig, vite and vitest. Use it in `src/`;
`scripts/` uses relative imports because it runs through bare `tsx`.

## Hard constraints — do not relitigate these

- **Mobile only: 1080 × 1920, 9:16, 30 fps.** Fixed in
  [src/video/config.ts](src/video/config.ts). Do not add a landscape or square
  composition; a second aspect ratio doubles the layout work in every slide.
- **Keep content inside `VIDEO.safeMargin` (120px).** Story UI covers the outer
  ~10% of the frame on most phones.
- **A stat module returns `null` when it cannot be computed** — never a
  placeholder, never a zero. `buildWrappedStats` emits slides only for non-null
  results, so a player with no scores simply has no score slide.
- **Determinism.** The same input must always produce the same video. Ties break
  by: higher count → earlier first appearance → alphabetical. `rank()` in
  [src/stats/context.ts](src/stats/context.ts) implements this; use it rather
  than sorting ad hoc.
- **Guard rails already enforced** (keep them): nemesis needs 3+ head-to-head
  plays, win-rate-per-game needs 3+ plays, night owl needs 10+ plays, win rate
  excludes cooperative games unless every play in range is cooperative, and a
  streak of one is not a streak.
- **Local-first.** Nothing leaves the machine. Box art (step 5) is downloaded
  once to `public/boxart/` so renders work with the network unplugged.

## What the BG Stats data can and cannot tell you

Verified against the real export — these are not guesses:

- `durationMin` is **0 on every play**. An "hours played" stat is impossible.
- `rank` is unreliable; only the `winner` boolean can be trusted.
- Scores exist on roughly a third of entries.
- Play tags and play ratings are unused.
- Some plays have **no `locationRefId` at all** (absent, not zero) — normalized
  to `null` in ingest.
- `playDate` is `"YYYY-MM-DD HH:mm:ss"` **local time**. Parse it with
  `parseLocalDate` in [src/shared/format.ts](src/shared/format.ts), never
  `new Date(string)` — the latter drifts by timezone and silently corrupts
  "game nights" and the night-owl stat.

## Adding a stat

1. Write the function in [src/stats/modules/](src/stats/modules/) —
   `core.ts` for default slides, `optional.ts` for opt-in ones. Return `null`
   when it cannot be computed.
2. Add its result type to the `Stat` union and its id to `SlideId` in
   [src/stats/types.ts](src/stats/types.ts).
3. Register it in `MODULES` in [src/stats/index.ts](src/stats/index.ts) **at the
   right slide position** — that array is the slide order, not just a registry.
4. Add a case to `describe()` in
   [StatsInspector.tsx](src/app/components/StatsInspector.tsx).
5. Write the test first, in [src/stats/__tests__/](src/stats/__tests__/), using
   the fixtures in `fixtures.ts`. Do not trust a number you have not tested.

## Status and next step

Steps 1–4 done (17 stat modules, 29 passing tests). **Step 5 — box art
prefetch — is next**; it unblocks every visual slide and makes the pipeline
fully offline. Then 6 themes → 7 slides/motion → 8 audio → 9 preview UI →
10 render → 11 batch → 12 polish.

[src/video/Wrapped.tsx](src/video/Wrapped.tsx) is deliberately a placeholder
composition — it exists so the render pipeline could be verified end to end
before design work. Steps 6–8 replace it. The `/render` route in
[server/index.ts](server/index.ts) is likewise a stub returning `pending` until
step 10 wires up `bundle()` + `renderMedia()`.

## Repo gotchas

- **`boardgame-wrapped/boardgame-wrapped/` is a duplicate** of the entire
  scaffold, byte-for-byte, from a scaffolding accident. The real project is the
  outer directory. Never edit the nested copy; it should be deleted.
- This directory is **not a git repository** yet, despite having a `.gitignore`.
  There is no history to fall back on — be careful with destructive edits.
- `out/`, `public/boxart/*` and `public/audio/*` are gitignored (generated).
