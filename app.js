const DEFAULT_EXPECTED_THROUGHPUT = 20;
const STORAGE_KEYS = {
  boardScope: 'runrunit-dashboard-board-scope',
  productivitySettings: 'runrunit-dashboard-productivity-settings',
};

function sanitizeExpectedThroughput(value) {
  const number = Number(value);
  if (!Number.isFinite(number)) return DEFAULT_EXPECTED_THROUGHPUT;
  return Math.max(1, Math.min(999, Math.round(number)));
}

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
      expectedThroughput: sanitizeExpectedThroughput(parsed.expectedThroughput),
      excludedTaskIdsByPerson: sanitizeExcludedTaskIdsByPerson(parsed.excludedTaskIdsByPerson),
    };
  } catch (error) {
    return {
      expectedThroughput: DEFAULT_EXPECTED_THROUGHPUT,
      excludedTaskIdsByPerson: {},
    };
  }
}

const state = {
  data: null,
  preset: 'this-week',
  boardScope: readStoredBoardScope(),
  settings: readStoredSettings(),
  selectedPerson: 'Allana',
  currentRequest: { preset: 'this-week' },
  loading: false,
  refreshTimer: null,
  nextRefreshAt: null,
  activeTab: 'overview',
  settingsTab: 'weights',
};

const REFRESH_INTERVAL_MS = 15000;

const els = {
  status: document.getElementById('connectionStatus'),
  refreshCountdown: document.getElementById('refreshCountdown'),
  notice: document.getElementById('notice'),
  globalOverview: document.getElementById('globalOverview'),
  periodTitle: document.getElementById('periodTitle'),
  metricGrid: document.getElementById('metricGrid'),
  peopleSummary: document.getElementById('peopleSummary'),
  boardBreakdown: document.getElementById('boardBreakdown'),
  stageFunnel: document.getElementById('stageFunnel'),
  productivityImpact: document.getElementById('productivityImpact'),
  workloadRows: document.getElementById('workloadRows'),
  personSelect: document.getElementById('personSelect'),
  individualTitle: document.getElementById('individualTitle'),
  individualMetrics: document.getElementById('individualMetrics'),
  individualBreakdowns: document.getElementById('individualBreakdowns'),
  individualImpact: document.getElementById('individualImpact'),
  individualTasks: document.getElementById('individualTasks'),
  alertsList: document.getElementById('alertsList'),
  auditTable: document.getElementById('auditTable'),
  startDate: document.getElementById('startDate'),
  endDate: document.getElementById('endDate'),
  boardScope: document.getElementById('boardScope'),
  settingsButton: document.getElementById('settingsButton'),
  settingsModal: document.getElementById('settingsModal'),
  closeSettings: document.getElementById('closeSettings'),
  settingsTargetNote: document.getElementById('settingsTargetNote'),
  expectedThroughputInput: document.getElementById('expectedThroughputInput'),
  expectedThroughputPreview: document.getElementById('expectedThroughputPreview'),
  cardSelectionSummary: document.getElementById('cardSelectionSummary'),
  cardSelectionList: document.getElementById('cardSelectionList'),
  includeAllCards: document.getElementById('includeAllCards'),
  resetSettings: document.getElementById('resetSettings'),
  saveSettings: document.getElementById('saveSettings'),
};

