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
npm test             # vitest, 342 tests
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
- **`highestWins` is real and it matters.** Eight of the 229 games are
  lowest-wins — Cabo, Cambio, Second Chance and friends. Anything that asks
  "who did best" and takes the maximum names the *worst* player in those games.
  It is on `NormalizedPlay` for exactly that reason.
- **`usesTeams` means the score is not one player's.** Poetry for Neanderthals
  is the case that found this: three different players each held the record at
  27, because all three were on the winning team of the same play.
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

- **Starter** — the six hand-specified palettes in
  [src/theme/starters.ts](src/theme/starters.ts).
- **Custom** — any token edited in the picker; persisted to localStorage.
- **Random** — one hue outside the muddy 45°–65° band, whole palette derived.
- **Box art** — accent taken from the slide's own cover, rest derived to match.

### Six starters, six signatures

A signature is the thing someone would describe if asked what the video looked
like, so **every starter owns one and no two share**. A test enforces that, along
with distinct grounds and distinct display faces — the point of having six is
that they read as six studios' work, not one palette shuffled.

| Theme | Ground | Signature | What it draws |
|---|---|---|---|
| Punchboard | chipboard | `diecut` | stats punch out of the board, leaving a recess |
| Scorepad | paper | `tally` | marks stroked on, every fifth one crossing the other four |
| Table Light | near-black | `lamp` | a warm pool drifting behind the subject |
| Felt Table | green cloth | `dice` | dice tumble through faces in the air and land on their value |
| Meadow | parchment | `tiles` | tiles dropped in with a quarter turn, roads meeting at the joins |
| Peg Board | walnut | `pegs` | pegs drop into a drilled track, empty holes ahead of them |

### Detail animations belong to a stat, not to a theme

[src/video/slides/details.tsx](src/video/slides/details.tsx) is the other half
of the picture. A **signature** belongs to a theme and appears on every slide; a
**detail** belongs to one stat and appears wherever that stat does, in whatever
theme is on.

The rule all of them are written to: **the drawing has to be about the number
underneath it.** A shape that would fit any slide equally well is decoration,
and decoration is what makes a video look assembled rather than made.

| Slide | Detail | Why that shape |
|---|---|---|
| Intro | `DealtHand` | every one of these evenings starts by dealing |
| Win rate | `ChipStacks` | two stacks, same scale — the slide's subject is a comparison |
| Longest win streak | `StreakChain` | the link between two wins is what makes it a streak rather than a total |
| Best / worst game | `ResultRow` | a percentage read, versus won and lost markers you can count |
| People played with | `Crowd` | people drawn as people |
| Nemesis | `HeadToHead` | one track filled from both ends; where they meet is the record |
| Busiest day | `DayStack` | every other count is spread over a year — this one piles up |
| Night owl | `HourDial` | 24 hours as a ring, shaded at exactly the 22:00–04:00 the stat counts |
| First and last play | `CalendarTear` | it tears the months the range actually covers, not a fixed twelve |
| Top location | `PinDrop` | a pin lands and the rings keep going out — a place is somewhere you go back to |
| Time played | `DayClock` | one lap of the dial is one day, so "about 4.8 days" is said as a movement |

Several are worth knowing in detail:

- **`ChipStacks` scales both columns by the same unit**, and says what one chip
  is worth on screen. Scaling each column to its own height would make 61 wins
  and 161 losses look like the same pile — the one thing the drawing exists to
  contradict — and a chip that silently meant eighteen plays would be a chart
  with a hidden axis. `chipScale` is pure and tested.
- **`HourDial`'s shaded band is 22:00–04:00**, because that is the window
  `lateShare` actually counts. A band that disagreed with the percentage beside
  it would be worse than no band.
- **The win-rate bar it replaced never animated at all.** It was drawn at its
  final width on the first frame. Worth remembering when reading old slides:
  a static shape is easy to mistake for a finished one.
- **`CalendarTear` tears the real span.** January to March is three pages, not
  twelve, and months are absolute indices (`year * 12 + month`) so a range that
  crosses New Year still counts forwards.
- **`ResultRow` spreads the wins through the row** rather than bunching them at
  the front. *Which* plays were won is not in the stat, and putting them all at
  one end would invent a run that may never have happened.
- **`DayClock` hangs in the frame's top corner, not beside the number.** In the
  row it first shared with the stat block it took width off the caption and
  broke it across more lines than it should. A decoration that costs the text
  its shape is not earning its place.

### The tally is the plays slide's, and nowhere else

