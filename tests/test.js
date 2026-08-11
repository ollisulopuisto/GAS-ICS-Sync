const test = require('node:test');
const assert = require('node:assert');
const { loadScripts } = require('./harness');

// Objects created inside the vm realm have a different prototype, which
// deepStrictEqual rejects; rebuild them as plain objects of this realm.
const plain = (value) => JSON.parse(JSON.stringify(value));

//---------------------------------------------------------------------------
// parseNotificationTime
//---------------------------------------------------------------------------
test('parseNotificationTime: week durations use multiplication, not bitwise AND', () => {
  const ctx = loadScripts();
  assert.strictEqual(ctx.parseNotificationTime('-P2W'), 2 * 7 * 24 * 60);
  assert.strictEqual(ctx.parseNotificationTime('P1W'), 7 * 24 * 60);
});

test('parseNotificationTime: minute/hour/day combinations', () => {
  const ctx = loadScripts();
  assert.strictEqual(ctx.parseNotificationTime('-PT15M'), 15);
  assert.strictEqual(ctx.parseNotificationTime('-PT1H'), 60);
  assert.strictEqual(ctx.parseNotificationTime('-P1DT2H30M'), 24 * 60 + 2 * 60 + 30);
});

//---------------------------------------------------------------------------
// getValidTriggerFrequency
//---------------------------------------------------------------------------
test('getValidTriggerFrequency: invalid inputs default to 15', () => {
  const ctx = loadScripts();
  assert.strictEqual(ctx.getValidTriggerFrequency(0), 15);
  assert.strictEqual(ctx.getValidTriggerFrequency(undefined), 15);
  assert.strictEqual(ctx.getValidTriggerFrequency(-5), 15);
  assert.strictEqual(ctx.getValidTriggerFrequency(NaN), 15);
});

test('getValidTriggerFrequency: rounds up to acceptable values', () => {
  const ctx = loadScripts();
  assert.strictEqual(ctx.getValidTriggerFrequency(7), 10);
  assert.strictEqual(ctx.getValidTriggerFrequency(30), 30);
  assert.strictEqual(ctx.getValidTriggerFrequency(61), 120);
  assert.strictEqual(ctx.getValidTriggerFrequency(5000), 1440);
});

//---------------------------------------------------------------------------
// formatDate
//---------------------------------------------------------------------------
test('formatDate: supported formats', () => {
  const ctx = loadScripts();
  ctx.dateFormat = 'DD.MM.YYYY';
  assert.strictEqual(ctx.formatDate('2026-08-11'), '11.08.2026');
});

test('formatDate: unsupported format falls back to YYYY-MM-DD instead of "undefined"', () => {
  const ctx = loadScripts();
  ctx.dateFormat = 'BOGUS';
  assert.strictEqual(ctx.formatDate('2026-08-11'), '2026-08-11');
});

//---------------------------------------------------------------------------
// HTML escaping in the summary email
//---------------------------------------------------------------------------
test('escapeHtml: escapes markup-significant characters', () => {
  const ctx = loadScripts();
  assert.strictEqual(typeof ctx.escapeHtml, 'function', 'escapeHtml helper should exist');
  assert.strictEqual(ctx.escapeHtml('<b>&"\'</b>'), '&lt;b&gt;&amp;&quot;&#39;&lt;/b&gt;');
  assert.strictEqual(ctx.escapeHtml(undefined), undefined);
  assert.strictEqual(ctx.escapeHtml(null), null);
});

test('sendSummary: feed-controlled fields are HTML-escaped in the email body', () => {
  let sent = null;
  const ctx = loadScripts({ MailApp: { sendEmail: (msg) => { sent = msg; } } });
  ctx.email = 'me@example.com';
  ctx.dateFormat = 'YYYY-MM-DD';
  ctx.addedEvents.push([
    [
      '<script>alert(1)</script>',
      '2026-08-11',
      '2026-08-12',
      '<img src=x onerror=alert(2)>',
      'desc with <iframe>',
    ],
    'My <Calendar>',
  ]);
  ctx.sendSummary();
  assert.ok(sent, 'an email should be sent');
  assert.ok(!sent.htmlBody.includes('<script>'), 'script tag must be escaped');
  assert.ok(!sent.htmlBody.includes('<img'), 'img tag must be escaped');
  assert.ok(!sent.htmlBody.includes('<iframe>'), 'iframe tag must be escaped');
  assert.ok(sent.htmlBody.includes('&lt;script&gt;'), 'escaped content should remain visible');
});

