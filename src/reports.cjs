const { buildAnalytics, matchesConfiguredName } = require('./analytics.cjs');
const { fetchRunrunSnapshot, getDashboardConfig } = require('./runrunit.cjs');

const DAY_MS = 86400000;
const BRAZIL_TIME_ZONE = 'America/Sao_Paulo';
const DEFAULT_REPORT_FROM = 'm.agapito@avalyst.com.br';
const RESEND_ENDPOINT = 'https://api.resend.com/emails';
const DEFAULT_REPORT_SUBJECT_TEMPLATE = 'Relatorio de produtividade - {{colaborador}} - {{periodo}}{{complementoMensal}}';
const DEFAULT_REPORT_BODY_TEMPLATE = `Ola, {{colaborador}}.

Segue o fechamento de produtividade do periodo {{periodo}}.

{{blocoMetricas}}

Tarefas que mais afetam o fluxo:
{{tarefasCriticas}}

{{complementoMensalTexto}}`;
const REPORT_TEMPLATE_VARIABLES = [
  { key: 'colaborador', label: 'Nome do colaborador' },
  { key: 'periodo', label: 'Periodo analisado' },
  { key: 'periodoInicio', label: 'Inicio do periodo' },
  { key: 'periodoFim', label: 'Fim do periodo' },
  { key: 'produtividade', label: 'Produtividade individual' },
  { key: 'entregues', label: 'Entregas individuais' },
  { key: 'noPrazo', label: 'Percentual no prazo individual' },
  { key: 'atrasadas', label: 'Entregas atrasadas individuais' },
  { key: 'vencidas', label: 'Abertas vencidas individuais' },
  { key: 'vazao', label: 'Vazao individual' },
  { key: 'tempoMedio', label: 'Tempo medio individual' },
  { key: 'tempoApontado', label: 'Tempo apontado individual' },
  { key: 'departamentoProdutividade', label: 'Produtividade do departamento' },
  { key: 'departamentoEntregues', label: 'Entregas do departamento' },
  { key: 'departamentoNoPrazo', label: 'Percentual no prazo do departamento' },
  { key: 'departamentoAtrasadas', label: 'Atrasadas do departamento' },
  { key: 'departamentoVencidas', label: 'Abertas vencidas do departamento' },
  { key: 'departamentoVazao', label: 'Vazao do departamento' },
  { key: 'blocoMetricas', label: 'Bloco visual de metricas' },
  { key: 'tarefasCriticas', label: 'Lista de tarefas criticas' },
  { key: 'complementoMensal', label: 'Sufixo do assunto quando houver mes fechado' },
  { key: 'complementoMensalTexto', label: 'Bloco mensal no corpo' },
];

const dateKeyFormatter = new Intl.DateTimeFormat('en-CA', {
  timeZone: BRAZIL_TIME_ZONE,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
});

function toDateKey(value) {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  const parts = dateKeyFormatter.formatToParts(date).reduce((acc, part) => {
    if (part.type !== 'literal') acc[part.type] = part.value;
    return acc;
  }, {});
  return `${parts.year}-${parts.month}-${parts.day}`;
}

function parseDateKey(key) {
  const [year, month, day] = String(key || '').split('-').map(Number);
  return { year, month, day };
}

function addDaysKey(key, amount) {
  const base = new Date(`${key}T12:00:00.000-03:00`);
  base.setTime(base.getTime() + (amount * DAY_MS));
  return toDateKey(base);
}

