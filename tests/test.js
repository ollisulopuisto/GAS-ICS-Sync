const test = require('node:test');
const assert = require('node:assert');
const { loadScripts } = require('./harness');

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
