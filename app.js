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

function formatNumber(value) {
  return new Intl.NumberFormat('pt-BR').format(Number(value || 0));
}

function formatPercent(value) {
  return `${Math.round(Number(value || 0))}%`;
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
  if (hours < 24) return `${Math.round(hours * 10) / 10}h`;
  const days = hours / 24;
  return `${Math.round(days * 10) / 10}d`;
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

function metric(label, value, detail = '', kind = '') {
  return `
    <article class="metric-card ${kind}">
      <span>${label}</span>
      <strong>${value}</strong>
      <small>${detail}</small>
    </article>
  `;
}

function ratio(part, total) {
  if (!total) return 0;
  return Math.round((part / total) * 100);
}

function renderMetrics(container, summary) {
  container.innerHTML = [
    metric('Produtividade', formatPercent(summary.productivityScore), 'indice composto', summary.productivityScore >= 70 ? 'positive' : 'warning'),
    metric('Abertas', formatNumber(summary.opened), 'criadas no periodo'),
    metric('Entregues', formatNumber(summary.delivered), `${formatPercent(ratio(summary.onTime, summary.delivered))} no prazo`, 'positive'),
    metric('Atrasadas', formatNumber(summary.late), `${formatNumber(summary.overdueOpen)} abertas vencidas`, summary.late || summary.overdueOpen ? 'negative' : 'positive'),
    metric('Ativas', formatNumber(summary.active), 'tocaram o periodo'),
    metric('Adiantadas', formatNumber(summary.early), 'fechadas antes do prazo', 'positive'),
    metric('Tempo medio', formatSeconds(summary.averageExecutionSeconds), 'inicio ate fechamento'),
    metric('Tempo apontado', formatSeconds(summary.workedSeconds), `estimado ${formatSeconds(summary.estimatedSeconds)}`),
  ].join('');
}

function renderBars(container, rows, valueKey = 'value') {
  if (!rows || !rows.length) {
    container.innerHTML = '<p class="empty">Sem dados suficientes neste periodo.</p>';
    return;
  }
  const max = Math.max(...rows.map((row) => Number(row[valueKey] || 0)), 1);
  container.innerHTML = rows.map((row) => {
    const value = Number(row[valueKey] || 0);
    return `
      <div class="bar-row">
        <div class="bar-head">
          <strong>${row.name}</strong>
          <span>${formatNumber(value)}</span>
        </div>
        <div class="bar-track"><div class="bar-fill" style="width:${Math.max(4, (value / max) * 100)}%"></div></div>
      </div>
    `;
  }).join('');
}

function renderPeople() {
  const people = state.data.people || [];
  els.peopleSummary.innerHTML = people.map((person) => `
    <div class="person-row">
      <div class="person-head">
        <strong>${person.name}</strong>
        <span class="score">${formatPercent(person.summary.productivityScore)}</span>
      </div>
      <div class="mini-stats">
        <span>${formatNumber(person.summary.delivered)} entregues</span>
        <span>${formatNumber(person.summary.onTime)} no prazo</span>
        <span>${formatNumber(person.summary.late)} atrasadas</span>
        <span>${formatNumber(person.summary.open)} abertas</span>
      </div>
    </div>
  `).join('');
}

function renderComparisons() {
  const comparison = state.data.comparisons?.[0];
  if (!comparison) {
    els.comparisonGrid.innerHTML = '';
    return;
  }
  const items = [
    ['Abertas', comparison.metrics.opened],
    ['Entregues', comparison.metrics.delivered],
    ['No prazo', comparison.metrics.onTime],
    ['Atrasadas', comparison.metrics.late],
    ['Abertas vencidas', comparison.metrics.overdueOpen],
    ['Tempo medio', comparison.metrics.averageExecutionSeconds, true],
    ['Produtividade', comparison.metrics.productivityScore, false, true],
  ];
  els.comparisonGrid.innerHTML = items.map(([label, item, seconds, percent]) => {
    const value = seconds ? formatSeconds(item.value) : percent ? formatPercent(item.value) : formatNumber(item.value);
    const previous = seconds ? formatSeconds(item.previous) : percent ? formatPercent(item.previous) : formatNumber(item.previous);
    const change = item.change > 0 ? `+${formatNumber(item.change)}` : formatNumber(item.change);
    return metric(label, value, `anterior ${previous} | variacao ${change}`);
  }).join('');
}

function renderWorkload() {
  const rows = (state.data.people || []).map((person) => ({
    name: person.name,
    value: person.summary.open + person.summary.overdueOpen,
    summary: person.summary,
  }));
  const max = Math.max(...rows.map((row) => row.value), 1);
  els.workloadRows.innerHTML = rows.map((row) => `
    <div class="person-row">
      <div class="person-head">
        <strong>${row.name}</strong>
        <span>${formatNumber(row.summary.open)} abertas</span>
      </div>
      <div class="bar-track"><div class="bar-fill" style="width:${Math.max(4, (row.value / max) * 100)}%"></div></div>
      <div class="mini-stats">
        <span>${formatNumber(row.summary.overdueOpen)} vencidas</span>
        <span>${formatSeconds(row.summary.workedSeconds)} apontadas</span>
        <span>${formatSeconds(row.summary.averageExecutionSeconds)} media</span>
      </div>
    </div>
  `).join('');
}

function renderIndividual() {
  const people = state.data.people || [];
  els.personSelect.innerHTML = people.map((person) => `<option value="${person.name}">${person.name}</option>`).join('');
  if (!people.some((person) => person.name === state.selectedPerson) && people[0]) {
    state.selectedPerson = people[0].name;
  }
  els.personSelect.value = state.selectedPerson;

  const person = people.find((item) => item.name === state.selectedPerson);
  if (!person) return;
  els.individualTitle.textContent = person.name;
  renderMetrics(els.individualMetrics, person.summary);

  const distribution = [
    '<h3>Por quadro</h3>',
    renderBarHtml(person.breakdowns.boards),
    '<h3>Por status</h3>',
    renderBarHtml(person.breakdowns.stages),
    '<h3>Por tipo</h3>',
    renderBarHtml(person.breakdowns.types),
  ].join('');
  els.individualBreakdowns.innerHTML = distribution;

  const tasks = (state.data.audit || [])
    .filter((task) => task.collaborator === person.name || task.assignee === person.name)
    .slice(0, 8);
  els.individualTasks.innerHTML = tasks.length
    ? tasks.map((task) => `
      <div class="task-row">
        <strong>${task.title}</strong>
        <div class="mini-stats">
          <span>${task.stage}</span>
          <span>Prazo ${formatDate(task.dueDate)}</span>
          <span>${formatSeconds(task.workedSeconds)}</span>
        </div>
      </div>
    `).join('')
    : '<p class="empty">Sem tarefas encontradas para este periodo.</p>';
}

function renderBarHtml(rows) {
  if (!rows || !rows.length) return '<p class="empty">Sem dados.</p>';
  const max = Math.max(...rows.map((row) => row.value), 1);
  return rows.map((row) => `
    <div class="bar-row">
      <div class="bar-head"><span>${row.name}</span><strong>${formatNumber(row.value)}</strong></div>
      <div class="bar-track"><div class="bar-fill" style="width:${Math.max(4, (row.value / max) * 100)}%"></div></div>
    </div>
  `).join('');
}

function renderAlerts() {
  const alerts = state.data.alerts || [];
  els.alertsList.innerHTML = alerts.length
    ? alerts.map((alert) => `
      <article class="alert-row ${alert.severity}">
        <div class="alert-head">
          <strong>${alert.title}</strong>
          <span class="muted">${alert.severity === 'high' ? 'Alta' : 'Media'}</span>
        </div>
        <p class="muted">${alert.detail}</p>
      </article>
    `).join('')
    : '<div class="panel"><p class="empty">Nenhum alerta critico para este periodo.</p></div>';
}

function renderAudit() {
  const rows = state.data.audit || [];
  els.auditTable.innerHTML = rows.length
    ? rows.map((row) => `
      <tr>
        <td><strong>${row.title}</strong><br><span class="muted">${row.project} | ${row.client}</span></td>
        <td>${row.assignee}</td>
        <td>${row.board}</td>
        <td>${row.stage}</td>
        <td>${formatDate(row.dueDate)}</td>
        <td>${formatSeconds(row.workedSeconds)}<br><span class="muted">est. ${formatSeconds(row.estimateSeconds)}</span></td>
      </tr>
    `).join('')
    : '<tr><td colspan="6" class="empty">Sem tarefas para auditar neste periodo.</td></tr>';
}

function renderAll() {
  const data = state.data;
  els.periodTitle.textContent = `${data.range?.label || 'Periodo'} | ${formatDate(data.period.start)} a ${formatDate(data.period.end)}`;
  renderMetrics(els.metricGrid, data.summary);
  renderPeople();
  renderBars(els.boardBreakdown, data.breakdowns.boards);
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