`useThemeMark` is `useCountMarks` minus the tally, and it is what
`groupShare` uses. Once the plays slide drew stripes in every theme, any second
slide drawing them again was one picture doing duty for two different facts —
which is exactly what happened on "People played with" before it got `Crowd`.
So Scorepad simply has no mark away from the plays slide; the other three
themes keep theirs, on nights-attended.

### Two slides count, and they count differently

**The plays slide draws the tally stripes in every theme.** It is the one slide
whose whole job is "how many", and the marks going down beside the figure are
what make it land — a bare 233 is a fact; 233 with the count drawn beside it is
a year. So the tally is not Scorepad's alone: it is what `TotalPlaysSlide` does,
in whatever accent the theme brings.

**The co-player count is where a theme counts in its own hand** — Scorepad's
strokes, Felt Table's dice, Meadow's tiles, Peg Board's pegs, and nothing for
the two whose signature is not a counting one. That slide is what tells the six
designs apart now that the plays slide is common to all of them.

All four counting marks share the timing helpers in
[src/video/signature/](src/video/signature/index.tsx) — `markStep` and
`markFinishFrame` — so a count can never outlive its slide whichever theme is
on. `draw` is how long a single mark takes, and it differs a lot: a pen stroke
is 3 frames, a die that has to tumble and land is 9. The window is the same 46
either way, and the step compresses to fit.

A slide asks `useCountMarks()` once and renders `<CountMarks>`; it never learns
which theme is on.

Three details worth keeping:

- **The tumbling die shows a cycling face, not its final one.** A die that faded
  in at its value is a picture of dice; cycling while it is in the air and
  settling on the real number is what reads as a throw. The cycle is driven by
  the frame, never `Math.random` — determinism applies to a decorative tumble
  exactly as much as to a stat.
- **The peg track is longer than the count.** Drawn exactly as long, thirty
  filled holes and no empty ones is a row of dots; the empty track ahead is what
  makes it a position on a board.
- **Each tile's road is quarter-turned by its own index**, so the finished block
  is a small mosaic rather than a grid of identical squares — the same reason a
  tally crosses every fifth mark.

### Contrast is enforced, and the plan's formulas do not satisfy it

The plan specifies `accent = hsl(h, 72%, 58%)` and requires accent-on-ground
≥ 4.5:1. Swept across every hue in both light and dark modes, that formula
**fails 425 of 720 combinations, worst case 1.26:1.** `ensureContrast` in
[src/theme/color.ts](src/theme/color.ts) walks a color's lightness the minimum
distance needed, keeping hue and saturation. After it, all 720 pass.

The starters are hand-picked and held to a different, honest bar:

| Theme | ink on bg | accent on bg | accentAlt on bg |
|---|---|---|---|
| Punchboard | 7.76:1 | 3.85:1 | 2.22:1 |
| Scorepad | 9.95:1 | 4.51:1 | 2.77:1 |
| Table Light | 15.81:1 | 11.73:1 | 5.95:1 |
| Felt Table | 13.53:1 | 8.33:1 | 3.60:1 |
| Meadow | 11.97:1 | 4.08:1 | 3.53:1 |
| Peg Board | 11.75:1 | 6.45:1 | 4.95:1 |

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

### `gameRecord` is a claim, so it is guarded three ways

A record is the best score of **anyone** who played that game in range — not the
player's own best, which is what `highestScore` reports. Three rails keep it
from firing on something that is not a record:

- **Two people must have scored in the game.** Otherwise it is not a record, it
  is the only score, and anyone who played something alone would "hold" it.
- **Best means best, not biggest** — `highestWins`, above.
- **Cooperative and team games are skipped**, because the number belongs to the
  table rather than to a player.

When someone holds several, the one they have **played most** is shown, and the
rest are counted beside it: a record in a game played twenty times says more
than one in a game played twice. Ties break by `rank`'s rule.

Measured on the real export: **19 of 93 players** hold one, so it is a real
distinction rather than a participation prize. Before the co-op and team rails
it was 24, and three of those were the same Poetry for Neanderthals team score.

`highestScore` deliberately still reports the largest number rather than the
best one — "highest score" says what it means. It is the one place the
`highestWins` flag is knowingly not applied.

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
- **Rows are dragged, and the arrows stay.** A drag is faster across the list, an
  arrow is exact for one place, and the arrows are the only one of the two that
  works from a keyboard. Drag is plain HTML5 `draggable` — no dependency — with
  `moveSlideTo` as the pure move behind it. The move buttons cancel `dragstart`,
  or pressing one would start a drag instead of clicking.
