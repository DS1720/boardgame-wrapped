# Board Game Wrapped — Implementation Plan

A local-only generator that turns a BG Stats JSON export into personalized
Spotify-Wrapped-style videos, one per player, for any date range.

**Output format is mobile: 1080 × 1920, 9:16, 30 fps** — the frame used by
Instagram Stories, TikTok and Reels. This is fixed in `src/video/config.ts` and
every slide is designed against it. There is deliberately no landscape or square
video composition; a second aspect ratio would double the layout work in every
slide. A square still can be exported alongside the video in step 12 for
sharing, but the video itself is portrait only.

Build it one step at a time. Each step has an explicit **Done when** and a set of
**Test cases**. Do not start the next step until the current one's tests pass.

---

## 0. Ground truth about the data

Verified against `BGStatsExport-260826181645.json` (568 plays, exported 2026-08-26).

| Field | Status | Consequence |
|---|---|---|
| `plays[].playDate` | Present on all | Date filtering works; time-of-day usable with caution |
| `plays[].durationMin` | **0 on all 568 plays** | No "hours played" slide. Ever. |
| `plays[].playerScores[].winner` | Reliable | Win/loss slides are the backbone |
| `plays[].playerScores[].score` | Only ~900 entries | Score slides need a graceful skip |
| `plays[].playerScores[].rank` | **0 everywhere** | Unusable — use `winner` only |
| `plays[].playerScores[].newPlayer` | 917 flags | "Games learned" is solid |
| `plays[].locationRefId` | 542 of 568 | Location slides work |
| `plays[].tags` | **Empty on all plays** | No tag-based slides |
| `plays[].rating` | 0 everywhere | No rating slides |
| `games[].urlImage` | 228 of 229 | Box art is the primary visual asset |
| `games[].bggId` | 227 of 229 | BGG enrichment possible later |
| Players | 106 total, 53 with ≥5 plays | ~50 viable videos |
| Plays by year | 2024: 4 · 2025: 51 · 2026: 513 | Only 2026 has full-year density |

**Rule:** every stat module must return `null` when its data is absent, and the
slide list must be built from non-null modules only. A player with no scores
should never see an empty score slide.

---

## 1. Architecture

```
boardgame-wrapped/
├── public/
│   ├── boxart/            # prefetched images, <gameId>.png|jpg
│   ├── audio/             # free tracks + SFX
│   └── fonts/             # self-hosted, for deterministic renders
├── src/
│   ├── app/               # the local UI (Vite + React)
│   ├── stats/             # pure functions, JSON in → stats out
│   ├── themes/            # token definitions + generators
│   ├── video/             # Remotion compositions and slides
│   └── shared/            # types
├── server/                # Express render service
└── out/                   # rendered MP4s
```

Two processes, both local:

- **Vite dev server** — the UI. Parses the JSON in-browser, computes stats,
  previews the video live with `@remotion/player`.
- **Express server** — receives a stats payload + theme, calls
  `@remotion/renderer` `renderMedia()`, writes an MP4 to `out/`.

Preview and export use the **same React components**, so what you see is what
renders. This is the main reason to use Remotion here rather than ffmpeg
scripting.

Licensing note: Remotion is free for individuals and companies of up to 3
people. Personal use is fine.

---

## Step 1 — Scaffold

**Goal:** an empty app that boots and renders a hardcoded 3-second video.

Build:
- Vite + React + TypeScript project
- Add `remotion`, `@remotion/player`, `@remotion/renderer`, `@remotion/bundler`,
  `@remotion/google-fonts`, `@remotion/media-utils`
- One composition `Wrapped`, 1080×1920, 30fps, showing a static "Hello" frame
- Express server on a second port with a `POST /render` stub that returns 200
- npm scripts: `dev` (UI), `server`, `render` (Remotion CLI)

**Test cases:**
1. `npm run dev` serves the UI at localhost, no console errors
2. The `<Player>` shows the Hello composition and plays
3. `npx remotion render Wrapped out/test.mp4` produces a playable 1080×1920 MP4
4. `POST /render` returns 200

