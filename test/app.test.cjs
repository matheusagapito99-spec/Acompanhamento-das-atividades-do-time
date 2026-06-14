const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

function fakeElement(id = '') {
  return {
    id,
    textContent: '',
    innerHTML: '',
    value: '',
    dataset: {},
    className: '',
    classList: {
      add() {},
      remove() {},
    },
    addEventListener() {},
  };
}

function loadAppContext() {
  const elements = new Map();
  const source = fs.readFileSync('app.js', 'utf8').replace(/\nloadData\(\);\s*$/, '\n');
  const context = {
    console,
    Date,
    Error,
    Intl,
    Math,
    Number,
    String,
    URLSearchParams,
    document: {
      getElementById(id) {
        if (!elements.has(id)) elements.set(id, fakeElement(id));
        return elements.get(id);
      },
      querySelectorAll() {
        return [];
      },
    },
    window: {
      setInterval() {
        return 1;
      },
      clearInterval() {},
    },
    fetch() {
      throw new Error('fetch should not run during utility tests');
    },
  };
  vm.createContext(context);
  vm.runInContext(source, context);
  return context;
}

test('formatDate displays date-only API values without shifting a day back', () => {
  const context = loadAppContext();

  assert.equal(context.formatDate('2026-05-01'), '01/05/2026');
  assert.equal(context.formatDate('2026-05-31'), '31/05/2026');
});

test('layout removes comparison tab and exposes refresh countdown', () => {
  const html = fs.readFileSync('index.html', 'utf8');

  assert.equal(html.includes('data-tab="comparison"'), false);
  assert.equal(html.includes('id="comparisonView"'), false);
  assert.equal(html.includes('id="refreshCountdown"'), true);
});

test('global overview is visible only on management tabs, not alerts or audit', () => {
  const context = loadAppContext();

  assert.equal(typeof context.shouldShowGlobalOverview, 'function');
  assert.equal(context.shouldShowGlobalOverview('overview'), true);
  assert.equal(context.shouldShowGlobalOverview('workload'), true);
  assert.equal(context.shouldShowGlobalOverview('individual'), true);
  assert.equal(context.shouldShowGlobalOverview('alerts'), false);
  assert.equal(context.shouldShowGlobalOverview('audit'), false);
});
