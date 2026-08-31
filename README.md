# Board Game Wrapped

Turns a [BG Stats](https://www.bgstatsapp.com/) JSON export into a personalized,
Spotify-Wrapped-style video — one per player, for any date range, cut to music
you choose.

**It runs entirely on your own machine.** No account, no upload, no server. Your
play data never leaves the computer it is on.

Output is mobile format: **1080 × 1920, 9:16, 30 fps**, about a minute and three
quarters at 120 BPM. Every render also writes a 1080 × 1080 square still beside
it, for the places a vertical video does not go.

---

## What it makes

Twenty stat modules, nineteen of them in the default cut, each one a slide:

| Slide | What it shows |
|---|---|
| **Total plays** | plays and game nights, with the count drawn beside the figure |
| **Time played** | estimated hours at the table, and the game that took the most of them |
| **Top five by time** | where the hours went, which is rarely where the plays went |
| **Win rate** | wins against losses, drawn as two stacks on the same scale |
| **Longest win streak** | link by link |
| **Best / worst game** | every play laid out as a won or lost marker |
| **Top game** | the most-played game, cover shown whole, and where you place among everyone in the export who played it |
| **Top five** | a countdown, five to one, first place landing last |
| **Highest score** | preferring a score you actually won with |
| **People played with** | drawn as people, counted in the theme's own hand |
| **Played most with** | the one who was there more than anyone |
| **Record holder** | a game where you hold the best score of anyone who played it |
| **Nemesis** | whoever beats you in the highest share of your head-to-head games |
| **Games learned** | the new ones, ordered by how much you played them afterwards |
| **Busiest day** | the one evening that piles up |
| **Night owl** | your most common starting hour, on a 24-hour ring |
| **First and last play** | how you opened the year and how you closed it |
| **Where you played** | a pin, and rings that keep going out |
| **Outro** | plays · games · nights, a fourth fact, and a superlative if the year earned one |

A twentieth — nights attended — is computed and available but off by default,
because the plays slide already counts nights.

Slides can be turned on and off, reordered by drag or arrow, and given their own
length. A stat a player does not have enough data for is shown **disabled rather
than hidden**, so "no nemesis slide" reads as a fact about their year rather
than a missing feature.

---

## Using it

### Install on Windows

```bash
npm install
npm run app:build
```

That prints where it put the installer — by default
`C:\Users\<you>\BoardGameWrapped-build\Board Game Wrapped Setup <version>.exe`.
Run it and it installs like any other Windows app: Start menu entry, desktop
shortcut, its own window, uninstaller in Settings.

**You do not need Node installed to run it.** The app carries its own. Node is
only needed on the machine that *builds* it.

- **It installs for your user, not the whole machine**, so there is no admin
  prompt.
- **Nothing you accumulate lives in the install folder.** Videos go to
  `Videos\Board Game Wrapped`, or wherever you point them. Covers, music and
  fonts go to `%APPDATA%\boardgame-wrapped\public\`. An update never costs you a
  110 MB re-download or the track you uploaded.
- **The first render downloads Chrome (~113 MB), once.** Remotion renders each
  frame in a real browser and fetches its own copy the first time. Everything
  after that is offline.
- **It is a big app** — about 630 MB installed, 170 MB for the installer. Most
  of that is Chromium and the video toolchain. There is no smaller honest
  version of "renders 1080 × 1920 video with no other software installed".

Don't want an installer? `win-unpacked` in the same output folder is the app as
a plain directory — copy it anywhere and run `Board Game Wrapped.exe` inside it.

Releasing and auto-updating are documented separately, in
[MAINTAINING.md](MAINTAINING.md).

### Run it from source

```bash
npm install
npm run dev        # UI at http://localhost:5173
npm run server     # render service at http://localhost:4000
npm test           # 611 tests
npm run app:start  # the desktop shell, unpackaged
```

The dev server proxies `/api` to the render service, so run both if you want to
download box art from the UI. The desktop build runs these same two halves, with
the service started for you — it is not a reimplementation, so there is no class
of bug that only shows up in the packaged app.

Drop your export on the page. It parses in the browser and is cached, so a
reload does not mean re-uploading.

### Check the numbers without rendering

```bash
npx tsx scripts/dry-run.ts <path-to-export.json> <player> [year|from:to|all]
```

Prints the full stats JSON straight to stdout. The first argument is a
filesystem path: exports hold personal play data and live in `data/`, which is
gitignored.

---

## What it does with your data

- **Nothing is uploaded.** The export is parsed in the browser and cached
  locally; the render service is bound to localhost.
- **Two things touch the network, both optional and both up front.** Box art is
  downloaded once from BGG's image host into a local folder, and the fonts are
  mirrored once. After that a render makes no external request at all — every
  asset resolves from disk. The manifest's source URLs are data, never fetched
  during a render.
- **Nothing is written back to the export.** Renaming a player for the video
  stores the new name in the app's own session storage; the file you dropped in
  is never edited.
- **The app checks GitHub for a newer release on startup.** That is the one
  recurring outbound call, and it sends nothing but the version check.

---

## What a BG Stats export can and cannot tell you

Verified against a real export of 229 games and ~100 players. These are the
constraints the whole stats engine is written around:

- **`durationMin` is 0 on every play**, so a *measured* "hours played" is
  impossible. But 225 of 229 games carry BGG's `minPlayTime`/`maxPlayTime`,
  covering 98.9% of plays, and that is what the time-at-the-table estimate is
  built from. It is labelled an estimate everywhere it appears, plays whose game
  has no stated length are **counted rather than guessed at**, and below 60%
  coverage the slide is dropped rather than shown wrong.
- **`highestWins` is real and it matters.** Eight of the 229 games are
  lowest-wins — Cabo, Cambio, Second Chance. Anything that asks "who did best"
  and takes the maximum names the *worst* player in those games.
- **`usesTeams` means the score is not one player's.** Poetry for Neanderthals
  found this: three different players each "held" the record at 27, because all
  three were on the winning team of the same play.
- **`rank` is unreliable**; only the `winner` boolean can be trusted.
- **Scores exist on roughly a third of entries.**
- **The export is one group's plays, not a game's playerbase.** So the top-game
  slide says "everyone who played it this year", which is true of the data, and
  not "players of this game", which would not be.
- **`playDate` is local time**, and parsing it as a UTC string silently corrupts
  game nights and the night-owl hour by a timezone.
- Some plays have **no `locationRefId` at all** — absent, not zero.
- Play tags and play ratings are unused.

---

## How it is built

Four layers, and the boundaries between them are the point.

| Path | Role |
|---|---|
| `src/ingest/` | Parse and normalize the raw export, select player and range. Raw shapes stay here |
| `src/stats/` | 20 pure stat modules → one `WrappedStats` JSON. No React, no rendering, no I/O |
| `src/video/` | The Remotion composition. Consumes stats; never computes them |
| `src/theme/` | Tokens, starters, generators, contrast maths |
| `src/app/` | The React UI: drop zone, pickers, slide list, the one `<Player>` |
| `server/` | Express, localhost only: render, batch, box art, audio decode, fonts |
| `electron/` | The desktop shell — picks a port, spawns the service, points a window at it |

### The stats engine

Pure functions, fully unit-tested. Two rules do most of the work.

**A module returns `null` when it cannot be computed** — never a placeholder,
never a zero. `buildWrappedStats` emits slides only for non-null results, so a
player with no scores simply has no score slide.

**Everything is deterministic.** The same input always produces the same video.
Ties break by higher count, then earlier first appearance, then alphabetical.
Even the decorative parts obey this: a tumbling die's face is driven by the
frame number, never by `Math.random`.

Guard rails, because a stat that fires on two data points is not a stat: nemesis
needs 3+ head-to-head plays, win rate per game needs 3+ plays, night owl needs
10+ plays, win rate excludes cooperative games unless every play in range is
cooperative, and a streak of one is not a streak.

Four are worth calling out for how they are guarded:

- **Record holder** needs two people to have scored, skips cooperative and team
  games, and respects `highestWins`. On the real export 19 of 93 players hold
  one — a real distinction rather than a participation prize. Before the co-op
  and team rails it was 24, and three of those were the same team score.
- **Highest score** prefers a score you actually *won* with, however much
  smaller. A big number in a game you lost is a fact about the scoring rather
  than about you. The label changes with it — "Best winning score" or "Highest
  score" — because one label for two claims makes the honest case sound like the
  boast.
- **Nemesis** ranks by *share* of head-to-head games, not by raw losses. Ranked
  by count it was always whoever you play most, which is a fact about your
  calendar.
- **The superlative** on the outro has two tiers: an earned claim at roughly the
  90th percentile, or a fallback that states something true and specific. 8 of
  93 players earn one, 85 get a fallback, **nobody gets a blank line**. It may
  not repeat a number the outro card already shows.

Adding one is five steps: write the function returning `null` when it cannot be
computed, add its type to the `Stat` union, register it in `MODULES` at the
right slide position, add a case to the inspector, and write the test first.

### Themes

Nine starters — Punchboard, Scorepad, Table Light, Felt Table, Meadow, Peg
Board, Neon Night, Blueprint, Meeple — and **no two share a ground, a display
face or a signature.** A test enforces that: the point of having nine is that
they read as nine studios' work rather than one palette shuffled.

A signature is drawn on every slide of its theme. Punchboard punches its stats
out of the board and leaves a recess. Scorepad strokes tally marks on, crossing
every fifth. Felt Table throws dice that tumble through faces in the air and
land on their value. Peg Board drops pegs into a drilled track, with empty holes
still ahead of them.

Four ways to arrive at a theme: a starter, any token edited by hand, a
constrained random one, or a palette pulled from the box art of that slide's own
cover.

**Every generated palette is checked against WCAG contrast and corrected.** Ink
at 7:1 on the ground, accent at the large-text 3:1. This is not a formality: the
obvious formula for a derived accent fails that floor for **425 of 720**
hue/mode combinations, worst case 1.26:1. Each colour is nudged the minimum
distance needed while keeping its hue, and a mid-tone ground — where no text
colour can rescue it — is moved rather than accepted.

**No slide component contains a literal colour or font.** Everything comes from
theme tokens; the starters file is the only place a hex value is correct.

Each card in the video gets its own ground, re-derived from the theme and
crossfaded over nine frames — so the video moves through six colours while still
looking like the theme that was picked.

### Fonts are mirrored, not fetched

```bash
npm run prefetch:fonts
```

Fourteen families, 36 faces, 1.5 MB, into `public/fonts/`. Both the preview and
the renderer read them from local disk, so a render needs no network and the
Player and the CLI produce identical typography.

### Text is measured, not estimated

A display number shrinks to fit and never wraps; a headline fills the box it is
given in **width and height**, tried at every line count it is allowed. The
measurement runs on a canvas rather than from a per-character constant, because
one constant covered every face only while every face was roughly one width —
and a random theme can pick any of them. Digits are measured as the widest
digit, since every number here is tabular and a figure that changes width while
it counts up is worse than one slightly too big.

### Box art

```bash
npx tsx scripts/prefetch-boxart.ts <path-to-export.json> [--force]
```

Or press **Download box art** in the UI. Every cover is downloaded once into
`public/boxart/`, with a manifest recording, per game, the stored filename, the
source URL, six Vibrant swatches and the dominant colour.

On the real export: 229 games, 228 covers (110 MB) in about 46 seconds, one game
with no art. A second run downloads nothing and finishes in under a second.

Two rules make it safe to interrupt and safe to re-run:

- **Magic bytes decide an image's format, never the `content-type` header.** The
  host serves mislabelled files, and serves HTML error pages under `image/png`.
- **Downloads are atomic** — write `.part`, then rename — so a killed run never
  leaves a truncated file that a later run counts as a cache hit.

Games without a cover get a fallback tile: the name typeset on a ground whose
hue is derived from the name itself, at the same radius and crop as a real box.

### Music

Drop in any audio file — mp3, wav, m4a, flac, ogg, opus — and the video is cut
to it.

1. **Upload.** Stored locally in `public/audio/`. Nothing is sent anywhere.
2. **The beat is detected.** An onset envelope, autocorrelation for the period,
   then a fine search over fractional periods for phase. The BPM is shown and
   can be corrected by hand; a track with no clear pulse gets a warning rather
   than a silently wrong answer. It assumes 4/4 and a steady tempo.
3. **Crop it.** Both handles snap to the track's own downbeats.
4. **Short crops loop**, trimmed to a whole number of bars first so the beat
   carries straight across the seam.

**The tempo drives the video, not the other way round.** Slide lengths are
declared in *bars*, so a slower track makes a longer video and every cut lands
on a downbeat. Measured on a real 124 BPM file, the worst cut sat **30 ms —
under one frame — off the beat.**

No music ships with this repo; those would be licensed files rather than code.
The manifest records a licence and credit per track, and anything adopted from
the audio folder by hand is marked "Unknown — set this before publishing" until
you set it.

### The control surface

One screen. Controls left, the video right — playing the real composition, not a
mock, from the same props object the renderer will be handed. There is exactly
one `<Player>` in the app, so there is no second code path between what you see
and what you get.

Everything is remembered across a reload: player, range, slide arrangement,
per-slide lengths, theme and track.

**A player can be renamed for the video** — the intro, the square and the
filename all follow — and so can the range: "Our first year" instead of "2026".
Both are overrides. The export's own name stays visible beside the new one, and
nothing is written back to the file.

### Rendering

Press **Render MP4**. The file lands in your chosen folder as
`<player>-<range>-<theme>.mp4`, with progress and a **Show in folder** button.
Names are sanitised, so "Jürgen Groß" over a custom range becomes
`jurgen-gross-2026-05-01-2026-06-30-table-light.mp4`.

A full year takes about a minute and a half and comes out around 20 MB: H.264 at
CRF 18, AAC audio, `yuv420p` in BT.709, fast-start so it plays before it has
finished downloading. Constant motion is expensive to compress — no two frames
are alike — which is most of that size.

**If a render fails you get the actual reason** — the missing file, the 404, the
line — not "render failed". Cancelling actually stops it and frees the slot,
which needs more than Remotion's cancel signal: that stops the frames but leaves
the promise unsettled and the headless browser alive.

### Batch

Tick the players, or **Select all**, set a minimum play count, and render. They
go one after another, each with **a random theme seeded by player id**, so the
same person gets the same theme every time and re-running a batch produces the
same set of videos rather than a different-looking one.

A failure never aborts the queue: the item is marked, the reason is kept against
that player's name, and the run carries on. Fifty videos is half an hour of
work, and stopping the lot because the fourth had no box art is the wrong trade
every time.

### Movement

**Something on screen is always moving, and it is never the thing you are
reading.** Numbers count up, headlines assemble a word at a time, and then they
stop dead. Three soft colour fields drift behind them on their own cycles,
running on the video's own clock rather than each slide's, so the motion carries
straight through the cuts instead of restarting at every one.

This is measurable, and it is the rule an earlier version broke: across two
frames twenty apart in the same slide, **zero** of the big number's 31,402 lit
pixels differ, while 60% of the background changes.

Seven slides open with a line before the number arrives. A beat after a number
lands, a remark rises into the lower third — *"That is 4.5 a week. Every
week."*, *"You could have watched all of Lord of the Rings 9 times."* Every one
is derived from the number above it, and slides whose numbers are too small to
be worth a remark simply do not get one. A generic quip under a specific number
makes the number feel generic too.

---

## Status

All twelve steps of `boardgame-wrapped-plan.md` are built, tested and packaged.
**611 tests pass** (`npm test`), and `npm run typecheck` is clean.

Known gaps, all deliberate:

- **One render at a time**, single or batch, enforced with a 409. Remotion opens
  a browser per render and saturates the CPU; two at once take longer than two
  in sequence.
- **The render bundle is cached for the life of the process**, so editing a
  slide means restarting the server before the change reaches a render.
- **No bundled tracks** — see above.
- **No SFX layer.** The plan lists one as optional; it is not built.
- **A one-play player still gets the full cut**, including a "top five" showing
  one game. It is coherent and never breaks, but a shorter cut for thin years
  would be better.
- **Windows only, in practice.** Nothing in the stats engine, the video or the
  UI is Windows-specific, but the packaging, the "show in folder" call and the
  shutdown path are, and only Windows has been tested.

## Licence

**GNU Affero General Public License v3.0** — see [LICENSE](LICENSE).

## Repo layout

```
src/ingest    parse and normalize the export
src/stats     20 pure stat modules
src/video     the Remotion composition and its slides
src/theme     tokens, nine starters, generators, contrast maths
src/app       the React control surface
server        Express: render, batch, box art, audio, fonts
electron      the desktop shell
scripts       dry run, prefetch, build
```

`CLAUDE.md` holds the long-form engineering notes — why each decision went the
way it did, and what broke before it did. `boardgame-wrapped-plan.md` is the
original spec. [MAINTAINING.md](MAINTAINING.md) is the release process.
