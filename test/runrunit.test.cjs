const test = require('node:test');
const assert = require('node:assert/strict');

const {
  assertCredentials,
  buildRunrunHeaders,
  extractTaskList,
  fetchRunrunSnapshot,
  sanitizeApiError,
} = require('../src/runrunit.cjs');

test('assertCredentials rejects missing tokens without leaking values', () => {
  assert.throws(
    () => assertCredentials({}),
    /RUNRUNIT_APP_KEY e RUNRUNIT_USER_TOKEN/,
  );
});

test('buildRunrunHeaders uses server-only credential headers', () => {
  const headers = buildRunrunHeaders({
    RUNRUNIT_APP_KEY: 'app-secret',
    RUNRUNIT_USER_TOKEN: 'user-secret',
  });

  assert.equal(headers['App-Key'], 'app-secret');
  assert.equal(headers['User-Token'], 'user-secret');
  assert.equal(headers['Content-Type'], 'application/json');
});

test('extractTaskList supports array and wrapped API shapes', () => {
  const direct = [{ id: 1 }];
  const wrapped = { tasks: [{ id: 2 }] };
  const nested = { task_evaluations: [{ task: { id: 3 } }] };

  assert.deepEqual(extractTaskList(direct), [{ id: 1 }]);
  assert.deepEqual(extractTaskList(wrapped), [{ id: 2 }]);
  assert.deepEqual(extractTaskList(nested), [{ id: 3 }]);
});

test('sanitizeApiError removes credential-looking values', () => {
  const message = sanitizeApiError('Request failed with app-secret and user-secret', {
    RUNRUNIT_APP_KEY: 'app-secret',
    RUNRUNIT_USER_TOKEN: 'user-secret',
  });

  assert.equal(message.includes('app-secret'), false);
  assert.equal(message.includes('user-secret'), false);
  assert.equal(message.includes('[oculto]'), true);
});

test('fetchRunrunSnapshot loads open and closed task pages', async () => {
  const calls = [];
  const fetchImpl = async (url) => {
    calls.push(url);
    const body = (() => {
      if (url.includes('/users')) return [];
      if (url.includes('/boards')) return [];
      if (url.includes('/tasks') && url.includes('is_closed=true')) {
        return [{ id: 2, title: 'Closed task', is_closed: true, close_date: '2026-06-03T12:00:00-03:00' }];
      }
      if (url.includes('/tasks') && url.includes('is_closed=false')) {
        return [{ id: 1, title: 'Open task', is_closed: false, close_date: null }];
      }
      return [];
    })();

    return new Response(JSON.stringify(body), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    });
  };

  const snapshot = await fetchRunrunSnapshot({
    env: {
      RUNRUNIT_APP_KEY: 'app-secret',
      RUNRUNIT_USER_TOKEN: 'user-secret',
    },
    fetchImpl,
    start: '2026-06-01',
    end: '2026-06-07',
  });

  assert.equal(snapshot.tasks.length, 2);
  assert.equal(calls.some((url) => url.includes('is_closed=false')), true);
  assert.equal(calls.some((url) => url.includes('is_closed=true')), true);
});