- **The slide under the playhead is marked**, with an accent bar down the left
  edge rather than a filled row: the list is also the thing you edit, and a
  whole row changing colour reads as "selected" rather than "playing now".
  `Preview` reports the *slide*, not the frame — `frameupdate` fires thirty
  times a second and lifting that into React state would re-render the control
  column on every frame. `slideAt` maps frame to slide, and the callback only
  fires when the answer changes, so about once every two seconds.
- **The picker shows the arrangement that will play**, via `arrangementOf` —
  `buildCut` can move a slide, and a list that disagrees with the video about
  the order is worse than no list. It is idempotent, which is what lets the UI
  feed its own output back in as the base for the next edit.
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

### Cancelling, and why it needs more than the cancel signal

`cancelSignal.cancel()` does stop Remotion rendering frames — the counter
freezes on the spot — but **the `renderMedia` promise then never settles.** It
neither resolves nor rejects. Measured: after a cancel the job sat in
`rendering` indefinitely, so `isRunning` stayed true, `/render` answered 409
forever, and the headless Chrome stayed alive. The only way out was restarting
the server.

So `startRender` does three things the cancel signal does not:

- **Moves the phase in `cancel()`, not in the catch.** The slot is free the
  moment cancel is asked for. Everything after that point checks a `cancelled`
  flag before touching `progress`, so a late callback from a render still
  unwinding cannot move the job back out of `cancelled`.
- **Opens the browser itself** with `openBrowser` and passes it to
  `selectComposition`/`renderMedia`/`renderStill`, so there is a handle to close.
  Remotion's own instance is not reachable from outside, and on the cancel path
  nothing ever releases it.
- **Settles `done` on cancel**, with `Promise.race`. The batch queue awaits
  `job.done`; on `work` alone it would wait for the life of the process.

Verified end to end: cancel, `running: false` within a second, a second render
started on the same server, and no browser left behind.

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
- **The hero cover is contained, not cropped.** `BoxArt` takes a `fit` prop:
  `cover` (the default) fills the box and trims the overhang, which is right
  for a grid where covers have to line up whatever shape they came in. The
  most-played slide passes `contain` into a 620×740 box instead, so the art
  keeps its own proportions — a square crop took the credits line and the
  publisher's mark off the bottom of the one cover the slide exists to show.
  The geometry is `coverBox()`, exported and unit-tested, because `<Img>` needs
  a composition context a test cannot provide.
- **The backdrop fade is on the backdrop only.** An earlier version masked the
  whole hero and faded out the bottom half of the cover with it.
- **The square** ([src/video/Square.tsx](src/video/Square.tsx)) is a `Still`
  composition, rendered beside every MP4 as `<same-name>.png`. A failure there
  never fails the video.
- **`--dry-run`** was already `scripts/dry-run.ts`, from step 4.

### Motion

The rule this design works to: **the frame is never still, but the content is.**
Something is always moving; it is never the thing you are trying to read.

An earlier pass had every element drifting on its own offset phase — the number,
its eyebrow, its caption, the aside, the player's name. Individually each was a
few pixels. Together they meant no line of type ever settled, and a stat slide
became tiring to read. **`Float` is now background-only.** Content arrives on a
spring and then stops dead.

This is measurable, and worth re-measuring after any change here: across two
frames twenty apart in the same slide, the big number's 31,402 lit pixels have
**zero** that differ, while 60% of the background changes.

Things that keep the frame moving:

- **[Ambient.tsx](src/video/Ambient.tsx)** — three colour fields drifting on
  their own periods (23s, 31s, 41s), mounted **above the `<Series>`** so it runs
  on the video's absolute frame and drifts straight through every cut. A
  background that restarted per slide would draw attention to the cuts instead
  of covering them.
- **Hero drift** — `BoxArtHero` floats on a nine-second cycle, longer than the
  slide, so it never visibly repeats. This is the one piece of *content* that
  still moves, and it is a picture rather than a number: a cover drifting reads
  as depth, where a drifting figure reads as a page that will not settle.
- **The top-five countdown** ([slides/TopFive.tsx](src/video/slides/TopFive.tsx))
  reveals five to one, filling upward, with first place landing last on a plate.
  Rows hold their final positions from the start and are simply invisible until
  their turn; laying them out as they arrive would shove every row already on
  screen.
- **`KineticWords`** assembles a headline a word at a time instead of fading it
  in — the single most recognisable move in this kind of video.