//---------------------------------------------------------------------------
// fetchSourceCalendars
//---------------------------------------------------------------------------
const ICS_OK = 'BEGIN:VCALENDAR\nBEGIN:VEVENT\nEND:VEVENT\nEND:VCALENDAR';

function makeFetchStub(responsesByUrl, seenParams) {
  return {
    fetch: (url, params) => {
      seenParams.push({ url, params });
      const r = responsesByUrl[url];
      return {
        getResponseCode: () => r.code,
        getContentText: () => r.body || '',
      };
    },
  };
}

test('fetchSourceCalendars: TLS certificate validation is enabled', () => {
  const seen = [];
  const ctx = loadScripts({
    UrlFetchApp: makeFetchStub({ 'https://example.com/a.ics': { code: 200, body: ICS_OK } }, seen),
  });
  ctx.fetchSourceCalendars([['https://example.com/a.ics', undefined]]);
  assert.strictEqual(seen.length >= 1, true);
  assert.notStrictEqual(seen[0].params.validateHttpsCertificates, false,
    'validateHttpsCertificates must not be disabled');
});

test('fetchSourceCalendars: reports fetch failures so cleanup can be skipped', () => {
  const seen = [];
  const ctx = loadScripts({
    UrlFetchApp: makeFetchStub({
      'https://example.com/ok.ics': { code: 200, body: ICS_OK },
      'https://example.com/dead.ics': { code: 404, body: '' },
    }, seen),
  });
  const result = ctx.fetchSourceCalendars([
    ['https://example.com/ok.ics', undefined],
    ['https://example.com/dead.ics', undefined],
  ]);
  assert.strictEqual(result.items.length, 1, 'only the fetched feed is returned');
  assert.strictEqual(result.fetchFailed, true, 'failure must be signalled to the caller');

  const ctx2 = loadScripts({
    UrlFetchApp: makeFetchStub({ 'https://example.com/ok.ics': { code: 200, body: ICS_OK } }, []),
  });
  const result2 = ctx2.fetchSourceCalendars([['https://example.com/ok.ics', undefined]]);
  assert.strictEqual(result2.items.length, 1);
  assert.strictEqual(result2.fetchFailed, false);
});

//---------------------------------------------------------------------------
// processEventInstance: both extended-property filters must reach the API
//---------------------------------------------------------------------------
test('processEventInstance: list query keeps both fromGAS and rec-id filters', () => {
  const listCalls = [];
  const ctx = loadScripts({
    Calendar: {
      Events: {
        list: (calId, opts) => { listCalls.push(opts); return { items: [{ id: 'evt1' }] }; },
        update: () => ({}),
        insert: () => ({}),
      },
    },
  });
  ctx.modifyExistingEvents = true;
  ctx.targetCalendarId = 'cal1';
  ctx.processEventInstance({
    recurringEventId: '20260811T100000Z',
    extendedProperties: { private: { id: 'uid1' } },
  });
  const filters = listCalls[0].privateExtendedProperty;
  assert.ok(Array.isArray(filters), 'privateExtendedProperty should be an array of filters');
  assert.ok(filters.includes('fromGAS=true'), 'fromGAS filter must not be dropped');
  assert.ok(filters.includes('rec-id=uid1_20260811T100000Z'));
});

//---------------------------------------------------------------------------
// processTasks
//---------------------------------------------------------------------------
function makeTasksEnv() {
  const inserted = [];
  const removed = [];
  let nextId = 1;
  const tasksStub = {
    Tasklists: { list: () => ({ items: [{ id: 'list1', title: 'My Tasks' }] }) },
    Tasks: {
      list: () => ({ items: [{ id: 'user-task-1', title: 'Manually created task' }] }),
      insert: (task, listId) => { const t = { ...task, id: 'gtask-' + nextId++ }; inserted.push(t); return t; },
      remove: (listId, id) => { removed.push(id); },
    },
    newTask: () => ({}),
  };
  // Minimal ICAL stub that asserts parse() receives a string (the real bug fed it an array)
  const icalStub = {
    parse: (s) => {
      if (typeof s !== 'string') throw new Error('ICAL.parse received a non-string: ' + typeof s);
      return s;
    },
    Component: class {
      constructor(data) { this.data = data; }
      getAllSubcomponents(kind) {
        if (kind !== 'vtodo' || !this.data.includes('VTODO')) return [];
        return [{
          getFirstPropertyValue: (prop) => {
            if (prop === 'uid') return 'todo-uid-1';
            if (prop === 'summary') return 'Buy milk';
            if (prop === 'due') return { toJSDate: () => new Date(Date.UTC(2026, 7, 11, 12, 0, 0)) };
            return null;
          },
        }];
      }
    },
  };
  return { tasksStub, icalStub, inserted, removed };
}