**Done when:** you can play a video in the browser and get the same frames as a
file on disk.

---

## Step 2 — Ingest and normalize

**Goal:** drop the JSON in, get clean typed objects out.

Build:
- Drag-and-drop zone; parse with `JSON.parse`, no server round-trip
- Validate the shape: presence of `plays`, `players`, `games`, `locations`
- Normalize into lookup maps keyed by `id` (`gamesById`, `playersById`,
  `locationsById`)
- Denormalize each play once into a `NormalizedPlay`: resolved game object,
  resolved location name, parsed `Date`, and a `participants` array of
  `{ playerId, name, won, score, isNew, team, teamRole }`
- Skip plays where `ignored === true`
- Persist the parsed result to IndexedDB so a page reload doesn't require
  re-uploading

**Test cases:**
1. Uploading the real export yields exactly 568 plays, 106 players, 229 games
2. Uploading a non-BG-Stats JSON shows a clear error naming what's missing
3. Uploading a truncated/corrupt file does not crash the app
4. Reloading the page restores the dataset from IndexedDB
5. Every `NormalizedPlay` has a resolved game name (no `undefined`)
6. The one game without `urlImage` (`✂️ 🪨 📜`) normalizes without throwing

**Done when:** the UI shows "568 plays · 106 players · 229 games · 2024-01-xx to
2026-08-25" after a drop.

---

## Step 3 — Player and range selection

**Goal:** pick who and when.

Build:
- Player list sorted by play count descending, with each player's play count in
  the selected range shown next to the name
- Date range control with presets (2026, 2025, Last 12 months, All time) and a
  custom from/to
- A warning when the selection yields fewer than 3 plays — the video will be
  thin
- Multi-select for batch mode (Step 12)

**Test cases:**
1. "2026" selects 513 plays; "2025" selects 51; "All time" selects 568
2. A custom range of 2025-05-01 to 2025-06-30 returns only plays in those months
   (boundary dates inclusive on both ends)
3. Selecting Tina + 2026 shows a play count matching a manual filter of the JSON
4. Selecting a player with 1 play in range shows the thin-data warning
5. An inverted range (to < from) is rejected with a message, not silently empty

**Done when:** every combination of player and range gives a correct play count
you can verify by hand.

---

## Step 4 — Stats engine

**Goal:** pure functions that take `(plays, playerId, range)` and return a
`WrappedStats` object. No React, no rendering. This is the part that must be
correct.

Each stat is a module with the signature
`(ctx: StatContext) => StatResult | null`.

### Core set (default 8-slide cut)

| # | Module | Output |
|---|---|---|
| 1 | `totalPlays` | plays, distinct game nights, distinct games |
| 2 | `topGame` | most-played game + count + box art |
| 3 | `topFive` | top 5 games with counts and art |
| 4 | `winRate` | wins, losses, percentage |
| 5 | `topCoPlayer` | most frequent tablemate + shared play count |
| 6 | `nemesis` | player who beat them most in head-to-head |
| 7 | `gamesLearned` | count + names, from `newPlayer` flags |
| 8 | `topLocation` | location name + nights there |

### Optional set (toggleable in the UI)

`busiestDay`, `longestWinStreak`, `bestGame` (highest win rate, min 3 plays),
`worstGame`, `rankInGroup`, `goodLuckCharm`, `coPlayerCount`, `firstAndLastPlay`,
`nightOwl` (hour histogram), `groupShare` (% of all plays they attended),
`highestScore`, `biggestBlowout`, `closestWin`, `soloGame` (a game only they
played).

### Rules

- Ties broken deterministically: higher count, then earlier first play, then
  alphabetical. Never random — the same input must always produce the same video.
- `winRate` counts only plays where the game is not `cooperative`, unless every
  play in range is coop, in which case report coop wins separately.
- `nemesis` requires ≥3 head-to-head plays or returns `null`.
- `bestGame`/`worstGame` require ≥3 plays of that game or return `null`.
- `nightOwl` requires ≥10 plays or returns `null`, and should be labeled by when
  the play was *logged* if you can't verify start times.
