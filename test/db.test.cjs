const test = require('node:test');
const assert = require('node:assert/strict');

const {
  dbEnabled,
  resolveDue,
  getTaskId,
  buildDueList,
  overlayFirstDue,
} = require('../src/db.cjs');

test('dbEnabled reflects DATABASE_URL presence', () => {
  assert.equal(dbEnabled({}), false);
  assert.equal(dbEnabled({ DATABASE_URL: 'postgres://x' }), true);
});

test('resolveDue follows the deadline precedence and rejects invalid dates', () => {
  assert.equal(resolveDue({ first_desired_date: '2026-06-05T18:00:00-03:00', desired_date: '2026-06-10' }), new Date('2026-06-05T18:00:00-03:00').toISOString());
  assert.equal(resolveDue({ desired_date: '2026-06-10' }), new Date('2026-06-10').toISOString());
  assert.equal(resolveDue({ due_date: 'data-invalida' }), null);
  assert.equal(resolveDue({}), null);
});

test('buildDueList keeps only cards with id and a due date', () => {
  const list = buildDueList([
    { id: 1, desired_date: '2026-06-05' },
    { id: 2 },
    { desired_date: '2026-06-07' },
    { id: 3, due_date: '2026-06-09' },
  ]);
  assert.deepEqual(list.map((x) => x.id), ['1', '3']);
});

test('overlayFirstDue exposes the persisted first deadline as first_desired_date', () => {
  const tasks = [
    { id: 1, desired_date: '2026-06-20' },
    { id: 2, desired_date: '2026-06-21' },
  ];
  const out = overlayFirstDue(tasks, { 1: '2026-06-05T00:00:00.000Z' });
  assert.equal(out[0].first_desired_date, '2026-06-05T00:00:00.000Z');
  assert.equal(out[0].desired_date, '2026-06-20'); // preserva o original
  assert.equal(out[1].first_desired_date, undefined); // sem primeiro prazo registrado
});

test('getTaskId normalizes id sources', () => {
  assert.equal(getTaskId({ id: 10 }), '10');
  assert.equal(getTaskId({ task_id: 'abc' }), 'abc');
  assert.equal(getTaskId({}), null);
});
