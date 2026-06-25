/* =========================================================================
   Marketing Analytics — front-end
   Dados servidos por /api/analytics, /api/report-config, /api/report-test.
   Gráficos em SVG nativo (sem dependências externas).
   ========================================================================= */

const DEFAULT_REPORT_FROM = 'm.agapito@avalyst.com.br';
const DEFAULT_REPORT_SUBJECT_TEMPLATE = 'Relatorio de produtividade - {{colaborador}} - {{periodo}}{{complementoMensal}}';
const DEFAULT_REPORT_BODY_TEMPLATE = `Ola, {{colaborador}}.

Segue o fechamento de produtividade do periodo {{periodo}}.

{{blocoMetricas}}

Tarefas que mais afetam o fluxo:
{{tarefasCriticas}}

{{complementoMensalTexto}}`;
const REPORT_TEMPLATE_VARIABLES = [
  'colaborador',
  'periodo',
  'periodoInicio',
  'periodoFim',
  'produtividade',
  'entregues',
  'noPrazo',
  'atrasadas',
  'vencidas',
  'vazao',
  'tempoMedio',
  'tempoApontado',
  'departamentoProdutividade',
  'departamentoEntregues',
  'departamentoNoPrazo',
  'departamentoAtrasadas',
  'departamentoVencidas',
  'departamentoVazao',
  'blocoMetricas',
  'tarefasCriticas',
  'complementoMensal',
  'complementoMensalTexto',
];
const STORAGE_KEYS = {
  boardScope: 'runrunit-dashboard-board-scope',
  productivitySettings: 'runrunit-dashboard-productivity-settings',
};

const REFRESH_INTERVAL_MS = 15000;

const TONE_COLORS = {
  positive: '#16a36b',
  warning: '#d28a16',
  negative: '#dc3a39',
  primary: '#2f74e0',
  muted: '#94a6b8',
};

const VIEW_TITLES = {
  overview: 'Visão geral',
  people: 'Pessoas',
  flow: 'Fluxo de trabalho',
  alerts: 'Alertas de gestão',
  audit: 'Auditoria das tarefas',
};

/* ---------------------------------------------------------------- helpers */

function sanitizeExcludedTaskIdsByPerson(value = {}) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
  return Object.entries(value).reduce((acc, [person, ids]) => {
    const cleanIds = (Array.isArray(ids) ? ids : String(ids || '').split(','))
      .map((id) => String(id || '').trim())
      .filter(Boolean);
    const uniqueIds = [...new Set(cleanIds)];
    if (person && uniqueIds.length) acc[person] = uniqueIds;
    return acc;
  }, {});
}

function sanitizeEmail(value) {
  const email = String(value || '').trim();
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ? email : '';
}

function readStoredBoardScope() {
  try {
    const value = window.localStorage?.getItem(STORAGE_KEYS.boardScope);
    return ['all', 'marketing', 'creation'].includes(value) ? value : 'all';
  } catch (error) {
    return 'all';
  }
}

function readStoredSettings() {
  try {
    const raw = window.localStorage?.getItem(STORAGE_KEYS.productivitySettings);
    const parsed = raw ? JSON.parse(raw) : {};
    return {
      excludedTaskIdsByPerson: sanitizeExcludedTaskIdsByPerson(parsed.excludedTaskIdsByPerson),
      reportFrom: sanitizeEmail(parsed.reportFrom) || DEFAULT_REPORT_FROM,
      testReportRecipient: sanitizeEmail(parsed.testReportRecipient),
      testReportPerson: parsed.testReportPerson || '',
      reportSubjectTemplate: String(parsed.reportSubjectTemplate || '').trim() || DEFAULT_REPORT_SUBJECT_TEMPLATE,
      reportBodyTemplate: String(parsed.reportBodyTemplate || '').trim() || DEFAULT_REPORT_BODY_TEMPLATE,
    };
  } catch (error) {
    return {
      excludedTaskIdsByPerson: {},
      reportFrom: DEFAULT_REPORT_FROM,
      testReportRecipient: '',
      testReportPerson: '',
      reportSubjectTemplate: DEFAULT_REPORT_SUBJECT_TEMPLATE,
      reportBodyTemplate: DEFAULT_REPORT_BODY_TEMPLATE,
    };
  }
}

const state = {
  data: null,
  preset: 'this-week',
  boardScope: readStoredBoardScope(),
  settings: readStoredSettings(),
  selectedPerson: 'Allana',
  reportConfig: null,
  currentRequest: { preset: 'this-week' },
  customRange: false,
  loading: false,
  refreshTimer: null,
  nextRefreshAt: null,
  activeTab: 'overview',
  settingsTab: 'cards',
  auditQuery: '',
};

const els = {};
[
  'connectionStatus', 'refreshCountdown', 'refreshButton', 'notice',
  'viewTitle', 'periodTitle',
  'boardScope', 'startDate', 'endDate', 'applyCustom',
  'insightsList', 'metricGrid', 'productivityDonut', 'deliveryComposition', 'peopleChart',
  'trendChart', 'trendLegend', 'productivityImpact',
  'peopleSummary', 'individualTitle', 'personSelect', 'individualMetrics',
  'individualTrend', 'individualOnTime', 'individualImpact', 'individualBreakdowns', 'individualTasks',
  'flowMetrics', 'wipTrend', 'stageFunnel', 'workloadRows', 'boardBreakdown', 'stageBreakdown',
  'alertsList', 'alertsBadge', 'auditTable', 'auditSearch',
  'settingsButton', 'settingsModal', 'closeSettings', 'cardSelectionSummary', 'cardSelectionList',
  'includeAllCards', 'reportFrom', 'testReportPerson', 'testReportRecipient', 'reportSubjectTemplate',
  'reportBodyTemplate', 'resetReportTemplate', 'templateVariableList', 'sendTestReport', 'testReportStatus',
  'sendWeeklyNow', 'sendNowConfirm', 'sendNowCancel', 'sendNowConfirmBtn', 'sendNowStatus',
  'authGate', 'authGateMsg', 'sidebarUser', 'userLabel', 'themeToggle',
].forEach((id) => { els[id] = document.getElementById(id); });

/* ------------------------------------------------------------- formatters */

function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function formatNumber(value) {
  return new Intl.NumberFormat('pt-BR').format(Number(value || 0));
}

function formatPercent(value) {
  return `${Math.round(Number(value || 0))}%`;
}

function formatDecimal(value, maximumFractionDigits = 2) {
  return new Intl.NumberFormat('pt-BR', { minimumFractionDigits: 0, maximumFractionDigits }).format(Number(value || 0));
}

function formatDays(value) {
  const number = Number(value || 0);
  return number ? `${new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 1 }).format(number)}d` : '0d';
}

function formatDate(value) {
  if (!value) return 'Sem data';
  const raw = String(value);
  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) {
    const [year, month, day] = raw.split('-');
    return `${day}/${month}/${year}`;
  }
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'Sem data';
  return new Intl.DateTimeFormat('pt-BR', { dateStyle: 'short' }).format(date);
}

function formatDayShort(value) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(value || ''))) return '';
  const [, month, day] = value.split('-');
  return `${day}/${month}`;
}

function formatSeconds(seconds) {
  const value = Number(seconds || 0);
  if (!value) return '0h';
  const hours = value / 3600;
  if (hours < 24) return `${new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 1 }).format(hours)}h`;
  const days = hours / 24;
  return `${new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 1 }).format(days)}d`;
}

function formatMetricValue(definition, value) {
  if (definition.type === 'percent') return formatPercent(value);
  if (definition.type === 'seconds') return formatSeconds(value);
  if (definition.type === 'days') return formatDays(value);
  return formatNumber(value);
}

function productivityHelp(summary = {}) {
  const currentBreakdown = summary.productivityBreakdown || {};
  const currentParts = Object.values(currentBreakdown).map((item) => {
    return `${item.label}: ${formatPercent(item.value)} x ${formatNumber(item.weight)} pts`;
  });
  return [
    'Cálculo da produtividade (Confiabilidade de Prazo):',
    'Fórmula: (60% x Confiabilidade de prazo) + (25% x Saúde do backlog) + (15% x Severidade dos atrasos).',
    ...currentParts,
    `Atraso médio considerado: ${formatDecimal(summary.averageLateDays || 0, 1)} dias entre itens atrasados/vencidos`,
    'A vazão segue como leitura de volume entregue, sem meta arbitrária no score.',
    `Score final: ${formatPercent(summary.productivityScore)}`,
  ].join('\n');
}

/* ----------------------------------------------------------- metric model */

