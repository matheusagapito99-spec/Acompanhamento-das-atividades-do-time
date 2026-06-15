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
      toggle() {},
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
      localStorage: {
        getItem() {
          return null;
        },
        setItem() {},
      },
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

test('layout exposes board filter, settings modal, and productivity impact panels', () => {
  const html = fs.readFileSync('index.html', 'utf8');

  assert.equal(html.includes('id="boardScope"'), true);
  assert.equal(html.includes('id="settingsModal"'), true);
  assert.equal(html.includes('id="productivityImpact"'), true);
  assert.equal(html.includes('id="individualImpact"'), true);
});

test('settings modal exposes target throughput and accordion card selection controls', () => {
  const html = fs.readFileSync('index.html', 'utf8');
  const app = fs.readFileSync('app.js', 'utf8');
  const styles = fs.readFileSync('styles.css', 'utf8');

  assert.equal(html.includes('aria-label="Abrir configura'), true);
  assert.equal(html.includes('data-settings-tab="cards"'), true);
  assert.equal(html.includes('id="cardSelectionList"'), true);
  assert.equal(html.includes('id="includeAllCards"'), true);
  assert.equal(html.includes('id="expectedThroughputInput"'), true);
  assert.match(app, /<details class="card-selection-person"/);
  assert.match(styles, /\.sidebar\s*{[^}]*position:\s*sticky/s);
  assert.match(html, /Cards usados/);
});

test('productivity help explains the SEFK score without progressive penalty', () => {
  const context = loadAppContext();
  const help = context.productivityHelp({
    productivityBaseScore: 59,
    productivityScore: 59,
    productivitySettings: { expectedThroughput: 20 },
    productivityBreakdown: {
      throughput: { label: 'Indice de Vazao', value: 75, weight: 40 },
      sle: { label: 'Indice de Previsibilidade / SLE', value: 36, weight: 40 },
      flowHealth: { label: 'Indice de Saude do Fluxo', value: 75, weight: 20 },
    },
  });

  assert.match(help, /SEFK/);
  assert.match(help, /Meta de vazao: 20 entregas/);
  assert.match(help, /Score final: 59%/);
  assert.doesNotMatch(help, /progressiva/i);
  assert.doesNotMatch(help, /ponto por dia/i);
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
