const test = require('node:test');
const assert = require('node:assert/strict');

const {
  classifyBoard,
  isApprovalStage,
  isExecutionStage,
  parseDurationToSeconds,
  parseTaskHistory,
} = require('../src/history.cjs');

test('parseDurationToSeconds reads Runrun.it duration strings', () => {
  assert.equal(parseDurationToSeconds('2h 58min'), 2 * 3600 + 58 * 60);
  assert.equal(parseDurationToSeconds('2d 19h 51min'), 2 * 86400 + 19 * 3600 + 51 * 60);
  assert.equal(parseDurationToSeconds('1d'), 86400);
  assert.equal(parseDurationToSeconds('45min'), 2700);
  assert.equal(parseDurationToSeconds('1h 0min'), 3600);
  assert.equal(parseDurationToSeconds(''), 0);
});

test('classifyBoard distinguishes the creation board from the marketing board', () => {
  assert.equal(classifyBoard('Demandas de MKT (Criação)'), 'bruno');
  assert.equal(classifyBoard('Criação'), 'bruno');
  assert.equal(classifyBoard('Demandas de MKT'), 'marketing');
  assert.equal(classifyBoard('Demandas de Marketing'), 'marketing');
  assert.equal(classifyBoard('Qualquer coisa', '606409'), 'bruno');
  assert.equal(classifyBoard('Qualquer coisa', '601838'), 'marketing');
  assert.equal(classifyBoard('Operações'), 'other');
});

test('isApprovalStage / isExecutionStage recognise the relevant columns', () => {
  assert.equal(isApprovalStage('Aprovação'), true);
  assert.equal(isApprovalStage('Aprovação de texto ou arte'), true);
  assert.equal(isApprovalStage('Fila de demandas'), false);
  assert.equal(isExecutionStage('Em produção'), true);
  assert.equal(isExecutionStage('Fazendo Bruno'), true);
  assert.equal(isExecutionStage('Aprovação'), false);
});

test('parseTaskHistory reconstructs board time, Bruno execution and approval excess from comments', () => {
  const comments = [
    { created_at: '2026-06-01T00:00:00Z', text: "Bruno moveu a tarefa da etapa 'Em produção' para a etapa 'Aprovação' no quadro 'Demandas de MKT (Criação)'. A tarefa permaneceu 1d na etapa 'Em produção'." },
    { created_at: '2026-06-02T00:00:00Z', text: "O tempo limite de inatividade de 1 dia na etapa 'Aprovação' foi ultrapassado." },
    { created_at: '2026-06-03T00:00:00Z', text: "Bruna moveu a tarefa da etapa 'Aprovação' para a etapa 'Entregues' no quadro 'Demandas de MKT (Criação)'. A tarefa permaneceu 2d na etapa 'Aprovação'." },
  ];
  const h = parseTaskHistory(comments, { now: '2026-06-04T00:00:00Z' });
  assert.equal(h.hasHistory, true);
  assert.equal(h.boardTimeSeconds.bruno, 86400 + 172800);
  assert.equal(h.brunoExecutionSeconds, 86400);
  assert.equal(h.approvalExcessSeconds, 86400); // limite ultrapassado 02 -> saiu 03 = 1 dia
  assert.equal(h.pausedSeconds, 259200 - 86400);
});

test('parseTaskHistory counts ongoing approval excess when still parked past 1 day', () => {
  const h = parseTaskHistory([], {
    now: '2026-06-03T00:00:00Z',
    lastActivityAt: '2026-06-01T00:00:00Z', // 2 dias parado
    currentBoardName: 'Demandas de MKT (Criação)',
    currentStageName: 'Aprovação',
  });
  assert.equal(h.boardTimeSeconds.bruno, 172800);
  assert.equal(h.approvalExcessSeconds, 86400); // 2 dias - 1 dia de tolerância
  assert.equal(h.pausedSeconds, 86400);
});

test('parseTaskHistory tracks marketing board time separately', () => {
  const comments = [
    { created_at: '2026-06-01T00:00:00Z', text: "Bruna moveu a tarefa da etapa 'Em andamento' para a etapa 'Concluído' no quadro 'Demandas de MKT'. A tarefa permaneceu 3h na etapa 'Em andamento'." },
  ];
  const h = parseTaskHistory(comments, { now: '2026-06-02T00:00:00Z' });
  assert.equal(h.boardTimeSeconds.marketing, 3 * 3600);
  assert.equal(h.boardTimeSeconds.bruno, 0);
  assert.equal(h.pausedSeconds, 0);
});