const METRICS = [
  {
    key: 'productivityScore', label: 'Produtividade', type: 'percent', polarity: 'higher',
    tone: (s) => (s.productivityScore >= 70 ? 'positive' : s.productivityScore >= 50 ? 'warning' : 'negative'),
    detail: (s) => `${formatNumber(s.onTime)}/${formatNumber(s.deliveredWithDeadline)} no prazo | ${formatNumber(s.overdueOpen)} vencidas`,
    help: (s) => productivityHelp(s),
  },
  {
    key: 'opened', label: 'Abertas', type: 'number', polarity: 'neutral',
    detail: (s) => `${formatNumber(s.openedCreatedInPeriod)} novas | ${formatNumber(s.openedCarryover)} herdadas`,
    help: 'Soma das tarefas criadas no período com as criadas antes que continuaram ativas durante o período analisado.',
  },
  {
    key: 'delivered', label: 'Entregues', type: 'number', polarity: 'higher',
    detail: (s) => `${formatNumber(s.deliveredCreatedInPeriod)} criadas no período | ${formatNumber(s.deliveredFromCarryover)} herdadas`,
    help: 'Tarefas fechadas dentro do período selecionado. A subdivisão mostra se nasceram no período ou vieram de antes.',
  },
  {
    key: 'onTimeRate', label: 'No prazo', type: 'percent', polarity: 'higher',
    tone: (s) => (s.deliveredWithDeadline ? (s.onTimeRate >= 80 ? 'positive' : s.onTimeRate >= 60 ? 'warning' : 'negative') : ''),
    detail: (s) => `${formatNumber(s.onTime)}/${formatNumber(s.deliveredWithDeadline)} entregas com prazo`,
    help: 'Percentual calculado somente sobre tarefas entregues que tinham prazo definido. Por enquanto usa o prazo atual do Runrun.it.',
  },
  {
    key: 'late', label: 'Atrasadas', type: 'number', polarity: 'lower',
    tone: (s) => (s.late ? 'negative' : 'positive'),
    detail: () => 'Baseada no prazo atual',
    help: 'Tarefas entregues depois do prazo atual definido. Quando houver histórico de prazo, passaremos a usar o primeiro prazo.',
  },
  {
    key: 'early', label: 'Adiantadas', type: 'number', polarity: 'higher',
    tone: (s) => (s.early ? 'positive' : ''),
    detail: () => 'Baseada no prazo atual',
    help: 'Tarefas entregues antes do prazo atual definido.',
  },
  {
    key: 'overdueOpen', label: 'Abertas vencidas', type: 'number', polarity: 'lower',
    tone: (s) => (s.overdueOpen ? 'negative' : 'positive'),
    detail: (s) => `${formatNumber(s.open)} abertas no fim do período`,
    help: 'Tarefas abertas ao final do período cujo prazo atual já estava vencido.',
  },
  {
    key: 'active', label: 'Ativas', type: 'number', polarity: 'neutral',
    detail: () => 'Criadas no período ou herdadas',
    help: 'Tarefas que estavam abertas ou em execução em algum momento do período, mesmo criadas antes dele.',
  },
  {
    key: 'throughput', label: 'Vazão', type: 'number', polarity: 'higher',
    detail: () => 'Entregas no período',
    help: 'Volume de tarefas finalizadas no período (throughput). Leitura de volume, sem meta arbitrária.',
  },
  {
    key: 'averageExecutionSeconds', label: 'Tempo médio', type: 'seconds', polarity: 'lower',
    detail: () => 'Abertura do card até a conclusão',
    help: 'Média do tempo entre a criação do card e a conclusão, apenas para tarefas entregues no período.',
  },
  {
    key: 'cycleTimeDays', label: 'Tempo de ciclo', type: 'days', polarity: 'lower',
    detail: (s) => `WIP médio ${formatNumber(s.averageDailyWip)}`,
    help: 'Estimativa pela Lei de Little: WIP médio diário dividido pela vazão diária do período.',
  },
  {
    key: 'flowEfficiency', label: 'Eficiência do fluxo', type: 'percent', polarity: 'higher',
    detail: () => 'Tempo apontado / ciclo total',
    help: 'Percentual entre o tempo apontado nas tarefas entregues e o tempo total entre abertura e conclusão.',
  },
  {
    key: 'workedSeconds', label: 'Tempo apontado', type: 'seconds', polarity: 'neutral',
    detail: (s) => `Estimado ${formatSeconds(s.estimatedSeconds)}`,
    help: 'Soma do tempo apontado no Runrun.it para tarefas que tocaram o período analisado.',
  },
];

const METRIC_BY_KEY = Object.fromEntries(METRICS.map((m) => [m.key, m]));

/* ============================================================ SVG charts */

function svgWrap(viewBox, inner, className = '') {
  return `<svg class="chart-svg ${className}" viewBox="${viewBox}" preserveAspectRatio="xMidYMid meet" role="img" focusable="false">${inner}</svg>`;
}

function donutChart(segments, centerValue, centerLabel) {
  const r = 54;
  const cx = 70;
  const cy = 70;
  const sw = 18;
  const circumference = 2 * Math.PI * r;
  const total = segments.reduce((sum, seg) => sum + Math.max(0, seg.value), 0) || 1;
  let offset = 0;
  const arcs = segments.map((seg) => {
    const dash = (Math.max(0, seg.value) / total) * circumference;
    const arc = `<circle cx="${cx}" cy="${cy}" r="${r}" fill="none" stroke="${seg.color}" stroke-width="${sw}"
      stroke-dasharray="${dash.toFixed(2)} ${(circumference - dash).toFixed(2)}"
      stroke-dashoffset="${(-offset).toFixed(2)}"><title>${escapeHtml(seg.label)}: ${escapeHtml(seg.display ?? seg.value)}</title></circle>`;
    offset += dash;
    return arc;
  }).join('');
  const inner = `
    <g transform="rotate(-90 ${cx} ${cy})">
      <circle cx="${cx}" cy="${cy}" r="${r}" fill="none" stroke="var(--surface-3)" stroke-width="${sw}" />
      ${arcs}
    </g>
    <text x="${cx}" y="${cy - 2}" text-anchor="middle" class="donut-value">${escapeHtml(centerValue)}</text>
    <text x="${cx}" y="${cy + 18}" text-anchor="middle" class="donut-label">${escapeHtml(centerLabel)}</text>`;
  return svgWrap('0 0 140 140', inner, 'donut');
}

function legendHtml(items) {
  return `<ul class="chart-legend">${items.map((item) => `
    <li><span class="legend-dot" style="background:${item.color}"></span>
    <span class="legend-label">${escapeHtml(item.label)}</span>
    <strong>${escapeHtml(item.display)}</strong></li>`).join('')}</ul>`;
}

function lineAreaChart(series, keys) {
  if (!series || !series.length) return '<p class="empty">Sem dados no período.</p>';
  const W = 660;
  const H = 240;
  const padL = 30;
  const padR = 14;
  const padT = 18;
  const padB = 30;
  const n = series.length;
  const maxVal = Math.max(1, ...series.flatMap((d) => keys.map((k) => Number(d[k.key] || 0))));
  const niceMax = maxVal <= 4 ? maxVal : Math.ceil(maxVal / 4) * 4;
  const xAt = (i) => (n === 1 ? (padL + (W - padL - padR) / 2) : padL + (i * (W - padL - padR)) / (n - 1));
  const yAt = (v) => padT + (1 - v / niceMax) * (H - padT - padB);

  const gridY = [0, niceMax / 2, niceMax].map((v) => `
    <line x1="${padL}" y1="${yAt(v).toFixed(1)}" x2="${W - padR}" y2="${yAt(v).toFixed(1)}" class="grid-line" />
    <text x="${padL - 6}" y="${(yAt(v) + 3).toFixed(1)}" text-anchor="end" class="axis-label">${formatNumber(Math.round(v))}</text>`).join('');

  const labelIdx = n === 1 ? [0] : [0, Math.floor((n - 1) / 2), n - 1];
  const xLabels = [...new Set(labelIdx)].map((i) => `
    <text x="${xAt(i).toFixed(1)}" y="${H - 10}" text-anchor="middle" class="axis-label">${formatDayShort(series[i].date)}</text>`).join('');

  const layers = keys.map((k) => {
    const pts = series.map((d, i) => `${xAt(i).toFixed(1)},${yAt(Number(d[k.key] || 0)).toFixed(1)}`);
    const line = `<polyline points="${pts.join(' ')}" fill="none" stroke="${k.color}" stroke-width="2.4" stroke-linejoin="round" stroke-linecap="round" />`;
    let area = '';
    if (k.fill) {
      const base = yAt(0).toFixed(1);
      area = `<polygon points="${xAt(0).toFixed(1)},${base} ${pts.join(' ')} ${xAt(n - 1).toFixed(1)},${base}" fill="${k.fill}" stroke="none" />`;
    }
    const dots = n <= 14
      ? series.map((d, i) => `<circle cx="${xAt(i).toFixed(1)}" cy="${yAt(Number(d[k.key] || 0)).toFixed(1)}" r="3" fill="${k.color}" />`).join('')
      : '';
    return area + line + dots;
  }).join('');

  return svgWrap(`0 0 ${W} ${H}`, `${gridY}${layers}${xLabels}`, 'line-area');
}

