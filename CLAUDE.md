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
npm test             # vitest, 704 tests
npm run typecheck    # tsc --noEmit
npm run video:studio # Remotion Studio
npm run video:render # renders out/test.mp4
npm run app:build    # Windows installer + unpacked app
npm run app:start    # the desktop shell, unpackaged
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

### BGG credit prefetch

```bash
npm run prefetch:bgg          # or: npx tsx scripts/prefetch-bgg.ts <export.json> [--force]
```

Fetches mechanics, categories, designers, artists and the original publisher for
every game and writes `public/bgg/manifest.json`. Measured on the real export:
**227 games, 227 fetched, 0 failures, 24.8s.** Safe to re-run — a cached success
is skipped, a cached failure is retried. The five credit slides do not appear
without it.

### Font mirror

```bash
npm run prefetch:fonts        # or: npx tsx scripts/prefetch-fonts.ts [--force]
```

Mirrors the fourteen curated families into `public/fonts/` — 36 faces, 1.5 MB,
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
| [src/shared/bgg.ts](src/shared/bgg.ts) | BGG credit types, placeholder and format blocklists | Pure; the prefetch and the stats layer share one shape |
| [server/bgg.ts](server/bgg.ts) | BGG credit fetch + manifest | Node-only; one request per game, cached |
| [src/stats/](src/stats/) | Pure stat modules → `WrappedStats` JSON | No React, no rendering, no I/O — fully unit-testable |
| [src/video/](src/video/) | Remotion composition, consumes `WrappedStats` | Reads stats; never computes them |
| [src/theme/](src/theme/) | Tokens, starters, generators, contrast math | Pure except `ThemeContext.tsx`; no slide imports a starter directly |
| [src/video/timeline.ts](src/video/timeline.ts) | What appears, in what order, for how long | Pure and React-free, so gaps and duration are testable |
| [src/video/slides/](src/video/slides/) | All 26 slides and their layout primitives | Content only ever inside `<SafeArea>` |
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
- **Local-first.** Nothing leaves the machine. Two one-time prefetches reach the
  network and nothing else does: box art into `public/boxart/`, and BGG credits
  into `public/bgg/`. At render time every asset resolves through Remotion's
  `staticFile()`, so a render makes no external request. The manifests' `source`
  URLs are data, never fetched during a render. **The credit manifest is not
  even a render-time asset** — it is consumed by the stats layer in the browser,
  and what reaches the renderer is the finished `WrappedStats`.
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

## The seven credit slides

Five lists - themes, mechanics, designers, artists and publishers - and two
heroes, one for the leading theme and one for the leading mechanic. All seven
are **off by default** and all seven need `npm run prefetch:bgg` to have been
run.

**The export has one of the five and not the other four.** Grepping both real
exports for `mechanic|publisher|artist|categor|theme|family` returns nothing;
`RawGame.designers` is the only credit BG Stats writes, and it covers 98.1% of
plays. So the other four are joined from BGG on `bggId`, which is on 99.0% of
plays.

**BGG's XML API is not the source, because it now answers `401`.** They moved to
requiring registered applications and bearer tokens. A token embedded in a
public repo and a 169 MB installer is not a secret - the same reasoning that
rules out shipping a GitHub token for the updater. `api.geekdo.com/api/geekitems`
is what the website itself calls, needs no authorization, and returns the same
links. It is undocumented and could be gated the same way; that is survivable,
because the manifest is cached and every module returns `null` without it.

### Ranked by plays, filtered by games

This is the one decision the whole feature turns on, and both halves were
measured before either was chosen.

- **Ranking by distinct games does not work at this dataset size.** Across the
  26 players with 20+ plays, the top designer reaches three distinct games for
  **2 of them**, and on average **19 names share fifth place** (22 for artists,
  12 for publishers). A top five picked from nineteen identical scores is
  ordered by the alphabetical tie-break, not by anything the player did - the
  same failure the old alphabetical `gamesLearned` had. It also draws as
  `2 - 2 - 2 - 2 - 2`, which is a list rather than a countdown.
- **Ranking by plays alone echoes the most-played slide.** At 1.5 designers per
  game, Tina's top two were Goupy and Lebrat tied at 21 - which is Faraway,
  which her most-played slide had already shown.
- **So distinct games is the eligibility filter and plays is the ranking.** A
  name must appear in `MIN_CREDIT_GAMES` (2) different games to be listed;
  survivors order by plays. Tina's designers become Chvatil 11, Flynn 6,
  Vogelmann 5 - none of them a Faraway name.

The filter costs coverage and that is the accepted trade: a full five exists for
4 of 26 players on designers, 5 on publishers, 6 on artists. Below
`MIN_CREDIT_ENTRIES` (2) the module returns `null`.