const METRICS = [
  {
    key: 'productivityScore',
    label: 'Produtividade',
    type: 'percent',
    polarity: 'higher',
    tone: (summary) => (summary.productivityScore >= 70 ? 'positive' : summary.productivityScore >= 50 ? 'warning' : 'negative'),
    detail: (summary) => `${formatNumber(summary.delivered)} entregas | meta ${formatNumber(summary.productivitySettings?.expectedThroughput || DEFAULT_EXPECTED_THROUGHPUT)}`,
    help: (summary) => productivityHelp(summary),
  },
  {
    key: 'opened',
    label: 'Abertas',
    type: 'number',
    polarity: 'neutral',
    detail: (summary) => `${formatNumber(summary.openedCreatedInPeriod)} novas | ${formatNumber(summary.openedCarryover)} herdadas`,
    help: 'Soma das tarefas criadas no periodo com as que foram criadas antes, mas continuaram abertas ou ativas durante o periodo analisado.',
  },
  {
    key: 'delivered',
    label: 'Entregues',
    type: 'number',
    polarity: 'higher',
    detail: (summary) => `${formatNumber(summary.deliveredCreatedInPeriod)} criadas no periodo | ${formatNumber(summary.deliveredFromCarryover)} herdadas`,
    help: 'Tarefas fechadas dentro do periodo selecionado. A subdivisao mostra se nasceram no periodo ou se vieram de antes.',
  },
  {
    key: 'onTimeRate',
    label: 'No prazo',
    type: 'percent',
    polarity: 'higher',
    detail: (summary) => `${formatNumber(summary.onTime)}/${formatNumber(summary.deliveredWithDeadline)} entregas com prazo`,
    help: 'Percentual calculado somente sobre tarefas entregues que tinham prazo definido. Por enquanto usa o prazo atual do Runrun.it.',
  },
  {
    key: 'late',
    label: 'Atrasadas',
    type: 'number',
    polarity: 'lower',
    tone: (summary) => (summary.late ? 'negative' : 'positive'),
    detail: () => 'Baseada no prazo atual',
    help: 'Tarefas entregues depois do prazo atual definido. Quando encontrarmos historico de prazo, trocaremos para o primeiro prazo definido.',
  },
  {
    key: 'early',
    label: 'Adiantadas',
    type: 'number',
    polarity: 'higher',
    tone: (summary) => (summary.early ? 'positive' : ''),
    detail: () => 'Baseada no prazo atual',
    help: 'Tarefas entregues antes do prazo atual definido. Quando encontrarmos historico de prazo, trocaremos para o primeiro prazo definido.',
  },
  {
    key: 'overdueOpen',
    label: 'Abertas vencidas',
    type: 'number',
    polarity: 'lower',
    tone: (summary) => (summary.overdueOpen ? 'negative' : 'positive'),
    detail: (summary) => `${formatNumber(summary.open)} abertas no fim do periodo`,
    help: 'Tarefas abertas ao final do periodo cujo prazo atual ja estava vencido.',
  },
  {
    key: 'active',
    label: 'Ativas',
    type: 'number',
    polarity: 'neutral',
    detail: () => 'Criadas no periodo ou herdadas',
    help: 'Tarefas que estavam abertas ou em execucao em algum momento do periodo, mesmo que tenham sido criadas antes dele.',
  },
  {
    key: 'throughput',
    label: 'Vazao',
    type: 'number',
    polarity: 'higher',
    detail: () => 'Entregas no periodo',
    help: 'Volume de tarefas finalizadas no periodo selecionado. Equivale ao throughput semanal, quinzenal ou mensal conforme o filtro.',
  },
  {
    key: 'averageExecutionSeconds',
    label: 'Tempo medio',
    type: 'seconds',
    polarity: 'lower',
    detail: () => 'Abertura do card ate conclusao',
    help: 'Media do tempo entre a criacao do card e sua conclusao, calculada apenas para tarefas entregues no periodo.',
  },
  {
    key: 'cycleTimeDays',
    label: 'Tempo de ciclo',
    type: 'days',
    polarity: 'lower',
    detail: (summary) => `WIP medio ${formatNumber(summary.averageDailyWip)}`,
    help: 'Estimativa pela Lei de Little: WIP medio diario dividido pela vazao diaria do periodo.',
  },
  {
    key: 'flowEfficiency',
    label: 'Eficiencia do fluxo',
    type: 'percent',
    polarity: 'higher',
    detail: () => 'Tempo apontado / ciclo total',
    help: 'Percentual entre o tempo apontado nas tarefas entregues e o tempo total entre abertura e conclusao dessas tarefas.',
  },
  {
    key: 'workedSeconds',
    label: 'Tempo apontado',
    type: 'seconds',
    polarity: 'neutral',
    detail: (summary) => `Estimado ${formatSeconds(summary.estimatedSeconds)}`,
    help: 'Soma do tempo apontado no Runrun.it para tarefas que tocaram o periodo analisado.',
  },
];

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
  return new Intl.NumberFormat('pt-BR', {
    minimumFractionDigits: 0,
    maximumFractionDigits,
  }).format(Number(value || 0));
}

