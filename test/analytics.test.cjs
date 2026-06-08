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
    board_name: 'Demandas MKT',
    board_stage_name: 'Publicacao',
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
    board_stage_name: 'Entregue',
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
    board_stage_name: 'Concluido',
    created_at: '2026-06-03T09:00:00-03:00',
    close_date: '2026-06-04T09:00:00-03:00',
    desired_date: '2026-06-05T18:00:00-03:00',
    is_closed: true,
    current_estimate_seconds: 3600,
    time_worked: 3600,
  },
  {
    id: 5,
    title: 'Demanda sem prazo',
    user_name: 'Beatriz',
    board_name: 'Demandas MKT',
    board_stage_name: 'Concluido',
    type_name: 'Social',
    project_name: 'Social',
    client_name: 'Interno',
    created_at: '2026-06-05T09:00:00-03:00',
    close_date: '2026-06-06T09:00:00-03:00',
    desired_date: null,
    is_closed: true,
    current_estimate_seconds: 3600,
    time_worked: 1800,
  },
  {
    id: 6,
    title: 'Entrega anterior',
    user_name: 'Allana',
    board_name: 'Demandas MKT',
    board_stage_name: 'Concluido',
    type_name: 'Design',
    project_name: 'Site',
    client_name: 'Interno',
    created_at: '2026-05-28T10:00:00-03:00',
    close_date: '2026-05-29T10:00:00-03:00',
    desired_date: '2026-05-30T18:00:00-03:00',
    is_closed: true,
    current_estimate_seconds: 3600,
    time_worked: 2400,
  },
];

const config = {
  collaborators: ['Allana', 'Bruno', 'Bruna', 'Beatriz'],
  boards: ['Demandas de Marketing', 'Demandas MKT', 'Criacao'],
  referenceDate: '2026-06-09T12:00:00-03:00',
};

test('buildAnalytics separates period demand, deadline status, flow metrics, and comparisons', () => {
  const analytics = buildAnalytics(tasks, {
    ...config,
    start: '2026-06-01',
    end: '2026-06-08',
    cycle: 'weekly',
  });

  assert.equal(analytics.summary.openedCreatedInPeriod, 3);
  assert.equal(analytics.summary.openedCarryover, 1);
  assert.equal(analytics.summary.opened, 4);
  assert.equal(analytics.summary.active, 4);
  assert.equal(analytics.summary.delivered, 3);
  assert.equal(analytics.summary.deliveredCreatedInPeriod, 3);
  assert.equal(analytics.summary.deliveredFromCarryover, 0);
  assert.equal(analytics.summary.deliveredWithDeadline, 2);
  assert.equal(analytics.summary.noDeadlineDelivered, 1);
  assert.equal(analytics.summary.onTime, 1);
  assert.equal(analytics.summary.onTimeRate, 50);
  assert.equal(analytics.summary.early, 1);
  assert.equal(analytics.summary.late, 1);
  assert.equal(analytics.summary.open, 1);
  assert.equal(analytics.summary.overdueOpen, 1);
  assert.equal(analytics.summary.averageExecutionSeconds, 291600);
  assert.equal(analytics.summary.throughput, 3);
  assert.equal(analytics.summary.dueDateBasis, 'current_deadline');
  assert.equal(analytics.comparisons[0].metrics.delivered.previous, 1);
  assert.equal(analytics.comparisons[0].metrics.delivered.value, 3);
  assert.equal(analytics.stageFunnel.rows.length > 0, true);
  assert.equal(analytics.stageFunnel.rows.reduce((sum, row) => sum + row.percentage, 0), 100);
  assert.equal(analytics.people.length, 4);
  assert.equal(analytics.audit.length, 4);
});

test('buildAnalytics applies the marketing and Bruno board rules', () => {
  const analytics = buildAnalytics([
    {
      id: 20,
      title: 'Fila Bruno',
      user_name: 'Bruno',
      board_name: 'Criacao',
      board_stage_name: 'Filas de demandas',
      created_at: '2026-06-02T10:00:00-03:00',
      close_date: null,
      is_closed: false,
    },
    {
      id: 21,
      title: 'Bruno fora da coluna',
      user_name: 'Bruno',
      board_name: 'Criacao',
      board_stage_name: 'Outra coluna',
      created_at: '2026-06-02T10:00:00-03:00',
      close_date: null,
      is_closed: false,
    },
    {
      id: 22,
      title: 'Allana qualquer coluna MKT',
      user_name: 'Allana',
      board_name: 'Demandas MKT',
      board_stage_name: 'Qualquer etapa',
      created_at: '2026-06-02T10:00:00-03:00',
      close_date: null,
      is_closed: false,
    },
    {
      id: 23,
      title: 'Beatriz em criacao nao conta',
      user_name: 'Beatriz',
      board_name: 'Criacao',
      board_stage_name: 'Filas de demandas',
      created_at: '2026-06-02T10:00:00-03:00',
      close_date: null,
      is_closed: false,
    },
  ], {
    ...config,
    start: '2026-06-01',
    end: '2026-06-07',
  });

  assert.equal(analytics.scopedTaskCount, 2);
  assert.deepEqual(analytics.audit.map((row) => row.title).sort(), [
    'Allana qualquer coluna MKT',
    'Fila Bruno',
  ]);
});