const ICS_WITH_TODO = 'BEGIN:VCALENDAR\nBEGIN:VTODO\nUID:todo-uid-1\nSUMMARY:Buy milk\nEND:VTODO\nEND:VCALENDAR';

test('processTasks: parses the ICS text (not the [content, color] tuple)', () => {
  const { tasksStub, icalStub, inserted } = makeTasksEnv();
  const ctx = loadScripts({ Tasks: tasksStub, ICAL: icalStub });
  ctx.removeEventsFromCalendar = false;
  ctx.processTasks([[ICS_WITH_TODO, undefined]]);
  assert.strictEqual(inserted.length, 1);
  assert.strictEqual(inserted[0].title, 'Buy milk');
});

test('processTasks: never deletes tasks the script did not create', () => {
  const { tasksStub, icalStub, removed } = makeTasksEnv();
  const ctx = loadScripts({ Tasks: tasksStub, ICAL: icalStub });
  ctx.removeEventsFromCalendar = true;
  ctx.processTasks([[ICS_WITH_TODO, undefined]]);
  assert.ok(!removed.includes('user-task-1'),
    'a manually created task in the default list must survive the sync');
});

//---------------------------------------------------------------------------
// Stored settings (the settings GUI writes these)
//---------------------------------------------------------------------------
test('resolveSettings: returns the script defaults when nothing is stored', () => {
  const ctx = loadScripts();
  const settings = ctx.resolveSettings();
  assert.strictEqual(settings.howFrequent, ctx.howFrequent);
  assert.strictEqual(settings.genericTitle, ctx.genericTitle);
  assert.strictEqual(settings.wipeTitles, ctx.wipeTitles);
});

test('resolveSettings: stored values override the defaults and are coerced by type', () => {
  const ctx = loadScripts();
  ctx._userProps.setProperty('settings', JSON.stringify({
    howFrequent: '30',            // number as string (an HTML form always sends strings)
    wipeTitles: 'false',
    genericTitle: 'Busy',
    syncFutureDays: '90',
    addAlerts: 'no',
  }));
  const settings = ctx.resolveSettings();
  assert.strictEqual(settings.howFrequent, 30);
  assert.strictEqual(settings.wipeTitles, false);
  assert.strictEqual(settings.genericTitle, 'Busy');
  assert.strictEqual(settings.syncFutureDays, 90);
  assert.strictEqual(settings.addAlerts, 'no');
});

test('resolveSettings: invalid or unknown values fall back to the defaults', () => {
  const ctx = loadScripts();
  ctx._userProps.setProperty('settings', JSON.stringify({
    howFrequent: 'not a number',
    addAlerts: 'maybe',           // not one of the allowed options
    somethingUnknown: 'ignored',
  }));
  const settings = ctx.resolveSettings();
  assert.strictEqual(settings.howFrequent, ctx.howFrequent);
  assert.strictEqual(settings.addAlerts, ctx.addAlerts);
  assert.strictEqual(settings.somethingUnknown, undefined);
});

test('resolveSettings: empty strings mean "no limit" for the optional numbers', () => {
  const ctx = loadScripts();
  ctx._userProps.setProperty('settings', JSON.stringify({ syncPastDays: '', syncFutureDays: '14' }));
  const settings = ctx.resolveSettings();
  assert.strictEqual(settings.syncPastDays, null);
  assert.strictEqual(settings.syncFutureDays, 14);
});

test('resolveSettings: source calendars are normalized and incomplete rows dropped', () => {
  const ctx = loadScripts();
  ctx._userProps.setProperty('settings', JSON.stringify({
    sourceCalendars: [
      { url: 'https://a.ics', target: 'Work', color: '11', privacy: 'true' },
      { url: 'https://b.ics', target: 'Home', color: '', privacy: '' },
      { url: '', target: 'Nope' },
      { url: 'https://c.ics', target: '' },
    ],
  }));
  const rows = ctx.resolveSettings().sourceCalendars;
  assert.strictEqual(rows.length, 2, 'rows without a url or target are dropped');
  assert.deepStrictEqual(plain(rows[0]), ['https://a.ics', 'Work', '11', true]);
  assert.strictEqual(rows[1][0], 'https://b.ics');
  assert.strictEqual(rows[1][1], 'Home');
  assert.strictEqual(rows[1][2], undefined, 'no color means no color override');
  assert.strictEqual(rows[1][3], undefined, 'no privacy override means the globals apply');
});