function formatPoints(value) {
  return `${formatDecimal(value, 2)} pts`;
}

function productivityHelp(summary = {}) {
  {
    const breakdown = summary.productivityBreakdown || {};
    const parts = Object.values(breakdown).map((item) => {
      return `${item.label}: ${formatPercent(item.value)} x ${formatNumber(item.weight)} pts`;
    });
    const expectedThroughput = summary.productivitySettings?.expectedThroughput
      || state.settings.expectedThroughput
      || DEFAULT_EXPECTED_THROUGHPUT;

    return [
      'Calculo da produtividade (SEFK):',
      'Metodologia: Score de Eficiencia de Fluxo Kanban, combinando vazao esperada, previsibilidade/SLE e saude do fluxo.',
      'Formula: (40% x Indice de Vazao) + (40% x Indice de Previsibilidade/SLE) + (20% x Indice de Saude do Fluxo).',
      ...parts,
      `Meta de vazao: ${formatNumber(expectedThroughput)} entregas no periodo`,
      `Score final: ${formatPercent(summary.productivityScore)}`,
      'Atrasos antigos aparecem no SLE e na saude do fluxo, sem subtracao diaria acumulada.',
    ].join('\n');
  }

  const breakdown = summary.productivityBreakdown || {};
  const parts = Object.values(breakdown).map((item) => {
    return `${item.label}: ${formatPercent(item.value)} x ${formatNumber(item.weight)} pts`;
  });
  const baseScore = summary.productivityBaseScore ?? summary.productivityScore ?? 0;
  const penalty = Number(summary.latePenaltyPoints || 0);
  const averageLate = Number(summary.averageLateDays || 0);
  const dailyWeight = summary.productivitySettings?.latePenaltyPerDay ?? state.settings.latePenaltyPerDay;

  return [
    'Calculo da produtividade:',
    'Metodologia: score de fluxo Kanban com vazao, previsibilidade/SLE, aging de WIP, saude do backlog e eficiencia de horas.',
    ...parts,
    `Score ponderado: ${formatPercent(baseScore)}`,
    `Pressão progressiva de atraso: ${formatPoints(penalty)} (${formatDecimal(averageLate, 1)} dias medios entre itens atrasados/vencidos)`,
    `Peso atual: ${formatDecimal(dailyWeight, 2)} ponto por dia de atraso`,
    'Essa pressão não é subtraída diretamente; ela reduz Controle de atrasos e Backlog vencido de forma limitada.',
    `Score final: ${formatPercent(summary.productivityScore)}`,
  ].join('\n');
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

function setStatus(text, kind = '') {
  els.status.textContent = text;
  els.status.className = `status-pill ${kind}`.trim();
}

function showNotice(message, kind = '') {
  if (!message) {
    els.notice.classList.add('hidden');
    return;
  }
  els.notice.textContent = message;
  els.notice.className = `notice ${kind}`.trim();
}

function deltaTone(definition, item) {
  if (!item || item.direction === 'flat' || definition.polarity === 'neutral') return 'neutral';
  const improved = (definition.polarity === 'higher' && item.change > 0)
    || (definition.polarity === 'lower' && item.change < 0);
  return improved ? 'positive' : 'negative';
}

function renderDeltaPill(definition, item) {
  if (!item) return '';
  const tone = deltaTone(definition, item);
  if (item.direction === 'flat') {
    return '<span class="delta-pill neutral">0% igual</span>';
  }
  const arrow = item.direction === 'up' ? '&uarr;' : '&darr;';
  const label = item.direction === 'up' ? 'acima' : 'abaixo';
  return `<span class="delta-pill ${tone}">${arrow} ${Math.abs(item.changePercent)}% ${label}</span>`;
}

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
      <em>Periodo anterior: ${formatMetricValue(definition, previous)}</em>
    </article>
  `;
}

function renderMetrics(container, summary, comparison, metricKeys = METRICS.map((metric) => metric.key)) {
  const definitions = METRICS.filter((definition) => metricKeys.includes(definition.key));
  container.innerHTML = definitions.map((definition) => renderMetricCard(definition, summary, comparison)).join('');
}

function renderBarHtml(rows) {
  if (!rows || !rows.length) return '<p class="empty">Sem dados.</p>';
  const max = Math.max(...rows.map((row) => Number(row.value || 0)), 1);
  return rows.map((row) => `
    <div class="bar-row">
      <div class="bar-head"><span>${escapeHtml(row.name)}</span><strong>${formatNumber(row.value)}</strong></div>
      <div class="bar-track"><div class="bar-fill" style="width:${Math.max(4, (Number(row.value || 0) / max) * 100)}%"></div></div>
    </div>
  `).join('');
}

function renderStageFunnelHtml(stageFunnel) {
  const rows = stageFunnel?.rows || [];
  if (!rows.length) return '<p class="empty">Sem cards abertos suficientes para ler gargalos neste periodo.</p>';
  return `
    <p class="panel-note">${escapeHtml(stageFunnel.basis || '')}</p>
    <div class="funnel-list">
      ${rows.map((row) => `
        <div class="funnel-row">
          <div class="funnel-head">
            <strong>${escapeHtml(row.name)}</strong>
            <span>${formatPercent(row.percentage)}</span>
          </div>
          <div class="bar-track"><div class="bar-fill accent" style="width:${Math.max(4, Number(row.percentage || 0))}%"></div></div>
          <div class="mini-stats">
            <span>${formatNumber(row.value)} cards</span>
            <span>media ${formatSeconds(row.averageSeconds)}</span>
            <span>total ${formatSeconds(row.totalSeconds)}</span>
          </div>
        </div>
      `).join('')}
    </div>
  `;
}

function renderImpactList(rows = []) {
  if (!rows.length) {
    return '<p class="empty">Sem tarefas vencidas ou entregues fora do prazo neste periodo.</p>';
  }

  return `
    <div class="impact-list">
      ${rows.map((row) => `
        <div class="impact-row">
          <div class="impact-main">
            <strong>${escapeHtml(row.title)}</strong>
            <span>${escapeHtml(row.collaborator || row.assignee || 'Sem responsavel')} | ${escapeHtml(row.board)} | ${escapeHtml(row.stage)}</span>
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
        </div>
      `).join('')}
    </div>
  `;
}

function renderStageFunnel() {
  els.stageFunnel.innerHTML = renderStageFunnelHtml(state.data.stageFunnel);
}

function renderProductivityImpact() {
  els.productivityImpact.innerHTML = renderImpactList(state.data.productivityImpacts || []);
}

function isCardExcludedForPerson(personName, cardId) {
  const exclusions = sanitizeExcludedTaskIdsByPerson(state.settings.excludedTaskIdsByPerson);
  const ids = exclusions[personName] || [];
  return ids.includes(String(cardId || '').trim());
}

function renderCardSelection() {
  if (!els.cardSelectionList || !els.cardSelectionSummary) return;
  const selection = state.data?.cardSelection;
  if (!selection || !selection.people?.length) {
    els.cardSelectionSummary.textContent = 'Sem cards carregados para este periodo.';
    els.cardSelectionList.innerHTML = '<p class="empty">Atualize os dados para ver os cards usados no calculo.</p>';
    return;
  }

  const people = selection.people.map((person) => {
    const cards = person.cards.map((card) => ({
      ...card,
      included: !isCardExcludedForPerson(person.name, card.id),
    }));
    return {
      ...person,
      cards,
      included: cards.filter((card) => card.included).length,
      excluded: cards.filter((card) => !card.included).length,
      total: cards.length,
    };
  });
  const included = people.reduce((sum, person) => sum + person.included, 0);
  const excluded = people.reduce((sum, person) => sum + person.excluded, 0);

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
            <input
              type="checkbox"
              class="card-selection-toggle"
              data-person="${escapeHtml(person.name)}"
              data-card-id="${escapeHtml(card.id)}"
              ${card.included ? 'checked' : ''}
            >
            <span class="card-selection-main">
              <strong>#${escapeHtml(card.id || 'sem ID')} ${escapeHtml(card.title)}</strong>
              <small>${escapeHtml(card.board)} | ${escapeHtml(card.stage)}</small>
            </span>
            <span class="card-selection-impact">${formatDecimal(card.lateDays || 0, 1)}d fora do fluxo</span>
          </label>
        `).join('') : '<p class="empty">Sem cards para esta pessoa no periodo.</p>'}
      </div>
    </details>
  `).join('');
}

function renderPeople() {
  const people = state.data.people || [];
  els.peopleSummary.innerHTML = people.map((person) => {
    const productivity = person.comparison?.metrics?.productivityScore;
    return `
      <div class="person-row">
        <div class="person-head">
          <strong>${escapeHtml(person.name)}</strong>
          <span class="score">${formatPercent(person.summary.productivityScore)}</span>
        </div>
        <div class="person-delta">${renderDeltaPill(METRICS[0], productivity)}</div>
        <div class="mini-stats">
          <span>${formatNumber(person.summary.delivered)} entregues</span>
          <span>${formatPercent(person.summary.onTimeRate)} no prazo</span>
          <span>${formatNumber(person.summary.late)} atrasadas</span>
          <span>${formatNumber(person.summary.overdueOpen)} vencidas</span>
        </div>
      </div>
    `;
  }).join('');
}

function renderWorkload() {
  const rows = state.data.people || [];
  const max = Math.max(...rows.map((row) => row.summary.open + row.summary.overdueOpen), 1);
  els.workloadRows.innerHTML = rows.map((person) => {
    const value = person.summary.open + person.summary.overdueOpen;
    return `
      <div class="person-row">
        <div class="person-head">
          <strong>${escapeHtml(person.name)}</strong>
          <span>${formatNumber(person.summary.open)} abertas</span>
        </div>
        <div class="bar-track"><div class="bar-fill" style="width:${Math.max(4, (value / max) * 100)}%"></div></div>
        <div class="mini-stats">
          <span>${formatNumber(person.summary.active)} ativas</span>
          <span>${formatNumber(person.summary.overdueOpen)} vencidas</span>
          <span>${formatSeconds(person.summary.workedSeconds)} apontadas</span>
          <span>${formatDays(person.summary.cycleTimeDays)} ciclo</span>
        </div>
      </div>
    `;
  }).join('');
}

function renderIndividual() {
  const people = state.data.people || [];
  els.personSelect.innerHTML = people.map((person) => `<option value="${escapeHtml(person.name)}">${escapeHtml(person.name)}</option>`).join('');
  if (!people.some((person) => person.name === state.selectedPerson) && people[0]) {
    state.selectedPerson = people[0].name;
  }
  els.personSelect.value = state.selectedPerson;

  const person = people.find((item) => item.name === state.selectedPerson);
  if (!person) return;
  els.individualTitle.textContent = person.name;
  renderMetrics(els.individualMetrics, person.summary, person.comparison);
  els.individualImpact.innerHTML = renderImpactList(person.productivityImpacts || []);

  els.individualBreakdowns.innerHTML = [
    '<h3>Gargalos individuais</h3>',
    renderStageFunnelHtml(person.stageFunnel),
    '<h3>Por quadro</h3>',
    renderBarHtml(person.breakdowns.boards),
    '<h3>Por status</h3>',
    renderBarHtml(person.breakdowns.stages),
    '<h3>Por tipo</h3>',
    renderBarHtml(person.breakdowns.types),
  ].join('');

  const tasks = (state.data.audit || [])
    .filter((task) => task.collaborator === person.name || task.assignee.includes(person.name))
    .slice(0, 8);
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
      </div>
    `).join('')
    : '<p class="empty">Sem tarefas encontradas para este periodo.</p>';
}

