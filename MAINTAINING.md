# Maintaining and releasing

Everything in this file is for whoever ships the Windows build. None of it is
needed to read the code, run it from source, or use the app — see
[README.md](README.md) for that.

## Contents

- [Updating an installed copy](#updating-an-installed-copy)
- [Releasing a new version, step by step](#releasing-a-new-version-step-by-step)
- [If something goes wrong](#if-something-goes-wrong)
- [What to do when you change something](#what-to-do-when-you-change-something)
- [If the build fails with `EPERM`](#if-the-build-fails-with-eperm)

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

## If something goes wrong

| Symptom | Cause |
|---|---|
| Nothing ever updates | The release is still a draft, or the repo is private |
| Nothing updates, release is published | `latest.yml` missing from the release assets |
| "Windows protected your PC" | The installer is unsigned. *More info → Run anyway.* Signing costs money and only removes the warning |
| The version did not change | `npm version` was skipped, or the tag was pushed without `--follow-tags` |
| The desktop icon disappeared | Fixed in 0.2.3; the next update restores it |

## What to do when you change something

A quick map of what has to happen for a change to reach an installed copy:

| You changed | Also do |
|---|---|
| A stat, a slide, the UI | Nothing special — steps 1–6 above |
| A slide's default length in `SLIDE_BARS` | Note that saved per-slide overrides win over the new default; clearing a slide's length in the picker restores it |
| Anything in `electron/` or the `build` block of `package.json` | Test the update itself, not just the app — that code only runs during a real update |
| `publish` in `package.json` | Every existing install needs a manual reinstall to learn the new address |

## If the build fails with `EPERM`

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