- Score modules return `null` when the player has zero non-null scores in range.

**Test cases:**
1. A hand-built fixture of 5 plays produces exactly the expected numbers for
   every core module
2. `totalPlays` for you (Dario) across all time equals 558 participations
3. `winRate` on a coop-only fixture does not divide by zero
4. `nemesis` returns `null` for a player with 2 head-to-head plays, and the
   correct name at 3
5. Every module returns `null` rather than throwing on an empty play list
6. Running the engine twice on the same input produces byte-identical JSON
7. A player who appears in a play with a null score still counts toward
   `totalPlays`

**Done when:** you can dump `WrappedStats` as JSON for any player and spot-check
the numbers against the BG Stats app itself.

---

## Step 5 — Box art

**Goal:** every game shown in a video has an image, locally.

Build:
- A prefetch action in the UI: iterate `games[]`, download `urlImage` into
  `public/boxart/<gameId>.<ext>`, deriving the extension from the response
  content-type (they are a mix of PNG and JPEG)
- Skip files that already exist; show progress; run it once per export
- Fallback tile component for games without art: the game name typeset in the
  theme's display face on a theme-colored ground, with the same corner radius
  and crop as a real box. It should look like a design decision, not a hole.
- Extract the dominant color of each box with `node-vibrant` at prefetch time
  and store it in a `boxart-manifest.json` alongside the images

**Rendering rules:**
- Always crop to a fixed shape with `object-fit: cover` — never letterbox
- One radius token used everywhere
- Hero slides: the box art large in the foreground, plus a blurred and darkened
  copy of the same image filling the background

**Test cases:**
1. Prefetch downloads 228 images; the manifest has 229 entries (228 images +
   1 fallback)
2. Re-running prefetch downloads nothing and completes fast
3. Killing the prefetch halfway and restarting resumes without corrupt files
4. A slide for `✂️ 🪨 📜` renders the fallback tile, correctly themed
5. Every stored file opens as a valid image
6. Renders work with the network disconnected

**Done when:** you can pull the ethernet cable and still render a full video.

---

## Step 6 — Theme system

**Goal:** themes are data. Slides never hardcode a color or a font.

### Token shape

```ts
type Theme = {
  id: string;
  name: string;
  color: {
    bg: string;        // slide ground
    surface: string;   // cards, tiles
    ink: string;       // primary text
    inkMuted: string;  // labels, captions
    accent: string;    // the number, the highlight
    accentAlt: string; // secondary highlight
  };
  type: {
    display: string;   // big numbers and headlines
    body: string;      // sentences
    utility: string;   // eyebrows, labels, captions
    scale: [number, number, number, number]; // px at 1080 wide
  };
  motion: { stiffness: number; damping: number; stagger: number };
  texture: 'none' | 'grain' | 'paper' | 'lamp';
  signature: string;   // which signature element this theme uses
};
```

### Three starter themes

**A — Punchboard.** Grounded in unpunched cardboard sprues.
Ground `#B8AC97` chipboard, surface `#CFC5B2`, ink `#1C1A17`, muted `#6B6255`,
accent `#2B4C7E` printer's blue, accentAlt `#C8402F` registration red.
Display: Archivo Condensed (heavy, tight). Body: IBM Plex Sans. Utility: IBM
Plex Mono.
*Signature:* stats sit inside die-cut rounded rectangles that appear to punch
out of the board on entry, leaving a recessed shadow behind.

**B — Scorepad.** Grounded in a paper score sheet.
Ground `#EDF1E6` pale ruled paper, surface `#FFFFFF`, ink `#3A3A38` graphite,
muted `#8A8A82`, accent `#D02B2B` red pen, accentAlt `#7A94A6` rule blue.
Display: Bricolage Grotesque. Body: Source Serif. Utility: Courier Prime.
*Signature:* play counts are drawn as **tally marks** that stroke on one at a
time, and numbers animate with a draw-on stroke rather than a fade. Faint ruled
horizontal lines run through every slide.

