# GAS-ICS-Sync

[![Tests](https://github.com/ollisulopuisto/GAS-ICS-Sync/actions/workflows/test.yml/badge.svg)](https://github.com/ollisulopuisto/GAS-ICS-Sync/actions/workflows/test.yml)

> **This is a fork of [derekantrican/GAS-ICS-Sync](https://github.com/derekantrican/GAS-ICS-Sync)** with privacy placeholders, a few extra settings and a set of bug/security fixes on top. See [Fork changes](#fork-changes) below.

### ⚠️⚠️ This project is looking for contributors and people to help answer questions! Please message @developers on the Discord! ⚠️⚠️

This is a standalone script (that consists of multiple files). The purpose is to sync ics/ical calendars to Google Calendar. Google Calendar *can* already do this, but updates only happen once every 12 or even 24 hrs. This script can be run much more frequently.

Unlike the original, this fork is configured on a settings page instead of by editing the code, and it can
hide event details (titles, descriptions, locations) so a work or personal feed can be synced into a
calendar other people can see.

## Installing

### Option A: from the command line (recommended)

Needs [Node.js](https://nodejs.org). Everything is pushed straight from this repo, so updating later is one command.

```sh
git clone https://github.com/ollisulopuisto/GAS-ICS-Sync.git
cd GAS-ICS-Sync
npm install          # installs clasp, Google's Apps Script CLI
npm run login        # opens a browser to authorize clasp
npm run create       # creates the Apps Script project in your account
npm run push         # uploads the script files
npm run open         # opens the project in your browser
```

Then deploy the settings page: **Deploy** → **New deployment** → gear icon → **Web app** →
Execute as **Me**, access **Only myself** → **Deploy**, and open the URL it gives you.
Fill in your calendars there, press **Save**, then **Turn on automatic syncing**.

To update to a newer version later: `git pull && npm run push`.

### Option B: copy and paste in the browser

1. Go to [script.google.com](https://script.google.com) and click **New project**
2. **Project Settings** (gear icon) → tick **"Show 'appsscript.json' manifest file in editor"**
3. Paste each file from this repo into the editor, adding files with **+** → **Script** for the `.gs` ones
   and **+** → **HTML** for `index.html` (Google adds the file extension itself, so type `Helpers`, not `Helpers.gs`)
4. Deploy the settings page as described in option A

### Setting it up

Everything is configured on the settings page — the ics/ical feeds, which Google Calendar each one syncs
to, how often to sync, and what to hide. The values written at the top of `Code.gs` are only the defaults
used until you save your own settings, and your settings are stored in your Google account rather than in
the code, so they survive updates and are never part of anything you share.

The page also has buttons to sync once, and to turn automatic syncing on and off.

**Before the first real sync:** turn *Add new events* off, press **Sync now**, and check the execution log
(**Executions** in the Apps Script sidebar) to confirm the feeds are read correctly. Then turn it back on.

---------------

### Fork changes

**Settings page** — a web app (`Settings.gs` + `index.html`) that stores your settings per Google account
with `PropertiesService`, instead of editing variables in the code. `Code.gs` still holds the defaults, so
the script works untouched if you never open the page, and `SETTING_DEFINITIONS` in `Settings.gs` is the
single place a setting is described — the form builds itself from it.

**Privacy placeholders** — hide event details when syncing into a calendar other people can see:

| Setting | Meaning |
| --- | --- |
| `wipeTitles` | Replace every event title with `genericTitle` |
| `genericTitle` | The placeholder title (default `"varattu"`) |
| `wipeDescriptions` | Blank out event descriptions |
| `wipeLocations` | Blank out event locations |

Each feed can override these on the settings page ("Details" column), so you can hide the work feed and
leave the hobby feed readable. In code that is a 4th element in a `sourceCalendars` row — `true` hides all
three, or an object for individual flags:

```js
var sourceCalendars = [
  ["https://work.example/feed.ics", "Shared", undefined, true],
  ["https://hobby.example/feed.ics", "Shared", undefined, {wipeTitles: true}],
];
```

**Sync window** — `syncPastDays` / `syncFutureDays` limit how far back and forward events are synced
(`null` = no limit). They generate the equivalent `dtend`/`dtstart` entries in `filters.gs`.

**Keeping your own changes to a synced event** — the feed is the source of truth, so editing a synced
event in Google Calendar (renaming it, moving it, changing its length) only lasts until that event next
changes in the feed, at which point it is overwritten; deleting it re-creates it on the next run. Events
are matched by the ICS UID stored in their private extended properties, so renaming or rescheduling them
does not detach them. To keep an edit permanently, either move/copy the event to a calendar that is not a
sync target, exclude it by `uid` in `filters.gs` (see the note there), or set `modifyExistingEvents = false`
to stop all feed updates.

**Fixes on top of upstream** — TLS certificate validation enabled on feed fetches, HTML escaping in the
summary email, Google Tasks sync no longer deletes tasks it did not create or duplicates them each run,
event/task removal is skipped when a feed fails to fetch, one failing calendar no longer aborts the others,
capped retry backoff, `LockService` instead of a timestamp property, and several smaller parsing fixes.

**Tests** — `node --test tests/test.js` runs the regression tests (no dependencies; the `.gs` files are
loaded into a Node vm with stubbed Apps Script globals).

---------------

### Questions? Comments? Anything else?
[Join the Discord!](https://discord.gg/DRBpb4k)

![Discord](https://img.shields.io/discord/612735135120490496)

----------------

### Contributing

If you would like to contribute to this repository, please fork the repository, make your changes, and start a pull request. If your pull request is approved, I will add you as a contributer directly to the repository


**If you would like to fund an issue, you can do that through here: https://issuehunt.io/repos/136078981/**