function columnChart(items) {
  if (!items || !items.length) return '<p class="empty">Sem dados no período.</p>';
  const W = 660;
  const H = 230;
  const padT = 26;
  const padB = 34;
  const n = items.length;
  const slot = W / n;
  const bw = Math.min(80, slot * 0.5);
  const max = Math.max(1, ...items.map((i) => Number(i.value || 0)));
  const yAt = (v) => padT + (1 - v / max) * (H - padT - padB);
  const bars = items.map((item, i) => {
    const cx = slot * i + slot / 2;
    const top = yAt(Number(item.value || 0));
    const h = Math.max(2, H - padB - top);
    return `
      <rect x="${(cx - bw / 2).toFixed(1)}" y="${top.toFixed(1)}" width="${bw.toFixed(1)}" height="${h.toFixed(1)}" rx="7" fill="${item.color || TONE_COLORS.primary}">
        <title>${escapeHtml(item.label)}: ${escapeHtml(item.display ?? item.value)}</title>
      </rect>
      <text x="${cx.toFixed(1)}" y="${(top - 8).toFixed(1)}" text-anchor="middle" class="bar-value">${escapeHtml(item.display ?? item.value)}</text>
      <text x="${cx.toFixed(1)}" y="${H - 12}" text-anchor="middle" class="axis-label strong">${escapeHtml(item.label)}</text>`;
  }).join('');
  return svgWrap(`0 0 ${W} ${H}`, bars, 'columns');
}

function sparkline(values, color = TONE_COLORS.primary) {
  const data = (values || []).map((v) => Number(v || 0));
  if (data.length < 2) return '<div class="sparkline-empty"></div>';
  const W = 120;
  const H = 34;
  const pad = 3;
  const max = Math.max(1, ...data);
  const xAt = (i) => pad + (i * (W - pad * 2)) / (data.length - 1);
  const yAt = (v) => pad + (1 - v / max) * (H - pad * 2);
  const pts = data.map((v, i) => `${xAt(i).toFixed(1)},${yAt(v).toFixed(1)}`);
  const inner = `
    <polygon points="${xAt(0).toFixed(1)},${H - pad} ${pts.join(' ')} ${xAt(data.length - 1).toFixed(1)},${H - pad}" fill="${color}22" stroke="none" />
    <polyline points="${pts.join(' ')}" fill="none" stroke="${color}" stroke-width="2" stroke-linejoin="round" stroke-linecap="round" />`;
  return svgWrap(`0 0 ${W} ${H}`, inner, 'sparkline');
}

function miniRing(value, tone) {
  const color = TONE_COLORS[tone] || TONE_COLORS.primary;
  const r = 26;
  const cx = 32;
  const cy = 32;
  const sw = 7;
  const circumference = 2 * Math.PI * r;
  const dash = (Math.max(0, Math.min(100, value)) / 100) * circumference;
  const inner = `
    <g transform="rotate(-90 ${cx} ${cy})">
      <circle cx="${cx}" cy="${cy}" r="${r}" fill="none" stroke="var(--surface-3)" stroke-width="${sw}" />
      <circle cx="${cx}" cy="${cy}" r="${r}" fill="none" stroke="${color}" stroke-width="${sw}" stroke-linecap="round"
        stroke-dasharray="${dash.toFixed(2)} ${(circumference - dash).toFixed(2)}" />
    </g>
    <text x="${cx}" y="${cy + 4}" text-anchor="middle" class="ring-value">${formatPercent(value)}</text>`;
  return svgWrap('0 0 64 64', inner, 'mini-ring');
}

/* ----------------------------------------------------- status & countdown */

function setStatus(text, kind = '') {
  if (!els.connectionStatus) return;
  els.connectionStatus.textContent = text;
  els.connectionStatus.className = `status-pill ${kind}`.trim();
}

function showNotice(message, kind = '') {
  if (!els.notice) return;
  if (!message) {
    els.notice.classList.add('hidden');
    return;
  }
  els.notice.textContent = message;
  els.notice.className = `notice ${kind}`.trim();
}

function updateRefreshCountdown(message) {
  if (!els.refreshCountdown) return;
  if (message) { els.refreshCountdown.textContent = message; return; }
  if (!state.nextRefreshAt) { els.refreshCountdown.textContent = 'Próxima atualização em --'; return; }
  const seconds = Math.max(0, Math.ceil((state.nextRefreshAt - Date.now()) / 1000));
  els.refreshCountdown.textContent = `Próxima atualização em ${seconds}s`;
}

function scheduleNextRefresh() {
  state.nextRefreshAt = Date.now() + REFRESH_INTERVAL_MS;
  updateRefreshCountdown();
}

function isEditingFilters() {
  const active = document.activeElement;
  return active === els.startDate || active === els.endDate || active === els.auditSearch;
}

function startAutoRefresh() {
  if (!state.nextRefreshAt) scheduleNextRefresh();
  if (state.refreshTimer) return;
  state.refreshTimer = window.setInterval(() => {
    if (typeof document !== 'undefined' && document.hidden) {
      updateRefreshCountdown('Pausado (aba em segundo plano)');
      return;
    }
    if (!state.nextRefreshAt) scheduleNextRefresh();
    if (Date.now() >= state.nextRefreshAt) {
      state.nextRefreshAt = Date.now() + REFRESH_INTERVAL_MS;
      if (isEditingFilters()) { updateRefreshCountdown(); return; }
      updateRefreshCountdown('Atualizando agora…');
      loadData(state.currentRequest, { background: true });
      return;
    }
    updateRefreshCountdown();
  }, 1000);
}

/* ------------------------------------------------------------- delta pill */

function deltaTone(definition, item) {
  if (!item || item.direction === 'flat' || definition.polarity === 'neutral') return 'neutral';
  const improved = (definition.polarity === 'higher' && item.change > 0)
    || (definition.polarity === 'lower' && item.change < 0);
  return improved ? 'positive' : 'negative';
}

function renderDeltaPill(definition, item) {
  if (!item) return '';
  const tone = deltaTone(definition, item);
  if (item.direction === 'flat') return '<span class="delta-pill neutral">= estável</span>';
  const arrow = item.direction === 'up' ? '▲' : '▼';
  return `<span class="delta-pill ${tone}">${arrow} ${Math.abs(item.changePercent)}%</span>`;
}

/* --------------------------------------------------------- metric cards */

function renderMetricCard(definition, summary, comparison) {
  const item = comparison?.metrics?.[definition.key];
  const value = item ? item.value : summary[definition.key];
  const previous = item ? item.previous : 0;
  const tone = definition.tone ? definition.tone(summary) : '';
  const detail = typeof definition.detail === 'function' ? definition.detail(summary) : definition.detail;
  const help = typeof definition.help === 'function' ? definition.help(summary) : definition.help;
  return `
    <article class="metric-card ${tone}">
      <div class="metric-top">
        <span>${escapeHtml(definition.label)}</span>
        <button class="metric-help" type="button" aria-label="Como calculamos ${escapeHtml(definition.label)}" data-help="${escapeHtml(help)}">?</button>
      </div>
      <div class="metric-value-row">
        <strong>${formatMetricValue(definition, value)}</strong>
        ${renderDeltaPill(definition, item)}
      </div>
      <small>${escapeHtml(detail)}</small>
      <em>Período anterior: ${formatMetricValue(definition, previous)}</em>
    </article>`;
}

function renderMetrics(container, summary, comparison, metricKeys = METRICS.map((m) => m.key)) {
  if (!container) return;
  const definitions = metricKeys.map((key) => METRIC_BY_KEY[key]).filter(Boolean);
  container.innerHTML = definitions.map((d) => renderMetricCard(d, summary, comparison)).join('');
}

/* -------------------------------------------------------------- insights */