**C — Table Light.** Grounded in your own data — your plays cluster between
20:00 and 01:00.
Ground `#0E1512` felt-dark, surface `#182420`, ink `#F0EDE4`, muted `#8C9A93`,
accent `#F2C879` lamp glow, accentAlt `#D9784F` warm falloff.
Display: Familjen Grotesk. Body: Inter. Utility: Inter (tracked out, uppercase).
*Signature:* a soft radial pool of warm light centered behind the subject, with
everything outside it falling to near-black. Box art is lit within the pool.
The light pool drifts a few pixels over the slide's duration.

### Custom and random

- **Custom:** color pickers bound to the six tokens; font selectors from a
  curated list of 6 display / 4 body / 3 utility faces. Persist to localStorage.
- **Random — constrained, never raw hex.** Pick one base hue `h` at random,
  excluding the muddy band 45°–65°. Then derive:
  - `accent = hsl(h, 72%, 58%)`
  - `accentAlt = hsl((h + 150) % 360, 62%, 55%)`
  - `bg = hsl(h, 10%, 11%)` for dark mode, or `hsl(h, 14%, 95%)` for light
  - `surface = bg` lifted 6% lightness
  - `ink = hsl(h, 8%, 96%)` / `hsl(h, 20%, 14%)`
  - `inkMuted = ink` at 62% alpha
  Then pick a random font trio from the curated list and a random motion profile.
  Constrained randomness looks designed; free randomness never does.
- **Box-art mode:** a fourth mode where `accent` is taken per-slide from the
  dominant color of that slide's box art, with the rest of the palette derived
  by the same rules. Every top-game slide becomes color-matched to its own
  artwork.

**Test cases:**
1. Switching theme in the UI re-renders the preview with no reload
2. No slide component contains a literal hex value (grep the codebase)
3. 50 consecutive random themes all pass a contrast check: ink on bg ≥ 7:1,
   accent on bg ≥ 4.5:1
4. A custom theme survives a page reload
5. Box-art mode produces a different accent for each of the top 5 games
6. All fonts render identically in `<Player>` and in a CLI render

**Done when:** the same player and range rendered under all three starter themes
produce three videos that look like they came from three different studios.

---

## Step 7 — Slides and motion

**Goal:** the video itself.

Build a motion primitive layer first, then slides on top:

- `<Reveal delay={n}>` — spring entry using the theme's motion profile
- `<CountUp to={n} />` — eased number count, never a fade-in
- `<Stagger>` — applies `theme.motion.stagger` frames between children

**Slide order (default cut):** Intro → Total plays → Top game → Top five →
Win rate → Top co-player → Nemesis → Games learned → Top location → Outro.

**Non-negotiables:**
- 1080×1920, all critical content inside a 120px safe margin
- One signature transition, reused on every slide. Not a different effect each
  time — that is the clearest tell of an assembled video.
- Type scale from the theme, four sizes only
- Eyebrow label above, giant number, small caption below — but only where the
  content is genuinely a single number. Do not force every slide into that shape.
- Outro: the top-5 grid, designed to be screenshotted and shared

**Test cases:**
1. Every slide renders correctly with the longest name in the dataset
   (`Sarah Schelmbauer`) and with a one-character name
2. A player missing an optional stat produces a video with that slide absent and
   no gap in the timeline
3. Numbers ≥ 1000 format with a separator
4. Nothing critical falls outside the safe margin at any frame
5. Total duration equals the sum of slide durations exactly
6. A 3-play player and a 268-play player both produce a coherent video

**Done when:** you'd send it to Tina without apologizing for anything.

---

## Step 8 — Audio, free

**Goal:** a soundtrack, on the beat.

### Where to get it

- **Pixabay Music** — free, no attribution required. Start here.
- **Uppbeat** — free tier, requires a credit in the description. Strongest
  upbeat/electronic selection.
- **YouTube Audio Library** — free, some tracks require attribution, all safe
  from Content ID if you post to YouTube.
