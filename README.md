# Board Game Wrapped

Turns a BG Stats JSON export into personalized Spotify-Wrapped-style videos,
one per player, for any date range. Runs entirely on your machine — no upload,
no account, no cloud.

**Output is mobile format: 1080 × 1920, 9:16, 30 fps.** That frame is fixed in
`src/video/config.ts` and every slide is designed against it. There is
deliberately no landscape composition.

## What is in this scaffold

Steps 1–9 of `boardgame-wrapped-plan.md` are implemented and tested:

| Step | Status |
|---|---|
| 1 Scaffold | Vite + React + Remotion + Express, mobile composition registered |
| 2 Ingest | Validate, normalize, cache to IndexedDB |
| 3 Selection | Player picker, presets and custom date ranges |
| 4 Stats engine | 17 modules, pure and fully tested |
| 5 Box art | 228 covers on disk, dominant colors extracted, renders offline |
| 6 Themes | 3 starters, custom, constrained random, box-art mode; fonts mirrored locally |
| 7 Slides | Ten slides, motion primitives, all three signatures — a real video |
| 8 Audio | Upload your own music, beat detection, crop, loop — cuts land on the beat |
| 9 Preview UI | One screen: controls left, live video right; all 19 slides selectable |
| 10 Render | An MP4 on disk, from the app, with progress and a show-in-folder button |
| 11 Batch | Every player in one go, a theme each, skip-on-error |
| 12 Polish | Vignette, per-player superlative, and a square still to share |

**All twelve steps are done**, plus a motion pass on top. 406 tests pass
(`npm test`).

## Make it a Windows program

Two commands, from a fresh copy of the repo:

```bash
npm install
npm run app:build
```

That prints where it put the installer — by default
`C:\Users\<you>\BoardGameWrapped-build\Board Game Wrapped Setup 0.1.0.exe`.
Run it, and Board Game Wrapped installs like any other Windows app: Start menu
entry, desktop shortcut, its own window, uninstaller in Settings.

**You do not need Node installed to run it.** The app carries its own. Node is
only needed on the machine that *builds* it.

A few things worth knowing:

- **It installs for your user, not the whole machine**, so there is no admin
  prompt.
