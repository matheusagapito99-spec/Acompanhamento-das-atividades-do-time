const test = require('node:test');
const assert = require('node:assert/strict');

const {
  DEFAULT_REPORT_FROM,
  DEFAULT_REPORT_BODY_TEMPLATE,
  DEFAULT_REPORT_SUBJECT_TEMPLATE,
  buildReportEmailHtml,
  buildReportPeriods,
  getReportTemplate,
  getReportFromOptions,
  renderTemplateText,
  resolveCollaboratorRecipients,
  sendEmailViaResend,
} = require('../src/reports.cjs');

test('report periods close the previous week and include monthly comparison on the first Monday', () => {
  const periods = buildReportPeriods(new Date('2026-07-06T12:00:00-03:00'));

  assert.deepEqual(periods.week, {
    start: '2026-06-29',
    end: '2026-07-05',
    label: 'Semana anterior',
  });
  assert.deepEqual(periods.previousWeek, {
    start: '2026-06-22',
    end: '2026-06-28',
    label: 'Semana comparativa',
  });
  assert.deepEqual(periods.month, {
    start: '2026-06-01',
    end: '2026-06-30',
    label: 'Mes fechado anterior',
  });
  assert.deepEqual(periods.previousMonth, {
    start: '2026-05-01',
    end: '2026-05-31',
    label: 'Mes comparativo',
  });
});

test('report sender options always include the requested default sender', () => {
  const options = getReportFromOptions({
    REPORT_FROM_EMAILS: 'relatorios@avalyst.com.br, m.agapito@avalyst.com.br',
  });

  assert.equal(DEFAULT_REPORT_FROM, 'm.agapito@avalyst.com.br');
  assert.equal(options[0], 'm.agapito@avalyst.com.br');
  assert.deepEqual(options, ['m.agapito@avalyst.com.br', 'relatorios@avalyst.com.br']);
});

test('collaborator recipients use emails registered on Runrun.it users', () => {
  const recipients = resolveCollaboratorRecipients([
    { name: 'Allana Souza', email: 'allana@avalyst.com.br' },
    { full_name: 'Bruno Agapito', email_address: 'bruno@avalyst.com.br' },
    { name: 'Pessoa fora do time', email: 'fora@avalyst.com.br' },
  ], ['Allana', 'Bruno', 'Bruna']);

  assert.deepEqual(recipients, [
    { collaborator: 'Allana', email: 'allana@avalyst.com.br', userName: 'Allana Souza' },
    { collaborator: 'Bruno', email: 'bruno@avalyst.com.br', userName: 'Bruno Agapito' },
  ]);
});

test('report email includes individual and department performance blocks', () => {
  const html = buildReportEmailHtml({
    collaborator: 'Allana',
    department: {
      summary: {
        productivityScore: 72,
        delivered: 12,
        onTimeRate: 80,
        overdueOpen: 2,
      },
    },
    person: {
      summary: {
        productivityScore: 84,
        delivered: 4,
        onTimeRate: 100,
        overdueOpen: 0,
      },
      productivityImpacts: [{ id: 10, title: 'Card atrasado', lateDays: 2 }],
    },
    period: { start: '2026-06-08', end: '2026-06-14' },
    comparison: { summary: { productivityScore: 70 } },
  });

  assert.match(html, /Allana/);
  assert.match(html, /Departamento/);
  assert.match(html, /Produtividade individual/);
  assert.match(html, /Produtividade do departamento/);
  assert.match(html, /Card atrasado/);
});

test('report templates expose editable subject and body variables', () => {
  const template = getReportTemplate({
    REPORT_SUBJECT_TEMPLATE: 'Fechamento {{colaborador}} - {{produtividade}}',
    REPORT_BODY_TEMPLATE: 'Oi {{colaborador}}\nScore: {{produtividade}}\n{{blocoMetricas}}',
  });

  assert.equal(template.subjectTemplate, 'Fechamento {{colaborador}} - {{produtividade}}');
  assert.equal(template.bodyTemplate, 'Oi {{colaborador}}\nScore: {{produtividade}}\n{{blocoMetricas}}');
  assert.equal(template.variables.some((item) => item.key === 'departamentoProdutividade'), true);
  assert.equal(DEFAULT_REPORT_SUBJECT_TEMPLATE.includes('{{periodo}}'), true);
  assert.equal(DEFAULT_REPORT_BODY_TEMPLATE.includes('{{blocoMetricas}}'), true);
});

test('custom report templates render metric variables in subject and body', () => {
  const html = buildReportEmailHtml({
    collaborator: 'Bruno',
    department: {
      summary: {
        productivityScore: 55,
        delivered: 10,
        onTimeRate: 40,
        overdueOpen: 3,
      },
    },
    person: {
      summary: {
        productivityScore: 62,
        delivered: 3,
        onTimeRate: 67,
        overdueOpen: 1,
      },
      productivityImpacts: [],
    },
    period: { start: '2026-06-08', end: '2026-06-14' },
    template: {
      bodyTemplate: 'Resumo de {{colaborador}}: {{produtividade}}. Departamento: {{departamentoProdutividade}}.',
    },
  });

  assert.match(html, /Resumo de Bruno: 62%/);
  assert.match(html, /Departamento: 55%/);
});

test('execution report (Bruno) shows execution metrics instead of delivery metrics', () => {
  const html = buildReportEmailHtml({
    collaborator: 'Bruno',
    department: { summary: { productivityScore: 70, delivered: 8, onTimeRate: 80, overdueOpen: 1 } },
    person: {
      summary: {
        role: 'execution',
        productivityScore: 55,
        efficiency: 55,
        cardsWorked: 12,
        executionSeconds: 3600 * 40,
        averageExecutionSeconds: 3600 * 3,
        aging: 2,
        overEstimate: 3,
      },
      productivityImpacts: [],
    },
    period: { start: '2026-06-08', end: '2026-06-14' },
  });

  assert.match(html, /Execucao no quadro de Criacao/);
  assert.match(html, /Cards executados/);
  assert.doesNotMatch(html, /Produtividade individual/);
});

test('renderTemplateText strips visual HTML-only variables from subject templates', () => {
  const subject = renderTemplateText('Assunto {{colaborador}} {{blocoMetricas}}', { colaborador: 'Beatriz', blocoMetricas: '<table></table>' });

  assert.equal(subject, 'Assunto Beatriz');
});

test('sendEmailViaResend posts the report with API key and selected sender', async () => {
  const calls = [];
  const result = await sendEmailViaResend({
    from: 'm.agapito@avalyst.com.br',
    to: 'allana@avalyst.com.br',
    subject: 'Relatorio',
    html: '<p>ok</p>',
    env: { RESEND_API_KEY: 're_test' },
    fetchImpl: async (url, options) => {
      calls.push({ url, options });
      return {
        ok: true,
        status: 200,
        async json() {
          return { id: 'email_123' };
        },
        async text() {
          return '';
        },
      };
    },
  });

  assert.equal(result.id, 'email_123');
  assert.equal(calls[0].url, 'https://api.resend.com/emails');
  assert.equal(calls[0].options.headers.Authorization, 'Bearer re_test');
  assert.deepEqual(JSON.parse(calls[0].options.body), {
    from: 'm.agapito@avalyst.com.br',
    to: ['allana@avalyst.com.br'],
    subject: 'Relatorio',
    html: '<p>ok</p>',
  });
});
