const test = require('node:test');
const assert = require('node:assert/strict');

const {
  buildAnalytics,
  getPresetRange,
  scorePerson,
} = require('../src/analytics.cjs');

const tasks = [
  {
    id: 1,
    title: 'Landing page',
    user_name: 'Allana',
    board_name: 'Demandas de Marketing',
    board_stage_name: 'Concluido',
    type_name: 'Design',
    project_name: 'Site',
    client_name: 'Interno',
    created_at: '2026-06-01T10:00:00-03:00',
    start_date: '2026-06-02T10:00:00-03:00',
    close_date: '2026-06-04T10:00:00-03:00',
    desired_date: '2026-06-05T18:00:00-03:00',
    is_closed: true,
    current_estimate_seconds: 7200,
    time_worked: 5400,
  },
  {
    id: 2,
    title: 'Campanha atrasada',
    user_name: 'Bruno',
    board_name: 'Criacao',
    board_stage_name: 'Concluido',
    type_name: 'Copy',
    project_name: 'Campanha',
    client_name: 'Interno',
    created_at: '2026-06-02T09:00:00-03:00',
    start_date: '2026-06-02T10:00:00-03:00',
    close_date: '2026-06-08T12:00:00-03:00',
    desired_date: '2026-06-06T18:00:00-03:00',
    is_closed: true,
    current_estimate_seconds: 3600,
    time_worked: 7200,
  },
  {
    id: 3,
    title: 'Post em andamento',
    user_name: 'Bruna',
    board_name: 'Demandas de Marketing',
    board_stage_name: 'Em andamento',
    type_name: 'Social',
    project_name: 'Social',
    client_name: 'Interno',
    created_at: '2026-05-25T09:00:00-03:00',
    start_date: '2026-06-03T09:00:00-03:00',
    close_date: null,
    desired_date: '2026-06-06T18:00:00-03:00',
    is_closed: false,
    current_estimate_seconds: 10800,
    time_worked: 3600,
    last_activity_at: '2026-06-03T12:00:00-03:00',
  },
  {
    id: 4,
    title: 'Demanda fora do escopo',
    user_name: 'Carlos',
    board_name: 'Operacoes',
    created_at: '2026-06-03T09:00:00-03:00',
    close_date: '2026-06-04T09:00:00-03:00',
    desired_date: '2026-06-05T18:00:00-03:00',
    is_closed: true,
    current_estimate_seconds: 3600,
    time_worked: 3600,
  },
];

const config = {
  collaborators: ['Allana', 'Bruno', 'Bruna', 'Beatriz'],
  boards: ['Demandas de Marketing', 'Criacao'],
  referenceDate: '2026-06-09T12:00:00-03:00',
};

test('buildAnalytics classifies department productivity across period views', () => {
  const analytics = buildAnalytics(tasks, {
    ...config,
    start: '2026-06-01',
    end: '2026-06-08',
    cycle: 'weekly',
  });

  assert.equal(analytics.summary.opened, 2);
  assert.equal(analytics.summary.delivered, 2);
  assert.equal(analytics.summary.active, 3);
  assert.equal(analytics.summary.early, 1);
  assert.equal(analytics.summary.onTime, 1);
  assert.equal(analytics.summary.late, 1);
  assert.equal(analytics.summary.open, 1);
  assert.equal(analytics.summary.overdueOpen, 1);
  assert.equal(analytics.summary.averageExecutionSeconds, 349200);
  assert.equal(analytics.people.length, 4);
  assert.equal(analytics.people.find((person) => person.name === 'Beatriz').summary.active, 0);
  assert.equal(analytics.audit.length, 3);
});

test('scorePerson rewards on-time delivery and penalizes overdue backlog', () => {
  const strong = scorePerson({
    delivered: 8,
    onTime: 7,
    late: 1,
    overdueOpen: 0,
    open: 2,
    workedSeconds: 18000,
    estimatedSeconds: 21600,
  }, { teamAverageDelivered: 5 });

  const risky = scorePerson({
    delivered: 2,
    onTime: 0,
    late: 2,
    overdueOpen: 3,
    open: 4,
    workedSeconds: 28800,
    estimatedSeconds: 14400,
  }, { teamAverageDelivered: 5 });

  assert.ok(strong > risky);
  assert.equal(strong <= 100, true);
  assert.equal(risky >= 0, true);
});

test('getPresetRange returns current Brazilian month to date', () => {
  const range = getPresetRange('this-month', new Date('2026-06-09T12:00:00-03:00'));

  assert.equal(range.start, '2026-06-01');
  assert.equal(range.end, '2026-06-09');
  assert.equal(range.label, 'Este mes');
});