- **The quip** ([slides/Quip.tsx](src/video/slides/Quip.tsx)) arrives at the
  foot of the frame 46 frames — about a second and a half — after its slide's
  content. It rises into place once and then holds. It is rendered by `Wrapped`
  for every slide rather than by each slide, so a stat component never has to
  think about it and one change covers all twenty.

  It sits `QUIP_LIFT` (190px) **above** the safe margin, at full body size in
  `ink` rather than 78% in `inkMuted`. Hard against the bottom edge and half
  faded it was being missed entirely — a phone's own story UI crowds that edge,
  and the eye does not travel that far after reading a number in the middle of
  the frame.

  **A slide with an aside gives up `QUIP_BAND` (350px) of height for it.** The
  aside is absolutely positioned while slide content is centred in the frame, so
  without the reservation the two share the same space and collide — on the
  most-played slide the line landed on top of the play count, and the taller the
  game's title the worse it got. `SafeArea` reads the band from `QuipSpace`, a
  context `Wrapped` provides, rather than every one of the twenty slides having
  to pass a flag down. It is reserved rather than measured: measuring text needs
  two passes, and Remotion renders each frame once.

### The quips are data, not filler

[src/stats/quips.ts](src/stats/quips.ts) is a pure `quipFor(slideId, stats)`.
Every line is derived from the number it sits under — "That is 4.5 a week. Every
week.", "You could have watched all of Lord of the Rings 9 times." — so it is a
remark about *this* year rather than something that would fit anyone's. A
generic quip under a specific number makes the number feel generic too.

It returns `null` freely, and that is the important half: a slide with no line
is better than a slide with a limp one. Small numbers get nothing (`gamesLearned`
under 4, `busiestDay` under 4, a top five with fewer than five games), a co-op-only
year gets no win-rate joke, and the bookends never get one at all — they have no
number to remark on. Thresholds are asserted in
[quips.test.ts](src/stats/__tests__/quips.test.ts).

### The intro is two bars

It was four, which is a long time to hold three lines of text at the top of a
video. Two bars, with the year set large, the name assembled by `KineticWords`
and every element on its own `Float`, says the same thing while moving.

A flat bottom edge on a name like "Tina" is the **baseline, not a clip** — T, i,
n and a all terminate there. This was investigated three times before rendering
a name with descenders settled it: "Tingy Jpq" shows every tail in full. Do not
"fix" it again.

### Two things learned tuning the background

**More opacity is not more movement.** The first attempt at "more visible" raised
every field and added a wide `surface` wash over the whole frame. On a dark
theme that is not motion, it is fog: the felt-dark ground became a flat olive
haze and the contrast big type needs went with it. Movement comes from
*coloured* fields crossing a ground that stays dark.

**The lamp was being drawn twice.** `texture: 'lamp'` and `signature: 'lamp'`
rendered near-identical gradients, one static and one drifting, stacked. With
the ambient fields on top that was three glow layers in the middle of the frame.
The texture slot for `lamp` is now empty and the signature owns it.

### Type

**A display number shrinks to fit; it never wraps.** The scale sets 280–310px,
which is about five characters of budget, so a six-figure score ran off the
right edge of the frame. `DisplayNumber` takes a `fit` prop — the widest string
the value will reach — and sizes with `fitDisplay`. It has to be the *final*
value rather than what `CountUp` is showing, or the type would shrink as the
number counted up.

Display and headline steps are roughly 40% larger than they were, with negative
tracking (`-0.025em` on headlines, `-0.035em` on numbers). Loose letterspacing
on a 130px headline is what makes big type look like a document rather than a
title card. `fitText` still shrinks anything that would overrun, so the larger
base is safe for a 56-character game title.

**This costs bitrate.** Constant motion means no two frames are alike, so
inter-frame compression has far less to work with: the same video went from
9.5 MB to 18.0 MB, and the render from 56s to 95s. Still inside the plan's
budget per 30 seconds, but worth knowing before adding more.

### Lead-in lines

`LEAD_INS` in [timeline.ts](src/video/timeline.ts) maps a slide to the line that
introduces it. Seven slides have one; the rest simply start.

The copy lives in the pure timeline layer, not in the component, because
**slide lengths depend on it**: `slideBars()` adds `LEAD_IN_BARS` to any slide
with a line, so the content keeps its full time and everything stays a whole
number of bars. `LEAD_IN_FRAMES` (46) is deliberately less than one bar at any
sensible tempo, and a test asserts it.