function daysInMonth(year, month) {
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

function previousMonthRange(year, month, offset = 1) {
  let targetMonth = month - offset;
  let targetYear = year;
  while (targetMonth <= 0) {
    targetMonth += 12;
    targetYear -= 1;
  }
  return {
    start: `${targetYear}-${String(targetMonth).padStart(2, '0')}-01`,
    end: `${targetYear}-${String(targetMonth).padStart(2, '0')}-${String(daysInMonth(targetYear, targetMonth)).padStart(2, '0')}`,
  };
}

function buildReportPeriods(referenceDate = new Date()) {
  const todayKey = toDateKey(referenceDate);
  const { year, month, day } = parseDateKey(todayKey);
  const noon = new Date(`${todayKey}T12:00:00.000-03:00`);
  const weekday = noon.getUTCDay();
  const mondayOffset = weekday === 0 ? -6 : 1 - weekday;
  const currentWeekStart = addDaysKey(todayKey, mondayOffset);
  const week = {
    start: addDaysKey(currentWeekStart, -7),
    end: addDaysKey(currentWeekStart, -1),
    label: 'Semana anterior',
  };
  const previousWeek = {
    start: addDaysKey(currentWeekStart, -14),
    end: addDaysKey(currentWeekStart, -8),
    label: 'Semana comparativa',
  };

  const periods = { week, previousWeek };
  if (day <= 7) {
    periods.month = {
      ...previousMonthRange(year, month, 1),
      label: 'Mes fechado anterior',
    };
    periods.previousMonth = {
      ...previousMonthRange(year, month, 2),
      label: 'Mes comparativo',
    };
  }

  return periods;
}

function normalizeEmail(value) {
  const email = String(value || '').trim();
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ? email : '';
}

function getUserName(user = {}) {
  return user.name
    || user.full_name
    || user.display_name
    || user.username
    || user.login
    || '';
}

function getUserEmail(user = {}) {
  return normalizeEmail(
    user.email
      || user.email_address
      || user.user_email
      || user.contact_email
      || user.login,
  );
}

function uniqueEmails(values = []) {
  const seen = new Set();
  const emails = [];
  for (const value of values) {
    const email = normalizeEmail(value);
    if (email && !seen.has(email.toLowerCase())) {
      seen.add(email.toLowerCase());
      emails.push(email);
    }
  }
  return emails;
}

function getReportFromOptions(env = process.env) {
  return uniqueEmails([
    env.REPORT_DEFAULT_FROM || DEFAULT_REPORT_FROM,
    DEFAULT_REPORT_FROM,
    ...String(env.REPORT_FROM_EMAILS || '').split(','),
  ]);
}

function normalizeTemplateText(value, fallback) {
  const text = String(value || '').trim();
  return text || fallback;
}

function getReportTemplate(env = process.env, template = {}) {
  return {
    subjectTemplate: normalizeTemplateText(
      template.subjectTemplate || env.REPORT_SUBJECT_TEMPLATE,
      DEFAULT_REPORT_SUBJECT_TEMPLATE,
    ),
    bodyTemplate: normalizeTemplateText(
      template.bodyTemplate || env.REPORT_BODY_TEMPLATE,
      DEFAULT_REPORT_BODY_TEMPLATE,
    ),
    variables: REPORT_TEMPLATE_VARIABLES,
  };
}

function resolveCollaboratorRecipients(users = [], collaborators = []) {
  const recipients = [];
  for (const collaborator of collaborators) {
    const user = users.find((item) => matchesConfiguredName(getUserName(item), collaborator));
    const email = getUserEmail(user);
    if (email) {
      recipients.push({
        collaborator,
        email,
        userName: getUserName(user),
      });
    }
  }
  return recipients;
}

function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function formatNumber(value) {
  return new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 1 }).format(Number(value || 0));
}

function formatPercent(value) {
  return `${formatNumber(value)}%`;
}

function metricBlock(label, value, detail = '') {
  return `
    <td style="padding:12px;border:1px solid #d8e2ec;border-radius:8px;">
      <div style="font-size:12px;color:#49657e;font-weight:700;text-transform:uppercase;">${escapeHtml(label)}</div>
      <div style="font-size:26px;color:#0b2840;font-weight:800;margin-top:4px;">${escapeHtml(value)}</div>
      ${detail ? `<div style="font-size:13px;color:#49657e;margin-top:4px;">${escapeHtml(detail)}</div>` : ''}
    </td>
  `;
}

function metricTableHtml(personSummary = {}, departmentSummary = {}, comparisonScore) {
  return `
    <h2 style="font-size:18px;margin:20px 0 8px;">Produtividade individual</h2>
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="border-spacing:8px;">
      <tr>
        ${metricBlock('Produtividade', formatPercent(personSummary.productivityScore), comparisonScore === undefined ? '' : `Periodo anterior: ${formatPercent(comparisonScore)}`)}
        ${metricBlock('Entregues', formatNumber(personSummary.delivered))}
        ${metricBlock('No prazo', formatPercent(personSummary.onTimeRate))}
        ${metricBlock('Abertas vencidas', formatNumber(personSummary.overdueOpen))}
      </tr>
    </table>

    <h2 style="font-size:18px;margin:28px 0 8px;">Produtividade do departamento</h2>
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="border-spacing:8px;">
      <tr>
        ${metricBlock('Departamento', formatPercent(departmentSummary.productivityScore))}
        ${metricBlock('Entregues', formatNumber(departmentSummary.delivered))}
        ${metricBlock('No prazo', formatPercent(departmentSummary.onTimeRate))}
        ${metricBlock('Abertas vencidas', formatNumber(departmentSummary.overdueOpen))}
      </tr>
    </table>
  `;
}

