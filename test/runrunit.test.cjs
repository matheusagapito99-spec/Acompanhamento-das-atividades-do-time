const test = require('node:test');
const assert = require('node:assert/strict');

const {
  assertCredentials,
  buildRunrunHeaders,
  extractTaskList,
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