The line and its slide share one `Series.Sequence`. The content is offset with a
nested `<Sequence from={LEAD_IN_FRAMES}>` rather than a delay prop, so the
slide's own frame still starts at zero and every `BEAT` inside it works
unchanged. A lead-in is never a slide of its own — turning a slide off can then
never strand its introduction.

**`planTimeline` resolves the line, not the component.** `PlannedSlide.leadIn`
carries it, because a line can depend on what ran before it *and* the slide's
length depends on whether it has one. Two places working that out separately is
two places to disagree, and they would disagree by exactly one bar.

### Linked slides

`PAIRED_LEAD_INS` holds lines that only appear when one particular slide runs
directly before. There is one: "Played with" counts the people, "Played most
with" names one of them, and between them goes *"But one of them was at the table
more than anyone…"*. Back to back they are two halves of one thought.

`LINKED_PAIRS` is what keeps them back to back — `buildCut` pulls the leading
slide up against its partner whenever both are in. Three consequences worth
knowing:

- **Only the leading slide is repositioned by `buildCut`.** Someone who dragged
  "Played most with" to the end still gets it at the end, with its setup in
  front of it.
- **The pair moves as one unit.** `unitsOf` groups it, and both `moveSlide` and
  `moveSlideTo` work on units. Without that, stepping the partner one place just
  swapped it with its own lead and `buildCut` put it straight back — the arrow
  appeared to do nothing.

  This is also why **both halves are ordinary rows in the picker**: grabbing
  either one moves both. An earlier version indented the leading slide and
  disabled its controls, which was correct only while the moves still worked on
  single rows; once they worked on units the restriction was dead weight. The
  arrows are disabled at the ends of the list of **units**, not of rows — a pair
  sitting last has a row that is not last, and its ↓ would look live while doing
  nothing.
- **The line is conditional on what was actually emitted**, not on the cut. A
  player with no co-player count gets no bridging line and no extra bar, rather
  than an introduction to a slide that never comes.

The default cut is **31 bars, about 62 seconds** at 120 BPM; every slide turned
on is 52 bars, about 104.

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

Three details worth keeping:

- **A range can be renamed for the video** — `rangeName` — and it is stored
  *beside* `rangeLabel` rather than replacing it. The derived label is what the
  year chips match on, so overwriting it would make renaming a range deselect
  the year it came from. Blank means "no override", which is why the derived
  label lives in the field's placeholder: seeding the input with it would make
  every session look renamed.
- **Only the track's id is stored**, not the track. A track carries 480 waveform
  peaks and would not survive a localStorage quota. The AudioPicker re-selects
  it once the manifest arrives.
- **Writes are gated on `restored`.** Without it the first render saves the
  defaults over whatever was stored before the load finished.

## Status and next step

**All twelve steps are done.** 406 passing tests. The plan is complete: ingest, a 20-module stats
engine, box art, four theme modes, twenty slides, a soundtrack the video is cut
to, a single-screen control surface, single and batch rendering, and the polish
pass.

Nothing in the plan remains. Natural next moves, none of them specified:
per-player audio, a landscape cut (the plan forbids one), or moving the stats
engine server-side so a batch does not need a browser tab open.

Known gaps left deliberately:

- The **optional stats are off by default**. Ten of the twenty-one modules
  (`bestGame`, `nightOwl`, `gameRecord`, …) are computed and shown in the
  StatsInspector but are not in `DEFAULT_CUT`. Each has a real slide and a
  length in `SLIDE_BARS`; adding one to the default cut is a one-line change.
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

## Repo gotchas

- **`boardgame-wrapped/boardgame-wrapped/` is a duplicate** of the entire
  scaffold, byte-for-byte, from a scaffolding accident. The real project is the
  outer directory. Never edit the nested copy; it should be deleted.
- This **is** a git repository now (`origin` is `DS1720/boardgame-wrapped`), so
  there is history to fall back on. It was not one for most of the build; older
  notes that say otherwise are out of date.
- `out/`, `public/boxart/*`, `public/audio/*` and `data/` are gitignored —
  generated output and personal data respectively.
- **Remotion bundles with its own webpack**, so the `@` alias is configured in
  three places: `tsconfig.json`, `vite.config.ts`/`vitest.config.ts`, and
  `Config.overrideWebpackConfig` in [remotion.config.ts](remotion.config.ts).
  A runtime `@/...` import inside `src/video` fails to bundle without the third.
  Type-only imports hide the problem, since they are stripped before webpack
  sees them.