**Mechanics and themes take no games filter.** At 5.2 and 3.0 tags per game they
already aggregate across a year rather than echoing one game, and their counts
have real separation (124 / 80 / 47 against a designer list's 11 / 6 / 5).

### Four narrowings, each of which the slide is wrong without

- **A publisher is `boardgamepublisher[0]`, taken at fetch time.** BGG lists
  every localization partner - 13.7 per game - so a raw tally ranks whoever
  translates the most games. Measured, the top four were MINDOK, Kaissa, MIPL
  and Gemklub: Czech, Greek, Polish and Hungarian localizers. The first entry is
  the original publisher (Faraway -> Catch Up Games, Flip 7 -> The Op, The Gang
  -> KOSMOS, Brass -> Roxley), and the long list never reaches the stats at all.
- **A theme is a category minus the formats.** `FORMAT_CATEGORIES` drops 21 of
  the 63 categories in the real library. Unfiltered, "Card Game" wins for
  everybody - it is on 106 of 229 games and takes a fifth of all category mass.
  The line is **subject versus not-subject**: "Movies / TV / Radio theme",
  "Novel-based", "Video Game Theme" and "Humor" stay because they say what a
  game is *about*; "Puzzle", "Word Game" and "Action / Dexterity" go because
  they say what you *do*. Genres between the two - Deduction, Bluffing,
  Negotiation - are kept, and Deduction is what Tina's filtered list leads with.
- **`PLACEHOLDER_CREDITS` are not people.** `(Unknown)` is the one that proves
  it: as a primary publisher it is on four of the real library's games, enough
  to rank it **first** on a game-weighted list.
- **A row's cover is de-duplicated.** Each row shows the player's most-played
  game carrying that name, *unless a row above already took it*. Without that,
  four of Tina's five top mechanics show the Faraway cover - true, and it
  renders as a slide that looks broken. A lower row takes its next-best game and
  falls back to its own top game only when every candidate is spoken for.

### Two smaller rules, both found by rendering

- **The "N games" line is on every credit row.** It was briefly gated on the
  counts *varying* across the list, on the argument that five rows reading
  "2 GAMES" is a column of one word rather than a second axis - and then left
  off themes and mechanics, on the argument that their hero slide had already
  said how far the leader reached. Both were wrong the same way: how many games
  a credit is spread over is the one axis the play count does not carry, and it
  is per-row information the hero can only give for the winner. On the mechanics
  list it is the most interesting column on the slide - 24, 18, 14, 13, 9 games
  behind play counts of 69, 69, 62, 61, 44.
- **The publishers slide always has a line, and `coPlayerCount` is no longer
  the only one.** Its quip needed three entries *and* a leader twice the
  runner-up, which measured on the real export is **1 player in 9** — the other
  eight ended the slide on a list with nothing under it. The three-entry guard
  was the worse half: a two-name list is still a contest, and one player was
  losing the line on a 12-to-2 lead purely for being short. Two tiers now: a
  wide lead is described (*"Catch Up Games had a very good year at your
  table."*) and a narrow one names the runner-up (*"Catch Up Games, just ahead
  of The Op Games."*), which is a fact the ranking implies but 32-against-27
  does not make obvious. **9 of 9 get a line.** "Just ahead of" is only ever
  said below 2x, where it is true.
- **The quips never restate that count.** The row already carries it, and a line
  under the list repeating row one's number is the same fact told twice. This
  is why the mechanics quip is *"Hand Management, over and over"* rather than
  *"Hand Management in 24 of your games"* - the row under it already says 24.
  The name is fair game; the number is not. A test sweeps all five.

### The picker's names say what a slide ranks by

Nine labels were renamed once there were three countdowns of games and five of
credits: `Top 5 games (by plays)` against `Top 5 by time`, and `Top game (by
plays)` against the hero `Top theme` and `Top mechanic`. A picker is a list of
names and nothing else, so two rows that read alike are two rows nobody can tell
apart — a test asserts every label is present and no two are equal.

**`SLIDE_LABELS` is a fixed catalogue name; the headline on the slide is not.**
The label has to read the same before anyone's stats are loaded, so it says
"Top 5 designers" unconditionally. The headline counts the rows it actually has
— `topNHeadline` — because the eligibility filter means a full five exists for
only 4 of 26 players on designers, and a slide claiming five over three rows
would be wrong more often than right. Themes and mechanics take no filter and
are effectively always five.

### Two of them are heroes, and they answer the list's own question

`topTheme` and `topMechanic` are built like the most-played slide - a claim,
centred, with the evidence under it - because they are making the same kind of
statement. The list says Deduction came up 39 times; the hero says *which games
those were*, which is the question a list of bare names invites and cannot
answer on its own.

- **The hero and its list share one tally.** `tallyCredits` walks the plays
  once and both `creditStat` and `leadingCredit` read it, so two adjacent
  slides can never disagree about who won - which would be the worst bug
  available here.
- **`MIN_LEAD_CREDIT_GAMES` is 2**, applied to the winner alone. The slide's
  whole job is "and here are the games", so a theme carried by a single game
  has nothing to show and is that game again under another name.
- **Two bars, like the most-played slide they are built from.** They were
  briefly three, on the argument that six covers is more to look at than one -
  but the covers stagger in over the first second and a half and the extra bar
  went on holding a finished card. The lead-in still buys a bar of anticipation
  in front of that.
- **The `+N more` line waits for the last cover, and the wait is computed.** It
  was a flat 22 frames after the grid began, which is right on a fast theme and
  13 frames early on Table Light, where the sixth cover does not land until 55.
  The stagger step is a theme's to set - 3 frames on Neon Night, 7 on Table
  Light - so a constant cannot be right for all nine. `moreDelay` is pure and
  tested against every starter, because the failure is invisible in eight of
  them.
- **Six examples, in a 3x2 grid, and a `+N more` line under it.** Six fills the
  grid without a ragged bottom row - the same reason the outro takes six from a
  top five - but the credit usually spans many more: Hand Management is on 24 of
  Tina's games. Without the overflow line the six read as the whole set, which
  is a quieter kind of wrong than a number being off. The caption says "across
  24 games", the grid shows six, and nothing on the slide connected the two.
  The line arrives after the last cover has landed, because it counts them.
- **The titles are set under the covers, not left implied.** Half the point is
  recognising the games, and a cover at 248px is a thumbnail: legible if you
  already know the box, not if you are being told about it. Two lines, then an
  ellipsis.
- **The covers sit on a shelf, not centred in their cells.** `fit="contain"`
  gives an element the cover's own aspect ratio up to the box - deliberately,
  so there is no letterbox bar and the shadow follows the art - which makes a
  wide box like Phantom Ink shorter than a tall one like Codenames. Left alone
  the titles then sat at three different heights across a row. A fixed cell
  with `align-items: flex-end` puts every title on the same line.
- **`Stagger` sits inside the grid**, not around it, so each cover is its own
  cell and they land one at a time. Wrapping the whole grid in one `Reveal`
  drops all six together, which is a picture rather than a list being counted.
- **Only themes and mechanics get one.** A hero designer or publisher would be
  a person's name over a grid of two covers, which is what the list row already
  is. Themes and mechanics span enough games for the grid to say something.

### A linked pair is introduced once

Both halves of the theme and mechanic pairs carry the *same* `LEAD_INS` line, so
either can open its section when the other is switched off. `LINKED_PAIRS` then
keeps them adjacent, at which point the second would repeat the line one bar
after the first said it.

So `leadInFor` suppresses a plain lead-in when the previous slide is this one's
linked partner. A pair with a **paired** line is unaffected - that line exists
precisely to be said on the join, and it is returned before the check. Nothing
existing changed: `topFiveByTime` and `topCoPlayer` both take the paired route.

### The progress bar estimates from fetches, not from items

The panel says how much longer it will take, and the arithmetic is
`estimateRemainingSeconds` in [src/shared/bgg.ts](src/shared/bgg.ts) — pure, so
it is tested rather than eyeballed.

**A cached game and a fetched game are not the same cost**, and the obvious
`elapsed / done` is badly wrong because of it. A re-run with 200 games already
in the manifest flies through them in under a second, so the rate measured over
all items says "one second left" — and then the run spends the rest of its time
on the fetches with the estimate climbing the whole way. An estimate that rises
is worse than none.

So the rate is measured per **fetch**, and the fetches still to come are
projected by assuming the cached/fetched mix seen so far continues. That is
right for a fresh run (everything is a fetch), for a fully cached one (no
fetches, so nothing to wait for), and self-correcting for a mixed one.

Three details, all measured on the real library:

- **`ETA_WARMUP_FETCHES` is 8, and it was 4.** The four workers start together,
  so `done` jumps straight to four in whatever the first request took — and that
  request pays for DNS and the TLS handshake, which none of the 226 after it do.
  At four fetches a real 21.0s run opened with *"about 50 seconds left"*; at
  eight it opens with 35s and has converged by 6s in. Nothing is shown before
  that: two seconds of silence beats two seconds of a wrong number.
- **The wording rounds coarsely** — five-second steps, then "about a minute",
  "about a minute and a half", then whole minutes. A figure ticking down second
  by second invites checking against a clock, and this is a projection from an
  average rate rather than a measurement.
- **It cuts to minutes at 55 seconds, not 60**, or rounding to the nearest five
  produces "about 60 seconds left" one tick before "about a minute left". And
  past 105s it goes straight to whole minutes: rounding to half minutes first
  and then to whole ones double-rounds, and 140 seconds came out as three.

The route's opening progress counts `fetchableGames(games)` rather than
`games.length`, because two of the real library's 229 games have no BGG id and a
bar opened against the raw count jumps backwards on the first tick.

### Everything else about them

- **`CountdownList` is shared, not copied.** It is the same component the two
  game lists use; the credit slides pass a heading, a unit and rows. Its
  ordering counts off `games.length` rather than the constant `ROWS`, or a
  three-row list would sit empty for two steps before its bottom row arrived.
- **The block has one lead-in**, on `topDesigners` - the line that turns the
  video from games to the people who made them. A line costs a bar and five of
  them would cost five.
- **Coverage is guarded at 60%**, the same floor and the same reasoning as
  `timePlayed`. It is also what makes all five vanish cleanly with no manifest,
  where coverage is 0. Measured with one: mechanics 97.4%, themes 99.1%,
  publishers 99.1%, designers 97.0%, artists 87.6%.
- **The designer slide has an offline fallback.** `NormalizedPlay.designers`
  comes from the export, so that one slide works with no prefetch and no
  network. The other four have no second source and simply do not appear.
- **A failed fetch is recorded, not dropped.** An entry with `error` is retried
  on the next run and excluded by `indexOf`, because "fetched, no artists" and
  "never fetched" mean different things to the coverage guard.

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
- **The export is one group's plays, not the game's playerbase.** Anything
  phrased as a ranking "among players of X" can only ever mean among the people
  in this file who played it — see the top game's percentile below.
- Play tags and play ratings are unused.
- Some plays have **no `locationRefId` at all** (absent, not zero) — normalized
  to `null` in ingest.
- `playDate` is `"YYYY-MM-DD HH:mm:ss"` **local time**. Parse it with
  `parseLocalDate` in [src/shared/format.ts](src/shared/format.ts), never
  `new Date(string)` — the latter drifts by timezone and silently corrupts
  "game nights" and the night-owl stat.
- **A day key is not a timestamp, and the two parsers are not interchangeable.**
  Stats carry `"YYYY-MM-DD"` wherever the time of day is not part of the fact.
  `parseLocalDate` requires the time and answers an *invalid Date* for a bare
  day key rather than throwing — correct, and a trap: the first-and-last slide's
  span line computed `NaN`, failed its own `days > 0` guard and rendered
  nothing at all, in silence. Use `parseDayKey` / `daysBetween` for day keys.
  `daysBetween` rounds rather than floors, because a span crossing a daylight
  saving change is 23 or 25 hours short of a whole number of days.

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

- **Starter** — the seven hand-specified palettes in
  [src/theme/starters.ts](src/theme/starters.ts).
- **Custom** — any token edited in the picker; persisted to localStorage.
- **Random** — one hue outside the muddy 45°–65° band, whole palette derived.
- **Box art** — accent taken from the slide's own cover, rest derived to match.

### Nine starters, nine signatures

A signature is the thing someone would describe if asked what the video looked
like, so **every starter owns one and no two share**. A test enforces that, along
with distinct grounds and distinct display faces — the point of having nine is
that they read as nine studios' work, not one palette shuffled.

| Theme | Ground | Signature | What it draws |
|---|---|---|---|
| Punchboard | chipboard | `diecut` | stats punch out of the board, leaving a recess |
| Scorepad | paper | `tally` | marks stroked on, every fifth one crossing the other four |
| Table Light | near-black | `lamp` | a warm pool drifting behind the subject |
| Felt Table | green cloth | `dice` | dice tumble through faces in the air and land on their value |
| Meadow | parchment | `tiles` | tiles dropped in with a quarter turn, roads meeting at the joins |
| Peg Board | walnut | `pegs` | pegs drop into a drilled track, empty holes ahead of them |
| Neon Night | deep violet | `cubes` | big flat cubes drifting at three depths, clear of the middle |
| Blueprint | drafting navy | `grid` | two grids at five to one, sliding under a measured rule down each margin |
| Meeple | warm sand | `meeples` | the one piece in the box shaped like a person, drifting |

**Neon Night is the odd one out, on purpose.** The other six are named after a
material and behave like it. This one is named after a look, and it exists
because six tasteful palettes cannot be arranged into anything resembling a
Wrapped deck — the ground is the effect, and chipboard is not a colour that
shouts. It is the only starter that states its own `grounds`, and the only one
whose texture is `none`: flat colour is the point, and a texture over these
grounds is a smudge on a poster.

Its display face is **Archivo at 125% width**, the far end of the same variable
axis Punchboard reads at 75%. Two widths of one family look nothing alike at
poster size, and `uniqueFontSpecs` dedupes on the Google spec — so the seventh
face downloaded nothing and the mirror is still the twelve curated families.

### The ground belongs to the slide, not to the video

`Stage` used to paint `theme.color.bg` once, above the `<Series>`, and hold it
for the whole minute — deliberately, so the cuts disappeared. A Wrapped deck
does the opposite: every card is its own colour, and **the snap between them is
the effect.** [src/theme/palette.ts](src/theme/palette.ts) is what changed.

- **`groundCycle(theme)`** is the six grounds a theme moves through. Neon Night
  states its own; every other theme derives them from the six tokens it already
  owns — its own colours reused as grounds rather than new ones invented for it,
  which is what keeps a starter looking like itself. The first is always the
  theme's own `bg`, so the video opens as the theme people picked.
- **`paletteForGround`** re-derives all six tokens against that ground. Nothing
  is carried over, because a colour's job is relative to what it sits on: the
  theme's ink is the right ink on the theme's own ground and nowhere else.
- **The cut crossfades, over `CARD_FADE_FRAMES` (9).** It was a hard snap on
  the argument that the snap *is* the effect; at speed that read as harsh
  rather than punchy. `blendPalettes` moves every token together — fading a
  ground under text that had already jumped to its new colour would set the
  text at whatever contrast the halfway mix happened to give.

  Two details make nine frames enough. The interpolation is **eased in and
  out**, so it is slow at both ends and quick through the centre: two saturated
  grounds have a muddy midpoint (lime to magenta passes through amber) and no
  curve avoids it, but a curve can decline to dwell there. And `SlideShell`
  now **fades its content in across the same window**, so the ground has
  settled before there is anything on it to read. That is what keeps the
  intermediate palette — which nothing holds to a contrast floor — from ever
  being the thing a number is set on.

  `CARD_FADE_FRAMES` lives in [config.ts](src/video/config.ts) because both
  halves need it and `Wrapped` imports the slides: a constant in either one
  would have to be imported back out of the other.

Three things make it safe rather than merely loud:

- **Every ground clears the same bar a whole theme has to.** `ensureContrast`
  holds ink to 7:1 and the accent to the large-text 3:1 on every card, checked
  in [palette.test.ts](src/theme/__tests__/palette.test.ts) across all seven
  starters, both random modes and three seeded batch themes — 60-odd palettes,
  not a sample.
- **A mid-tone ground is moved, not accepted.** At L=50 both white and black
  land near 4.5:1, so no *text* colour can rescue one — `ensureContrast` on the
  ink cannot help. `legibleGround` walks the ground itself away from the middle,
  in its own polarity, until the ink clears. Walking to either end of the scale
  reaches maximum contrast, so it always terminates on something that works.
- **When neither highlight survives, the accent becomes the ink.** Walking a
  highlight's lightness until it clears keeps its hue and loses its colour: a
  neon lime dragged down far enough to sit on hot pink is olive. So a card whose
  ground is already shouting sets its number in ink with a trace of the
  highlight mixed back in. On the bright cards this is exactly the Wrapped move
  — near-black type on orange — and it is why the win-rate chips read as two
  heights rather than two colours there.

**No slide changed.** Each `Series.Sequence` is wrapped in a `ThemeProvider`
carrying its own palette, so a slide still asks `useTheme()` and still never
names a colour. The backdrop layers sit outside the `<Series>` and cannot read
that provider, so `Stage` looks the current slide up by frame with
`slideIndexAt` — same array, same index, so the ground under the content and the
content itself can never disagree about what colour the card is.

**A theme that states `grounds` stops stating them the moment its tokens are
edited.** Both the picker's `setColor` and `themeFromBoxArt` drop the field.
Without that, editing Neon Night's accent would appear to do nothing: the six
cards would keep the colours the starter shipped with.

### Every signature moves

The rule the video is built to is that the frame is never still while the
content is, and for a long time only the ambient fields kept it: five of the
signatures were a static CSS gradient, and Punchboard had **no backdrop at
all** — its signature acts on the plate a stat sits in, so its ground was bare.
That was survivable while the ground was one colour for the whole video. Once
the ground started travelling between cards, a printed sheet under a light show
is what it looked like.

All nine now drift, and `BACKDROP_SIGNATURES` is a map rather than a chain of
ifs so a test can assert every starter is in it — a signature that fell through
to `null` is exactly the bug Punchboard had, and it is invisible until someone
renders that theme.

- **`useTileDrift(pitch, framesPerPitch)`** is what most of them use. It returns
  an offset in `[0, pitch)`, so translating a tiled layer by it runs forever
  without ever showing a seam: when the offset wraps, the pattern is one whole
  tile along and looks identical. Layers are inset by `BLEED` (160px), because a
  fill translated by up to one pitch otherwise exposes a strip of nothing at its
  trailing edge.
- **Scorepad** scrolls one rule every ten seconds — a page being filled, not a
  page being scrolled. **Meadow** drifts diagonally on two different periods, so
  the field never looks dragged in one direction. **Peg Board**'s two tracks run
  *opposite* ways, which reads as depth rather than as one sheet sliding behind
  the type; every fifth hole is larger, so the drift is countable.
- **Felt Table** has the fine nap creeping along its own angle — at a 9px pitch
  you cannot follow individual lines, which is the point — plus a sheen crossing
  the cloth once every twenty-three seconds.
- **Table Light** was already drifting, at ±2%, which is technically moving and
  visibly still. It is ±6% now, and the pool breathes as well as travels, so the
  light has a source rather than being a shape that slides.
- **Punchboard** gets `SprueField`: the cut lines of the shapes *not* yet
  punched out. Every other row is offset half a pitch, the way a real sheet
  nests its shapes to waste less board — and it means the die-cut plate reads as
  one piece taken from a board rather than a card floating on a colour.

Everything is frame-driven, never `Math.random`. Determinism applies to a
background exactly as much as to a stat.

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
| Best / worst game | `ResultRow` | a percentage read, versus ticks and crosses you can count |
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
- **`ResultRow` marks a win with a tick and a loss with a cross**, in the same
  ring `StreakChain` uses — filled and knocked out for a win, hollow and muted
  for a loss. It was a filled dot against a hollow one, which is a distinction
  you have to be told about; a tick and a cross are the marks anybody already
  reads as won and lost, and the streak slide had been using them all along.
  The tick is that one's path scaled from its r=20 ring to this r=13 one, so
  the two are the same glyph rather than two drawings of the same idea.
- **`ResultRow` spreads the wins through the row** rather than bunching them at
  the front. *Which* plays were won is not in the stat, and putting them all at
  one end would invent a run that may never have happened — and with ticks on
  the markers, that invented run would now be legible as a streak.

  `winMarkers` is that arithmetic, pure and exported. It became worth testing
  when the dots became glyphs: nine filled dots under "80% in 10 plays" is a
  slightly wrong texture, nine *ticks* is a contradiction a viewer can read off
  the slide. A sweep checks the tick count equals the win count for every
  combination the row can show.
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
the engine emits all 27 modules and the default video is nineteen of them.
Adding one to the cut
means adding its id there and writing its component; nothing else.

Slide lengths are declared in **bars, not frames** (`SLIDE_BARS`), because step 8
puts a track underneath. A slide lasting a whole number of bars can land on the
beat; one lasting 87 frames never can. `Root.tsx` computes the composition's
duration with `calculateMetadata`, so a player missing a stat gets a shorter
video rather than a gap.

Three rules worth not breaking:

- **One transition, reused everywhere.** `SlideShell` is it. The ground, texture
  and signature still live in `Wrapped.tsx` above the `<Series>` and still never
  *move* between slides — but their colour now changes on every cut, and that
  change is a hard snap rather than a transition. A per-slide *effect* is, in the
  plan's words, the clearest tell of an assembled video; one palette cycle
  applied identically to every slide is the opposite of that.
- **Four slides are centred; the rest are left-aligned.** Best game, worst game,
  highest score and the record are the ones that are a *verdict* about a single
  game — a claim, its cover and its record — and a verdict reads as one thing
  stacked down the middle rather than as a column of facts. `SafeArea`'s `align`
  centres the text; `Stack`'s new `align` is what centres a cover, which is a
  block of its own width and would otherwise stay hard against the left margin.

  **The aside stays where it is.** It is a sibling of the slide component under
  `SlideShell` rather than a child, so it inherits none of this — which is the
  reason it could be centred without touching twenty other things.

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

### Where the time went is a different list

`topFiveByTime` is the companion to `timePlayed`, and the reason it earns a
slide rather than a line: **the games that took the most time are usually not
the ones played most often.** For Tina in 2026 the time list leads with
Terraforming Mars (8.0 h over four plays) while the play count leads with
Faraway (21 plays). That contrast is the whole point, which is why it is drawn
in exactly the same shape as the top five — shown any other way it would read as
two unrelated facts rather than the same year counted two ways.

- **`CountdownList` is shared.** The motion is the recognisable part of that
  slide — five to one, filling upward, first place landing last on a plate — and
  two copies would drift apart the first time either was touched. The heading
  and the number on the right are all either slide passes in.
- **Both read the same aggregation.** `estimatedTime` returns the per-game
  minutes and is used by both, so they cannot disagree about where the time
  went — and, more importantly, they answer the coverage question the same way.
  A "top five by time" appearing while the honest total was suppressed would be
  the same estimate carrying *less* of a caveat, not more.
- **Two games at minimum**, for the same reason the play-count top five needs
  two: a top five of one game is `timePlayed`'s own `topGame` again, at greater
  length.
- **It is the one countdown that centres, and the one with no line.** Both
  lists are the same fixed height whatever the numbers say, so there is nothing
  for the bottom anchor to earn. It briefly carried the play-count five's
  remark in this slide's unit — "Five games, and 26% of your time at the
  table" — which was a third way of saying what the five durations beside the
  games already say.

  Losing it moves the list **down** about 205px, because `SafeArea` stops
  reserving `QUIP_BAND` at the foot of the frame and centres in the taller box.
  That is the right direction: bottom-anchored with the band reserved, the
  play-count list's top sits at `1389 - h`, and this one centred in the full
  frame sits at `960 - h/2`. Those meet at h = 858 and stay within about 90px
  of each other across every height these five rows can take — closer than the
  ~180px the reserved version was out by. The play-count list is still
  bottom-anchored like every other slide.
- **It is a linked pair with `timePlayed`.** "114 h at the table", then *"And
  this is where it went…"*. The bridging line only works with that number still
  on screen behind it, so `LINKED_PAIRS` keeps the two adjacent and
  `PAIRED_LEAD_INS` supplies the line. There is also a plain `LEAD_INS` entry
  for when the time slide is not in the cut, so the line can never point back at
  a number nobody was shown.

The default cut is now **54 bars, about 108 seconds** at 120 BPM. It was 34
bars and ten stat slides; every module except `groupShare` is now on by
default, so the video is the whole year rather than a sample of it.

### Estimated time played

`timePlayed` is the one stat that is inferred rather than measured, so it says
so: the slide's eyebrow reads "Roughly this long at the table". The caption used
to name the method as well — "· estimated from how long these games take" — and
saying it twice in one block was one caveat too many for a slide that is still
only claiming "about". The eyebrow is where that honesty lives now, so leave it
alone.

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
All 19 show their most-played record, checked against a re-derivation of the
boards rather than trusted from the ranking code.

#### The slide carries one caption, and it is the other records

It used to carry two: *"the highest of 12 players - over 21 plays"* under the
number, and *"and the best score in 3 other games"* in the accent a beat below
that. The first is gone and the second took its slot and its muted style - a
footnote to a footnote is not where the interesting line belongs.

Two things followed from that removal, and neither is optional:

- **The quip stopped counting the other records.** With that line promoted to
  the caption, `And 3 more where that came from.` was the same figure twice.
  The `>= 5` branch keeps the flourish without the number and the `>= 1` branch
  is gone.
- **`highestWins` had to resurface somewhere.** Eight of the 229 games are
  lowest-wins, and the caption was the only thing on the slide saying so - a
  low number reads as a bad one without it. It is now the quip's first branch,
  ahead of everything else, because a misread number is a failed slide where a
  missing flourish is not. `contenders` moved up with it for the same reason:
  the quip is the only place either can still be said.

Both are still on the stat and in the StatsInspector; only the slide stopped
showing them.

### `highestScore` prefers a score you actually won with

A winning score beats a losing one **however much smaller it is**, and the
losing high score is only the answer when there is no winning one at all. A big
number in a game you lost is a fact about the scoring rather than about you:
plenty of games hand points to everyone, and in some the loser outscores the
winner on a subtotal.

Measured on the real export: **10 of the top 20 players change**, and all 20
now show a score they won with. Tina's was 66,000 in La Cosa Nostra — a game
she lost — and is now 466 in La Cuenta. The old rule reliably picked whichever
game had the biggest numbers rather than her best night.

`won` travels on the stat so the slide can say which of the two it is showing:
**"Best winning score"** or **"Highest score"**. One label for two different
claims would make the honest case sound like the boast.

It still does **not** read `highestWins`, and that is deliberate: "highest
score" means the largest number, which is what the slide says. `gameRecord` is
the stat where best has to mean best.

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

### Slides are selectable, orderable **and timeable**

**Every slide's length is set in the picker, in bars.** `SLIDE_BARS` is now the
default rather than the answer: `SlideBarOverrides` is a sparse map of the ones
someone changed, and it travels with the cut everywhere the cut goes — session
storage, the Player's `inputProps`, `POST /render`, and every item in a batch.

- **Bars, not seconds**, for the same reason the table is: the video is cut to a
  track, and a slide lasting a whole number of bars lands on a downbeat where
  one lasting 3.4 seconds never can. The seconds it works out to depend on the
  tempo, which is why they are not what you set — the readout under the player
  says what the whole video came to.
- **The override replaces the content length, not the total.** A slide with a
  lead-in still gets its extra bar, so setting a length means the same amount of
  content time wherever the slide happens to sit.
- **Sparse on purpose.** Storing every slide's length would freeze today's
  defaults into everyone's session, and a later change to `SLIDE_BARS` would
  reach nobody who had ever opened the app. Setting a slide back to its default
  removes the entry rather than writing the default into it — which is also what
  clicking the number does.
- **`clampBars` is a boundary, not a convenience.** These values arrive from
  localStorage and from an HTTP body as much as from a stepper. A fractional
  length would put every cut after it off the beat and a huge one would hang a
  render, so `parseBarOverrides` is shared by the session loader and the render
  route.
- **The bookends are timeable too**, even though they are not part of the
  selection and never move. The outro is the one people most often want longer,
  because it is the screenshot.
- **`Root.tsx` uses the same overrides in `calculateMetadata`** as the component
  does. A composition whose declared length disagreed with the timeline the
  component lays out would cut the last slide short — and only in a render, not
  in the preview.

### Slides are selectable **and orderable**

All 27 stat modules have slide components. The UI holds an **ordered
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

**The folder button is always on screen.** It used to appear only once a render
had finished, which put it halfway through a workflow where nobody knew it
existed — and "where do my videos go" is a question people have *before* they
have any. With nothing to reveal it opens the output folder instead, creating it
if this is the first time anyone has asked.

### "Show in folder" needs the quotes in the right place

`explorer.exe` wants `/select,"C:\path with spaces\file.mp4"` — quotes around
the path, never around the whole argument. Node quotes any argument containing a
space, so the array form `['/select,' + target]` reaches Windows as
`"/select,C:\path with spaces\file.mp4"`, which explorer does not parse: it
opens the default folder, or nothing, and reports no error. **Both output
folders have a space in them** — `Board Game Wrapped` in the desktop build,
`Boardgame wrapped` in this checkout — so the button was broken everywhere
rather than in an edge case. `windowsVerbatimArguments` hands the command line
over unquoted, so the quotes written in `revealInFolder` are the only ones
there are.

Two things went with it, because a button that fails in silence is the hardest
kind to report:

- **The guard is `path.relative`, not `startsWith`.** `startsWith` also matched a
  sibling folder whose name merely began the same way, and it compared
  case-sensitively, which on Windows makes `C:\Users` and `c:\users` two
  different places. `isInside` is pure and tested.
- **A refusal is a 409 with the reason**, shown in the panel. The route used to
  answer `{ opened: true }` whatever happened, so a file rendered before the
  output folder was changed looked exactly like a working button. A file that
  has been moved since it was rendered now opens its folder rather than nothing.

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

  **Its layout is derived, not tuned.** It used to size itself from the theme's
  four-step scale — `display * 0.3` for the range, `display * 0.34` for the
  name — which works while every theme's display step is around 300. Neon
  Night's is 340, and the card ran 240px past its own frame: the year was cut
  off the top and the bottom row of covers lost its titles. A square has no
  scrollbar and a still has no later frame to correct itself on, so anything
  that does not fit is simply gone.

  `squareLayout()` is the arithmetic. Type sizes are fixed px, because a 1080
  square is a fixed canvas; the **cover size is computed from what the header
  leaves**, because the header is three to five lines depending on whether this
  player earned a fourth fact and a superlative, and one fixed cover size cannot
  serve both. [square.test.ts](src/video/__tests__/square.test.ts) checks every
  combination of those optional lines fits.
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
  think about it and one change covers every one of them.

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
  context `Wrapped` provides, rather than every one of the slides having
  to pass a flag down. It is reserved rather than measured: measuring text needs
  two passes, and Remotion renders each frame once.

### The bookends slide is three rows, not two and a decoration

"Started the year with / Ended it with" was two covers and a torn calendar, and
next to slides that all lead with a figure it read as the one with nothing to
say. Adding the span helped and was still wrong: set loose on the frame, the
line under the tear was indented from nothing and aligned to nothing — the one
piece of text on the slide that belonged to no row.

**The calendar now sits in the same two columns the rows use**: the tear where a
cover would be, the span where a game's name would be. The slide reads as three
rows — a game, the gap, a game — and everything lines up because everything is
in the same grid.

- **The span is said once, in the unit a person lives in** — weeks up to a
  season, then months. It was briefly a display figure ("236 days") with that
  line under it, which put a third number on a slide whose whole point is the
  two dates already on it, and made the middle row taller than the two it
  divides. Nobody counts 236 days; everybody knows how long eight months is.
- **It is fitted to the column, not the frame.** `Eyebrow` and `fitBlock` both
  take a `width`. At full size "Started the year with" wrapped onto two lines
  and pushed the date out from under it.
- **The rows arrive from opposite sides.** One opened the year and one closed
  it; sliding in from the same side made them read as two items in a list.
- **It has a quip now**, which is what the slide was really missing — a remark
  rather than a second reading of the same number. The best case costs nothing
  to check: if the first game and the last are the same game, it says so, and
  "You opened and closed with Faraway. Full circle." is a better line than any
  number the slide is already showing. Otherwise it reaches for what happened in
  between — the distinct games, or the nights. Under a week apart it says
  nothing at all.

### The outro's fourth fact

[src/stats/outroFact.ts](src/stats/outroFact.ts) adds one line under
"233 plays · 71 games · 73 nights". The rule it is written to: **it has to add
an axis those three do not have.** Plays, games and nights are one thing seen
three ways — how often, how varied, how many evenings — so a fourth count of the
same kind reads as a rounding of the first three.

Candidates in order: hours (a different unit), people (the only social fact),
win rate (the only one saying how it *went*), place. `gamesLearned` is
deliberately excluded — "34 new games" beside "71 games" is the same axis twice
and invites arithmetic the card cannot support. A test asserts the line never
contains "plays", "games" or "nights", or any of the three numbers.

The square carries the same line, because two cards claiming different things
about one year is worse than either.

### The superlative may not repeat what the card already shows

"504 plays. Never off the table." printed directly under "504 plays · 106
games · 180 nights" is the same number twice, and the second time it reads as
filler rather than as a distinction. So `superlativeFor` takes
`{ avoid: SuperlativeQuantity[] }`, and the outro passes plays, games, nights,
hours **and whatever quantity its own fourth fact just used** — otherwise
"Played with 60 different people." can land under "with 60 people".

Only claims that *state a number of* something carry a `quantity` tag:
`marathon` (plays), `explorer` (games), `social` (people). `loyalist`
("Half the year was Faraway") names a game rather than counting any, and
`nightOwl` ("46% of games began after dark") is built on the hour, not on a
count — tagging those would delete good lines for no gain.

### Two tiers, so nobody gets a blank

Excluding those quantities used to leave players with nothing, because their
only distinction *was* a count of plays or games. So `superlativeFor` has a
second tier below the earned claims:

- **Earned** — clears a 90th-percentile threshold. Still hard to get, still
  scored, still ranked against the others. 8 of 93 players.
- **Fallback** — not a claim at all, just something true and specific: what
  they were best at, what they came back to, who they sat across from. Scored
  `0`, so it is never ranked against a real claim. 85 of 93.

**0 of 93 players get a blank line now.** The spread: `favourite` 36,
`partner` 24, `bestAt` 22, then the eight earned ones.

Two details that keep the fallbacks honest, both found by reading the output
rather than the code:

- **`bestGame` is the best of *their* games, which is often still a losing
  one.** "Hardest to beat at X" is only said at a 50% record or better;
  below that it is "Your best record was at X".
- **"Almost always across the table from X" was false for most people it fired
  for.** Somebody who played five games with five different people has a top
  co-player they sat with once. The wording now follows the share, dropping to
  "More games with X than anyone else" under 60%.

`favourite` sits above `partner` for spread as much as for interest: without
that, two thirds of a batch ended on the same sentence with only the name
changed.

### The quips are data, not filler

[src/stats/quips.ts](src/stats/quips.ts) is a pure `quipFor(slideId, stats)`.
Every line is derived from the number it sits under — "That is 4.5 a week. Every
week.", "You could have watched all of Lord of the Rings 9 times." — so it is a
remark about *this* year rather than something that would fit anyone's. A
generic quip under a specific number makes the number feel generic too.

It returns `null` freely, and that is the important half: a slide with no line
is better than a slide with a limp one.

**`coPlayerCount` is the one exception, and for a layout reason rather than a
copy one.** A slide with an aside gives up `QUIP_BAND` of height for it; with
no line the content drops to the foot of the frame, so "People played with" sat
in a visibly different place depending on how many people somebody had played
with — a number they have no control over. It now has four tiers covering every
count the slide can be shown for (the stat is null for a solo-only year, so the
count is always at least 1), and the line it always had above ten is unchanged. Small numbers get nothing (`gamesLearned`
under 4, `busiestDay` under 4, a top five with fewer than five games), a co-op-only
year gets no win-rate joke, and the bookends never get one at all — they have no
number to remark on. Thresholds are asserted in
[quips.test.ts](src/stats/__tests__/quips.test.ts).

#### The top game says a percentile, and the pool is the export

The line under the most-played slide is Wrapped's own move: **"You were in the
top 17% of everyone who played it this year."** It replaced "Once every 11 days,
on average", which was a restatement of the play count in another unit — true,
but it told nobody anything the number above it had not already said.

`standingIn` in [core.ts](src/stats/modules/core.ts) computes it and the result
travels on the stat as `standing: { rank, players }`; `topGameShare` in
`quips.ts` turns it into the percentage. The stats layer ranks, the quip layer
words it — `quipFor` only ever gets `WrappedStats` and has no way to reach the
dataset, which is what forces the split and is the right side of the line
anyway.

Four things keep the claim honest:

- **The pool is everyone in *this export* who played the game in range** — the
  group's table, not the world's. Spotify can say "top 0.5% of listeners"
  because it has every listener; BG Stats has the plays it was handed and
  nothing else. So the line says "everyone who played it", which is true of the
  data it is built from, and it does not say "players of this game", which
  would not be.
- **It rounds up.** A rank of 2 in 12 is 16.7%, and "top 16%" claims a place
  nobody reached. Rounding down is the direction that lies.
- **Ties share a rank.** Two people on twenty plays are both second if one
  person has more — the alternative is a percentile decided alphabetically.
- **Below `MIN_STANDING_POOL` (5) there is no percentage.** The problem at four
  is granularity, not sample size: every step is a quarter of the field, so
  first place reads as "top 25%", which sounds like a worse result than it is.
  Those slides fall back to the old rate line rather than going silent.
- **It names the period, and the period is measured.** `rangePhrase` ends the
  sentence, from the dates rather than from `rangeLabel` — the label is
  renameable, and a phrase built from a name somebody typed is not a phrase
  about time.

  **"This year" means a calendar year and nothing else.** September to
  September is twelve months long, but nobody calls it "this year": it is the
  last twelve months, and that is what it says. The same rule one unit down —
  "this month" is the first to the last of one month, and a span that merely
  happens to be about a month long is counted in weeks. Everything else is
  "in the last N ...", in the largest unit that does not round to one.

  **Twelve months is the last month counted in months.** Past it the phrase is
  years, rounded to the nearest — eighteen months is two years, thirteen is
  one — because "in the last 19 months" is arithmetic rather than a period.
  One year is said without the numeral ("in the last year"), so the sentence
  can never land on "in the last 1 months" or "in the last 1 year". A test
  sweeps 1200 consecutive spans checking exactly that.

Above `MAX_STANDING_SHARE` (50%) it says nothing either — "top 67%" is not a
compliment. Measured on the real export: of 93 players, **36 get a percentage,
5 get the rate and 52 get no line at all**, the last because their top game has
under three plays and always did.

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

**A headline fills the box it is given — width *and* height.** `fitBlock` is
the fitter; `fitText` is now a thin call into it. Filling the measure was only
half a rule: "Flip 7" is six characters over two words, so a width fitter is
delighted to set it at nearly 300px across two lines, and two lines at 300px is
600px of frame on a slide that has already spent 740 of it on a cover. That
pushed the cover off the top of the frame and the play count down into the
aside — both of which the most-played slide really did. `fitBlock` tries every
line count it is allowed and keeps the best: more lines buy width and cost
height, and which way the trade falls depends on the string.

**Every slide that stacks a cover above its type passes a `maxHeight`.**
`useSpareHeight(fixed)` is the one place the arithmetic lives: the frame, less
the margins, less the band the aside has already taken, less `SLIDE_TOP_AIR`
(56) and whatever the slide states as fixed. What comes back is the budget for
the one element allowed to grow.

Three slides need it — most played, the record, and best/worst. Content is
anchored to the bottom of its box, so anything that does not fit spills off the
*top*, and on those slides the top is the cover, or the heading above it. It was
Blueprint and Meeple that exposed it, but it turned out to be true of most
themes once anyone looked.

A budget is only as good as its terms, and two were missing:

- **Captions wrap, and a wrapped caption takes a line nobody budgeted for.**
  `linesFor` counts them for real. "the highest of 12 players · over 21 plays"
  is two lines in most of the body faces here and one in the narrowest, and
  a game's name can be 56 characters.
- **`fitBlock` assumed the words pack into their lines perfectly.** A browser
  wraps greedily, and greedy wrapping wastes whatever is left at the end of each
  line — so a size that fits "two lines' worth of measure" can still need three.
  "You win most at" was set as "You / win / most at" at a size budgeted for two
  lines, which is half again the height. `linesAt` now counts the wrap the way
  the browser will, and `fitBlock` steps the size down until the text genuinely
  fits. It is exported and tested: the wrapping is the part worth checking, and
  the only part of it needing a browser is the measurement handed in.

**And the measurement had to match how a headline is actually laid out.**
`KineticWords` sets every word as an `inline-block` with a `KINETIC_WORD_GAP`
(0.26em) right margin, so no whitespace survives between words and that margin
*is* the space. Measuring the string as one run uses the font's own space glyph,
which is narrower — the gap between "fits on two lines" and "is set on three"
was exactly that difference. `Headline` measures word by word and adds the gap.

Checked by rendering the three slides in all nine starters and scanning each
frame for the topmost row holding content: 27 of 27 now clear the safe margin,
where 13 did not.

**A display number never wraps, and every one of them is sized against its own
string.** `whiteSpace: nowrap` is the backstop; `fit` is the fix. The formatted
value is wider than its digits and only the caller knows by how much — "114 h"
is five characters where "114" is three, and at the full display step the
difference was a line break that put the unit under the figure. Every
`StatBlock` now passes `fit`, not just the one that overflowed first: a
four-digit play count would have been the next.

**A headline fills the width it is given.** `fitText` is unchanged — it still
returns the largest size that fits — but `Headline` hands it the *display* step
as a ceiling rather than the headline step. A short name was the case that
showed why: "Tina" at 132px is four characters in the middle of a 1080px frame
with two thirds of the line empty, which reads as a caption that lost its
paragraph. At the display ceiling it fills the measure. A long game title is
unaffected: the measure decides its size, and that has not moved. The ceiling
stops at the display step because the number is still meant to be the largest
thing in the video.

**Text is measured, not estimated.** One constant — 0.56em per character —
covered every display face while every face was roughly one width. It stopped
being true the moment Neon Night took Archivo at 125%, and it broke outright
when Syne and Outfit arrived: a headline in Syne Extrabold is half again as wide
as the guess. Worse, `randomTheme` picks a display face at random, so *any* face
being wrong made random themes unreliable rather than just the two.

[measure.ts](src/video/measure.ts) measures instead. `measureText` on a 2D
canvas is synchronous — no layout pass, no second render — which is what makes
it usable somewhere that renders each frame exactly once. `fitBlock`,
`fitDisplay` and `fitLabel` all take a `Measure`, and the per-character estimate
survives only as the fallback for a unit test with no canvas.

Three details are load-bearing, and all three were found by rendering:

- **Digits are measured as the widest digit.** `measureText` knows nothing about
  `font-variant-numeric`, and every number in this video is tabular — a figure
  that changes width while it counts up is worse than one slightly too big. In a
  face with a narrow 1, measuring the proportional figures understated a score
  by enough to run it off the frame.
- **The face is checked with `document.fonts.check` first.** `FontLoader` holds
  the first frame until the theme's faces have loaded, so in practice it is
  always ready — but the failure it guards against is silent. Chrome measures
  whatever it fell back to, the number looks perfectly reasonable, and
  everything is mis-sized by however much the fallback differs.
- **The fallback guesses wide** (0.78em), not at the old 0.56. Understating is
  the direction that runs type off the frame; a fit that comes out slightly
  small is a slide nobody notices.

Tracking, `font-stretch` and `text-transform: uppercase` are all folded in,
because they are part of the font *choice* rather than decoration on it —
`inter-tracked` is Inter set uppercase at 0.16em, and measuring plain lowercase
Inter understates it by a fifth. Letter-spacing set by a component is
deliberately *not* subtracted: it is always negative there, so ignoring it
rounds toward a smaller fit.

**Slide content is anchored to the bottom of its box, not centred in it.**
Centred, a short stat block floated in the middle of the frame with a third of
the card empty above it and a third below — which is what made a slide look like
a slide rather than a card. Anchored low, every slide starts from the same line
whatever its height, and a tall one grows upward.

That is also why **`QUIP_BAND` went from 350 to 411**. The reservation always
included 40px of air, but while content was centred in what was left, the gap
you saw was half the slack rather than the reservation. Now the margin *is* the
gap: at 40 the last row of the co-player list sat directly on the aside.

**The label above a stat is a heading, not a footnote.** `Eyebrow` was set at
the caption step, which lost it the argument with the figure underneath:
"Longest win streak" at 30px below a 300px number reads as an annotation on the
number, and anyone who missed it is left with a large 4 and nothing saying what
it counts. It is now `LABEL_SCALE` (1.6x caption, just above the body step) and
set in `ink` rather than `inkMuted`. It is still unmistakably a label — every
utility face is uppercase and tracked, and the display step is six times its
size — but it is read first, which is the order the slide is meant to be read
in.

`fitLabel` shrinks a label that would overrun the safe width, because a heading
that wrapped would push the number down the frame by an amount that depended on
how long the label happened to be: the same slide would sit in two places for
two different players. Its floor is the caption step, so making labels bigger
cannot make one smaller. Nothing in the video reaches either bound — the longest
is "You hold the record in", which fits on one line at full size.

The two chip labels on the win-rate slide moved up with it, to 1.1x caption.
"Won" and "lost" are what say which pile is which on the one slide whose subject
is the comparison. The axis note beside them stayed small: it is a footnote to
the drawing, and at any larger size the three no longer fit on one row.

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
directly before. "Played with" counts the people, "Played most with" names one
of them, and between them goes *"But one of them was at the table more than
anyone…"*. Back to back they are two halves of one thought.

**The most-played slide takes the losing record as its cue.** The default cut
runs best game, worst game, most played, and `topGame`'s plain line — *"One game
more than any other…"* — said nothing about either verdict: it landed a bar
after a slide about losing as if that had not happened. After `worstGame` it now
reads *"Win or lose, one game more than any other…"*, which answers both slides
at once and hands over to the count. That is the turn the video is making there,
from how it went to how much of it there was.

Paired rather than plain, for the usual reason: the worst-game slide is optional
and its module returns null for a coop-only year, so the connective would
otherwise point back at a slide nobody was shown. `LEAD_INS.topGame` still runs
in that case, and both branches return a line, so the slide's length cannot
depend on which one it got.

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

**The most-played slide is two bars.** Eight seconds is a long time to hold one
cover and one number, and it read as finished well before it cut; it went to
three, then to one — and one was a bar too far. Two seconds is not long enough
to look at the largest single image in the video, which is the whole reason
this slide is drawn the way it is. The lead-in line still buys it a bar of
anticipation before the cover lands, and it is still the shortest stat slide in
the cut. The outro keeps its four: that one is the screenshot, and it has to
sit still long enough to take one.

**The top five is two bars and the record holder is two.** The countdown still
lands five to one and still holds the finished list, and at three the record
was the longest slide in a run of verdicts that all read at the same pace.

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

### A player can be renamed for the video

The name in the export is whatever somebody typed when they first added a
player, and `stats.playerName` is the single value the intro slide, the square
and the **output filename** all read. So the override is applied in
`buildWrappedStats` — a fifth, optional `displayName` — rather than at the call
sites. Two callers each remembering to override it is two places to forget, and
the failure mode is a batch that renames the video but writes the file under
the old name.

[playerNames.ts](src/app/state/playerNames.ts) is the pure half.

- **Sparse, and an empty field clears.** An entry exists only where somebody
  typed one, exactly like `bars`.
- **The field is stored verbatim; only the *use* is trimmed.** `setPlayerName`
  runs on every keystroke, so trimming there deleted a trailing space the
  instant it was typed and the box fought anybody writing two words. `rawFor`
  is what the input is handed back — the one accessor that does not trim, so
  the caret cannot jump — and `overrideFor` is the boundary everything else
  goes through. A field holding only spaces is somebody mid-word: it persists,
  and `overrideFor` answers null, so a half-typed name can never reach a video
  or a filename. This is also why there are two caps: `MAX_PLAYER_NAME` (60)
  bounds the trimmed name, `MAX_PLAYER_NAME_RAW` (200) bounds what is stored.
- **The real name is the placeholder, never the value.** Seeding the field with
  it would make every player look renamed, and there would be no way back to
  the export's name short of deleting the exact string.
- **Typing the name that was already there is not a rename.** `isRenamed`
  compares, so the list never shows `Tina (Tina)`.
- **Keys are strings.** `Record<number, string>` is a type that lies about what
  survives a round trip through `localStorage`.
- **The session version was *not* bumped.** A bump makes `parseSession` fall
  back to defaults, which would discard every stored slide arrangement to
  introduce a field that defaults to `{}`. A purely additive field needs none;
  bump it only when an existing field changes meaning.

Both lists show `Name (Override)`, but only the player picker has the field —
the batch list is read-only, because two places to type one name is one too
many.

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

**All twelve steps are done.** 704 passing tests, and it packages as a Windows app. The plan is complete: ingest, a 27-module stats
engine, box art, four theme modes, twenty-five slides, a soundtrack the video is cut
to, a single-screen control surface, single and batch rendering, and the polish
pass.

Nothing in the plan remains. Natural next moves, none of them specified:
per-player audio, a landscape cut (the plan forbids one), or moving the stats
engine server-side so a batch does not need a browser tab open.

Known gaps left deliberately:

- **Eight modules are off by default.** `groupShare` (nights attended) is computed
  and shown in the StatsInspector but is not in `DEFAULT_CUT`, because the plays
  slide already counts nights. It has a real slide and a length in `SLIDE_BARS`;
  adding it is a one-line change. The seven credit slides are the others - they
  need a prefetch the rest of the engine does not, and switching every list on
  would put seven countdowns in a row.
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
- A **one-play player still gets the full cut**, including a "top five"
  showing one game. It is coherent and never breaks, but step 12's polish pass
  should consider a shorter cut when `stats.thin` is true.

## The desktop build

`npm run app:build` produces a Windows installer. The shape of it:

| Piece | What it is |
|---|---|
| [electron/main.cjs](electron/main.cjs) | Picks a free port, spawns the service, points a window at it |
| [scripts/build-server.ts](scripts/build-server.ts) | esbuild bundles `server/index.ts` → `build/server.cjs` |
| [scripts/build-app.ts](scripts/build-app.ts) | UI → service → electron-builder, and says where the .exe went |
| `build` field in package.json | electron-builder config |

**The packaged app runs the same server the dev script does.** It is not a
reimplementation — the shell starts `build/server.cjs`, which is
`server/index.ts` with its imports resolved. There is no second code path, so
there is no class of bug that only appears in the .exe.

Six things here are load-bearing:

- **`asar: false`.** Remotion's `bundle()` runs webpack at *render* time, and
  webpack resolves modules by walking real directories. Inside an asar archive
  it does not find them, and the failure surfaces on the first render rather
  than at build time. This is also why `src/**` ships: the composition is
  compiled from source when a render starts.
- **The service is spawned, not imported.** `process.execPath` with
  `ELECTRON_RUN_AS_NODE=1` is Electron acting as Node, so the app needs no
  system Node — and a service that dies cannot take the window with it.
- **Quitting asks before it kills.** `child.kill()` does end the service — on
  Windows it terminates unconditionally — but the headless Chrome a render opens
  is a child of the *service*, and **Windows does not cascade a kill down the
  process tree**. Quitting mid-render left twelve `chrome-headless-shell`
  processes behind, holding a few hundred megabytes until somebody found them in
  Task Manager.

  So `stopServer` posts to `/shutdown` first, waits for the exit, and only then
  runs `taskkill /T /F`. It has to be an HTTP call and not a signal: **Windows
  delivers no SIGTERM**, so a `process.on('SIGTERM')` handler in the service
  would never run — it is there for `npm run server` and for the other two
  platforms, not for the app. `before-quit` defers the exit with
  `preventDefault` and finishes with `app.exit`, which skips the quit events and
  so cannot re-enter itself.

  Measured: 12 browser processes during a render, 0 after the shutdown call, and
  the port released. The `taskkill` branch is the untested one — it only runs
  for a service too wedged to answer, which is exactly when its children need
  collecting anyway.
- **The port is stable across launches, and that is a correctness rule, not a
  convenience.** It was `listen(0)` — any free port — on the reasoning that a
  hardcoded 4000 collides with `npm run server` in a checkout. That reasoning
  is right and the conclusion was wrong: **a page's origin includes its port**,
  and `localStorage` is partitioned by origin. A new port every launch is a new
  origin every launch, so the slide arrangement, the theme and the whole
  session were not lost *on update* — they were lost on **every start**, with
  the previous ones stranded in the profile under origins nothing would load
  again. Measured before the fix: eight distinct `http://127.0.0.1:<port>`
  origins in one Local Storage database.

  `choosePort` now prefers the port used last time, falls back to a fixed
  `DEFAULT_PORT` (47615 — far enough from 4000 that a checkout cannot take it),
  and only then takes what it is given. All three are written to `port.json` in
  `userData`, so even the unlucky path is a one-off rather than a new origin
  every time. **A checkout deliberately remembers nothing**: `npm run app:start`
  is a development run and must not squat on the installed copy's port.

  This is also why the app takes a **single-instance lock**. Two copies cannot
  both hold one port, and the loser falls back to a random one — which presents
  as exactly the state loss the stable port exists to prevent.
- **`/api` is rewritten in the server itself.** Vite's proxy does this in dev;
  packaged there is no Vite, so `server/index.ts` strips the prefix at the top
  of the middleware stack. The alternative was registering every route twice.
- **`copyPublicDir: false`.** Vite would copy 133 MB of box art into `dist/`,
  and — worse than the size — a cover downloaded *after* the build would land in
  `public/` where the stale `dist/` copy shadowed it. The packaged server serves
  `public/` directly, ahead of `dist/`, so it is always current.
- **The output folder is settable, and read fresh on every render.**
  [server/settings.ts](server/settings.ts) owns it, persisted to
  `settings.json` beside the user's other data. `render.ts` calls
  `getOutDir()` inside the job rather than capturing a constant at import —
  a captured value would keep writing to the old folder until the service was
  restarted, which is the kind of bug that looks like the setting silently not
  working. Setting a folder creates it *and writes a probe file*: a path that
  looks fine and turns out to be read-only should fail now, not after two
  minutes of rendering. `revealInFolder`'s escape guard reads the same
  function, so it still refuses anything outside the current output folder.
- **The folder picker is the only privileged thing the UI can do.**
  [electron/preload.cjs](electron/preload.cjs) exposes exactly one function over
  `contextBridge`. A browser cannot hand a page a filesystem path — that is a
  deliberate rule, not an oversight — so in dev the field is typed into and the
  **Choose…** button is simply absent. `window.bgw?.chooseFolder` being
  optional is what makes one component work in both.
- **Nothing the user accumulates lives in the install directory.**
  `BGW_OUT_DIR` sends renders to `Videos\Board Game Wrapped` and
  `BGW_PUBLIC_DIR` sends covers, audio and fonts to
  `%APPDATA%\boardgame-wrapped\public`. An update is entitled to replace the
  program's own files, so a 110 MB cover cache beside the .exe is a cache every
  update destroys, and an uploaded track there is a track the user loses.
  `bundle({ publicDir })` has to be given the same directory — `staticFile()`
  resolves against it, and a disagreement means covers present in the preview
  and missing from the render. The shipped fonts are copied into it on first
  run, because those ship with the app but are read through `staticFile`.

### Updating

`electron-updater` checks GitHub Releases on startup, downloads in the
background and installs on quit. `.github/workflows/release.yml` builds and
uploads a **draft** release when a `v*` tag is pushed.

- **Releases, not pushes.** Only a release carries an installer, and the draft
  step means a bad build can be deleted rather than shipped.
- **`electron-updater` is a `dependency`, not a devDependency.** electron-builder
  ships only production dependencies, so as a devDependency it is absent from
  the packaged app and the update check silently never runs.
- **The repo is public, and that is what makes this work at all.** A private
  repo answers 404 unauthenticated, the updater swallows it, and the check
  silently never succeeds. Reading a private repo would mean embedding a
  GitHub token in a 169 MB installer handed to other people.
- **`app-update.yml` is written at install time, not read from the network.**
  Every installed copy points at whatever `publish` said when *its* installer
  was built. So moving releases to a different repo or a static host needs one
  manual reinstall on every machine; making this repo public was the only
  option that reached the copies already out there.

#### `createDesktopShortcut` must be `"always"`, not `true`

An update deletes the desktop shortcut and does not put it back. The old
uninstaller runs first and removes it; the new installer then skips creating it
because at `true` the NSIS script only creates a desktop shortcut on a *first*
install. The user is left with no icon, and Windows — still holding the .lnk in
its link-tracking state — answers a click with *"Verknüpfung wurde geändert"*
rather than anything that names the real problem.

`"always"` means "recreate on reinstall too", which is exactly the update case.
Confirmed on a real machine after the 0.2.1 → 0.2.2 update: the Start Menu
shortcut was intact and correct, the install directory held the new build, and
there was simply no Board Game Wrapped .lnk on the desktop at all.

It is self-healing rather than retroactive: the shortcut is written by the
*incoming* installer, so the first update that carries this flag puts the icon
back on every machine that takes it.

#### Updating says what it is doing

It used to say it in the **title bar** — the one part of a window nobody reads
— and said nothing whatsoever while a 169 MB installer came down. The first
sign most people had was the app restarting as a different version.

`electron/main.cjs` now keeps an `updateStatus` and pushes it to the page.
Four things are load-bearing:

- **The status is stored, not only pushed.** The check runs at startup and its
  first events fire before the page has mounted a listener. The renderer asks
  for the current state on mount (`bgw:update-state`) and subscribes for the
  rest, so it can never miss the state it arrived in.
- **A quiet result stays quiet, unless somebody asked.** `describeUpdate` takes
  a `manual` flag. An automatic check finding nothing must say nothing — a bar
  reading "up to date" on every launch is a notification attached to a
  non-event — while the same result behind a button has to answer or the button
  looks broken. Same for a failed check: unreachable GitHub is not a problem a
  local video tool raises on its own.
- **Nothing installs itself, ever.** `autoInstallOnAppQuit` is off — it listens
  for the `quit` event, which `stopServer`'s `app.exit(0)` does not emit, so it
  only ever promised an install that never ran — and the quit path no longer
  installs either. `quitAndInstall` has exactly one caller: the
  `bgw:install-update` handler behind the **Restart and update** button.
- **The service is stopped before the installer is spawned.** NSIS is about to
  overwrite the directory the render service is running out of, and a headless
  Chrome still holding files in there is how an update half-applies.

#### Three surfaces, and they escalate

[UpdateSurface.tsx](src/app/components/UpdateSurface.tsx) holds the one
subscription and picks between them. Three components listening to the same IPC
channel would be three things that could disagree about where the update had
got to, and the last of the three is a screen the other two must not be
rendering behind.

| State | Surface | Why that much |
|---|---|---|
| checking, downloading, up to date, failed | [UpdateBanner](src/app/components/UpdateBanner.tsx) — a strip | None of it asks anything, so none of it earns more than a line |
| downloaded | [UpdateDialog](src/app/components/UpdateDialog.tsx) — a modal | The only state that asks a question |
| installing | [UpdateScreen](src/app/components/UpdateScreen.tsx) — the whole window | The app is being taken apart underneath the page |

**A popup for the decision.** Downloading is news: an update *coming down* is
never urgent enough to throw a dialog over somebody's render. A **downloaded**
one is the exception, because it is the only update state that asks a question
rather than describing progress — and asked in a 14px line above a video
preview, it was routinely not read at all. Four things about the dialog are
deliberate:

- **`modal` is a field on `UpdateCopy`, not a check on the phase.** `ready` is
  the only state that sets it, and a test asserts the other five never do — a
  second phase raising a modal is exactly the "dialog over a half-configured
  video" the strip exists to avoid, and it would be a one-word change to cause.
- **"Later" means later, not never.** The dismissal is React state and nothing
  writes it anywhere, so the next launch that still finds an update waiting
  asks again. It is keyed by version rather than a boolean: dismissing 0.2.4 is
  not an answer about 0.2.5.
- **The dismissal drops back to the strip**, which still carries the button.
  Taking away every way to start the update until the next launch would be a
  worse answer than the one the user gave.
- **Native `<dialog>` with `showModal()`.** The focus trap, the top layer, the
  backdrop and Escape-to-close all come with it, and a hand-rolled overlay gets
  all four wrong quietly. `onClose` is the single dismissal path, so Escape and
  the button cannot disagree; `onCancel` is refused while the restart is in
  flight, where a dialog vanishing would read as a cancel.

**The trade this makes:** somebody who dismisses every time never updates. They
are asked on every launch, which is the design — but if silent updating matters
more than the prompt, restoring it is one call to `quitAndInstall` on the quit
path in [electron/main.cjs](electron/main.cjs), and the popup then only ever
returns after a crash or a failed install.

#### The restart takes the whole window

Pressing **Restart and update** used to be the last thing that visibly
happened. `stopServer` waits up to eight seconds for the service to unwind, and
longer with a render still going; then the window closed, NSIS ran silently,
and the app came back some time later on a different version. None of it was
reported, so the honest reading from outside was that the app had crashed.

The install now publishes a `step` alongside the phase — `stopping`,
`launching`, `failed` — and `UpdateScreen` renders it.

- **The app is replaced, not covered.** `UpdateSurface` wraps `<App/>` rather
  than sitting beside it, and stops rendering its children in this phase.
  Everything behind a full-screen message would be polling a render service
  that is already going down; a half-live control column under it is a worse
  thing to leave on screen than no control column.
- **`launching`'s detail line is the load-bearing copy**, and it is why the
  step exists at all. Once the installer has control there is no window of ours
  left to draw in, so the only thing that can be done about the silence is to
  say it is coming: *"will close while it updates, then open again on its own"*.
  A window that disappears after saying it will is an update; one that
  disappears in silence is a crash. A test asserts that line.
- **The bar is indeterminate.** NSIS reports nothing back to us. A bar that
  invented a percentage would be worse than one that only says something is
  still happening — and under `prefers-reduced-motion` it pulses in place
  rather than travelling, because "not stuck" is the whole message.
- **A step never survives its phase.** `setUpdateStatus` clears `step` on any
  patch that changes `phase` without naming one, so a screen cannot end up
  describing something that stopped happening.
- **The install stays silent, and that is a consequence of `oneClick: false`.**
  This is the assisted NSIS installer, so running it with its own UI would ask
  where to install and wait to be clicked through — not what "Restart and
  update" promised. `isForceRunAfter` is what brings the app back afterwards.
- **A failed install is undone, not just reported.** By that point the service
  has been stopped for an install that never happened, which leaves a UI
  talking to nothing: every poll fails and the window looks alive while being
  useless. `recoverFromFailedInstall` restarts the service, waits for
  `/health`, and only then says so — with a button back to the app rather than
  a spinner that never ends. `app.isQuitting` is cleared on that path too, or a
  service that later died for real would do it in silence.
- **`INSTALL_EXIT_MS` (10s) is a backstop, not the mechanism.**
  `quitAndInstall` spawns the installer and then quits us; if it ever did not,
  the window would sit on this screen forever while the installer waited for a
  process that was never going to let go of the directory.

### Two things that will bite

- **Building into `Documents` fails with `EPERM`.** electron-builder renames
  `win-unpacked.tmp`, and OneDrive holds a handle during the sync. Reproducible:
  `release/` inside this repo fails every time, the same build to `C:\tmp`
  succeeds. `build-app.ts` therefore writes to `~/BoardGameWrapped-build` by
  default; `BGW_RELEASE_DIR` overrides it.
- **`ELECTRON_RUN_AS_NODE` leaking into the parent** makes `require('electron')`
  return a string, and the shell dies on `app.isPackaged`. `build-app.ts` strips
  it from the environment it passes down for exactly this reason.

Measured: **633 MB unpacked, a 169 MB installer**, and a render from inside the
packaged app produced the same 20.5 MB file the CLI does, covers included, with
box art resolved from AppData. **The first render downloads Chrome Headless
Shell (113 MB), once** — Remotion fetches its own browser rather than using
Electron's.

It was 763 MB and 303 MB before `public/**` in the packaged `files` was narrowed
to `public/fonts/**`: the installer was carrying a 110 MB cover cache that the
app no longer reads from there.

**The SPA fallback must not answer for file-shaped paths.** `app.get('*')`
returning `index.html` gave a missing cover a page of HTML and `200 OK`, which
an `<img>` reports as a broken image with nothing in the log. Anything with an
extension now 404s.

## Repo gotchas

- **`boardgame-wrapped/boardgame-wrapped/` is a duplicate** of the entire
  scaffold, byte-for-byte, from a scaffolding accident. The real project is the
  outer directory. Never edit the nested copy; it should be deleted.
- This **is** a git repository now (`origin` is `DS1720/boardgame-wrapped`), so
  there is history to fall back on. It was not one for most of the build; older
  notes that say otherwise are out of date.
- `out/`, `public/boxart/*`, `public/audio/*`, `public/bgg/*` and `data/` are
  gitignored — generated output and personal data respectively. The credit
  manifest is derived data and rebuilds in under a minute.
- **Remotion bundles with its own webpack**, so the `@` alias is configured in
  three places: `tsconfig.json`, `vite.config.ts`/`vitest.config.ts`, and
  `Config.overrideWebpackConfig` in [remotion.config.ts](remotion.config.ts).
  A runtime `@/...` import inside `src/video` fails to bundle without the third.
  Type-only imports hide the problem, since they are stripped before webpack
  sees them.
