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

test('buildAnalytics filters the calculation by selected board scope', () => {
  const analytics = buildAnalytics(tasks, {
    ...config,
    start: '2026-06-01',
    end: '2026-06-08',
    boardScope: 'marketing',
  });

  assert.equal(analytics.scope.boardScope, 'marketing');
  assert.equal(analytics.summary.delivered, 2);
  assert.equal(analytics.people.find((person) => person.name === 'Bruno').summary.active, 0);
  assert.deepEqual(analytics.audit.map((row) => row.title).sort(), [
    'Demanda sem prazo',
    'Landing page',
    'Post em andamento',
  ]);

  const creationAnalytics = buildAnalytics(tasks, {
    ...config,
    start: '2026-06-01',
    end: '2026-06-08',
    boardScope: 'creation',
  });

  assert.equal(creationAnalytics.scope.boardScope, 'creation');
  assert.equal(creationAnalytics.summary.delivered, 1);
  assert.deepEqual(creationAnalytics.audit.map((row) => row.title), ['Campanha atrasada']);
});

test('buildAnalytics lets managers exclude individual cards from productivity calculations', () => {
  const analytics = buildAnalytics(tasks, {
    ...config,
    start: '2026-06-01',
    end: '2026-06-08',
    excludedTaskIdsByPerson: {
      Allana: [1],
    },
  });

  const allana = analytics.people.find((person) => person.name === 'Allana');
  const bruno = analytics.people.find((person) => person.name === 'Bruno');
  const allanaSelection = analytics.cardSelection.people.find((person) => person.name === 'Allana');

  assert.equal(allana.summary.delivered, 0);
  assert.equal(bruno.summary.delivered, 1);
  assert.equal(analytics.summary.delivered, 2);
  assert.equal(analytics.audit.some((row) => row.id === 1), false);
  assert.equal(allanaSelection.cards.find((card) => card.id === 1).included, false);
  assert.equal(analytics.scope.excludedTaskIdsByPerson.Allana[0], '1');
});

test('progressive late weight makes long delays cost more productivity points than short delays', () => {
  const analytics = buildAnalytics([
    {
      id: 50,
      title: 'Atraso de uma hora',
      user_name: 'Allana',
      board_name: 'Demandas MKT',
      board_stage_name: 'Concluido',
      created_at: '2026-06-01T09:00:00-03:00',
      close_date: '2026-06-02T19:00:00-03:00',
      desired_date: '2026-06-02T18:00:00-03:00',
      is_closed: true,
    },
    {
      id: 51,
      title: 'Atraso de trinta e cinco dias',
      user_name: 'Allana',
      board_name: 'Demandas MKT',
      board_stage_name: 'Concluido',
      created_at: '2026-05-01T09:00:00-03:00',
      close_date: '2026-06-06T18:00:00-03:00',
      desired_date: '2026-05-02T18:00:00-03:00',
      is_closed: true,
    },
  ], {
    collaborators: ['Allana'],
    boards: ['Demandas MKT'],
    start: '2026-06-01',
    end: '2026-06-08',
    latePenaltyPerDay: 0.5,
  });

  const [longDelay, shortDelay] = analytics.productivityImpacts;
  assert.equal(longDelay.title, 'Atraso de trinta e cinco dias');
  assert.equal(shortDelay.title, 'Atraso de uma hora');
  assert.ok(longDelay.lostPoints > shortDelay.lostPoints);
  assert.ok(analytics.summary.latePenaltyPoints >= longDelay.lostPoints);
  assert.equal(analytics.summary.productivityScore, analytics.summary.productivityBaseScore);
  assert.ok(analytics.summary.productivityBreakdown.delayControl.value < 100);
});

test('productivity score is a bounded Kanban flow score instead of an unbounded late subtraction', () => {
  const score = scorePerson({
    productivityBaseScore: 32,
    latePenaltyPoints: 145.86,
  });

  assert.equal(score, 32);

  const analytics = buildAnalytics([
    {
      id: 70,
      title: 'Entrega feita com atraso longo',
      user_name: 'Allana',
      board_name: 'Demandas MKT',
      board_stage_name: 'Concluido',
      created_at: '2025-01-01T09:00:00-03:00',
      close_date: '2026-06-05T18:00:00-03:00',
      desired_date: '2025-01-05T18:00:00-03:00',
      is_closed: true,
      current_estimate_seconds: 7200,
      time_worked: 3600,
    },
  ], {
    collaborators: ['Allana'],
    boards: ['Demandas MKT'],
    start: '2026-06-01',
    end: '2026-06-08',
    latePenaltyPerDay: 0.2,
  });

  assert.equal(analytics.summary.delivered, 1);
  assert.ok(analytics.summary.latePenaltyPoints > analytics.summary.productivityBaseScore);
  assert.ok(analytics.summary.productivityScore > 0);
  assert.equal(analytics.summary.productivityScore, analytics.summary.productivityBaseScore);
  assert.match(analytics.summary.productivityMethodology, /Kanban/);
});

test('open overdue tasks appear in productivity impact lists for the team and the person', () => {
  const analytics = buildAnalytics([
    {
      id: 60,
      title: 'Demanda aberta muito vencida',
      user_name: 'Bruna',
      board_name: 'Demandas MKT',
      board_stage_name: 'Em andamento',
      created_at: '2026-05-01T09:00:00-03:00',
      close_date: null,
      desired_date: '2026-05-10T18:00:00-03:00',
      is_closed: false,
    },
  ], {
    collaborators: ['Bruna'],
    boards: ['Demandas MKT'],
    start: '2026-06-01',
    end: '2026-06-08',
    latePenaltyPerDay: 0.25,
  });

  assert.equal(analytics.productivityImpacts.length, 1);
  assert.equal(analytics.productivityImpacts[0].title, 'Demanda aberta muito vencida');
  assert.equal(analytics.people[0].productivityImpacts[0].title, 'Demanda aberta muito vencida');
  assert.equal(analytics.audit[0].lostPoints, analytics.productivityImpacts[0].lostPoints);
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

test('buildAnalytics prioritizes the assigned collaborator over a matching creator/requester', () => {
  const analytics = buildAnalytics([
    {
      id: 40,
      title: 'Video com responsavel Beatriz',
      user_name: 'Allana Guimaraes',
      responsible_name: 'Beatriz Casseb Gracia',
      board_name: 'Demandas de MKT',
      board_stage_name: 'Em andamento',
      created_at: '2026-05-21T10:00:00-03:00',
      close_date: null,
      is_closed: false,
    },
  ], {
    ...config,
    start: '2026-05-01',
    end: '2026-05-31',
  });

  assert.equal(analytics.people.find((person) => person.name === 'Allana').summary.active, 0);
  assert.equal(analytics.people.find((person) => person.name === 'Beatriz').summary.active, 1);
  assert.equal(analytics.audit[0].collaborator, 'Beatriz');
});

test('getPresetRange returns current Brazilian month to date', () => {
  const range = getPresetRange('this-month', new Date('2026-06-09T12:00:00-03:00'));

  assert.equal(range.start, '2026-06-01');
  assert.equal(range.end, '2026-06-09');
  assert.equal(range.label, 'Este mes');
});
