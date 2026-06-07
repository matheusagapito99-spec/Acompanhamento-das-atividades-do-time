const DAY_MS = 24 * 60 * 60 * 1000;

function toDate(value) {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function toDateKey(value) {
  const date = toDate(value);
  if (!date) return null;
  return date.toISOString().slice(0, 10);
}

function startOfDay(value) {
  const date = toDate(value);
  if (!date) return null;
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
}

function endOfDay(value) {
  const start = startOfDay(value);
  if (!start) return null;
  return new Date(start.getTime() + DAY_MS - 1);
}

function normalizeName(name) {
  return String(name || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()
    .toLowerCase();
}

function getAssigneeName(task) {
  if (task.user_name) return task.user_name;
  if (task.assignee_name) return task.assignee_name;
  if (Array.isArray(task.assignments) && task.assignments[0]?.assignee_name) {
    return task.assignments[0].assignee_name;
  }
  return 'Sem responsavel';
}

function isClosed(task) {
  return Boolean(task.is_closed || task.close_date || task.state === 'done' || task.state === 'closed');
}

function includesName(list, name) {
  const normalized = normalizeName(name);
  return list.map(normalizeName).includes(normalized);
}

function includesBoard(list, name) {
  return list.map(normalizeName).includes(normalizeName(name));
}

function inRange(dateValue, start, end) {
  const date = toDate(dateValue);
  if (!date) return false;
  return date >= start && date <= end;
}

function wasActiveInRange(task, start, end) {
  const created = toDate(task.created_at);
  const closed = toDate(task.close_date);
  if (!created) return false;
  return created <= end && (!closed || closed >= start);
}

function executionSeconds(task) {
  const started = toDate(task.start_date || task.created_at);
  const closed = toDate(task.close_date);
  if (started && closed && closed >= started) {
    return Math.round((closed.getTime() - started.getTime()) / 1000);
  }
  return Number(task.time_worked || 0);
}

function buildTaskFlags(task, start, end, referenceDate) {
  const closed = isClosed(task);
  const desiredDate = toDate(task.desired_date_with_time || task.desired_date || task.estimated_delivery_date);
  const closeDate = toDate(task.close_date);
  const opened = inRange(task.created_at, start, end);
  const delivered = closed && inRange(closeDate, start, end);
  const active = wasActiveInRange(task, start, end);
  const open = !closed;
  const overdueOpen = open && desiredDate && desiredDate < referenceDate;
  const early = delivered && desiredDate && closeDate < desiredDate;
  const late = delivered && desiredDate && closeDate > desiredDate;
  const onTime = delivered && (!desiredDate || closeDate <= desiredDate);
  const atRisk = open && desiredDate && desiredDate.getTime() - referenceDate.getTime() <= 2 * DAY_MS;

  return {
    opened,
    delivered,
    active,
    open,
    overdueOpen: Boolean(overdueOpen),
    early: Boolean(early),
    late: Boolean(late),
    onTime: Boolean(onTime),
    atRisk: Boolean(atRisk),
  };
}

function emptySummary() {
  return {
    opened: 0,
    delivered: 0,
    active: 0,
    onTime: 0,
    early: 0,
    late: 0,
    open: 0,
    overdueOpen: 0,
    atRisk: 0,
    workedSeconds: 0,
    estimatedSeconds: 0,
    averageExecutionSeconds: 0,
    medianExecutionSeconds: 0,
    productivityScore: 0,
  };
}

function summarizeTasks(tasks, start, end, referenceDate) {
  const summary = emptySummary();
  const executionValues = [];

  for (const task of tasks) {
    const flags = buildTaskFlags(task, start, end, referenceDate);
    if (flags.opened) summary.opened += 1;
    if (flags.delivered) summary.delivered += 1;
    if (flags.active) summary.active += 1;
    if (flags.onTime) summary.onTime += 1;
    if (flags.early) summary.early += 1;
    if (flags.late) summary.late += 1;
    if (flags.open) summary.open += 1;
    if (flags.overdueOpen) summary.overdueOpen += 1;
    if (flags.atRisk) summary.atRisk += 1;

    if (flags.active || flags.delivered || flags.opened) {
      summary.workedSeconds += Number(task.time_worked || 0);
      summary.estimatedSeconds += Number(task.current_estimate_seconds || task.estimated_seconds || 0);
    }

    if (flags.delivered) {
      executionValues.push(executionSeconds(task));
    }
  }

  if (executionValues.length) {
    const sorted = [...executionValues].sort((a, b) => a - b);
    const total = sorted.reduce((sum, value) => sum + value, 0);
    summary.averageExecutionSeconds = Math.round(total / sorted.length);
    const mid = Math.floor(sorted.length / 2);
    summary.medianExecutionSeconds = sorted.length % 2
      ? sorted[mid]
      : Math.round((sorted[mid - 1] + sorted[mid]) / 2);
  }

  return summary;
}

function scorePerson(summary, context = {}) {
  const delivered = Number(summary.delivered || 0);
  const onTimeRate = delivered ? Number(summary.onTime || 0) / delivered : 0;
  const teamAverageDelivered = Math.max(Number(context.teamAverageDelivered || 0), 1);
  const throughput = Math.min(delivered / teamAverageDelivered, 1);
  const estimated = Number(summary.estimatedSeconds || 0);
  const worked = Number(summary.workedSeconds || 0);
  const efficiency = estimated > 0 && worked > 0 ? Math.min(estimated / worked, 1.2) / 1.2 : 0.6;
  const open = Number(summary.open || 0);
  const overdueOpen = Number(summary.overdueOpen || 0);
  const backlogHealth = open ? Math.max(0, 1 - overdueOpen / open) : 1;

  return Math.round(
    Math.max(0, Math.min(100,
      onTimeRate * 40
      + throughput * 25
      + efficiency * 20
      + backlogHealth * 15,
    )),
  );
}

function groupCount(tasks, field, start, end, referenceDate) {
  const result = new Map();
  for (const task of tasks) {
    const flags = buildTaskFlags(task, start, end, referenceDate);
    if (!flags.active && !flags.delivered && !flags.opened) continue;
    const key = task[field] || 'Sem informacao';
    result.set(key, (result.get(key) || 0) + 1);
  }
  return [...result.entries()]
    .map(([name, value]) => ({ name, value }))
    .sort((a, b) => b.value - a.value || a.name.localeCompare(b.name));
}

function buildAudit(tasks, start, end, referenceDate) {
  return tasks
    .map((task) => {
      const flags = buildTaskFlags(task, start, end, referenceDate);
      return {
        id: task.id,
        title: task.title || `Tarefa ${task.id}`,
        assignee: getAssigneeName(task),
        board: task.board_name || 'Sem quadro',
        stage: task.board_stage_name || task.state || 'Sem status',
        project: task.project_name || 'Sem projeto',
        client: task.client_name || 'Sem cliente',
        type: task.type_name || 'Sem tipo',
        createdAt: task.created_at || null,
        startDate: task.start_date || null,
        closeDate: task.close_date || null,
        dueDate: task.desired_date_with_time || task.desired_date || task.estimated_delivery_date || null,
        estimateSeconds: Number(task.current_estimate_seconds || task.estimated_seconds || 0),
        workedSeconds: Number(task.time_worked || 0),
        flags,
      };
    })
    .filter((row) => row.flags.active || row.flags.delivered || row.flags.opened)
    .sort((a, b) => String(b.createdAt || '').localeCompare(String(a.createdAt || '')));
}

function previousRange(start, end) {
  const length = end.getTime() - start.getTime() + 1;
  const previousEnd = new Date(start.getTime() - 1);
  const previousStart = new Date(previousEnd.getTime() - length + 1);
  return { start: previousStart, end: previousEnd };
}

function delta(current, previous) {
  return {
    value: current,
    previous,
    change: current - previous,
    changePercent: previous ? Math.round(((current - previous) / previous) * 100) : null,
  };
}

function buildComparison(tasks, start, end, referenceDate, label = 'Periodo anterior') {
  const current = summarizeTasks(tasks, start, end, referenceDate);
  const prev = previousRange(start, end);
  const previous = summarizeTasks(tasks, prev.start, prev.end, prev.end);
  return {
    label,
    currentRange: { start: toDateKey(start), end: toDateKey(end) },
    previousRange: { start: toDateKey(prev.start), end: toDateKey(prev.end) },
    metrics: {
      opened: delta(current.opened, previous.opened),
      delivered: delta(current.delivered, previous.delivered),
      onTime: delta(current.onTime, previous.onTime),
      late: delta(current.late, previous.late),
      overdueOpen: delta(current.overdueOpen, previous.overdueOpen),
      averageExecutionSeconds: delta(current.averageExecutionSeconds, previous.averageExecutionSeconds),
      productivityScore: delta(current.productivityScore, previous.productivityScore),
    },
  };
}

function buildAlerts(audit, people) {
  const alerts = [];
  for (const row of audit) {
    if (row.flags.overdueOpen) {
      alerts.push({
        severity: 'high',
        title: 'Tarefa vencida em aberto',
        detail: `${row.title} - ${row.assignee}`,
      });
    } else if (row.flags.atRisk) {
      alerts.push({
        severity: 'medium',
        title: 'Tarefa perto do prazo',
        detail: `${row.title} - ${row.assignee}`,
      });
    }
    if (row.estimateSeconds && row.workedSeconds > row.estimateSeconds) {
      alerts.push({
        severity: 'medium',
        title: 'Tempo acima da estimativa',
        detail: `${row.title} consumiu mais tempo que o previsto`,
      });
    }
  }
  for (const person of people) {
    if (person.summary.open > 0 && person.summary.overdueOpen / person.summary.open >= 0.5) {
      alerts.push({
        severity: 'high',
        title: 'Backlog individual em risco',
        detail: `${person.name} tem metade ou mais das tarefas abertas em atraso`,
      });
    }
  }
  return alerts.slice(0, 20);
}

function buildAnalytics(tasks, options) {
  const collaborators = options.collaborators || [];
  const boards = options.boards || [];
  const start = startOfDay(options.start);
  const end = endOfDay(options.end);
  const referenceDate = toDate(options.referenceDate) || end || new Date();
  if (!start || !end) throw new Error('Periodo invalido.');

  const scopedTasks = tasks.filter((task) => (
    includesName(collaborators, getAssigneeName(task))
    && includesBoard(boards, task.board_name)
  ));

  const summary = summarizeTasks(scopedTasks, start, end, referenceDate);
  const teamAverageDelivered = collaborators.length ? summary.delivered / collaborators.length : 0;
  const people = collaborators.map((name) => {
    const personTasks = scopedTasks.filter((task) => normalizeName(getAssigneeName(task)) === normalizeName(name));
    const personSummary = summarizeTasks(personTasks, start, end, referenceDate);
    personSummary.productivityScore = scorePerson(personSummary, { teamAverageDelivered });
    return {
      name,
      summary: personSummary,
      breakdowns: {
        boards: groupCount(personTasks, 'board_name', start, end, referenceDate),
        stages: groupCount(personTasks, 'board_stage_name', start, end, referenceDate),
        projects: groupCount(personTasks, 'project_name', start, end, referenceDate),
        types: groupCount(personTasks, 'type_name', start, end, referenceDate),
      },
    };
  });

  summary.productivityScore = people.length
    ? Math.round(people.reduce((sum, person) => sum + person.summary.productivityScore, 0) / people.length)
    : scorePerson(summary, { teamAverageDelivered: Math.max(summary.delivered, 1) });

  const audit = buildAudit(scopedTasks, start, end, referenceDate);
  return {
    generatedAt: new Date().toISOString(),
    period: { start: toDateKey(start), end: toDateKey(end), referenceDate: referenceDate.toISOString() },
    scope: { collaborators, boards },
    summary,
    people,
    comparisons: [
      buildComparison(scopedTasks, start, end, referenceDate, options.cycle || 'Periodo anterior'),
    ],
    breakdowns: {
      boards: groupCount(scopedTasks, 'board_name', start, end, referenceDate),
      stages: groupCount(scopedTasks, 'board_stage_name', start, end, referenceDate),
      projects: groupCount(scopedTasks, 'project_name', start, end, referenceDate),
      clients: groupCount(scopedTasks, 'client_name', start, end, referenceDate),
      types: groupCount(scopedTasks, 'type_name', start, end, referenceDate),
    },
    alerts: buildAlerts(audit, people),
    audit,
    rawTaskCount: tasks.length,
    scopedTaskCount: scopedTasks.length,
  };
}

function getPresetRange(preset, reference = new Date()) {
  const ref = startOfDay(reference);
  const weekday = ref.getUTCDay() || 7;
  const weekStart = new Date(ref.getTime() - (weekday - 1) * DAY_MS);
  const monthStart = new Date(Date.UTC(ref.getUTCFullYear(), ref.getUTCMonth(), 1));
  const fortnightStart = ref.getUTCDate() <= 15
    ? monthStart
    : new Date(Date.UTC(ref.getUTCFullYear(), ref.getUTCMonth(), 16));

  const ranges = {
    'this-week': { start: weekStart, end: ref, label: 'Esta semana' },
    'last-week': {
      start: new Date(weekStart.getTime() - 7 * DAY_MS),
      end: new Date(weekStart.getTime() - DAY_MS),
      label: 'Semana passada',
    },
    'this-fortnight': { start: fortnightStart, end: ref, label: 'Esta quinzena' },
    'last-fortnight': {
      start: new Date(fortnightStart.getTime() - 15 * DAY_MS),
      end: new Date(fortnightStart.getTime() - DAY_MS),
      label: 'Quinzena passada',
    },
    'this-month': { start: monthStart, end: ref, label: 'Este mes' },
    'last-month': {
      start: new Date(Date.UTC(ref.getUTCFullYear(), ref.getUTCMonth() - 1, 1)),
      end: new Date(Date.UTC(ref.getUTCFullYear(), ref.getUTCMonth(), 0)),
      label: 'Mes passado',
    },
  };

  const range = ranges[preset] || ranges['this-month'];
  return {
    start: toDateKey(range.start),
    end: toDateKey(range.end),
    label: range.label,
  };
}

module.exports = {
  buildAnalytics,
  buildTaskFlags,
  getPresetRange,
  normalizeName,
  scorePerson,
  summarizeTasks,
};