function buildInsights(data) {
  const insights = [];
  const summary = data.summary || {};
  const people = (data.people || []).filter((p) => p.summary.active || p.summary.delivered);

  if (people.length) {
    const best = [...people].sort((a, b) => b.summary.productivityScore - a.summary.productivityScore)[0];
    insights.push({
      tone: 'positive', icon: '★',
      text: `<strong>${escapeHtml(best.name)}</strong> lidera em produtividade com ${formatPercent(best.summary.productivityScore)} no período.`,
    });
  }

  if (summary.open) {
    const ratio = summary.overdueOpen / summary.open;
    if (summary.overdueOpen) {
      insights.push({
        tone: ratio >= 0.3 ? 'negative' : 'warning', icon: '⚠',
        text: `<strong>${formatNumber(summary.overdueOpen)} de ${formatNumber(summary.open)}</strong> tarefas abertas estão vencidas (${formatPercent(ratio * 100)} do backlog).`,
      });
    }
  }

  const topStage = data.stageFunnel?.rows?.[0];
  if (topStage && topStage.percentage >= 1) {
    insights.push({
      tone: 'primary', icon: '⇄',
      text: `Maior gargalo: <strong>${escapeHtml(topStage.name)}</strong> concentra ${formatPercent(topStage.percentage)} do tempo dos cards abertos.`,
    });
  }

  const onTime = data.comparisons?.[0]?.metrics?.onTimeRate;
  if (onTime && onTime.direction !== 'flat') {
    const up = onTime.direction === 'up';
    insights.push({
      tone: up ? 'positive' : 'warning', icon: up ? '↗' : '↘',
      text: `Cumprimento de prazo ${up ? 'subiu' : 'caiu'} <strong>${Math.abs(onTime.change)} pts</strong> vs. o período anterior (${formatPercent(onTime.value)}).`,
    });
  }

  if (!insights.length) {
    insights.push({ tone: 'primary', icon: 'ℹ', text: 'Sem destaques relevantes neste período. Ajuste o filtro para explorar outros recortes.' });
  }
  return insights.slice(0, 4);
}

function renderInsights() {
  if (!els.insightsList) return;
  const insights = buildInsights(state.data);
  els.insightsList.innerHTML = insights.map((ins) => `
    <div class="insight-chip ${ins.tone}">
      <span class="insight-chip-ico">${ins.icon}</span>
      <p>${ins.text}</p>
    </div>`).join('');
}

/* -------------------------------------------------------- overview charts */

function renderProductivityDonut() {
  if (!els.productivityDonut) return;
  const summary = state.data.summary || {};
  const girls = Number(summary.girlsScore ?? summary.productivityScore ?? 0);
  const bruno = Number(summary.brunoScore ?? 0);
  const blended = Number(summary.productivityScore ?? girls);
  const hasBruno = (state.data.brunoSummary?.cardsWorked || 0) > 0;

  const segments = [
    { label: 'Meninas (prazo)', value: hasBruno ? girls * 0.8 : girls, display: formatPercent(girls), color: TONE_COLORS.primary },
  ];
  if (hasBruno) segments.push({ label: 'Bruno (execução)', value: bruno * 0.2, display: formatPercent(bruno), color: TONE_COLORS.positive });
  segments.push({ label: 'Margem', value: Math.max(0, 100 - blended), display: '', color: 'transparent' });

  const donut = donutChart(segments, formatPercent(blended), 'produtividade');
  const legendItems = [{ label: 'Meninas · confiabilidade de prazo', display: formatPercent(girls), color: TONE_COLORS.primary }];
  if (hasBruno) legendItems.push({ label: 'Bruno · eficiência de execução', display: formatPercent(bruno), color: TONE_COLORS.positive });
  els.productivityDonut.innerHTML = `<div class="donut-host">${donut}</div>${legendHtml(legendItems)}`;
}

function deliveryCompositionSegments(summary) {
  return [
    { key: 'onTime', label: 'No prazo', value: summary.onTime || 0, color: TONE_COLORS.positive },
    { key: 'late', label: 'Atrasadas', value: summary.late || 0, color: TONE_COLORS.negative },
    { key: 'overdueOpen', label: 'Abertas vencidas', value: summary.overdueOpen || 0, color: TONE_COLORS.warning },
    { key: 'noDeadline', label: 'Sem prazo', value: (summary.noDeadlineDelivered || 0) + (summary.noDeadlineOpen || 0), color: TONE_COLORS.muted },
  ];
}

function renderDeliveryComposition(container, summary) {
  if (!container) return;
  const segs = deliveryCompositionSegments(summary).filter((s) => s.value > 0);
  const total = segs.reduce((sum, s) => sum + s.value, 0);
  if (!total) { container.innerHTML = '<p class="empty">Sem entregas ou pendências no período.</p>'; return; }
  const donut = donutChart(segs.map((s) => ({ ...s, display: formatNumber(s.value) })), formatNumber(total), 'tarefas');
  const legend = legendHtml(segs.map((s) => ({ label: s.label, display: formatNumber(s.value), color: s.color })));
  container.innerHTML = `<div class="donut-host">${donut}</div>${legend}`;
}

function renderPeopleChart() {
  if (!els.peopleChart) return;
  const people = (state.data.people || []);
  if (!people.length) { els.peopleChart.innerHTML = '<p class="empty">Sem colaboradores no período.</p>'; return; }
  const items = people.map((p) => {
    const score = p.summary.productivityScore || 0;
    const tone = score >= 70 ? 'positive' : score >= 50 ? 'warning' : 'negative';
    return { label: p.name, value: score, display: formatPercent(score), color: TONE_COLORS[tone] };
  });
  els.peopleChart.innerHTML = columnChart(items);
}

function renderTrend() {
  if (!els.trendChart) return;
  const series = state.data.dailySeries || [];
  const keys = [
    { key: 'delivered', label: 'Entregues', color: TONE_COLORS.positive, fill: `${TONE_COLORS.positive}1f` },
    { key: 'opened', label: 'Abertas', color: TONE_COLORS.primary },
  ];
  els.trendChart.innerHTML = lineAreaChart(series, keys);
  if (els.trendLegend) {
    els.trendLegend.innerHTML = keys.map((k) => `<span class="legend-inline"><span class="legend-dot" style="background:${k.color}"></span>${escapeHtml(k.label)}</span>`).join('');
  }
}

/* ---------------------------------------------------------- shared lists */

function renderBarHtml(rows) {
  if (!rows || !rows.length) return '<p class="empty">Sem dados.</p>';
  const max = Math.max(...rows.map((row) => Number(row.value || 0)), 1);
  return rows.map((row) => `
    <div class="bar-row">
      <div class="bar-head"><span>${escapeHtml(row.name)}</span><strong>${formatNumber(row.value)}</strong></div>
      <div class="bar-track"><div class="bar-fill" style="width:${Math.max(4, (Number(row.value || 0) / max) * 100)}%"></div></div>
    </div>`).join('');
}

function renderStageFunnelHtml(stageFunnel) {
  const rows = stageFunnel?.rows || [];
  if (!rows.length) return '<p class="empty">Sem cards abertos suficientes para ler gargalos neste período.</p>';
  return `
    <p class="panel-note source-note">${escapeHtml(stageFunnel.basis || '')}</p>
    <div class="funnel-list">
      ${rows.map((row) => `
        <div class="funnel-row">
          <div class="funnel-head"><strong>${escapeHtml(row.name)}</strong><span>${formatPercent(row.percentage)}</span></div>
          <div class="bar-track"><div class="bar-fill accent" style="width:${Math.max(4, Number(row.percentage || 0))}%"></div></div>
          <div class="mini-stats">
            <span>${formatNumber(row.value)} cards</span>
            <span>média ${formatSeconds(row.averageSeconds)}</span>
            <span>total ${formatSeconds(row.totalSeconds)}</span>
          </div>
        </div>`).join('')}
    </div>`;
}

function renderImpactList(rows = []) {
  if (!rows.length) return '<p class="empty">Sem tarefas vencidas ou entregues fora do prazo neste período.</p>';
  return `
    <div class="impact-list">
      ${rows.map((row) => `
        <div class="impact-row">
          <div class="impact-main">
            <strong>${escapeHtml(row.title)}</strong>
            <span>${escapeHtml(row.collaborator || row.assignee || 'Sem responsável')} · ${escapeHtml(row.board)} · ${escapeHtml(row.stage)}</span>
            <div class="mini-stats">
              <span>${escapeHtml(row.reason || 'Atraso')}</span>
              <span>Prazo ${formatDate(row.dueDate)}</span>
              <span>${formatSeconds(row.lateSeconds)} de atraso</span>
            </div>
          </div>
          <div class="impact-score">
            <strong>${formatDecimal(row.lateDays || 0, 1)}d</strong>
            <span>fora do fluxo</span>
          </div>
        </div>`).join('')}
    </div>`;
}

/* ------------------------------------------------------------- people view */

function isExecutionPerson(person) {
  return person?.role === 'execution' || person?.summary?.role === 'execution';
}