function impactList(impacts = []) {
  if (!impacts.length) return '<p style="color:#49657e;">Sem tarefas vencidas relevantes no periodo.</p>';
  return `
    <ul style="padding-left:18px;color:#0b2840;">
      ${impacts.slice(0, 5).map((item) => `
        <li>
          <strong>#${escapeHtml(item.id)} ${escapeHtml(item.title)}</strong>
          <br><span style="color:#49657e;">${formatNumber(item.lateDays)}d fora do fluxo</span>
        </li>
      `).join('')}
    </ul>
  `;
}

function formatDuration(seconds) {
  const value = Number(seconds || 0);
  if (!value) return '0h';
  const hours = value / 3600;
  if (hours < 24) return `${formatNumber(hours)}h`;
  return `${formatNumber(hours / 24)}d`;
}

function monthlyTemplateHtml(monthly) {
  if (!monthly) return '';
  return `
    <h2 style="font-size:18px;color:#0b2840;margin:28px 0 8px;">Complemento mensal</h2>
    <p style="color:#49657e;margin:0 0 12px;">
      Mes fechado: ${escapeHtml(monthly.period.start)} a ${escapeHtml(monthly.period.end)}.
      Comparativo: ${escapeHtml(monthly.previousPeriod.start)} a ${escapeHtml(monthly.previousPeriod.end)}.
    </p>
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="border-spacing:8px;">
      <tr>
        ${metricBlock('Produtividade mensal individual', formatPercent(monthly.person?.summary?.productivityScore))}
        ${metricBlock('Produtividade mensal departamento', formatPercent(monthly.department?.summary?.productivityScore))}
      </tr>
    </table>
  `;
}

function escapeTemplateText(value) {
  return escapeHtml(value).replace(/\r?\n/g, '<br>');
}

function renderTemplateHtml(template, variables = {}) {
  const safeHtmlVariables = new Set(['blocoMetricas', 'tarefasCriticas', 'complementoMensalTexto']);
  const pattern = /{{\s*([a-zA-Z0-9_]+)\s*}}/g;
  let cursor = 0;
  let output = '';
  let match;

  while ((match = pattern.exec(template)) !== null) {
    output += escapeTemplateText(template.slice(cursor, match.index));
    const key = match[1];
    const value = variables[key] ?? '';
    output += safeHtmlVariables.has(key) ? String(value || '') : escapeTemplateText(value);
    cursor = match.index + match[0].length;
  }

  output += escapeTemplateText(template.slice(cursor));
  return output;
}

function renderTemplateText(template, variables = {}) {
  return String(template || '').replace(/{{\s*([a-zA-Z0-9_]+)\s*}}/g, (_, key) => {
    if (['blocoMetricas', 'tarefasCriticas', 'complementoMensalTexto'].includes(key)) return '';
    return String(variables[key] ?? '');
  }).replace(/\s+/g, ' ').trim();
}

