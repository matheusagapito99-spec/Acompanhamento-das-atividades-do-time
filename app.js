const state = {
  data: null,
  preset: 'this-week',
  selectedPerson: 'Allana',
};

const els = {
  status: document.getElementById('connectionStatus'),
  notice: document.getElementById('notice'),
  periodTitle: document.getElementById('periodTitle'),
  metricGrid: document.getElementById('metricGrid'),
  peopleSummary: document.getElementById('peopleSummary'),
  boardBreakdown: document.getElementById('boardBreakdown'),
  stageFunnel: document.getElementById('stageFunnel'),
  comparisonGrid: document.getElementById('comparisonGrid'),
  workloadRows: document.getElementById('workloadRows'),
  personSelect: document.getElementById('personSelect'),
  individualTitle: document.getElementById('individualTitle'),
  individualMetrics: document.getElementById('individualMetrics'),
  individualBreakdowns: document.getElementById('individualBreakdowns'),
  individualTasks: document.getElementById('individualTasks'),
  alertsList: document.getElementById('alertsList'),
  auditTable: document.getElementById('auditTable'),
  startDate: document.getElementById('startDate'),
  endDate: document.getElementById('endDate'),
};

const METRICS = [
  {
    key: 'productivityScore',
    label: 'Produtividade',
    type: 'percent',
    polarity: 'higher',
    tone: (summary) => (summary.productivityScore >= 70 ? 'positive' : summary.productivityScore >= 50 ? 'warning' : 'negative'),
    detail: (summary) => `${formatNumber(summary.delivered)} entregas | ${formatNumber(summary.overdueOpen)} abertas vencidas`,
    help: 'Coeficiente transparente: entregas realizadas, entregas no prazo, atrasos, backlog vencido e eficiencia de horas.',
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

function formatDays(value) {
  const number = Number(value || 0);
  return number ? `${new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 1 }).format(number)}d` : '0d';
}

function formatDate(value) {
  if (!value) return 'Sem data';
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

  return `
    <article class="metric-card ${tone}">
      <div class="metric-top">
        <span>${escapeHtml(definition.label)}</span>
        <button class="metric-help" type="button" aria-label="Como calculamos ${escapeHtml(definition.label)}" data-help="${escapeHtml(definition.help)}">?</button>
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

function renderStageFunnel() {
  els.stageFunnel.innerHTML = renderStageFunnelHtml(state.data.stageFunnel);
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

function renderComparisons() {
  const comparison = state.data.comparisons?.[0];
  renderMetrics(els.comparisonGrid, state.data.summary, comparison);
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
  renderMetrics(els.metricGrid, data.summary, comparison);
  renderPeople();
  els.boardBreakdown.innerHTML = renderBarHtml(data.breakdowns.boards);
  renderStageFunnel();
  renderComparisons();
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

async function loadData(params = {}) {
  setStatus('Carregando');
  showNotice('');

  const query = new URLSearchParams();
  if (params.start && params.end) {
    query.set('start', params.start);
    query.set('end', params.end);
  } else {
    query.set('preset', state.preset);
  }

  try {
    const response = await fetch(`/api/analytics?${query.toString()}`);
    const payload = await response.json();
    if (!response.ok || !payload.ok) {
      throw new Error(payload.error || 'Falha ao carregar dados.');
    }
    state.data = payload;
    setStatus('Conectado', 'ready');
    renderAll();
  } catch (error) {
    setStatus('Acao necessaria', 'error');
    showNotice(error.message, 'error');
  }
}

document.querySelectorAll('.nav-tab').forEach((button) => {
  button.addEventListener('click', () => {
    document.querySelectorAll('.nav-tab').forEach((tab) => tab.classList.remove('active'));
    document.querySelectorAll('.view').forEach((view) => view.classList.remove('active'));
    button.classList.add('active');
    document.getElementById(`${button.dataset.tab}View`).classList.add('active');
  });
});

document.querySelectorAll('.preset').forEach((button) => {
  button.addEventListener('click', () => {
    state.preset = button.dataset.preset;
    document.querySelectorAll('.preset').forEach((preset) => preset.classList.remove('active'));
    button.classList.add('active');
    loadData();
  });
});

document.getElementById('applyCustom').addEventListener('click', () => {
  if (!els.startDate.value || !els.endDate.value) {
    showNotice('Escolha inicio e fim para aplicar o periodo personalizado.', 'error');
    return;
  }
  document.querySelectorAll('.preset').forEach((preset) => preset.classList.remove('active'));
  loadData({ start: els.startDate.value, end: els.endDate.value });
});

document.getElementById('refreshButton').addEventListener('click', () => loadData());

els.personSelect.addEventListener('change', () => {
  state.selectedPerson = els.personSelect.value;
  renderIndividual();
});

loadData();