- **Your stuff lives outside the app.** Finished videos go to
  `Videos\Board Game Wrapped` — **or wherever you point them**, with the
  *Save videos to* box in the Render panel. Downloaded covers and uploaded music
  go to `%APPDATA%\boardgame-wrapped\public\`. Nothing you accumulate sits
  inside the install folder, so updating or reinstalling never costs you a 110 MB
  re-download or the track you uploaded.
- **The first render downloads Chrome (~113 MB), once.** Remotion renders each
  frame in a real browser and fetches its own copy the first time. Everything
  after that is offline, and nothing but that download and the box-art prefetch
  ever leaves the machine.
- **It is a big app** — about 630 MB installed, 170 MB for the installer. Most
  of that is Chromium and the video toolchain. There is no smaller honest
  version of "renders 1080×1920 video with no other software installed".

Don't want an installer? `win-unpacked` in the same output folder is the app as
a plain directory — copy it anywhere, run `Board Game Wrapped.exe` inside it.

### If the build fails with `EPERM`

It will not, by default — but this is worth knowing if you change where it
builds. electron-builder extracts Electron to `win-unpacked.tmp` and renames it,
and on a folder OneDrive is syncing that rename fails every time. The project's
own `release/` is inside `Documents`, which is exactly such a folder on a
default Windows install, so `app:build` deliberately writes outside it. To pick
your own spot:

```bash
set BGW_RELEASE_DIR=C:\temp\bgw
npm run app:build
```

## Updating an installed copy

**Changing the code does not change an installed app.** The installer is a
snapshot: it carries its own copy of the UI, the render service and the
composition source. Editing this repo has no effect on an installed copy until
you build and release again.

### What an update keeps

Nothing you accumulate lives in the install directory, because an update is
entitled to replace the program's own files. Everything below survives an
update, a reinstall, and an uninstall:

| What | Where it lives | Kept |
|---|---|---|
| Finished videos and squares | `Videos\Board Game Wrapped` | yes |
| Music you dropped in | `%APPDATA%\boardgame-wrapped\public\audio` | yes |
| Downloaded box art | `%APPDATA%\boardgame-wrapped\public\boxart` | yes |
| Mirrored fonts | `%APPDATA%\boardgame-wrapped\public\fonts` | yes |
| Output folder setting | `%APPDATA%\boardgame-wrapped\settings.json` | yes |
| Slide arrangement, lengths, theme, last export | the app profile, `%APPDATA%\boardgame-wrapped` | yes, **from 0.2.3** |

So **you never re-add your music or re-download the artwork.** A 110 MB cover
cache is exactly the thing an update must not touch, which is why it is in
`%APPDATA%` and not beside the .exe.

The last row has a version on it because until 0.2.3 it was not true, and not
only across updates. The window was served from a **random port every launch**,
a page's origin includes its port, and browser storage is partitioned by
origin — so a new port meant a new origin meant an empty slide arrangement and
a default theme, on *every start*. From 0.2.3 the port is remembered in
`port.json` and reused, so the arrangement stays put.

**Moving to 0.2.3 loses that state once**, because the new stable origin has
nothing stored under it yet and no earlier origin can be read from. Anything in
the table above it is unaffected. After that one launch it stops happening.

### Does a fix need a reinstall?

**No — an ordinary update applies everything.** Two details make that true:

- Shortcuts and installer behaviour are written by the **incoming** installer,
  so a packaging fix repairs machines that take the update. The missing
  desktop icon (`createDesktopShortcut: "always"`) heals itself this way; there
  is nothing to do by hand.
- App code is replaced wholesale, so UI and shell fixes arrive with it.

The one thing an update cannot change is **where the installed copy looks for
updates**: `app-update.yml` is written at install time. Moving releases to a
different repo or host would need one manual reinstall everywhere.

### Updating by hand

```bash
npm run app:build      # produces a new installer
```

Run the new installer over the old one. It upgrades in place — same shortcuts,
same settings, same data.

## Releasing a new version, step by step

The app checks GitHub for a newer **release** on startup, downloads it in the
background, and shows a strip at the top of the window with a progress bar and
a **Restart and install** button. It updates on a *release*, not on a push: a
push is a change, a release is a decision, and only a release carries an
installer.

### Before you start, once

These are one-time settings. Skip if they are already done.

1. **The repo must be public.** A private repo answers 404 to the updater, the
   error is swallowed, and the check silently never succeeds. Reading a private
   one would mean embedding a GitHub token in an installer you hand to other
   people. Public does not mean writable — nobody but you and your collaborators
   can push.
   *Settings → General → Danger Zone → Change visibility → Public.*
2. **Actions must be allowed to write.** The workflow creates the release.
   *Settings → Actions → General → Workflow permissions → Read and write.*

### Every release

**1. Get the working tree clean and pushed.**

```bash
git status            # must be clean
git push
```

The release is built from the tag, so anything uncommitted is not in it. `npm
version` also refuses to run on a dirty tree.

**2. Check it locally first.** The workflow runs these too, but failing here
takes seconds and failing there takes ten minutes.

```bash
npm run typecheck
npm test
```

**3. Bump the version and tag it.**

```bash
npm version patch     # 0.2.2 -> 0.2.3, updates the lockfile, commits, tags
git push --follow-tags
```

`patch` for a fix, `minor` for a new feature, `major` for a break. The version
must go **up** — electron-updater compares against `package.json`, and an
installed copy ignores anything not newer than itself.

**4. Watch the build.** *Actions → Release.* It installs, typechecks, runs the
tests, mirrors the fonts, packages the app and uploads. About ten minutes. If
anything fails it fails here, before it can reach anybody.

**5. Publish the draft.** *Releases →* the new `vX.Y.Z` *→ Publish release.*

⚠️ **This is the step that is easy to miss.** The workflow deliberately creates
a **draft**, and `electron-updater` cannot see drafts — so a bad build can be
deleted rather than shipped. Nothing reaches a single machine until you click
**Publish release**. Beware the **Save draft** button beside it.

Check the release has three assets before publishing:

- `Board Game Wrapped Setup X.Y.Z.exe`
- `...exe.blockmap`
- `latest.yml` — **this is the file the updater actually reads.** Without it
  nothing updates.

**6. Verify on one machine.**

1. Launch the installed copy. The check runs once at startup; the strip appears
   and the download is 169 MB, so give it a few minutes.
2. It reads *"Version X.Y.Z is ready to install."*
3. Press **Restart and install**.
4. Confirm the new version, and that the desktop icon still works.

There is also a **Check for updates** link in the top right, for when you do
not want to wait for the next launch.

### If something goes wrong

| Symptom | Cause |
|---|---|
| Nothing ever updates | The release is still a draft, or the repo is private |
| Nothing updates, release is published | `latest.yml` missing from the release assets |
| "Windows protected your PC" | The installer is unsigned. *More info → Run anyway.* Signing costs money and only removes the warning |
| The version did not change | `npm version` was skipped, or the tag was pushed without `--follow-tags` |
| The desktop icon disappeared | Fixed in 0.2.3; the next update restores it |

### What to do when you change something

A quick map of what has to happen for a change to reach an installed copy:

| You changed | Also do |
|---|---|
| A stat, a slide, the UI | Nothing special — steps 1–6 above |
| A slide's default length in `SLIDE_BARS` | Note that saved per-slide overrides win over the new default; clearing a slide's length in the picker restores it |
| Anything in `electron/` or the `build` block of `package.json` | Test the update itself, not just the app — that code only runs during a real update |
| `publish` in `package.json` | Every existing install needs a manual reinstall to learn the new address |

## Setup (development)

```bash
npm install
npm run dev        # UI at http://localhost:5173
npm run server     # render service at http://localhost:4000
npm test           # 406 tests
```

The dev server proxies `/api` to the render service, so run both if you want to
download box art from the UI. Nothing about the desktop build changes this — it
runs the same two halves, with the service started for you.

To try a change to the desktop shell without packaging:

```bash
npm run app:start
```

Drop your export on the page. It parses in the browser and is cached, so a
reload does not mean re-uploading.

## Checking the numbers before you trust them

```bash
npx tsx scripts/dry-run.ts data/BGStatsExport-260826181645.json Tina 2026
npx tsx scripts/dry-run.ts data/BGStatsExport-260826181645.json Tina 2025-05-01:2025-06-30
```

The first argument is a path. Exports hold personal play data and live in
`data/`, which is gitignored.

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

- `durationMin` is 0 on every play, so a *measured* "hours played" is impossible
- ...but 225 of 229 games carry BGG's play-time range, covering 98.9% of plays,
  which is what the estimated time-at-the-table stat is built from
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

## Box art

Every cover is downloaded once and kept in `public/boxart/`, alongside a
`manifest.json` that records, per game, the stored filename, the source URL, the
six Vibrant swatches, and the dominant color with its hue. Slides read the
manifest; nothing fetches an image at render time.

```bash
npx tsx scripts/prefetch-boxart.ts data/BGStatsExport-260826181645.json
```

Or press **Download box art** in the UI with the render service running. Either
way it is safe to re-run and safe to interrupt: covers already on disk are
skipped, and a killed run leaves `.part` files that the next run sweeps, never a
truncated image that would pass as complete.

On the real export: 229 games, 228 covers (110 MB) in about 46 seconds, one game
(`✂️ 🪨 📜`) with no art. A second run downloads nothing and finishes in under a
second. Pass `--force` to re-fetch everything after art changes upstream.

Games without a cover get a **fallback tile**: the name typeset on a ground whose
hue is derived from the name itself, at the same radius and crop as a real box.
Deterministic, so it looks the same in the preview and in a CLI render.

In grids, covers are cropped square so they line up whatever shape they came in.
On the most-played slide the cover is shown **whole** instead — board game boxes
are rarely square, and a square crop cuts the credits line and the publisher's
mark off the bottom of the one cover that slide is about.

## Records

**Record holder** is an optional slide for a game where you hold the best score
of anyone who played it. It is off by default; turn it on in the slide list.

It only appears if you actually hold one, and it is fussy about what counts:
at least two people must have put a score on the board, cooperative and team
games are skipped because the number belongs to the table rather than to you,
and in a game where the *lowest* score wins the best score is the lowest one.
If you hold several, you get the one you have played most, and a count of the
others.

On the real export 19 of 93 players hold a record — so it means something when
it shows up.

## Themes

Six of them. **Punchboard** punches its stats out of the board. **Scorepad**
strokes tally marks on, crossing every fifth. **Table Light** sits under a
drifting pool of lamplight. **Felt Table** throws dice that tumble through faces
in the air and land on their value. **Meadow** lays tiles one at a time, each
turned a quarter so the roads meet at the joins. **Peg Board** drops pegs into a
drilled track, with empty holes still ahead of them.

No two share a ground, a display face or a signature — a test says so.

Two slides draw their count rather than just stating it. **The plays slide
strokes tally marks on in every theme**, in that theme's own colour, because
that is the slide the whole video is about. **The "played with" slide counts in
the theme's own hand** — dice, tiles, pegs or strokes.

Most other slides have a small drawing of their own, and each one is about that
slide's subject rather than being pattern. The **intro** deals a hand, because
that is how every one of these evenings starts. **Win rate** stacks chips for
wins against chips for losses on the same scale. A **win streak** lights up link
by link, since the connection is what makes it a streak. **Best** and **worst
game** lay out every play as a won or lost marker. **People played with** draws
people. **Nemesis** fills one track from both ends so you can see where you
meet. Your **busiest day** piles up instead of spreading out. **Night owl**
swings a hand round a 24-hour ring with your late hours shaded. **First and last
play** tears a calendar through exactly the months your range covers. **Where
you played** drops a pin and lets the rings keep going out. And **time played**
runs a clock whose hand laps once per day you spent at the table.

## Naming a player

Each player in the picker has a field beside their name. Type into it and the
video says that name instead — in the intro, on the square, and in the
filename. Leave it blank and the export's own name is used.

The export's name stays visible beside the new one, so the list is still
searchable by whatever BG Stats calls somebody, and the row reads
`Tina (Tinchen)` once a name is in use.

Spaces inside a name are kept, and you can type them freely — the box holds
exactly what you type, including trailing spaces on the way to a second word.
What the app *uses* is trimmed, so a name left as `Tinchen ` reaches the video,
the square, the filename and the `(Tinchen)` in the list without the space.

**It applies to batch renders too.** The batch list shows the same
`Name (Override)`, and each video is rendered and filed under the name you
typed. The field itself is only in the player picker — two places to type one
name is one too many.

Nothing is written back to the export. It is personal data, and the app never
edits it; the names live in the app's own session storage alongside the slide
arrangement.

## Naming the range

Under the date pickers there is a box for what the video should call this range.
Leave it empty and it uses the obvious thing — “2026”, or the two dates. Type
something and that is what appears instead: “Our first year”, “The Basement
Sessions”, whatever it was. Renaming it does not change which dates are
selected.

Themes are data: six colors, three fonts, four type sizes, a motion profile, a
texture and a signature. No slide component contains a literal color or font.

Four ways to get one:

- **Starter** — Punchboard (unpunched cardboard), Scorepad (paper score sheet),
  Table Light (felt and lamp glow).
- **Custom** — edit any token in the picker. Persisted, so a reload keeps it.
- **Random** — constrained, never raw hex. One hue outside the muddy 45°–65°
  band, the whole palette derived from it, a font trio from the curated list.
- **Box art** — the accent is taken from the dominant color of that slide's own
  cover, with the rest of the palette derived to match.

Every generated palette is checked against WCAG contrast and corrected if it
falls short — ink at 7:1 on the ground, accent at 4.5:1. The plan's raw formula
misses that floor for most of the hue wheel, so each derived color is nudged the
minimum distance needed while keeping its hue.

### Fonts are mirrored, not fetched

```bash
npm run prefetch:fonts
```

Twelve families, 32 faces, 1.3 MB, into `public/fonts/`. Renders and the preview
both read them from local disk, so a render still needs no network and the
Player and the CLI produce identical typography. Do not swap this for
`@remotion/google-fonts` — it hits the CDN at render time.

## The video

Ten slides: Intro → Total plays → Top game → Top five → Win rate → Top co-player
→ Nemesis → Games learned → Top location → Outro. A full year comes out at about
33 seconds.

```bash
npx remotion render src/video/index.ts Wrapped out/wrapped.mp4 --props=props.json
```

Everything moves through three primitives — `<Reveal>`, `<CountUp>`,
`<Stagger>` — and all three take their spring from `theme.motion`, so the same
slide feels stamped under Punchboard and settles under Table Light. There is
exactly **one transition**, reused on every slide; the ground, texture and
signature never move between cuts.

Each theme's signature is drawn on every slide: Punchboard's stats punch out of
the board leaving a recess, Scorepad rules the page and draws counts as tally
marks that stroke on, Table Light's warm pool drifts behind the subject.

Slide lengths are declared in bars rather than frames, so step 8 can put a track
under them and have the cuts land on the beat. The composition's duration is
computed from the data: a player with no nemesis gets a shorter video, not a gap.

The outro is the top-five grid, with names and counts, built to be screenshotted.

## Music

Drop in any audio file — mp3, wav, m4a, flac, ogg, opus — and the video is cut
to it.

1. **Upload.** The file is stored locally in `public/audio/`. Nothing is sent
   anywhere.
2. **The beat is detected.** Tempo and the position of the first downbeat, so
   the video knows where the bars are. The detected BPM is shown and can be
   corrected by hand; if the track has no clear pulse you get a warning rather
   than a silently wrong answer.
3. **Crop it.** Drag the handles over the waveform to pick the part you want.
   Both handles snap to downbeats, which is what keeps the cuts on the beat.
4. **Short tracks loop.** If your crop is shorter than the video it repeats as
   many times as needed. The crop is trimmed to a whole number of bars first, so
   the beat carries straight across the seam.

The tempo drives everything: every slide lasts a whole number of bars, so a
slower song makes a longer video and every cut lands on a downbeat. Measured on
a real 124 BPM file, the worst slide cut sits 30 ms — under one frame — off the
beat. The track fades in and out rather than cutting.

You can also drop files straight into `public/audio/` and press **Scan**.
Set the credit field for anything that needs attribution — the manifest records
a licence and credit per track, and files adopted from the folder are marked
"Unknown — set this before publishing" until you do.

No music ships with this repo. The plan lists good free sources: Pixabay Music
(no attribution), Uppbeat, and the YouTube Audio Library.

## The control surface

One screen. Controls on the left, the video on the right, playing the real
composition — not a mock. Change anything and the preview follows within a
second, no reload.

Pick a range, pick a player, then choose the slides **and the order they play
in** — each row moves up or down, and the intro and outro stay pinned to the
ends. Everything you set is remembered: reload the page and you come back to the
same player, range, arrangement and track. The default cut is
the ten the plan specifies; nine more are computed for every player and sit
there until you ask for them — best game, worst game, longest win streak,
highest score, people played with, busiest day, night owl, first and last play,
nights attended. A stat a player does not have enough data for is shown
disabled rather than hidden, so "no nemesis slide" reads as a fact about their
year rather than a missing feature.

One of the slides estimates **how long you spent at the table** — BG Stats never
records how long a play took, but nearly every game carries its play time from
BoardGameGeek, so the video can add those up. It is labelled as an estimate
wherever it appears, plays whose game has no stated length are counted rather
than guessed at, and if too much of a year is unmeasurable the slide is left out
rather than shown wrong. It also names the game you sank the most *hours* into,
which is rarely the one you played most often.

The default cut runs about 56 seconds. Every slide turned on runs about 92.

## Where videos are saved

The Render panel has a **Save videos to** box. In the desktop app there is a
**Choose…** button beside it that opens the normal Windows folder dialog; in a
browser you type or paste a path, because a web page cannot be handed one.

The folder is checked when you set it, not when a render finishes: it is created
if it does not exist and then actually written to. A path that looks fine and
turns out to be read-only is worth discovering immediately rather than at the
end of a two-minute render.

The choice is remembered in `settings.json`, stored with the rest of your data
rather than inside the app, so an update never resets it. **Use the default**
appears once you have changed it, and puts it back.

## Rendering

Press **Render MP4**. The file lands in `out/` as
`<player>-<range>-<theme>.mp4`, with a progress bar while it works and a
**Show in folder** button when it finishes.

A full year takes about a minute and comes out around 9–10 MB: 1080 × 1920,
H.264 at CRF 18, AAC audio, fast-start so it plays before it has finished
downloading. Names are sanitised, so "Jürgen Groß" over a custom range becomes
`jurgen-gross-2026-05-01-2026-06-30-table-light.mp4`.

If a render fails you get the actual reason — the missing file, the 404, the
line — not "render failed".

## Batch render

Tick the players you want — or **Select all** — set a minimum play count, and
press render. They go one after another, and you get a summary at the end.

**A random theme per player** gives everyone their own palette, fonts and
motion. It is seeded by player id, so the same person gets the same theme every
time: re-running a batch produces the same set of videos rather than a different
-looking one.

If one player fails the rest carry on. The summary names who failed and why, so
you can re-run just them.

On this export: 68 of 104 players clear a three-play minimum. Five players took
about four minutes.

## The finishing touches

Every render also writes a **1080 × 1080 square** beside the MP4 — the same
year, laid out for the places a vertical video does not go. Same name, `.png`
instead of `.mp4`.

The outro carries a **superlative** when the year earned one: *"Played with 60
different people."*, *"504 plays. Never off the table."*, *"Albin had your number
all year."* The thresholds come from your own export, set so that roughly the
top tenth of players clear them — a line everyone gets is a caption, not a
superlative, so most players simply do not get one.

Dark themes get a vignette; every theme gets its paper or grain at 3–4%.

## Movement

**Something on screen is always moving — and it is never the thing you are
reading.** Numbers count up, headlines assemble a word at a time, and then they
stop. The movement is behind them.

An earlier version drifted the text too, a few pixels each on its own cycle. It
sounds subtle and it is not: nothing ever settles, and a screen with a number on
it becomes tiring to look at.

The background never stops. Three soft colour fields drift across the frame on
different cycles, running on the video's own clock rather than each slide's — so
the motion carries straight through the cuts instead of restarting at every one.
The top game's cover floats gently while it is on screen.

Some slides open with a line before the number arrives: *"One game more than any
other…"*, *"Someone had your number…"*, *"You did not just replay old
favourites…"*. Only seven of them — a setup before every slide would be a
narrator.

Two slides are a pair. If you have both "People played with" and "Played most
with" in the cut, they always play back to back, with *"But one of them was at
the table more than anyone…"* in between — the count sets up the name. Drag or
arrow either one and both move together; the only thing you cannot do is put
another slide between them.

While the preview plays, the slide on screen is marked in the slide list, so you
can see where you are without counting.

The top five is a **countdown**. Five appears first, then four, then three, and
the list fills upward until first place lands last, larger and on its own plate.

A beat after a number lands, a line slides up into the lower third and stays
there: *"That is 4.5 a week. Every week."*, *"You could have watched all of Lord
of the Rings 9 times."*, *"99% of your games. At this point it is a duo."* Every
one is worked out from the number above it, so it is about your year rather than
being filler that would fit anyone's — and slides whose numbers are too small to
be worth a remark simply do not get one.

Type is set big and tight — the numbers fill the frame the way this kind of
video should.

The opening card is short — two bars, moving the whole time — because holding
three lines of text is not how you start a video like this.

A full year runs about 62 seconds and comes out around 20 MB. Constant motion
is expensive to compress: no two frames are alike, so there is far less for the
encoder to reuse.

## Done

That is the whole plan. What is here: your export in, a video per player out,
cut to music you chose, in a theme you picked or one picked for you, rendered
one at a time or fifty in a row — all on your own machine, with nothing
uploaded anywhere.