test('saveSettings: stores known keys only and round-trips through resolveSettings', () => {
  const ctx = loadScripts();
  ctx.saveSettings({ genericTitle: 'Reserved', wipeLocations: 'false', bogus: 1 });
  const stored = JSON.parse(ctx._userProps.getProperty('settings'));
  assert.strictEqual(stored.bogus, undefined);
  const settings = ctx.resolveSettings();
  assert.strictEqual(settings.genericTitle, 'Reserved');
  assert.strictEqual(settings.wipeLocations, false);
});

test('resetSettings: goes back to the values written in the script', () => {
  const ctx = loadScripts();
  ctx.saveSettings({ genericTitle: 'Reserved' });
  ctx.resetSettings();
  assert.strictEqual(ctx.resolveSettings().genericTitle, ctx.genericTitle);
});

test('applySettings: every defined setting reaches its script variable', () => {
  const ctx = loadScripts();
  // Give every setting a value that differs from its default, then check it lands
  const overrides = {};
  for (const def of ctx.SETTING_DEFINITIONS){
    if (def.type === 'boolean') overrides[def.key] = !def.default;
    else if (def.type === 'number') overrides[def.key] = def.default + 5;
    else if (def.type === 'nullableNumber') overrides[def.key] = 7;
    else if (def.type === 'select') overrides[def.key] = def.options.find(o => o !== def.default);
    else if (def.type === 'calendars') overrides[def.key] = [{ url: 'https://x.ics', target: 'T' }];
    else overrides[def.key] = 'changed';
  }
  ctx.saveSettings(overrides);
  ctx.applySettings();

  for (const def of ctx.SETTING_DEFINITIONS){
    assert.notDeepStrictEqual(ctx[def.key], def.default,
      `setting "${def.key}" is not applied to the script variable of the same name`);
  }
});

test('startSync: applies the stored settings before syncing', () => {
  const ctx = loadScripts();
  ctx.saveSettings({ genericTitle: 'Reserved', wipeTitles: 'false' });
  ctx.sourceCalendars = [];
  ctx.emailSummary = false;
  ctx.syncCalendar = () => {};
  ctx.startSync();
  assert.strictEqual(ctx.genericTitle, 'Reserved');
  assert.strictEqual(ctx.wipeTitles, false);
});

//---------------------------------------------------------------------------
// Privacy placeholders
//---------------------------------------------------------------------------
test('applyPrivacySettings: wipes title, description and location per settings', () => {
  const ctx = loadScripts();
  const evt = { summary: 'Dentist', description: 'Root canal', location: 'Main St 1' };
  ctx.applyPrivacySettings(evt, { wipeTitles: true, wipeDescriptions: true, wipeLocations: true });
  assert.deepStrictEqual(evt, { summary: ctx.genericTitle, description: '', location: '' });

  const evt2 = { summary: 'Dentist', description: 'Root canal', location: 'Main St 1' };
  ctx.applyPrivacySettings(evt2, { wipeTitles: true, wipeDescriptions: false, wipeLocations: false });
  assert.deepStrictEqual(evt2, { summary: ctx.genericTitle, description: 'Root canal', location: 'Main St 1' });
});

test('getPrivacySettings: falls back to the global settings', () => {
  const ctx = loadScripts();
  ctx.wipeTitles = true;
  ctx.wipeDescriptions = false;
  ctx.wipeLocations = true;
  const event = { hasProperty: () => false, getFirstPropertyValue: () => null };
  assert.deepStrictEqual(plain(ctx.getPrivacySettings(event)),
    { wipeTitles: true, wipeDescriptions: false, wipeLocations: true });
});

test('getPrivacySettings: per-source setting overrides the globals', () => {
  const ctx = loadScripts();
  ctx.wipeTitles = false;
  ctx.wipeDescriptions = false;
  ctx.wipeLocations = false;
  const event = {
    hasProperty: (p) => p === 'privacy',
    getFirstPropertyValue: () => JSON.stringify({ wipeTitles: true, wipeLocations: true }),
  };
  assert.deepStrictEqual(plain(ctx.getPrivacySettings(event)),
    { wipeTitles: true, wipeDescriptions: false, wipeLocations: true });
});

test('condenseCalendarMap: keeps the per-source privacy setting', () => {
  const ctx = loadScripts();
  const condensed = ctx.condenseCalendarMap([
    ['https://a.ics', 'Work', '11', true],
    ['https://b.ics', 'Work', undefined, { wipeTitles: true }],
  ]);
  assert.strictEqual(condensed.length, 1);
  const sources = condensed[0][1];
  assert.deepStrictEqual(plain(sources[0]), ['https://a.ics', '11', true]);
  assert.strictEqual(sources[1][0], 'https://b.ics');
  assert.strictEqual(sources[1][1], undefined);
  assert.deepStrictEqual(plain(sources[1][2]), { wipeTitles: true });
});