function renderPeopleCards() {
  if (!els.peopleSummary) return;
  const people = state.data.people || [];
  els.peopleSummary.innerHTML = people.map((person) => {
    const s = person.summary;
    const score = s.productivityScore || 0;
    const tone = score >= 70 ? 'positive' : score >= 50 ? 'warning' : 'negative';
    const delta = renderDeltaPill(METRIC_BY_KEY.productivityScore, person.comparison?.metrics?.productivityScore);
    const isActive = person.name === state.selectedPerson;
    const exec = isExecutionPerson(person);
    const spark = sparkline((person.dailySeries || []).map((d) => (exec ? d.wip : d.delivered)), exec ? TONE_COLORS.primary : TONE_COLORS.positive);
    const tag = exec ? '<span class="role-tag">execução</span>' : '';
    const stats = exec
      ? `<span>${formatNumber(s.cardsWorked)} cards</span>
         <span>${formatSeconds(s.executionSeconds)} execução</span>
         <span class="${s.aging ? 'danger' : ''}">${formatNumber(s.aging)} aging</span>`
      : `<span>${formatNumber(s.delivered)} entregues</span>
         <span>${formatPercent(s.onTimeRate)} no prazo</span>
         <span class="${s.overdueOpen ? 'danger' : ''}">${formatNumber(s.overdueOpen)} vencidas</span>`;
    return `
      <button class="person-card ${isActive ? 'selected' : ''}" type="button" data-person-card="${escapeHtml(person.name)}">
        <div class="person-card-top">
          ${miniRing(score, tone)}
          <div class="person-card-id">
            <strong>${escapeHtml(person.name)} ${tag}</strong>
            <span>${exec ? 'eficiência' : ''} ${delta || '<span class="delta-pill neutral">= estável</span>'}</span>
          </div>
        </div>
        <div class="person-card-spark">${spark}</div>
        <div class="mini-stats">${stats}</div>
      </button>`;
  }).join('');
}

const BRUNO_METRIC_CARDS = [
  { key: 'productivityScore', label: 'Eficiência', type: 'percent', help: 'Eficiência de execução = estimativa do card ÷ tempo de execução (atribuição). 100% quando entrega dentro da estimativa.', tone: (s) => (s.efficiency >= 70 ? 'positive' : s.efficiency >= 50 ? 'warning' : 'negative') },
  { key: 'cardsWorked', label: 'Cards trabalhados', type: 'number', help: 'Quantidade de cards do quadro de Criação que o Bruno tocou no período.' },
  { key: 'averageExecutionSeconds', label: 'Tempo médio/card', type: 'seconds', help: 'Duração média de atribuição por card (tempo de execução).' },
  { key: 'executionSeconds', label: 'Execução total', type: 'seconds', help: 'Soma da duração das atribuições do Bruno no período.' },
  { key: 'workedSeconds', label: 'Tempo apontado', type: 'seconds', help: 'Horas lançadas pelo Bruno no Runrun.it.' },
  { key: 'aging', label: 'Aging', type: 'number', help: 'Cards cujo tempo de execução passou de 2x a estimativa (risco de gargalo).', tone: (s) => (s.aging ? 'negative' : 'positive') },
];

function renderBrunoMetrics(container, summary, comparison) {
  if (!container) return;
  container.innerHTML = BRUNO_METRIC_CARDS.map((def) => {
    const value = summary[def.key === 'productivityScore' ? 'efficiency' : def.key] ?? summary[def.key];
    const tone = def.tone ? def.tone(summary) : '';
    const item = comparison?.metrics?.[def.key];
    return `
      <article class="metric-card ${tone}">
        <div class="metric-top">
          <span>${escapeHtml(def.label)}</span>
          <button class="metric-help" type="button" aria-label="Como calculamos ${escapeHtml(def.label)}" data-help="${escapeHtml(def.help)}">?</button>
        </div>
        <div class="metric-value-row">
          <strong>${formatMetricValue(def, value)}</strong>
          ${renderDeltaPill({ polarity: def.key === 'aging' ? 'lower' : 'higher' }, item)}
        </div>
        <small>${def.key === 'productivityScore' ? `${formatNumber(summary.overEstimate)} card(s) acima da estimativa` : 'Execução no quadro de Criação'}</small>
      </article>`;
  }).join('');
}

function renderIndividual() {
  const people = state.data.people || [];
  if (els.personSelect) {
    els.personSelect.innerHTML = people.map((p) => `<option value="${escapeHtml(p.name)}">${escapeHtml(p.name)}</option>`).join('');
    if (!people.some((p) => p.name === state.selectedPerson) && people[0]) state.selectedPerson = people[0].name;
    els.personSelect.value = state.selectedPerson;
  }
  const person = people.find((p) => p.name === state.selectedPerson);
  if (!person) return;

  if (els.individualTitle) els.individualTitle.textContent = person.name;
  const exec = isExecutionPerson(person);

  if (exec) {
    renderBrunoMetrics(els.individualMetrics, person.summary, person.comparison);
  } else {
    renderMetrics(els.individualMetrics, person.summary, person.comparison,
      ['productivityScore', 'delivered', 'onTimeRate', 'late', 'overdueOpen', 'throughput']);
  }

  if (els.individualTrend) {
    els.individualTrend.innerHTML = exec
      ? lineAreaChart(person.dailySeries || [], [{ key: 'wip', label: 'WIP', color: TONE_COLORS.primary, fill: `${TONE_COLORS.primary}1f` }])
      : lineAreaChart(person.dailySeries || [], [
        { key: 'delivered', label: 'Entregues', color: TONE_COLORS.positive, fill: `${TONE_COLORS.positive}1f` },
        { key: 'opened', label: 'Abertas', color: TONE_COLORS.primary },
      ]);
  }

  if (exec) {
    const eff = person.summary.efficiency || 0;
    const tone = eff >= 70 ? 'positive' : eff >= 50 ? 'warning' : 'negative';
    if (els.individualOnTime) {
      els.individualOnTime.innerHTML = `<div class="donut-host">${miniRing(eff, tone)}</div><p class="panel-note" style="text-align:center">Eficiência de execução · ${formatNumber(person.summary.overEstimate)} card(s) acima da estimativa</p>`;
    }
    if (els.individualImpact) {
      els.individualImpact.innerHTML = person.summary.aging
        ? `<p class="empty">${formatNumber(person.summary.aging)} card(s) com tempo de execução acima de 2x a estimativa — possíveis gargalos.</p>`
        : '<p class="empty">Nenhum card em aging: execução dentro do esperado.</p>';
    }
  } else {
    renderDeliveryComposition(els.individualOnTime, person.summary);
    if (els.individualImpact) els.individualImpact.innerHTML = renderImpactList(person.productivityImpacts || []);
  }

  if (els.individualBreakdowns) {
    els.individualBreakdowns.innerHTML = [
      '<h4>Gargalos individuais</h4>', renderStageFunnelHtml(person.stageFunnel),
      '<h4>Por quadro</h4>', renderBarHtml(person.breakdowns.boards),
      '<h4>Por etapa</h4>', renderBarHtml(person.breakdowns.stages),
      '<h4>Por tipo</h4>', renderBarHtml(person.breakdowns.types),
    ].join('');
  }

  const tasks = (state.data.audit || [])
    .filter((t) => t.collaborator === person.name || (t.assignee || '').includes(person.name))
    .slice(0, 8);
  if (els.individualTasks) {
    els.individualTasks.innerHTML = tasks.length
      ? tasks.map((task) => `
        <div class="task-row">
          <strong>${escapeHtml(task.title)}</strong>
          <div class="tag-list">${(task.tags || []).slice(0, 4).map((tag) => `<span>${escapeHtml(tag)}</span>`).join('')}</div>
          <div class="mini-stats">
            <span>${escapeHtml(task.stage)}</span>
            <span>Prazo ${formatDate(task.dueDate)}</span>
            <span>${formatSeconds(task.workedSeconds)}</span>
          </div>
        </div>`).join('')
      : '<p class="empty">Sem tarefas encontradas para este período.</p>';
  }
}

/* --------------------------------------------------------------- flow view */

function renderWorkload() {
  if (!els.workloadRows) return;
  const rows = state.data.people || [];
  const max = Math.max(...rows.map((row) => row.summary.open + row.summary.overdueOpen), 1);
  els.workloadRows.innerHTML = rows.map((person) => {
    const value = person.summary.open + person.summary.overdueOpen;
    return `
      <div class="person-row">
        <div class="person-head"><strong>${escapeHtml(person.name)}</strong><span>${formatNumber(person.summary.open)} abertas</span></div>
        <div class="bar-track"><div class="bar-fill" style="width:${Math.max(4, (value / max) * 100)}%"></div></div>
        <div class="mini-stats">
          <span>${formatNumber(person.summary.active)} ativas</span>
          <span class="${person.summary.overdueOpen ? 'danger' : ''}">${formatNumber(person.summary.overdueOpen)} vencidas</span>
          <span>${formatSeconds(person.summary.workedSeconds)} apontadas</span>
          <span>${formatDays(person.summary.cycleTimeDays)} ciclo</span>
        </div>
      </div>`;
  }).join('');
}

function renderFlow() {
  renderMetrics(els.flowMetrics, state.data.summary, state.data.comparisons?.[0],
    ['throughput', 'cycleTimeDays', 'flowEfficiency', 'averageExecutionSeconds', 'active', 'workedSeconds']);
  if (els.wipTrend) {
    els.wipTrend.innerHTML = lineAreaChart(state.data.dailySeries || [], [
      { key: 'wip', label: 'WIP', color: TONE_COLORS.primary, fill: `${TONE_COLORS.primary}1f` },
    ]);
  }
  if (els.stageFunnel) els.stageFunnel.innerHTML = renderStageFunnelHtml(state.data.stageFunnel);
  renderWorkload();
  if (els.boardBreakdown) els.boardBreakdown.innerHTML = renderBarHtml(state.data.breakdowns.boards);
  if (els.stageBreakdown) els.stageBreakdown.innerHTML = renderBarHtml(state.data.breakdowns.stages);
}

