// Loads the .gs files into a Node vm context with stubbed Google Apps Script globals,
// so the plain-JS logic can be unit tested with `node --test tests/`.
const fs = require('fs');
const path = require('path');
const vm = require('vm');

function makePropertyStore() {
  const store = {};
  return {
    getProperty: (k) => (k in store ? store[k] : null),
    setProperty: (k, v) => { store[k] = String(v); },
    deleteProperty: (k) => { delete store[k]; },
    _store: store,
  };
}

function loadScripts(overrides = {}) {
  const userProps = makePropertyStore();
  const scriptProps = makePropertyStore();

  const context = {
    console,
    Logger: { log: () => {} },
    Utilities: {
      formatDate: () => { throw new Error('Utilities.formatDate stub not implemented'); },
      sleep: () => {},
      computeDigest: () => [0, 1, 2],
      DigestAlgorithm: { MD5: 'MD5' },
      Charset: { UTF_8: 'UTF_8' },
    },
    PropertiesService: {
      getUserProperties: () => userProps,
      getScriptProperties: () => scriptProps,
    },
    LockService: {
      getUserLock: () => ({ tryLock: () => true, releaseLock: () => {} }),
    },
    ScriptApp: { getProjectTriggers: () => [], newTrigger: () => {} },
    Calendar: {},
    CalendarApp: { EventColor: {} },
    MailApp: { sendEmail: () => {} },
    Tasks: {},
    UrlFetchApp: {},
    ICAL: {},
    HtmlService: {
      XFrameOptionsMode: {
        ALLOWALL: 'ALLOWALL',
        DEFAULT: 'DEFAULT',
        DENY: 'DENY',
      },
      createHtmlOutputFromFile: (filename) => {
        const output = {
          _filename: filename,
          _title: '',
          _metaTags: [],
          _xFrameOptionsMode: null,
          setTitle: function(t) { output._title = t; return output; },
          addMetaTag: function(name, content) { output._metaTags.push({ name, content }); return output; },
          setXFrameOptionsMode: function(mode) { output._xFrameOptionsMode = mode; return output; },
        };
        return output;
      },
    },
    ...overrides,
  };
  vm.createContext(context);
  for (const f of ['Code.gs', 'Helpers.gs', 'Settings.gs', 'filters.gs', 'tzid.gs']) {
    const code = fs.readFileSync(path.join(__dirname, '..', f), 'utf8');
    vm.runInContext(code, context, { filename: f });
  }
  context._userProps = userProps;
  context._scriptProps = scriptProps;
  return context;
}

module.exports = { loadScripts };