test('buildAnalytics accepts the real Runrun.it Demandas de MKT board name', () => {
  const analytics = buildAnalytics([
    {
      id: 30,
      title: 'Demanda real de MKT',
      responsible_name: 'Bruna Alvares',
      user_name: 'Matheus Agapito',
      board_name: 'Demandas de MKT',
      board_stage_name: 'Em andamento',
      created_at: '2026-05-21T10:00:00-03:00',
      close_date: null,
      is_closed: false,
    },
    {
      id: 31,
      title: 'Demanda com dupla atribuicao',
      responsible_name: 'Allana Guimaraes',
      user_name: 'Matheus Agapito',
      board_name: 'Demandas de MKT',
      board_stage_name: 'Ajustes',
      created_at: '2026-05-22T10:00:00-03:00',
      close_date: null,
      is_closed: false,
      assignments: [
        { id: '31-a', assignee_name: 'Allana Guimaraes' },
        { id: '31-b', assignee_name: 'Beatriz Casseb Gracia' },
      ],
    },
  ], {
    ...config,
    start: '2026-05-01',
    end: '2026-05-31',
  });

  assert.equal(analytics.scopedTaskCount, 3);
  assert.equal(analytics.people.find((person) => person.name === 'Bruna').summary.active, 1);
  assert.equal(analytics.people.find((person) => person.name === 'Allana').summary.active, 1);
  assert.equal(analytics.people.find((person) => person.name === 'Beatriz').summary.active, 1);
  assert.equal(analytics.breakdowns.boards[0].name, 'Demandas de MKT');
});

test('scorePerson rewards delivery health and penalizes overdue backlog', () => {
  const strong = scorePerson({
    active: 9,
    delivered: 8,
    deliveredWithDeadline: 8,
    onTime: 7,
    late: 1,
    overdueOpen: 0,
    open: 2,
    flowEfficiency: 84,
  });

  const risky = scorePerson({
    active: 6,
    delivered: 2,
    deliveredWithDeadline: 2,
    onTime: 0,
    late: 2,
    overdueOpen: 3,
    open: 4,
    flowEfficiency: 25,
  });

  assert.ok(strong > risky);
  assert.equal(strong <= 100, true);
  assert.equal(risky >= 0, true);
});

test('buildAnalytics uses Runrun responsible assignment instead of task creator', () => {
  const analytics = buildAnalytics([
    {
      id: 10,
      title: 'Peca de campanha',
      user_name: 'Pessoa que abriu',
      responsible_name: 'Allana Silva',
      board_name: 'Demandas MKT',
      board_stage_name: 'Concluido',
      created_at: '2026-06-02T10:00:00-03:00',
      close_date: '2026-06-03T17:00:00-03:00',
      desired_date: '2026-06-04T18:00:00-03:00',
      is_closed: true,
      assignments: [
        {
          id: 'assignment-10',
          task_id: 10,
          assignee_name: 'Allana Silva',
          start_date: '2026-06-02T11:00:00-03:00',
          close_date: '2026-06-03T17:00:00-03:00',
          is_closed: true,
          current_estimate_seconds: 7200,
          time_worked: 5400,
        },
      ],
    },
  ], {
    collaborators: ['Allana'],
    boards: ['Demandas MKT'],
    start: '2026-06-01',
    end: '2026-06-07',
    referenceDate: '2026-06-07T12:00:00-03:00',
  });

  assert.equal(analytics.scopedTaskCount, 1);
  assert.equal(analytics.summary.delivered, 1);
  assert.equal(analytics.people[0].summary.delivered, 1);
  assert.equal(analytics.audit[0].assignee, 'Allana Silva');
});

test('getPresetRange returns current Brazilian month to date', () => {
  const range = getPresetRange('this-month', new Date('2026-06-09T12:00:00-03:00'));

  assert.equal(range.start, '2026-06-01');
  assert.equal(range.end, '2026-06-09');
  assert.equal(range.label, 'Este mes');
});