function buildReportTemplateVariables({
  collaborator,
  department,
  person,
  period,
  comparison,
  monthly,
} = {}) {
  const personSummary = person?.summary || {};
  const departmentSummary = department?.summary || {};
  const comparisonScore = comparison?.summary?.productivityScore;
  return {
    colaborador: collaborator || '',
    periodo: `${period?.start || ''} a ${period?.end || ''}`,
    periodoInicio: period?.start || '',
    periodoFim: period?.end || '',
    produtividade: formatPercent(personSummary.productivityScore),
    entregues: formatNumber(personSummary.delivered),
    noPrazo: formatPercent(personSummary.onTimeRate),
    atrasadas: formatNumber(personSummary.late),
    vencidas: formatNumber(personSummary.overdueOpen),
    vazao: formatNumber(personSummary.throughput),
    tempoMedio: formatDuration(personSummary.averageExecutionSeconds),
    tempoApontado: formatDuration(personSummary.workedSeconds),
    departamentoProdutividade: formatPercent(departmentSummary.productivityScore),
    departamentoEntregues: formatNumber(departmentSummary.delivered),
    departamentoNoPrazo: formatPercent(departmentSummary.onTimeRate),
    departamentoAtrasadas: formatNumber(departmentSummary.late),
    departamentoVencidas: formatNumber(departmentSummary.overdueOpen),
    departamentoVazao: formatNumber(departmentSummary.throughput),
    blocoMetricas: metricTableHtml(personSummary, departmentSummary, comparisonScore),
    tarefasCriticas: impactList(person?.productivityImpacts || []),
    complementoMensal: monthly ? ' + fechamento mensal' : '',
    complementoMensalTexto: monthlyTemplateHtml(monthly),
  };
}

function buildReportEmailHtml({
  collaborator,
  department,
  person,
  period,
  comparison,
  monthly,
  template,
} = {}) {
  const reportTemplate = getReportTemplate(process.env, template);
  const variables = buildReportTemplateVariables({
    collaborator,
    department,
    person,
    period,
    comparison,
    monthly,
  });
  const bodyHtml = renderTemplateHtml(reportTemplate.bodyTemplate, variables);

  return `
    <div style="font-family:Arial,sans-serif;background:#f4f7fb;padding:24px;color:#0b2840;">
      <div style="max-width:720px;margin:0 auto;background:white;border:1px solid #d8e2ec;border-radius:10px;padding:24px;">
        <p style="font-size:12px;color:#49657e;text-transform:uppercase;font-weight:700;margin:0;">Runrun.it Analytics</p>
        ${bodyHtml}
      </div>
    </div>
  `;
}

function buildSubject({ collaborator, department, person, period, comparison, monthly, template } = {}) {
  const reportTemplate = getReportTemplate(process.env, template);
  const variables = buildReportTemplateVariables({
    collaborator,
    department,
    person,
    period,
    comparison,
    monthly,
  });
  return renderTemplateText(reportTemplate.subjectTemplate, variables);
}

function buildAnalyticsForPeriod(tasks, config, period, options = {}) {
  return buildAnalytics(tasks, {
    ...config,
    start: period.start,
    end: period.end,
    boardScope: options.boardScope || 'all',
  });
}

function buildReportForCollaborator({ collaborator, tasks, config, periods, boardScope = 'all', template } = {}) {
  const department = buildAnalyticsForPeriod(tasks, config, periods.week, { boardScope });
  const previousDepartment = buildAnalyticsForPeriod(tasks, config, periods.previousWeek, { boardScope });
  const person = department.people.find((item) => matchesConfiguredName(item.name, collaborator));
  const comparisonPerson = previousDepartment.people.find((item) => matchesConfiguredName(item.name, collaborator));
  const monthly = periods.month && periods.previousMonth ? {
    period: periods.month,
    previousPeriod: periods.previousMonth,
    department: buildAnalyticsForPeriod(tasks, config, periods.month, { boardScope }),
    previousDepartment: buildAnalyticsForPeriod(tasks, config, periods.previousMonth, { boardScope }),
  } : null;

  if (monthly) {
    monthly.person = monthly.department.people.find((item) => matchesConfiguredName(item.name, collaborator));
    monthly.previousPerson = monthly.previousDepartment.people.find((item) => matchesConfiguredName(item.name, collaborator));
  }

  return {
    collaborator,
    period: periods.week,
    department,
    person,
    comparison: comparisonPerson,
    monthly,
    subject: buildSubject({
      collaborator,
      department,
      person,
      period: periods.week,
      comparison: comparisonPerson,
      monthly,
      template,
    }),
    html: buildReportEmailHtml({
      collaborator,
      department,
      person,
      period: periods.week,
      comparison: comparisonPerson,
      monthly,
      template,
    }),
  };
}