function severityLabel(severity) {
  if (severity === 'high') return 'Alta';
  if (severity === 'medium') return 'Media';
  return 'Baixa';
}

function renderAlerts() {
  const alerts = state.data.alerts || [];
  els.alertsList.innerHTML = alerts.length
    ? alerts.map((alert) => `
      <article class="insight-card ${escapeHtml(alert.severity)}">
        <div class="insight-icon">!</div>
        <div>
          <div class="alert-head">
            <strong>${escapeHtml(alert.title)}</strong>
            <span>${severityLabel(alert.severity)}</span>
          </div>
          <p>${escapeHtml(alert.detail)}</p>
          <div class="alert-action">
            <span>${escapeHtml(alert.assignee || 'Departamento')}</span>
            <b>${escapeHtml(alert.action || '')}</b>
          </div>
        </div>
      </article>
    `).join('')
    : '<div class="panel"><p class="empty">Nenhum alerta critico para este periodo.</p></div>';
}

function renderAudit() {
  const rows = state.data.audit || [];
  els.auditTable.innerHTML = rows.length
    ? rows.map((row) => `
      <tr>
        <td>
          <strong>${escapeHtml(row.title)}</strong>
          <div class="muted">${escapeHtml(row.project)} | ${escapeHtml(row.client)}</div>
          <div class="tag-list">${(row.tags || []).map((tag) => `<span>${escapeHtml(tag)}</span>`).join('')}</div>
        </td>
        <td>${escapeHtml(row.assignee)}<br><span class="muted">${escapeHtml(row.collaborator)}</span></td>
        <td>${escapeHtml(row.board)}</td>
        <td>${escapeHtml(row.stage)}</td>
        <td>
          ${formatDate(row.dueDate)}
          ${row.dueDate ? '<br><span class="deadline-basis">prazo atual</span>' : ''}
        </td>
        <td>
          ${formatSeconds(row.workedSeconds)}
          <br><span class="muted">est. ${formatSeconds(row.estimateSeconds)}</span>
          <br><span class="muted">criada ${formatDate(row.createdAt)}</span>
        </td>
      </tr>
    `).join('')
    : '<tr><td colspan="6" class="empty">Sem tarefas para auditar neste periodo.</td></tr>';
}