/* ------------------------------------------------------------ alerts/audit */

function severityLabel(severity) {
  if (severity === 'high') return 'Alta';
  if (severity === 'medium') return 'Média';
  return 'Baixa';
}

function renderAlerts() {
  const alerts = state.data.alerts || [];
  if (els.alertsBadge) {
    const high = alerts.filter((a) => a.severity === 'high').length;
    els.alertsBadge.textContent = formatNumber(alerts.length);
    els.alertsBadge.classList.toggle('hidden', !alerts.length);
    els.alertsBadge.classList.toggle('high', high > 0);
  }
  if (!els.alertsList) return;
  els.alertsList.innerHTML = alerts.length
    ? alerts.map((alert) => `
      <article class="insight-card ${escapeHtml(alert.severity)}">
        <div class="insight-icon">!</div>
        <div>
          <div class="alert-head"><strong>${escapeHtml(alert.title)}</strong><span>${severityLabel(alert.severity)}</span></div>
          <p>${escapeHtml(alert.detail)}</p>
          <div class="alert-action"><span>${escapeHtml(alert.assignee || 'Departamento')}</span><b>${escapeHtml(alert.action || '')}</b></div>
        </div>
      </article>`).join('')
    : '<div class="panel"><p class="empty">Nenhum alerta crítico para este período.</p></div>';
}

function renderAudit() {
  if (!els.auditTable) return;
  const query = state.auditQuery.trim().toLowerCase();
  let rows = state.data.audit || [];
  if (query) {
    rows = rows.filter((row) => [row.title, row.assignee, row.collaborator, row.board, row.stage, row.type]
      .some((field) => String(field || '').toLowerCase().includes(query)));
  }
  els.auditTable.innerHTML = rows.length
    ? rows.map((row) => `
      <tr>
        <td>
          <strong>${escapeHtml(row.title)}</strong>
          <div class="muted">${escapeHtml(row.project)} · ${escapeHtml(row.client)}</div>
          <div class="tag-list">${(row.tags || []).map((tag) => `<span>${escapeHtml(tag)}</span>`).join('')}</div>
        </td>
        <td>${escapeHtml(row.assignee)}<br><span class="muted">${escapeHtml(row.collaborator)}</span></td>
        <td>${escapeHtml(row.board)}</td>
        <td>${escapeHtml(row.stage)}</td>
        <td>${formatDate(row.dueDate)}${row.dueDate ? '<br><span class="deadline-basis">prazo atual</span>' : ''}</td>
        <td>${formatSeconds(row.workedSeconds)}<br><span class="muted">est. ${formatSeconds(row.estimateSeconds)}</span><br><span class="muted">criada ${formatDate(row.createdAt)}</span></td>
      </tr>`).join('')
    : `<tr><td colspan="6" class="empty">${query ? 'Nenhuma tarefa corresponde à busca.' : 'Sem tarefas para auditar neste período.'}</td></tr>`;
}

/* --------------------------------------------------------------- render all */

function syncFilterControls() {
  if (els.boardScope) {
    state.boardScope = state.data.scope?.boardScope || state.boardScope;
    els.boardScope.value = state.boardScope;
  }
  if (!isEditingFilters()) {
    if (els.startDate) els.startDate.value = state.data.period.start || '';
    if (els.endDate) els.endDate.value = state.data.period.end || '';
  }
}

function renderAll(options = {}) {
  const data = state.data;
  const comparison = data.comparisons?.[0];
  const rangeLabel = data.range?.label || (state.customRange ? 'Período personalizado' : 'Período');
  if (els.periodTitle) els.periodTitle.textContent = `${rangeLabel} · ${formatDate(data.period.start)} a ${formatDate(data.period.end)}`;

  if (!options.background) syncFilterControls();
  if (data.scope?.excludedTaskIdsByPerson) {
    state.settings.excludedTaskIdsByPerson = sanitizeExcludedTaskIdsByPerson(data.scope.excludedTaskIdsByPerson);
  }

  // Overview
  renderInsights();
  renderMetrics(els.metricGrid, data.summary, comparison);
  renderProductivityDonut();
  renderDeliveryComposition(els.deliveryComposition, data.summary);
  renderPeopleChart();
  renderTrend();
  if (els.productivityImpact) els.productivityImpact.innerHTML = renderImpactList(data.productivityImpacts || []);

  // People
  renderPeopleCards();
  renderIndividual();

  // Flow
  renderFlow();

  // Alerts + Audit
  renderAlerts();
  renderAudit();

  // Settings (card selection reflects fresh data)
  renderCardSelection();

  showNotice(data.source?.warnings?.length ? data.source.warnings.join(' · ') : '');
}

/* --------------------------------------------------------------- settings */

function isCardExcludedForPerson(personName, cardId) {
  const exclusions = sanitizeExcludedTaskIdsByPerson(state.settings.excludedTaskIdsByPerson);
  const ids = exclusions[personName] || [];
  return ids.includes(String(cardId || '').trim());
}

function renderCardSelection() {
  if (!els.cardSelectionList || !els.cardSelectionSummary) return;
  const selection = state.data?.cardSelection;
  if (!selection || !selection.people?.length) {
    els.cardSelectionSummary.textContent = 'Sem cards carregados para este período.';
    els.cardSelectionList.innerHTML = '<p class="empty">Atualize os dados para ver os cards usados no cálculo.</p>';
    return;
  }
  const people = selection.people.map((person) => {
    const cards = person.cards.map((card) => ({ ...card, included: !isCardExcludedForPerson(person.name, card.id) }));
    return { ...person, cards, included: cards.filter((c) => c.included).length, total: cards.length };
  });
  const included = people.reduce((sum, p) => sum + p.included, 0);
  const excluded = people.reduce((sum, p) => sum + (p.total - p.included), 0);
  els.cardSelectionSummary.textContent = `${formatNumber(included)} marcados | ${formatNumber(excluded)} desmarcados`;
  els.cardSelectionList.innerHTML = people.map((person) => `
    <details class="card-selection-person">
      <summary class="card-selection-person-head">
        <strong>${escapeHtml(person.name)}</strong>
        <span>${formatNumber(person.included)}/${formatNumber(person.total)} usados</span>
      </summary>
      <div class="card-selection-items">
        ${person.cards.length ? person.cards.map((card) => `
          <label class="card-selection-row ${card.included ? '' : 'excluded'}">
            <input type="checkbox" class="card-selection-toggle" data-person="${escapeHtml(person.name)}" data-card-id="${escapeHtml(card.id)}" ${card.included ? 'checked' : ''}>
            <span class="card-selection-main">
              <strong>#${escapeHtml(card.id || 'sem ID')} ${escapeHtml(card.title)}</strong>
              <small>${escapeHtml(card.board)} · ${escapeHtml(card.stage)}</small>
            </span>
            <span class="card-selection-impact">${formatDecimal(card.lateDays || 0, 1)}d fora do fluxo</span>
          </label>`).join('') : '<p class="empty">Sem cards para esta pessoa no período.</p>'}
      </div>
    </details>`).join('');
}

function persistBoardScope() {
  try { window.localStorage?.setItem(STORAGE_KEYS.boardScope, state.boardScope); } catch (error) { /* noop */ }
}

function persistSettings() {
  try { window.localStorage?.setItem(STORAGE_KEYS.productivitySettings, JSON.stringify(state.settings)); } catch (error) { /* noop */ }
}

function setCardIncluded(personName, cardId, included) {
  const person = String(personName || '').trim();
  const id = String(cardId || '').trim();
  if (!person || !id) return;
  const exclusions = sanitizeExcludedTaskIdsByPerson(state.settings.excludedTaskIdsByPerson);
  const ids = new Set(exclusions[person] || []);
  if (included) ids.delete(id); else ids.add(id);
  if (ids.size) exclusions[person] = [...ids].sort((a, b) => a.localeCompare(b, 'pt-BR', { numeric: true }));
  else delete exclusions[person];
  state.settings.excludedTaskIdsByPerson = exclusions;
  persistSettings();
  renderCardSelection();
  loadData(state.currentRequest);
}

function includeAllCards() {
  state.settings.excludedTaskIdsByPerson = {};
  persistSettings();
  renderCardSelection();
  loadData(state.currentRequest);
}