- **Free Music Archive** / **Incompetech** — mostly CC-BY, so credit required.
- **Freesound.org**, filtered to **CC0** — for the reveal ticks and transition
  whooshes.

Download 3–5 tracks with clearly stated BPM into `public/audio/`. Pick ones with
a steady tempo and no vocals — vocals fight the on-screen type.

### Build

- `public/audio/manifest.json`: `{ file, name, bpm, license, credit }` per track
- Track selector in the UI, defaulting per theme
- Beat grid: `framesPerBar = (60 / bpm) * 4 * fps`
- Every slide duration is a whole number of bars — 2 bars for stat slides, 4 for
  intro, top game, and outro
- `<Audio src={staticFile(track)} />` with volume `interpolate`d to 0 over the
  final 30 frames
- Optional SFX layer: a tick timed to each `CountUp` landing

**Test cases:**
1. Total video duration is an exact whole number of bars
2. Slide cuts land on beats — verify by scrubbing the preview against the track
3. Audio fades out and never clips or cuts abruptly
4. Switching tracks with a different BPM re-times all slides automatically
5. A track shorter than the video loops without an audible seam, or the video is
   capped to the track length
6. The manifest records the license and credit for every track you use

**Done when:** muting the video makes it feel noticeably worse.

---

## Step 9 — Preview UI

**Goal:** the control surface.

Build a single-screen layout: left column for controls (upload state, player,
range, theme, track, optional-stat toggles), right column a 9:16
`<Player>` with transport controls.

Apply the same discipline as the video: real type hierarchy, one accent, states
that say what happened. Empty state before upload is an invitation
("Drop a BG Stats export to start"), not a blank panel. Errors name the fix.

**Test cases:**
1. Changing any control updates the preview within a second, no reload
2. The preview is scrubbable and loops
3. Before upload, only the drop zone is interactive
4. Every button label matches the result it produces
5. Works at 1280px wide without horizontal scroll

---

## Step 10 — Render one video

**Goal:** an MP4 on disk.

Build:
- `POST /render` accepting `{ stats, theme, track, slides }`
- `bundle()` once at server start, cache the bundle
- `renderMedia()` with H.264, CRF 18, writing to
  `out/<player>-<range>-<theme>.mp4`
- Progress streamed back to the UI
- Open-folder button on completion

**Test cases:**
1. A rendered file plays in VLC and in the iOS Photos app
2. The rendered frames match the preview at the same timestamps
3. Rendering the same inputs twice produces the same duration and frame count
4. Filenames with umlauts or spaces are sanitized
5. A render failure surfaces the actual error in the UI, not a generic message
6. File size for a 30-second video is reasonable (under ~15 MB)

---

## Step 11 — Batch render

**Goal:** all 50 videos, one button.

Build:
- Multi-select players, one shared range
- Optional "random theme per player" toggle, seeded by player id so results are
  reproducible
- Sequential queue with per-item status, skip-on-error, and a summary at the end
- Auto-skip players below a minimum play threshold you set

**Test cases:**
1. Batching 5 players produces 5 correctly named files
2. One player failing does not abort the remaining renders
3. The failure is reported with the player name and reason
4. Seeded random themes reproduce identically on a second run
5. Batching all 53 eligible players completes without a memory leak

---

## Step 12 — Polish pass

Only after everything above works.

- Grain or paper texture overlay at 3–5% opacity, per theme
- Vignette on the dark theme
- Per-player superlative line on the outro, chosen from their stats
- A shareable 1080×1080 still exported alongside the MP4
- A `--dry-run` mode that dumps the stats JSON without rendering, for debugging

Then apply the mirror test: watch three finished videos back to back and remove
one effect from each. Whatever you don't miss shouldn't have been there.

---

## Build order summary

1. Scaffold → 2. Ingest → 3. Selection → 4. **Stats engine** → 5. Box art →
6. Themes → 7. Slides → 8. Audio → 9. UI → 10. Render → 11. Batch → 12. Polish

Steps 4 and 7 are where the quality lives. Steps 1–3 should take an evening;
budget accordingly.