function renderAll() {
  const data = state.data;
  const comparison = data.comparisons?.[0];
  els.periodTitle.textContent = `${data.range?.label || 'Periodo'} | ${formatDate(data.period.start)} a ${formatDate(data.period.end)}`;
  els.startDate.value = data.period.start || '';
  els.endDate.value = data.period.end || '';
  if (els.boardScope) {
    state.boardScope = data.scope?.boardScope || state.boardScope;
    els.boardScope.value = state.boardScope;
  }
  if (data.scope?.excludedTaskIdsByPerson) {
    state.settings.excludedTaskIdsByPerson = sanitizeExcludedTaskIdsByPerson(data.scope.excludedTaskIdsByPerson);
  }
  renderMetrics(els.metricGrid, data.summary, comparison);
  renderPeople();
  els.boardBreakdown.innerHTML = renderBarHtml(data.breakdowns.boards);
  renderProductivityImpact();
  renderCardSelection();
  renderStageFunnel();
  renderWorkload();
  renderIndividual();
  renderAlerts();
  renderAudit();

  if (data.source?.warnings?.length) {
    showNotice(data.source.warnings.join(' | '));
  } else {
    showNotice('');
  }
}

function shouldShowGlobalOverview(tabName) {
  return ['overview', 'workload', 'individual'].includes(tabName);
}