//---------------------------------------------------------------------------
// Sync window
//---------------------------------------------------------------------------
test('getEffectiveFilters: no window settings means the user filters are used unchanged', () => {
  const ctx = loadScripts();
  ctx.syncPastDays = null;
  ctx.syncFutureDays = null;
  ctx.filters = [{ parameter: 'summary', type: 'exclude', comparison: 'contains', criterias: ['x'] }];
  assert.deepStrictEqual(ctx.getEffectiveFilters(), ctx.filters);
});

test('getEffectiveFilters: window settings generate dtend/dtstart filters', () => {
  const ctx = loadScripts();
  ctx.filters = [];
  ctx.syncPastDays = 30;
  ctx.syncFutureDays = 90;
  assert.deepStrictEqual(plain(ctx.getEffectiveFilters()), [
    { parameter: 'dtend', type: 'include', comparison: '>', offset: -30 },
    { parameter: 'dtstart', type: 'exclude', comparison: '>', offset: 90 },
  ]);

  ctx.syncPastDays = 0;
  ctx.syncFutureDays = null;
  assert.deepStrictEqual(plain(ctx.getEffectiveFilters()), [
    { parameter: 'dtend', type: 'include', comparison: '>', offset: 0 },
  ]);
});

//---------------------------------------------------------------------------
// Robustness
//---------------------------------------------------------------------------
test('callWithBackoff: sleep is capped so retries cannot eat the execution budget', () => {
  const sleeps = [];
  const ctx = loadScripts({
    Utilities: { sleep: (ms) => sleeps.push(ms) },
  });
  let calls = 0;
  const result = ctx.callWithBackoff(function(){
    calls++;
    if (calls < 12) throw new Error('Rate Limit Exceeded');
    return 'ok';
  }, 20);
  assert.strictEqual(result, 'ok');
  assert.ok(sleeps.length > 0);
  for (const ms of sleeps)
    assert.ok(ms <= 30000, `backoff sleep ${ms}ms exceeds the 30s cap`);
});

test('setupTargetCalendar: pages through the calendar list instead of creating a duplicate', () => {
  const pages = {
    undefined: { items: [{ id: 'c1', summary: 'Other', accessRole: 'owner' }], nextPageToken: 'p2' },
    p2: { items: [{ id: 'c2', summary: 'Wanted', accessRole: 'owner' }] },
  };
  let inserted = 0;
  const ctx = loadScripts({
    Calendar: {
      CalendarList: { list: (opts) => pages[opts.pageToken] },
      Calendars: { insert: (c) => { inserted++; return c; } },
      newCalendar: () => ({}),
      Settings: { get: () => ({ value: 'Europe/Helsinki' }) },
    },
  });
  const cal = ctx.setupTargetCalendar('Wanted');
  assert.strictEqual(cal.id, 'c2', 'should find the calendar on the second page');
  assert.strictEqual(inserted, 0, 'must not create a duplicate calendar');
});

test('startSync: a failing calendar does not abort the remaining calendars', () => {
  const ctx = loadScripts();
  const synced = [];
  ctx.sourceCalendars = [
    ['https://a.ics', 'Cal A'],
    ['https://b.ics', 'Cal B'],
  ];
  ctx.emailSummary = false;
  ctx.syncCalendar = function(calendar){
    if (calendar[0] === 'Cal A') throw new Error('boom');
    synced.push(calendar[0]);
  };
  assert.throws(() => ctx.startSync(), /produced errors/,
    'the run should still be reported as failed');
  assert.deepStrictEqual(synced, ['Cal B'], 'the second calendar must still be synced');
});

test('processTasks: does not duplicate tasks on every run and removes tasks gone from the feed', () => {
  const { tasksStub, icalStub, inserted, removed } = makeTasksEnv();
  const ctx = loadScripts({ Tasks: tasksStub, ICAL: icalStub });
  ctx.removeEventsFromCalendar = true;
  ctx.processTasks([[ICS_WITH_TODO, undefined]]);
  ctx.processTasks([[ICS_WITH_TODO, undefined]]);
  assert.strictEqual(inserted.length, 1, 'the same VTODO must not be inserted twice');

  // Feed no longer contains the todo -> the script-created task is removed
  ctx.processTasks([['BEGIN:VCALENDAR\nEND:VCALENDAR', undefined]]);
  assert.deepStrictEqual(removed, ['gtask-1']);
});
