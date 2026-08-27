# CLAUDE.md

Guidance for Claude Code working in this repository.

## What this is

A **local-only** Spotify-Wrapped-style video generator for
[BG Stats](https://www.bgstatsapp.com/) JSON exports. Drop an export in, pick a
player and a date range, get a personalized vertical video. Nothing is uploaded;
no account, no cloud, no network calls beyond box-art prefetch (step 5) and
localhost.

`boardgame-wrapped-plan.md` is the spec. It defines 12 steps; steps 1–12 are
built and tested. All twelve are done. Treat it as the source of truth for
scope and for what each remaining step must do.

## Setup and commands

`node_modules` is **not installed** in a fresh clone — run `npm install` first
or every command below except the `npx tsx` one will fail.

```bash
npm install
npm run dev          # UI on http://localhost:5173
npm run server       # render service on http://localhost:4000 (stub until step 10)
npm test             # vitest, 338 tests
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

### Box art prefetch

```bash
npx tsx scripts/prefetch-boxart.ts data/BGStatsExport-260826181645.json [--force]
```

Downloads every cover into `public/boxart/` and writes `manifest.json`. Safe to
re-run and safe to interrupt. Baseline on the real export: 229 games, 228 covers
(110 MB) in ~46s, 1 fallback; a second run downloads nothing in under a second.

### Font mirror

```bash
npm run prefetch:fonts        # or: npx tsx scripts/prefetch-fonts.ts [--force]
```

Mirrors the twelve curated families into `public/fonts/` — 32 faces, 1.3 MB,
latin and latin-ext only. Run once. **Do not replace this with
`@remotion/google-fonts`:** it fetches from fonts.gstatic.com at render time,
which breaks the offline guarantee and makes "identical in Player and CLI" a
matter of network luck.

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
| [src/theme/](src/theme/) | Tokens, starters, generators, contrast math | Pure except `ThemeContext.tsx`; no slide imports a starter directly |
| [src/video/timeline.ts](src/video/timeline.ts) | What appears, in what order, for how long | Pure and React-free, so gaps and duration are testable |
| [src/video/slides/](src/video/slides/) | All 19 slides and their layout primitives | Content only ever inside `<SafeArea>` |
| [src/app/components/Preview.tsx](src/app/components/Preview.tsx) | The one `<Player>` | Same props object the renderer will get; never a second code path |
| [src/video/motion/](src/video/motion/) | `Reveal`, `CountUp`, `Stagger` | All three read `theme.motion`; nothing animates outside them |
| [src/audio/analyze.ts](src/audio/analyze.ts) | Tempo and downbeat detection | Pure DSP on PCM; tested against synthetic click tracks |
| [src/shared/audio.ts](src/shared/audio.ts) | Beat grid, crop snapping, loop maths | Pure; the UI and the renderer share it |
| [server/audio.ts](server/audio.ts) | Upload, decode, store | Node-only; decoding needs ffmpeg |
| [server/render.ts](server/render.ts) | `bundle()` cache + `renderMedia()` | One render at a time; the bundle is built once and reused |
| [server/batch.ts](server/batch.ts) | Sequential queue around `startRender` | Skip-on-error; payloads released as it goes |
| [src/video/signature/](src/video/signature/) | Die-cut, tally marks, lamp pool | One per theme, on every slide |
| [server/boxart.ts](server/boxart.ts) | Box art download + color extraction | Node-only; the browser cannot write to `public/` |
| [server/fonts.ts](server/fonts.ts) | Font mirror | Node-only; same reasoning |
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
- **Local-first.** Nothing leaves the machine. Box art is downloaded once to
  `public/boxart/`; at render time every asset resolves through Remotion's
  `staticFile()`, so a render makes no external request. The manifest's `source`
  URLs are data, never fetched during a render.
- **Magic bytes decide an image's format, never the `content-type` header.** The
  image host serves mislabelled files, and serves HTML error pages under
  `image/png`. Anything whose bytes are not an image is rejected rather than
  written to disk.
- **Downloads are atomic.** Write `<id>.<ext>.part`, then rename. A killed run
  must never leave a truncated file that a later run counts as a cache hit.
- **No slide component contains a literal color or font.** Step 6's test case 2.
  Everything comes from theme tokens; `src/theme/starters.ts` is the only file
  where a hex value is correct. Check with:
  `grep -rE "#[0-9a-fA-F]{3,8}" src/video/*.tsx`
- **Generated themes are guaranteed legible, never assumed to be.** Every
  derived color goes through `ensureContrast`. The plan's raw formulas fail its
  own floor for 425 of 720 hue/mode combinations — see below.

## What the BG Stats data can and cannot tell you

Verified against the real export — these are not guesses:

- `durationMin` is **0 on every play**, so how long a play actually took is not
  in the data. A *measured* hours-played stat is impossible.
- But games carry BGG's **`minPlayTime` / `maxPlayTime`**, and 225 of 229 games
  have them — **98.9% of plays**. That is what `timePlayed` estimates from.
  `estimatedPlayMinutes` in [src/ingest/parse.ts](src/ingest/parse.ts) takes the
  midpoint of the range and returns `null` when a game has neither bound.
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

## Adding box art to a slide

The manifest is loaded once per render by `useBoxArtManifest()` in
[src/video/useBoxArt.ts](src/video/useBoxArt.ts), which holds the first frame
with `delayRender` until it lands. Look an entry up with
`boxArtFor(manifest, gameId)` and hand it to `<BoxArt>` or `<BoxArtHero>` from
[src/video/BoxArt.tsx](src/video/BoxArt.tsx) — they render the fallback tile on
their own when a game has no art, so slides never branch on it.

Colors are passed in as props rather than read from a theme, because step 6 is
what introduces themes. When it lands, slides pass theme tokens down and
`BoxArt.tsx` does not change.

## Themes

Six color tokens, three font roles, a four-step type scale, a motion profile, a
texture and a signature — the shape is in [src/theme/types.ts](src/theme/types.ts).
Slides read them through `useTheme()`, `useTypeScale()` and `useFont(role)`.

Four ways a theme is arrived at:

- **Starter** — the three hand-specified palettes in
  [src/theme/starters.ts](src/theme/starters.ts).
- **Custom** — any token edited in the picker; persisted to localStorage.
- **Random** — one hue outside the muddy 45°–65° band, whole palette derived.
- **Box art** — accent taken from the slide's own cover, rest derived to match.

### Contrast is enforced, and the plan's formulas do not satisfy it

The plan specifies `accent = hsl(h, 72%, 58%)` and requires accent-on-ground
≥ 4.5:1. Swept across every hue in both light and dark modes, that formula
**fails 425 of 720 combinations, worst case 1.26:1.** `ensureContrast` in
[src/theme/color.ts](src/theme/color.ts) walks a color's lightness the minimum
distance needed, keeping hue and saturation. After it, all 720 pass.

The three starters are hand-picked and held to a different, honest bar:

| Theme | ink on bg | accent on bg | accentAlt on bg |
|---|---|---|---|
| Punchboard | 7.76:1 | 3.85:1 | 2.22:1 |
| Scorepad | 9.95:1 | 4.51:1 | 2.77:1 |
| Table Light | 15.81:1 | 11.73:1 | 5.95:1 |

Their accents are only ever set at display sizes, where WCAG's large-text
threshold of 3:1 applies — so `CONTRAST.accentOnBgLarge` is the bar they are
tested against. **`accentAlt` in the starters is decorative only**: at 2.22:1
and 2.77:1 it is not legible as text at any size. Use it for rules, marks and
fills; if a slide needs to set type in it, pass it through `ensureContrast`
first.

## The video

`planTimeline(stats)` in [src/video/timeline.ts](src/video/timeline.ts) decides
what appears; `SLIDE_COMPONENTS` in [src/video/slides/](src/video/slides/index.tsx)
decides what draws it. **A stat id absent from `DEFAULT_CUT` gets no slide** —
the engine emits all 17 modules, the default video is ten. Adding one to the cut
means adding its id there and writing its component; nothing else.

Slide lengths are declared in **bars, not frames** (`SLIDE_BARS`), because step 8
puts a track underneath. A slide lasting a whole number of bars can land on the
beat; one lasting 87 frames never can. `Root.tsx` computes the composition's
duration with `calculateMetadata`, so a player missing a stat gets a shorter
video rather than a gap.

Three rules worth not breaking:

- **One transition, reused everywhere.** `SlideShell` is it. The ground, texture
  and signature live in `Wrapped.tsx` above the `<Series>` and never move
  between slides — only the content changes. A per-slide effect is, in the
  plan's words, the clearest tell of an assembled video.
- **Not every slide is eyebrow/number/caption.** `StatBlock` is for content that
  genuinely is one number. The top five is a list, the outro is a grid.
- **Long names shrink, they do not wrap freely.** `fitText` handles the real
  worst cases: a 24-character player name and a 56-character game title, both
  longer than the plan's `Sarah Schelmbauer` example.

## Music

Any audio file can be dropped in through the UI. The server stores it in
`public/audio/`, decodes it, detects tempo and downbeat, and records everything
in `manifest.json`.

**The track's tempo drives the video**, not the other way round: `planTimeline`
takes the bpm from the selected track, and slide lengths are whole bars, so
every cut lands on a downbeat. On a real 124 BPM file the worst slide cut
measured **30 ms — under one frame — off the beat**.

Three pieces of arithmetic do the work, all in
[src/shared/audio.ts](src/shared/audio.ts):

- `snapToDownbeat` — the crop handles snap to the track's own downbeats, so a
  crop dragged by hand is always one the video can be cut to.
- `resolvePlayback` — trims the crop to a **whole number of bars**. This is what
  makes looping work: a 3.7-bar segment would put the downbeat somewhere new on
  every repeat.
- `trackVolume` — one fade across the whole video. Repeats are explicit
  `<Sequence>`s rather than a `<Loop>` because Remotion resets frame numbering
  inside a loop, which would restart the fade on every pass.

### Detection, and its limits

The detector is an onset envelope, autocorrelation for the period, then a fine
search over fractional periods for phase. It assumes **4/4 and a steady tempo**
and does not follow a tempo that changes.

Accuracy on test signals is within ~0.3 BPM, and `confidence` reports when there
is no clear pulse — the UI shows a warning under 0.3 and the tempo can always be
typed in by hand, which re-times the whole video.

**Decoding needs ffmpeg.** It reuses the binary Remotion bundles rather than
adding a dependency (`findFfmpeg`). That build is lean: it has only the `wav`
muxer and only the `pcm_s16le` encoder, so `-f f32le` to stdout fails with
"format not known". `decodePcm` therefore writes a temporary 16-bit WAV and
parses it — and the parser walks the RIFF chunk list rather than assuming audio
starts at byte 44, because ffmpeg writes a `LIST` chunk first.

## The control surface

Two columns: controls left, one `<Player>` right. **There is exactly one
`<Player>` in the app** — the theme picker used to have its own, which rendered
the same frames twice for no gain. Anything that needs a preview reads the one
in [Preview.tsx](src/app/components/Preview.tsx).

The preview gets the same `inputProps` object step 10 will hand the renderer, so
there is no second code path between what you see and what you get. Its
`inputProps` and `timeline` are memoised: a fresh object identity on every
render restarts the Player and throws away the scrub position.

### Estimated time played

`timePlayed` is the one stat that is inferred rather than measured, so every
surface says so: the slide's eyebrow reads "Roughly this long at the table" and
its caption names where the number came from.

Two rules keep it honest:

- **Plays whose game has no stated length are counted, not guessed at.** The
  stat carries `playsMissing` alongside `playsCounted`.
- **Below 60% coverage the module returns `null`** and the slide does not
  appear. An estimate built from a third of someone's plays is an estimate of a
  third of their year presented as the whole.

It also reports the game the most *time* went into, which is usually not the
most-played one — for Tina in 2026 it is Terraforming Mars (8 h over 4 plays),
not Faraway (21 plays). That contrast is the point of the slide.

The estimate deliberately does **not** scale with player count. Plenty of games
do not get longer with more people, and a scaling rule would make the figure
look more precise than it is.

### Two stats rank by rate, not by count

- **Nemesis** is whoever beats you in the highest *share* of your head-to-head
  games, needing at least five of them. Ranked by raw losses it was always
  whoever you play most — a fact about your calendar, not about who beats you.
- **Games learned** are ordered by how often each new game was played
  afterwards. Alphabetical order meant the slide showed six games beginning
  with "A" out of sixty-two: a sample of the alphabet rather than of the year.

### `nightOwl` measures 22:00, and says so

`peakHour` is the **most common** starting hour, not the latest. The slide used
to be labelled "You play latest at", and its caption claimed a 20:00 threshold
while `lateShare` has always counted 22:00–04:00. Both are corrected. Every
player in a group that plays together will share a peak hour; that is the data
being right, not a bug.

### Slides are selectable **and orderable**

All 20 stat modules have slide components. The UI holds an **ordered
`SlideId[]`** — the arrangement, not just the selection — and `buildCut` turns
it into a cut.

- **The order given is the order played.** `moveSlide` shifts one slide up or
  down; `insertSlide` folds a newly enabled slide in where the catalogue would
  put it, without resorting an arrangement someone made by hand.
- **The bookends are always in, and always at the ends.** A video with no intro
  is not a shorter video, it is a broken one; an outro in the middle is not an
  outro. `buildCut` strips them out of the selection and re-adds them.
- **Unknown ids are dropped.** The list comes back from localStorage and can
  name slides a later version renamed or removed.

`ALL_SLIDES` is derived from `MODULES` rather than listed again, so the order a
stat appears in the video is the order step 4 chose for it. A test asserts
`DEFAULT_SLIDE_IDS` equals the engine's `CORE_SLIDES`, so the "optional" tags in
the UI cannot drift from what is actually on by default.

### Layout

`minmax(0, 1fr) 380px`, collapsing to one column under 1100px. At 1280px the
content box is 1232px, so the columns are 828 + 24 + 380 with no horizontal
scroll — verified at 1024, 1100, 1280 and 1366.

## Rendering

`POST /render` takes `{ stats, theme, track, slides }` — the same object the
preview is running — and writes `out/<player>-<range>-<theme>.mp4`. The UI polls
`/render/progress`; `/render/cancel` stops one and `/render/reveal` opens the
folder.

**The webpack `@` alias now lives in one file.** Remotion's CLI reads
`remotion.config.ts`; `bundle()` does not read it at all, so the alias is in
[remotion.webpack.ts](remotion.webpack.ts) and both import it. A version that
fixed only one would fail exactly where it is hardest to spot: a render that
works from the command line and not from the app.

Settings are pinned in `RENDER_SETTINGS` and mirrored in `remotion.config.ts`,
with a test asserting they agree. **`pixelFormat` is `yuv420p`** — rendering from
JPEG frames otherwise yields `yuvj420p`, the deprecated full-range variant,
which plays but can shift colours depending on how a player reads the range tag.

Measured on the real export: 1630 frames in **56 s**, 9.5 MB for 54 seconds of
video, H.264 High at CRF 18 with the `moov` atom at byte 36 (so it starts
playing before it has fully downloaded).

**`colorSpace: 'bt709'` is doing more than it looks.** Left at the default, a
1080x1920 render came out tagged `bt470bg` — SD PAL — at full JPEG range, which
ffprobe reports as `yuvj420p`. A player honouring those tags converts the colours
wrongly. Setting the colour space fixes the whole chain at once: true `yuv420p`,
limited range, HD primaries. `pixelFormat` alone did not.

**Errors are surfaced verbatim.** A missing audio file reports the 404 and the
path; replacing that with "render failed" throws away the fix.

Two things are deterministic and one is not: the **duration and frame count**
are identical across runs, the **encoded bytes are not** — x264 is threaded and
not bit-exact. The plan's test case asks for the first, which holds.

## Batch rendering

`POST /batch` takes `{ items, minPlays }` and renders them one after another.
Stats and themes are computed **in the browser** and posted whole — both are
pure functions it already has, and sending the finished payload keeps the
service from needing its own copy of the ingest and stats layers.

- **A failure never aborts the queue.** Fifty videos is half an hour of work;
  stopping the lot because the fourth had no box art is the wrong trade every
  time. The item is marked, the reason is kept against the player's name, and
  the run continues.
- **Payloads are released as they go.** `requested[index]` is nulled once an
  item finishes — fifty players' worth of stats held to the end of a run is the
  one place this queue could grow without bound.
- **The minimum-plays skip happens before rendering**, and skipped players are
  reported with their actual play count rather than silently dropped.

### Seeded themes

`themeForPlayer(playerId)` in [src/theme/generate.ts](src/theme/generate.ts)
gives each player a fixed random theme. Two details make it work:

- The seed is **hashed, not used directly**. A plain LCG seeded with 1, 2, 3
  gives three near-identical first draws, and the whole group comes out one
  colour.
- The theme's `id` and `name` are **pinned to the player**. `randomTheme` puts a
  random tail in its id, which would make the theme part of a filename differ
  between runs of the same batch.

Measured on the real export: 5 players, 4 rendered and 1 skipped, 27.7 MB in
3m49s, each with its own theme.

## Polish

- **Textures** sit at 3–4.5% of the theme's ink, per theme.
- **The vignette** ([src/video/Texture.tsx](src/video/Texture.tsx)) draws only
  when `isDark(bg)` — decided by the colour, not the theme id, so a random dark
  theme gets one too. Its strength was set by the plan's mirror test: at 0.28 it
  was invisible when removed, which by that rule means it should not have been
  there. 0.42 is where it does something.
- **The superlative** ([src/stats/superlative.ts](src/stats/superlative.ts)) is
  one line on the outro. Thresholds are measured from the real export at roughly
  the 90th percentile across the 50 players with five or more plays, and claims
  based on a *proportion* need 20 plays behind them — without that guard
  "half the year was one game" fired for 44 of 93 players, because three of six
  plays clears it. 75% of players with 50+ plays earn one; most casual players
  get none, which is the point.
- **The square** ([src/video/Square.tsx](src/video/Square.tsx)) is a `Still`
  composition, rendered beside every MP4 as `<same-name>.png`. A failure there
  never fails the video.
- **`--dry-run`** was already `scripts/dry-run.ts`, from step 4.

### The mirror test found a bug, not an effect

Removing the vignette and re-rendering produced a square with **two of six
covers blank**. That was not the vignette: `BoxArt` used a plain `<img>`, so a
still could capture before the covers decoded, and a still has no later frame to
correct itself on. It now uses Remotion's `<Img>`, which holds the render until
the file has loaded. Three consecutive renders are byte-identical.

That change has a cost worth knowing: `<Img>` calls `useCurrentFrame()`, so
`BoxArt`'s image path can no longer be rendered by `renderToStaticMarkup` in a
unit test. The test covers the path decision and the crop tokens instead, and
the crop itself is verified from rendered frames.

## Session persistence

[src/app/state/useSession.ts](src/app/state/useSession.ts) stores the player,
range, slide arrangement, track id and box-art mode under `bgw:session`. The
theme has its own older store; these two together are what makes a reload resume
where you left off.

Two details worth keeping:

- **Only the track's id is stored**, not the track. A track carries 480 waveform
  peaks and would not survive a localStorage quota. The AudioPicker re-selects
  it once the manifest arrives.
- **Writes are gated on `restored`.** Without it the first render saves the
  defaults over whatever was stored before the load finished.

## Status and next step

Steps 1–9 done: 18 stat modules and 20 slides, 228 covers, 32 mirrored font
faces, four theme modes, a soundtrack the video is cut to, and a single-screen
control surface. 242 passing tests. The default cut at 120 BPM is 28 bars —
about 56 seconds; every slide turned on is 46 bars, about 92.

**All twelve steps are done.** The plan is complete: ingest, a 20-module stats
engine, box art, four theme modes, twenty slides, a soundtrack the video is cut
to, a single-screen control surface, single and batch rendering, and the polish
pass.

Nothing in the plan remains. Natural next moves, none of them specified:
per-player audio, a landscape cut (the plan forbids one), or moving the stats
engine server-side so a batch does not need a browser tab open.

Known gaps left deliberately:

- The **optional stats have no slides**. Nine of the seventeen modules
  (`bestGame`, `nightOwl`, `longestWinStreak`, …) are computed and shown in the
  StatsInspector but are not in `DEFAULT_CUT`. They have lengths in `SLIDE_BARS`
  so adding one is small.
- **Only one render at a time**, single or batch, enforced with a 409. Remotion
  opens a browser per render and saturates the CPU; two at once take longer than
  two in sequence and are likelier to run out of memory.
- The bundle is cached for the life of the process, so **editing a slide means
  restarting `npm run server`** before the change reaches a render.
- **No bundled tracks ship with the repo.** `public/audio/` is gitignored and
  empty; the plan's suggestion to download 3–5 Pixabay tracks has not been done,
  because those are licensed files rather than code. `POST /audio/scan` adopts
  anything dropped into the folder by hand, and sets its licence to
  "Unknown — set this before publishing" so it cannot be forgotten.
- The **SFX layer** the plan lists as optional (a tick on each `CountUp`
  landing) is not built.
- A **one-play player still gets a ten-slide video**, including a "top five"
  showing one game. It is coherent and never breaks, but step 12's polish pass
  should consider a shorter cut when `stats.thin` is true.
- **The slide selection is not persisted.** Theme choice survives a reload;
  which slides are in the cut does not.

## Repo gotchas

- **`boardgame-wrapped/boardgame-wrapped/` is a duplicate** of the entire
  scaffold, byte-for-byte, from a scaffolding accident. The real project is the
  outer directory. Never edit the nested copy; it should be deleted.
- This directory is **not a git repository** yet, despite having a `.gitignore`.
  There is no history to fall back on — be careful with destructive edits.
- `out/`, `public/boxart/*`, `public/audio/*` and `data/` are gitignored —
  generated output and personal data respectively.
- **Remotion bundles with its own webpack**, so the `@` alias is configured in
  three places: `tsconfig.json`, `vite.config.ts`/`vitest.config.ts`, and
  `Config.overrideWebpackConfig` in [remotion.config.ts](remotion.config.ts).
  A runtime `@/...` import inside `src/video` fails to bundle without the third.
  Type-only imports hide the problem, since they are stripped before webpack
  sees them.
