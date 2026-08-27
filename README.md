# Board Game Wrapped

Turns a BG Stats JSON export into personalized Spotify-Wrapped-style videos,
one per player, for any date range. Runs entirely on your machine — no upload,
no account, no cloud.

**Output is mobile format: 1080 × 1920, 9:16, 30 fps.** That frame is fixed in
`src/video/config.ts` and every slide is designed against it. There is
deliberately no landscape composition.

## What is in this scaffold

Steps 1–4 of `boardgame-wrapped-plan.md` are implemented and tested:

| Step | Status |
|---|---|
| 1 Scaffold | Vite + React + Remotion + Express, mobile composition registered |
| 2 Ingest | Validate, normalize, cache to IndexedDB |
| 3 Selection | Player picker, presets and custom date ranges |
| 4 Stats engine | 17 modules, 29 passing tests |
| 5–12 | Not started — see the plan |

## Setup

```bash
npm install
npm run dev        # UI at http://localhost:5173
npm run server     # render service at http://localhost:4000
npm test           # 29 tests
```

Drop your export on the page. It parses in the browser and is cached, so a
reload does not mean re-uploading.

## Checking the numbers before you trust them

```bash
npx tsx scripts/dry-run.ts path/to/BGStatsExport.json Tina 2026
npx tsx scripts/dry-run.ts path/to/BGStatsExport.json Tina 2025-05-01:2025-06-30
```

Prints the full stats JSON without rendering. Verified against the real export:
Tina in 2026 gives 233 plays, 73 nights, 71 distinct games, Faraway 21×,
61 wins in 222 competitive plays.

## The stats engine

`src/stats/` is pure functions — no React, no rendering, fully testable.

Every module returns `null` rather than a placeholder when its data is missing,
and `buildWrappedStats` only emits slides for non-null modules. A player with no
scores never gets an empty score slide.

Ties break deterministically: higher count, then earlier first appearance, then
alphabetical. The same input always produces the same video.

Guard rails already enforced: nemesis needs 3+ head-to-head plays, win-rate
games need 3+ plays, the night-owl slide needs 10+ plays, win rate excludes
cooperative games unless every play in range is cooperative, and a streak of one
is not a streak.

## Known limits of BG Stats data

- `durationMin` is 0 on every play — no "hours played" stat is possible
- `rank` is unused; only the `winner` boolean is reliable
- Scores exist on roughly a third of entries
- Play tags and play ratings are unused
- Some plays have no `locationRefId` at all, not a zero — handled in ingest

## Adding a stat

1. Write the function in `src/stats/modules/`, returning `null` when it cannot
   be computed
2. Add its result type to the `Stat` union in `src/stats/types.ts`
3. Register it in `MODULES` in `src/stats/index.ts` at the right slide position
4. Add a case to `describe()` in `StatsInspector.tsx`
5. Write the test before you trust the number

## Next

Step 5 (box art prefetch) is the next one to build. It unblocks every visual
slide, and once the images are on disk the whole pipeline runs offline.