function setSettingsTab(tabName) {
  state.settingsTab = tabName;
  document.querySelectorAll('[data-settings-tab]').forEach((b) => b.classList.toggle('active', b.dataset.settingsTab === tabName));
  document.querySelectorAll('[data-settings-panel]').forEach((panel) => {
    const active = panel.dataset.settingsPanel === tabName;
    panel.classList.toggle('active', active);
    panel.classList.toggle('hidden', !active);
  });
}

function setSelectOptions(select, values = [], selectedValue = '') {
  if (!select) return;
  const uniqueValues = [...new Set(values.filter(Boolean))];
  select.innerHTML = uniqueValues.map((value) => `<option value="${escapeHtml(value)}" ${value === selectedValue ? 'selected' : ''}>${escapeHtml(value)}</option>`).join('');
}

function normalizeTemplateVariables(values = REPORT_TEMPLATE_VARIABLES) {
  return values.map((item) => (typeof item === 'string' ? { key: item, label: item } : { key: String(item.key || '').trim(), label: String(item.label || item.key || '').trim() }))
    .filter((item) => item.key);
}

function getReportTemplateDefaults() {
  const template = state.reportConfig?.template || {};
  return {
    subjectTemplate: template.subjectTemplate || DEFAULT_REPORT_SUBJECT_TEMPLATE,
    bodyTemplate: template.bodyTemplate || DEFAULT_REPORT_BODY_TEMPLATE,
    variables: normalizeTemplateVariables(template.variables || REPORT_TEMPLATE_VARIABLES),
  };
}

function renderTemplateVariables() {
  if (!els.templateVariableList) return;
  const defaults = getReportTemplateDefaults();
  els.templateVariableList.innerHTML = defaults.variables.map((item) => `
    <button class="template-variable" type="button" data-template-variable="${escapeHtml(item.key)}" title="${escapeHtml(item.label)}">{{${escapeHtml(item.key)}}}</button>`).join('');
}

function syncTemplateInputsFromState() {
  const defaults = getReportTemplateDefaults();
  if (!state.settings.reportSubjectTemplate || state.settings.reportSubjectTemplate === DEFAULT_REPORT_SUBJECT_TEMPLATE) state.settings.reportSubjectTemplate = defaults.subjectTemplate;
  if (!state.settings.reportBodyTemplate || state.settings.reportBodyTemplate === DEFAULT_REPORT_BODY_TEMPLATE) state.settings.reportBodyTemplate = defaults.bodyTemplate;
  if (els.reportSubjectTemplate) els.reportSubjectTemplate.value = state.settings.reportSubjectTemplate;
  if (els.reportBodyTemplate) els.reportBodyTemplate.value = state.settings.reportBodyTemplate;
  renderTemplateVariables();
}

function resetReportTemplate() {
  const defaults = getReportTemplateDefaults();
  state.settings.reportSubjectTemplate = defaults.subjectTemplate;
  state.settings.reportBodyTemplate = defaults.bodyTemplate;
  persistSettings();
  syncTemplateInputsFromState();
}

function insertTemplateVariable(variableName) {
  const token = `{{${variableName}}}`;
  const field = document.activeElement === els.reportSubjectTemplate ? els.reportSubjectTemplate : els.reportBodyTemplate;
  if (!field) return;
  const start = Number.isInteger(field.selectionStart) ? field.selectionStart : field.value.length;
  const end = Number.isInteger(field.selectionEnd) ? field.selectionEnd : start;
  field.value = `${field.value.slice(0, start)}${token}${field.value.slice(end)}`;
  const next = start + token.length;
  if (typeof field.setSelectionRange === 'function') field.setSelectionRange(next, next);
  if (field === els.reportSubjectTemplate) state.settings.reportSubjectTemplate = field.value;
  else state.settings.reportBodyTemplate = field.value;
  persistSettings();
  field.focus();
}

function renderAutomationControls() {
  const config = state.reportConfig || {};
  const fromOptions = config.fromOptions?.length ? config.fromOptions : [DEFAULT_REPORT_FROM];
  const collaborators = config.collaborators?.length ? config.collaborators : (state.data?.scope?.collaborators || ['Allana', 'Bruno', 'Bruna', 'Beatriz']);
  const selectedFrom = state.settings.reportFrom || config.defaultFrom || DEFAULT_REPORT_FROM;
  const selectedPerson = state.settings.testReportPerson || collaborators[0] || '';
  setSelectOptions(els.reportFrom, fromOptions, selectedFrom);
  setSelectOptions(els.testReportPerson, collaborators, selectedPerson);
  if (els.testReportRecipient) els.testReportRecipient.value = state.settings.testReportRecipient || '';
  syncTemplateInputsFromState();
}

async function loadReportConfig() {
  try {
    const response = await fetch(`/api/report-config?_=${Date.now()}`);
    const payload = await response.json();
    if (!response.ok || !payload.ok) throw new Error(payload.error || 'Falha ao carregar automação.');
    state.reportConfig = payload;
    renderAutomationControls();
  } catch (error) {
    if (els.testReportStatus) {
      els.testReportStatus.textContent = error.message;
      els.testReportStatus.className = 'automation-status error';
    }
  }
}

function openSettingsModal() {
  renderAutomationControls();
  renderCardSelection();
  loadReportConfig();
  setSettingsTab(state.settingsTab || 'cards');
  els.settingsModal.classList.remove('hidden');
}

function closeSettingsModal() {
  els.settingsModal.classList.add('hidden');
}

async function sendTestReport() {
  const from = els.reportFrom?.value || DEFAULT_REPORT_FROM;
  const collaborator = els.testReportPerson?.value || state.selectedPerson;
  const to = sanitizeEmail(els.testReportRecipient?.value);
  const subjectTemplate = String(els.reportSubjectTemplate?.value || '').trim() || DEFAULT_REPORT_SUBJECT_TEMPLATE;
  const bodyTemplate = String(els.reportBodyTemplate?.value || '').trim() || DEFAULT_REPORT_BODY_TEMPLATE;
  state.settings.reportFrom = from;
  state.settings.testReportPerson = collaborator;
  state.settings.testReportRecipient = to;
  state.settings.reportSubjectTemplate = subjectTemplate;
  state.settings.reportBodyTemplate = bodyTemplate;
  persistSettings();

  if (!to) {
    if (els.testReportStatus) { els.testReportStatus.textContent = 'Informe um destinatário válido para o teste.'; els.testReportStatus.className = 'automation-status error'; }
    return;
  }
  if (els.sendTestReport) els.sendTestReport.disabled = true;
  if (els.testReportStatus) { els.testReportStatus.textContent = 'Enviando teste…'; els.testReportStatus.className = 'automation-status'; }
  try {
    const response = await fetch('/api/report-test', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ from, to, collaborator, boardScope: state.boardScope, template: { subjectTemplate, bodyTemplate } }),
    });
    const payload = await response.json();
    if (!response.ok || !payload.ok) throw new Error(payload.error || 'Falha ao enviar teste.');
    if (els.testReportStatus) { els.testReportStatus.textContent = `Teste enviado para ${to}.`; els.testReportStatus.className = 'automation-status success'; }
  } catch (error) {
    if (els.testReportStatus) { els.testReportStatus.textContent = error.message; els.testReportStatus.className = 'automation-status error'; }
  } finally {
    if (els.sendTestReport) els.sendTestReport.disabled = false;
  }
}

async function runWeeklyReportNow() {
  if (!els.sendNowConfirmBtn) return;
  els.sendNowConfirmBtn.disabled = true;
  if (els.sendNowStatus) { els.sendNowStatus.textContent = 'Enviando para todos os colaboradores…'; els.sendNowStatus.className = 'automation-status'; }
  try {
    const response = await fetch('/api/report-run', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ confirm: true, boardScope: state.boardScope }),
    });
    const payload = await response.json();
    if (!response.ok || !payload.ok) throw new Error(payload.error || 'Falha ao enviar relatórios.');
    const sent = (payload.sent || []).length;
    const skipped = (payload.skipped || []).length;
    if (els.sendNowStatus) {
      els.sendNowStatus.textContent = `Enviado para ${sent} colaborador(es)${skipped ? ` · ${skipped} sem dados no período` : ''}.`;
      els.sendNowStatus.className = 'automation-status success';
    }
  } catch (error) {
    if (els.sendNowStatus) { els.sendNowStatus.textContent = error.message; els.sendNowStatus.className = 'automation-status error'; }
  } finally {
    els.sendNowConfirmBtn.disabled = false;
    els.sendNowConfirm?.classList.add('hidden');
  }
}

/* --------------------------------------------------------------- navigation */

function shouldShowGlobalOverview(tabName) {
  return ['overview', 'people', 'flow'].includes(tabName);
}

function setActiveTab(tabName) {
  state.activeTab = tabName;
  document.querySelectorAll('.nav-tab').forEach((tab) => tab.classList.toggle('active', tab.dataset.tab === tabName));
  document.querySelectorAll('.view').forEach((view) => view.classList.remove('active'));
  const view = document.getElementById(`${tabName}View`);
  if (view) view.classList.add('active');
  if (els.viewTitle) els.viewTitle.textContent = VIEW_TITLES[tabName] || 'Visão geral';
}

