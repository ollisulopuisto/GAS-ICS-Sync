# Changelog

Versions are calendar versions: `vYY.MM.DD.build`.

## v26.08.11.1

First release of this fork. It is based on the current upstream
[derekantrican/GAS-ICS-Sync](https://github.com/derekantrican/GAS-ICS-Sync) code, with the changes below.

### Added

- **Settings page.** A web app (`Settings.gs` + `index.html`) that stores settings per Google account with
  `PropertiesService` instead of requiring edits to the code. It suggests the calendars the account can write
  to, offers Google's event colours by name, names the account it is working on, and can sync once or turn
  automatic syncing on and off. `SETTING_DEFINITIONS` describes each setting once and the form builds itself
  from it. The values in `Code.gs` remain the defaults, so the script still works untouched.
- **Privacy placeholders.** `wipeTitles` (with `genericTitle`), `wipeDescriptions` and `wipeLocations` replace
  event details with a placeholder, so a private feed can be synced into a calendar other people can see.
  Each feed can override them, on the settings page or as a 4th element of a `sourceCalendars` row.
- **Sync window.** `syncPastDays` / `syncFutureDays` limit how far back and forward events are synced,
  generating the equivalent `dtend`/`dtstart` filters.
- **Install from a clone.** `npm run create && npm run push` installs the whole project with clasp, and
  `git pull && npm run push` updates it.
- **Tests.** `node --test tests/test.js` runs 43 regression tests with no dependencies; the `.gs` files are
  loaded into a Node vm with stubbed Apps Script globals. Also run in CI on every push.

### Fixed

- TLS certificate validation was disabled on every feed fetch, so anyone able to intercept the connection
  could inject or replace events.
- The summary email interpolated feed-controlled titles, locations and descriptions into HTML unescaped.
- Google Tasks sync compared Google-assigned task ids against ICS UIDs, so with `addTasks` and
  `removeEventsFromCalendar` on it deleted every task in the default task list on each run, and re-inserted
  the feed's tasks as duplicates. Tasks created by the script are now tracked by UID and only those are removed.
- Task parsing was handed the `[content, colorId]` pair instead of the ICS text, so it always threw.
- A feed that failed to fetch made its events look deleted, so they were removed from the calendar and
  re-created on the next run. Removal is now skipped when a source could not be fetched.
- A failed listing of existing events crashed the run, or silently synced against a partial list.
- One failing target calendar aborted the whole run; each calendar is now isolated.
- `parseNotificationTime` used a bitwise AND instead of a multiplication for week-long reminder offsets.
- A duplicate object key dropped the `fromGAS` filter when patching recurrence instances, so it could match
  events the script did not create.
- The calendar list was read without paging, creating a duplicate target calendar past 250 calendars.
- Retry backoff had no jitter (it was added to `sleep`'s return value) and no cap, so a long retry chain
  could use up the whole execution time.
- A crashed run left the "already running" marker set; `LockService` is now used instead.
- `getValidTriggerFrequency` had an operator precedence bug in its validity check.
- An unsupported `dateFormat` produced the string "undefined" in the summary email.
- The update check pointed at upstream and parsed versions as floats; it now follows this repository and
  compares calendar versions properly.
- Removed the `String.prototype.includes` override, which is native on the V8 runtime.