function setActiveTab(tabName) {
  state.activeTab = tabName;
  document.querySelectorAll('.nav-tab').forEach((tab) => tab.classList.remove('active'));
  document.querySelectorAll('.view').forEach((view) => view.classList.remove('active'));
  const button = document.querySelectorAll('.nav-tab');
  button.forEach((tab) => {
    if (tab.dataset.tab === tabName) tab.classList.add('active');
  });
  const view = document.getElementById(`${tabName}View`);
  if (view) view.classList.add('active');
  els.globalOverview.hidden = !shouldShowGlobalOverview(tabName);
}

function updateRefreshCountdown(message) {
  if (!els.refreshCountdown) return;
  if (message) {
    els.refreshCountdown.textContent = message;
    return;
  }
  if (!state.nextRefreshAt) {
    els.refreshCountdown.textContent = 'Proxima atualizacao em --';
    return;
  }
  const seconds = Math.max(0, Math.ceil((state.nextRefreshAt - Date.now()) / 1000));
  els.refreshCountdown.textContent = `Proxima atualizacao em ${seconds}s`;
}

function scheduleNextRefresh() {
  state.nextRefreshAt = Date.now() + REFRESH_INTERVAL_MS;
  updateRefreshCountdown();
}

function startAutoRefresh() {
  if (!state.nextRefreshAt) scheduleNextRefresh();
  if (state.refreshTimer) return;
  state.refreshTimer = window.setInterval(() => {
    if (!state.nextRefreshAt) scheduleNextRefresh();
    if (Date.now() >= state.nextRefreshAt) {
      state.nextRefreshAt = Date.now() + REFRESH_INTERVAL_MS;
      updateRefreshCountdown('Atualizando agora...');
      loadData(state.currentRequest, { background: true });
      return;
    }
    updateRefreshCountdown();
  }, 1000);
}