/* --------------------------------------------------------------- data load */

async function loadData(params = state.currentRequest, options = {}) {
  if (state.loading) return;
  state.loading = true;
  if (!options.background) { setStatus('Carregando'); showNotice(''); updateRefreshCountdown('Atualizando agora…'); }

  const query = new URLSearchParams();
  query.set('_', String(Date.now()));
  query.set('boardScope', state.boardScope);
  query.set('excludedTaskIdsByPerson', JSON.stringify(state.settings.excludedTaskIdsByPerson || {}));
  // O refresh em segundo plano não busca histórico (comentários) para não estourar o
  // limite de 100 req/min do Runrun.it; o histórico é recalculado nas cargas em primeiro plano.
  if (options.background) query.set('history', 'off');
  if (params.start && params.end) { query.set('start', params.start); query.set('end', params.end); }
  else { query.set('preset', params.preset || state.preset); }

  try {
    const response = await fetch(`/api/analytics?${query.toString()}`);
    const payload = await response.json();
    if (!response.ok || !payload.ok) throw new Error(payload.error || 'Falha ao carregar dados.');
    state.currentRequest = params.start && params.end ? { start: params.start, end: params.end } : { preset: params.preset || state.preset };
    state.data = payload;
    setStatus('Conectado', 'ready');
    renderAll(options);
    scheduleNextRefresh();
    startAutoRefresh();
  } catch (error) {
    setStatus('Ação necessária', 'error');
    if (!options.background) showNotice(error.message, 'error');
    scheduleNextRefresh();
  } finally {
    state.loading = false;
  }
}

/* --------------------------------------------------------------- listeners */

document.querySelectorAll('.nav-tab').forEach((button) => {
  button.addEventListener('click', () => setActiveTab(button.dataset.tab));
});

document.querySelectorAll('.preset').forEach((button) => {
  button.addEventListener('click', () => {
    state.preset = button.dataset.preset;
    state.customRange = false;
    document.querySelectorAll('.preset').forEach((p) => p.classList.remove('active'));
    button.classList.add('active');
    loadData({ preset: state.preset });
  });
});

if (els.boardScope) {
  els.boardScope.value = state.boardScope;
  els.boardScope.addEventListener('change', () => {
    state.boardScope = els.boardScope.value;
    persistBoardScope();
    loadData(state.currentRequest);
  });
}

if (els.applyCustom) {
  els.applyCustom.addEventListener('click', () => {
    const start = els.startDate?.value;
    const end = els.endDate?.value;
    if (!start || !end) { showNotice('Escolha início e fim para aplicar o período personalizado.', 'error'); return; }
    if (start > end) { showNotice('A data de início deve ser anterior ou igual à data de fim.', 'error'); return; }
    state.customRange = true;
    document.querySelectorAll('.preset').forEach((p) => p.classList.remove('active'));
    loadData({ start, end });
  });
}

if (els.refreshButton) els.refreshButton.addEventListener('click', () => loadData(state.currentRequest));

if (els.personSelect) {
  els.personSelect.addEventListener('change', () => { state.selectedPerson = els.personSelect.value; renderPeopleCards(); renderIndividual(); });
}

if (els.peopleSummary) {
  els.peopleSummary.addEventListener('click', (event) => {
    const card = event.target.closest?.('[data-person-card]');
    if (!card) return;
    state.selectedPerson = card.dataset.personCard;
    renderPeopleCards();
    renderIndividual();
    document.querySelector('.detail-panel')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  });
}

if (els.auditSearch) {
  els.auditSearch.addEventListener('input', () => { state.auditQuery = els.auditSearch.value; renderAudit(); });
}

if (els.settingsButton) els.settingsButton.addEventListener('click', openSettingsModal);
if (els.closeSettings) els.closeSettings.addEventListener('click', closeSettingsModal);
if (els.settingsModal) els.settingsModal.addEventListener('click', (e) => { if (e.target === els.settingsModal) closeSettingsModal(); });
if (typeof document.addEventListener === 'function') {
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && els.settingsModal && !els.settingsModal.classList.contains('hidden')) closeSettingsModal(); });
}

document.querySelectorAll('[data-settings-tab]').forEach((b) => b.addEventListener('click', () => setSettingsTab(b.dataset.settingsTab)));

if (els.cardSelectionList) {
  els.cardSelectionList.addEventListener('change', (event) => {
    const checkbox = event.target.closest?.('.card-selection-toggle');
    if (!checkbox) return;
    setCardIncluded(checkbox.dataset.person, checkbox.dataset.cardId, checkbox.checked);
  });
}

if (els.includeAllCards) els.includeAllCards.addEventListener('click', includeAllCards);
if (els.reportFrom) els.reportFrom.addEventListener('change', () => { state.settings.reportFrom = els.reportFrom.value || DEFAULT_REPORT_FROM; persistSettings(); });
if (els.testReportPerson) els.testReportPerson.addEventListener('change', () => { state.settings.testReportPerson = els.testReportPerson.value; persistSettings(); });
if (els.testReportRecipient) els.testReportRecipient.addEventListener('input', () => { state.settings.testReportRecipient = sanitizeEmail(els.testReportRecipient.value); persistSettings(); });
if (els.reportSubjectTemplate) els.reportSubjectTemplate.addEventListener('input', () => { state.settings.reportSubjectTemplate = els.reportSubjectTemplate.value || DEFAULT_REPORT_SUBJECT_TEMPLATE; persistSettings(); });
if (els.reportBodyTemplate) els.reportBodyTemplate.addEventListener('input', () => { state.settings.reportBodyTemplate = els.reportBodyTemplate.value || DEFAULT_REPORT_BODY_TEMPLATE; persistSettings(); });
if (els.resetReportTemplate) els.resetReportTemplate.addEventListener('click', resetReportTemplate);
if (els.templateVariableList) {
  els.templateVariableList.addEventListener('click', (event) => {
    const button = event.target.closest?.('.template-variable');
    if (button) insertTemplateVariable(button.dataset.templateVariable);
  });
}
if (els.sendTestReport) els.sendTestReport.addEventListener('click', sendTestReport);
if (els.sendWeeklyNow) els.sendWeeklyNow.addEventListener('click', () => { els.sendNowConfirm?.classList.remove('hidden'); });
if (els.sendNowCancel) els.sendNowCancel.addEventListener('click', () => { els.sendNowConfirm?.classList.add('hidden'); });
if (els.sendNowConfirmBtn) els.sendNowConfirmBtn.addEventListener('click', runWeeklyReportNow);

function startApp() {
  loadData();
}

function showUser(user) {
  if (!user) return;
  if (els.userLabel) els.userLabel.textContent = user.name || user.email || '';
  els.sidebarUser?.classList.remove('hidden');
}

function showAuthGate() {
  const search = (typeof location !== 'undefined' && location.search) || '';
  const reason = new URLSearchParams(search).get('auth');
  if (reason && els.authGateMsg) {
    els.authGateMsg.textContent = reason === 'dominio'
      ? 'Use uma conta @avalyst.com.br para entrar.'
      : 'Não foi possível entrar. Tente novamente.';
    els.authGateMsg.classList.remove('hidden');
  }
  els.authGate?.classList.remove('hidden');
}

async function ensureAuth() {
  try {
    const response = await fetch('/api/auth/me', { cache: 'no-store' });
    const payload = await response.json().catch(() => ({}));
    if (response.ok && payload.authenticated) {
      if (!payload.open && payload.user) showUser(payload.user);
      startApp();
      return;
    }
  } catch (error) {
    // sem conexão com o endpoint de auth — mostra o gate
  }
  showAuthGate();
}

const THEME_KEY = 'mkt-theme';

function applyTheme(theme) {
  if (typeof document === 'undefined' || !document.documentElement) return;
  document.documentElement.dataset.theme = theme;
  if (els.themeToggle) els.themeToggle.textContent = theme === 'dark' ? '☀' : '◐';
}

function initTheme() {
  let stored = null;
  try { stored = window.localStorage?.getItem(THEME_KEY); } catch (error) { /* noop */ }
  const prefersDark = typeof window !== 'undefined' && window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches;
  applyTheme(stored === 'dark' || stored === 'light' ? stored : (prefersDark ? 'dark' : 'light'));
}

function toggleTheme() {
  const current = (typeof document !== 'undefined' && document.documentElement?.dataset.theme) || 'light';
  const next = current === 'dark' ? 'light' : 'dark';
  applyTheme(next);
  try { window.localStorage?.setItem(THEME_KEY, next); } catch (error) { /* noop */ }
}

if (els.themeToggle) els.themeToggle.addEventListener('click', toggleTheme);
initTheme();

setActiveTab(state.activeTab);
ensureAuth();