async function sendEmailViaResend({ from, to, subject, html, env = process.env, fetchImpl = globalThis.fetch }) {
  const apiKey = env.RESEND_API_KEY;
  if (!apiKey) {
    const error = new Error('Configure RESEND_API_KEY para enviar relatorios por e-mail.');
    error.statusCode = 500;
    error.code = 'MISSING_RESEND_API_KEY';
    throw error;
  }
  if (!fetchImpl) throw new Error('Fetch API indisponivel neste runtime.');
  const recipients = Array.isArray(to) ? to : [to];
  const response = await fetchImpl(RESEND_ENDPOINT, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      from,
      to: recipients,
      subject,
      html,
    }),
  });
  const text = await response.text();
  let payload = {};
  if (text) {
    try {
      payload = JSON.parse(text);
    } catch {
      payload = { message: text };
    }
  } else if (typeof response.json === 'function') {
    payload = await response.json();
  }
  if (!response.ok) {
    const error = new Error(payload.message || payload.error || `Resend respondeu ${response.status}.`);
    error.statusCode = response.status;
    error.code = 'RESEND_API_ERROR';
    throw error;
  }
  return payload;
}

async function loadReportContext({ env = process.env, referenceDate = new Date(), fetchImpl, boardScope = 'all' } = {}) {
  const config = getDashboardConfig(env);
  const periods = buildReportPeriods(referenceDate);
  const earliestStart = periods.previousMonth?.start || periods.previousWeek.start;
  const snapshot = await fetchRunrunSnapshot({
    env,
    fetchImpl,
    start: earliestStart,
    end: periods.week.end,
  });
  return {
    config,
    periods,
    snapshot,
    boardScope,
  };
}

async function sendScheduledReports({ env = process.env, referenceDate = new Date(), fetchImpl, boardScope = 'all' } = {}) {
  const context = await loadReportContext({ env, referenceDate, fetchImpl, boardScope });
  const from = getReportFromOptions(env)[0];
  const template = getReportTemplate(env);
  const recipients = resolveCollaboratorRecipients(context.snapshot.users, context.config.collaborators);
  const sent = [];
  const skipped = [];

  for (const recipient of recipients) {
    const report = buildReportForCollaborator({
      collaborator: recipient.collaborator,
      tasks: context.snapshot.tasks,
      config: context.config,
      periods: context.periods,
      boardScope,
      template,
    });
    if (!report.person) {
      skipped.push({ collaborator: recipient.collaborator, reason: 'Sem dados no periodo.' });
      continue;
    }
    const result = await sendEmailViaResend({
      from,
      to: recipient.email,
      subject: report.subject,
      html: report.html,
      env,
      fetchImpl,
    });
    sent.push({ collaborator: recipient.collaborator, email: recipient.email, id: result.id });
  }

  return { sent, skipped, periods: context.periods };
}

async function sendTestReport({
  from,
  to,
  collaborator,
  template,
  env = process.env,
  referenceDate = new Date(),
  fetchImpl,
  boardScope = 'all',
} = {}) {
  const recipient = normalizeEmail(to);
  if (!recipient) {
    const error = new Error('Informe um destinatario de teste valido.');
    error.statusCode = 400;
    error.code = 'INVALID_TEST_RECIPIENT';
    throw error;
  }
  const context = await loadReportContext({ env, referenceDate, fetchImpl, boardScope });
  const selectedCollaborator = collaborator || context.config.collaborators[0];
  const report = buildReportForCollaborator({
    collaborator: selectedCollaborator,
    tasks: context.snapshot.tasks,
    config: context.config,
    periods: context.periods,
    boardScope,
    template: getReportTemplate(env, template),
  });
  const result = await sendEmailViaResend({
    from: normalizeEmail(from) || getReportFromOptions(env)[0],
    to: recipient,
    subject: `[Teste] ${report.subject}`,
    html: report.html,
    env,
    fetchImpl,
  });
  return { id: result.id, collaborator: selectedCollaborator, to: recipient };
}

module.exports = {
  DEFAULT_REPORT_FROM,
  DEFAULT_REPORT_BODY_TEMPLATE,
  DEFAULT_REPORT_SUBJECT_TEMPLATE,
  REPORT_TEMPLATE_VARIABLES,
  buildReportEmailHtml,
  buildReportForCollaborator,
  buildReportPeriods,
  getReportTemplate,
  getReportFromOptions,
  resolveCollaboratorRecipients,
  renderTemplateText,
  sendEmailViaResend,
  sendScheduledReports,
  sendTestReport,
};