function persistBoardScope() {
  try {
    window.localStorage?.setItem(STORAGE_KEYS.boardScope, state.boardScope);
  } catch (error) {
    // Local storage can be unavailable in private or embedded contexts.
  }
}

function persistSettings() {
  try {
    window.localStorage?.setItem(STORAGE_KEYS.productivitySettings, JSON.stringify(state.settings));
  } catch (error) {
    // Local storage can be unavailable in private or embedded contexts.
  }
}

function setCardIncluded(personName, cardId, included) {
  const person = String(personName || '').trim();
  const id = String(cardId || '').trim();
  if (!person || !id) return;

  const exclusions = sanitizeExcludedTaskIdsByPerson(state.settings.excludedTaskIdsByPerson);
  const ids = new Set(exclusions[person] || []);
  if (included) {
    ids.delete(id);
  } else {
    ids.add(id);
  }

  if (ids.size) {
    exclusions[person] = [...ids].sort((a, b) => a.localeCompare(b, 'pt-BR', { numeric: true }));
  } else {
    delete exclusions[person];
  }

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
  document.querySelectorAll('[data-settings-tab]').forEach((button) => {
    button.classList.toggle('active', button.dataset.settingsTab === tabName);
  });
  document.querySelectorAll('[data-settings-panel]').forEach((panel) => {
    const active = panel.dataset.settingsPanel === tabName;
    panel.classList.toggle('active', active);
    panel.classList.toggle('hidden', !active);
  });
}

function syncSettingsControls(value = state.settings.expectedThroughput) {
  const sanitized = sanitizeExpectedThroughput(value);
  if (els.settingsTargetNote) {
    els.settingsTargetNote.textContent = 'Informe a meta de entregas esperada para o periodo selecionado. Ela alimenta o indice de vazao do SEFK.';
  }
  if (els.expectedThroughputInput) els.expectedThroughputInput.value = String(sanitized);
  if (els.expectedThroughputPreview) {
    els.expectedThroughputPreview.textContent = `${formatNumber(sanitized)} entregas como meta do periodo selecionado`;
  }
}

function openSettingsModal() {
  syncSettingsControls();
  renderCardSelection();
  setSettingsTab(state.settingsTab || 'weights');
  els.settingsModal.classList.remove('hidden');
}

function closeSettingsModal() {
  els.settingsModal.classList.add('hidden');
}

async function loadData(params = state.currentRequest, options = {}) {
  if (state.loading) return;
  state.loading = true;
  if (!options.background) {
    setStatus('Carregando');
    showNotice('');
    updateRefreshCountdown('Atualizando agora...');
  }

  const query = new URLSearchParams();
  query.set('_', String(Date.now()));
  query.set('boardScope', state.boardScope);
  query.set('expectedThroughput', String(state.settings.expectedThroughput));
  query.set('excludedTaskIdsByPerson', JSON.stringify(state.settings.excludedTaskIdsByPerson || {}));
  if (params.start && params.end) {
    query.set('start', params.start);
    query.set('end', params.end);
  } else {
    query.set('preset', params.preset || state.preset);
  }

  try {
    const response = await fetch(`/api/analytics?${query.toString()}`);
    const payload = await response.json();
    if (!response.ok || !payload.ok) {
      throw new Error(payload.error || 'Falha ao carregar dados.');
    }
    state.currentRequest = params.start && params.end
      ? { start: params.start, end: params.end }
      : { preset: params.preset || state.preset };
    state.data = payload;
    setStatus('Conectado', 'ready');
    renderAll();
    scheduleNextRefresh();
    startAutoRefresh();
  } catch (error) {
    setStatus('Acao necessaria', 'error');
    if (!options.background) showNotice(error.message, 'error');
    scheduleNextRefresh();
  } finally {
    state.loading = false;
  }
}

document.querySelectorAll('.nav-tab').forEach((button) => {
  button.addEventListener('click', () => {
    setActiveTab(button.dataset.tab);
  });
});

document.querySelectorAll('.preset').forEach((button) => {
  button.addEventListener('click', () => {
    state.preset = button.dataset.preset;
    document.querySelectorAll('.preset').forEach((preset) => preset.classList.remove('active'));
    button.classList.add('active');
    loadData({ preset: state.preset });
  });
});

els.boardScope.value = state.boardScope;
els.boardScope.addEventListener('change', () => {
  state.boardScope = els.boardScope.value;
  persistBoardScope();
  loadData(state.currentRequest);
});

els.settingsButton.addEventListener('click', openSettingsModal);
els.closeSettings.addEventListener('click', closeSettingsModal);
els.settingsModal.addEventListener('click', (event) => {
  if (event.target === els.settingsModal) closeSettingsModal();
});

document.querySelectorAll('[data-settings-tab]').forEach((button) => {
  button.addEventListener('click', () => setSettingsTab(button.dataset.settingsTab));
});

els.cardSelectionList.addEventListener('change', (event) => {
  const checkbox = event.target.closest?.('.card-selection-toggle');
  if (!checkbox) return;
  setCardIncluded(checkbox.dataset.person, checkbox.dataset.cardId, checkbox.checked);
});

els.includeAllCards.addEventListener('click', includeAllCards);

els.expectedThroughputInput.addEventListener('input', () => {
  syncSettingsControls(els.expectedThroughputInput.value);
});

els.resetSettings.addEventListener('click', () => {
  syncSettingsControls(DEFAULT_EXPECTED_THROUGHPUT);
});

els.saveSettings.addEventListener('click', () => {
  state.settings.expectedThroughput = sanitizeExpectedThroughput(els.expectedThroughputInput.value);
  persistSettings();
  closeSettingsModal();
  loadData(state.currentRequest);
});

document.getElementById('applyCustom').addEventListener('click', () => {
  if (!els.startDate.value || !els.endDate.value) {
    showNotice('Escolha inicio e fim para aplicar o periodo personalizado.', 'error');
    return;
  }
  document.querySelectorAll('.preset').forEach((preset) => preset.classList.remove('active'));
  loadData({ start: els.startDate.value, end: els.endDate.value });
});

document.getElementById('refreshButton').addEventListener('click', () => loadData(state.currentRequest));

els.personSelect.addEventListener('change', () => {
  state.selectedPerson = els.personSelect.value;
  renderIndividual();
});

setActiveTab(state.activeTab);
loadData();
