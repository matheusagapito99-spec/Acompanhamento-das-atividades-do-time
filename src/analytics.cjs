const DAY_SECONDS = 86400;
const DAY_MS = DAY_SECONDS * 1000;
const BRAZIL_TIME_ZONE = 'America/Sao_Paulo';
const CURRENT_DEADLINE_BASIS = 'current_deadline';
const DEFAULT_LATE_PENALTY_PER_DAY = 0.2;
const MAX_LATE_PENALTY_PER_DAY = 5;
const PRODUCTIVITY_IMPACT_LIMIT = 8;

const MARKETING_BOARD_ALIASES = ['Demandas MKT', 'Demandas de MKT', 'Demandas de Marketing'];
const CREATION_BOARD_ALIASES = ['Criacao', 'Criação'];
const BOARD_SCOPE_LABELS = {
  all: 'Todos',
  marketing: 'Demandas MKT',
  creation: 'Criacao',
};
const BRUNO_STAGE_ALIASES = [
  'Filas de demandas',
  'Fazendo Bruno',
  'Aprovacao de texto ou arte',
  'Aprovação de texto ou arte',
  'Entregue',
];
const MARKETING_COLLABORATORS = ['Allana', 'Bruna', 'Beatriz'];

const dateKeyFormatter = new Intl.DateTimeFormat('en-CA', {
  timeZone: BRAZIL_TIME_ZONE,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
});

function normalizeName(value) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}

function compactName(value) {
  return normalizeName(value).replace(/[^a-z0-9]/g, '');
}

function toDate(value) {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function toDateKey(value) {
  const date = toDate(value);
  if (!date) return '';
  const parts = dateKeyFormatter.formatToParts(date).reduce((acc, part) => {
    if (part.type !== 'literal') acc[part.type] = part.value;
    return acc;
  }, {});
  return `${parts.year}-${parts.month}-${parts.day}`;
}

function pad(value) {
  return String(value).padStart(2, '0');
}

function makeDateKey(year, month, day) {
  return `${year}-${pad(month)}-${pad(day)}`;
}

function parseDateKey(key) {
  const [year, month, day] = String(key || '').split('-').map(Number);
  return { year, month, day };
}

function dateFromKey(key, endOfDay = false) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(key || ''))) return null;
  return new Date(`${key}T${endOfDay ? '23:59:59.999' : '00:00:00.000'}-03:00`);
}

function startOfDay(value) {
  if (/^\d{4}-\d{2}-\d{2}$/.test(String(value || ''))) return dateFromKey(value);
  const key = toDateKey(value);
  return key ? dateFromKey(key) : null;
}

function endOfDay(value) {
  if (/^\d{4}-\d{2}-\d{2}$/.test(String(value || ''))) return dateFromKey(value, true);
  const key = toDateKey(value);
  return key ? dateFromKey(key, true) : null;
}

function addDaysKey(key, amount) {
  const base = new Date(`${key}T12:00:00.000-03:00`);
  base.setUTCDate(base.getUTCDate() + amount);
  return toDateKey(base);
}

function daysBetween(startKey, endKey) {
  const start = new Date(`${startKey}T12:00:00.000-03:00`);
  const end = new Date(`${endKey}T12:00:00.000-03:00`);
  return Math.max(0, Math.round((end.getTime() - start.getTime()) / DAY_MS));
}

function daysInMonth(year, month) {
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

function getPresetRange(preset = 'this-month', referenceDate = new Date()) {
  const todayKey = toDateKey(referenceDate) || toDateKey(new Date());
  const { year, month, day } = parseDateKey(todayKey);
  const todayNoon = new Date(`${todayKey}T12:00:00.000-03:00`);
  const weekday = todayNoon.getUTCDay();
  const mondayOffset = weekday === 0 ? -6 : 1 - weekday;
  const weekStart = addDaysKey(todayKey, mondayOffset);

  if (preset === 'this-week') {
    return { start: weekStart, end: todayKey, label: 'Esta semana' };
  }

  if (preset === 'last-week') {
    return {
      start: addDaysKey(weekStart, -7),
      end: addDaysKey(weekStart, -1),
      label: 'Semana anterior',
    };
  }

  if (preset === 'this-fortnight') {
    return {
      start: makeDateKey(year, month, day <= 15 ? 1 : 16),
      end: todayKey,
      label: 'Esta quinzena',
    };
  }

  if (preset === 'last-fortnight') {
    if (day <= 15) {
      const previousMonth = month === 1 ? 12 : month - 1;
      const previousYear = month === 1 ? year - 1 : year;
      return {
        start: makeDateKey(previousYear, previousMonth, 16),
        end: makeDateKey(previousYear, previousMonth, daysInMonth(previousYear, previousMonth)),
        label: 'Quinzena anterior',
      };
    }
    return {
      start: makeDateKey(year, month, 1),
      end: makeDateKey(year, month, 15),
      label: 'Quinzena anterior',
    };
  }

  if (preset === 'last-month') {
    const previousMonth = month === 1 ? 12 : month - 1;
    const previousYear = month === 1 ? year - 1 : year;
    return {
      start: makeDateKey(previousYear, previousMonth, 1),
      end: makeDateKey(previousYear, previousMonth, daysInMonth(previousYear, previousMonth)),
      label: 'Mes anterior',
    };
  }

  return {
    start: makeDateKey(year, month, 1),
    end: todayKey,
    label: 'Este mes',
  };
}

function matchesConfiguredText(value, target) {
  const normalizedValue = normalizeName(value);
  const normalizedTarget = normalizeName(target);
  if (!normalizedValue || !normalizedTarget) return false;
  return normalizedValue === normalizedTarget
    || normalizedValue.includes(normalizedTarget)
    || normalizedTarget.includes(normalizedValue);
}

function matchesAny(value, aliases = []) {
  return aliases.some((alias) => matchesConfiguredText(value, alias));
}

function matchesConfiguredName(value, configuredName) {
  const valueCompact = compactName(value);
  const configuredCompact = compactName(configuredName);
  if (!valueCompact || !configuredCompact) return false;
  return valueCompact === configuredCompact
    || valueCompact.includes(configuredCompact)
    || configuredCompact.includes(valueCompact);
}

function getNestedName(value) {
  if (!value) return '';
  if (typeof value === 'string') return value;
  return value.name || value.full_name || value.title || '';
}

function getAssigneeName(task) {
  return task.assignee_name
    || task.responsible_name
    || getNestedName(task.assignee)
    || getNestedName(task.responsible)
    || task.user_name
    || getNestedName(task.user)
    || task.created_by_name
    || getNestedName(task.created_by)
    || '';
}

function findFirstConfiguredMatch(candidates = [], collaborators = []) {
  for (const candidate of candidates.filter(Boolean)) {
    for (const collaborator of collaborators) {
      if (matchesConfiguredName(candidate, collaborator)) return collaborator;
    }
  }
  return null;
}

function findConfiguredName(task, collaborators = []) {
  const directAssigneeCandidates = [
    task.assignee_name,
    task.responsible_name,
    getNestedName(task.assignee),
    getNestedName(task.responsible),
  ];
  const userCandidates = [
    task.user_name,
    getNestedName(task.user),
  ];
  const creatorCandidates = [
    task.created_by_name,
    getNestedName(task.created_by),
  ];

  for (const group of [directAssigneeCandidates, userCandidates, creatorCandidates]) {
    const match = findFirstConfiguredMatch(group, collaborators);
    if (match) return match;
  }
  return null;
}

function expandTaskAssignments(tasks = []) {
  const expanded = [];

  for (const task of tasks) {
    const assignments = Array.isArray(task.assignments) ? task.assignments : [];
    if (!assignments.length) {
      expanded.push({
        ...task,
        task_created_at: task.task_created_at || task.created_at,
      });
      continue;
    }

    for (const assignment of assignments) {
      expanded.push({
        ...task,
        assignment_id: assignment.id ?? assignment.assignment_id,
        assignment_created_at: assignment.created_at || assignment.assigned_at || null,
        task_created_at: task.task_created_at || task.created_at,
        assignee_name: assignment.assignee_name
          || assignment.user_name
          || getNestedName(assignment.assignee)
          || getNestedName(assignment.user)
          || task.assignee_name
          || task.responsible_name,
        responsible_name: assignment.responsible_name
          || assignment.assignee_name
          || assignment.user_name
          || task.responsible_name,
        start_date: assignment.start_date || task.start_date,
        close_date: assignment.close_date || task.close_date,
        is_closed: assignment.is_closed ?? task.is_closed,
        current_estimate_seconds: assignment.current_estimate_seconds
          ?? task.current_estimate_seconds,
        estimated_seconds: assignment.estimated_seconds ?? task.estimated_seconds,
        time_worked: assignment.time_worked ?? task.time_worked,
      });
    }
  }

  return expanded;
}

function isClosed(task) {
  return task.is_closed === true || Boolean(task.close_date || task.closed_at || task.completed_at);
}

function getCreatedDate(task) {
  return toDate(task.task_created_at || task.created_at || task.opened_at || task.start_date || task.close_date);
}

function getCloseDate(task) {
  return toDate(task.close_date || task.closed_at || task.completed_at);
}

function getDueDate(task) {
  return toDate(
    task.first_desired_date
    || task.original_desired_date
    || task.desired_date_with_time
    || task.desired_date
    || task.estimated_delivery_date
    || task.due_date,
  );
}

function getEstimateSeconds(task) {
  return Number(task.current_estimate_seconds ?? task.estimated_seconds ?? task.estimate_seconds ?? 0) || 0;
}

function getWorkedSeconds(task) {
  return Number(task.time_worked ?? task.worked_seconds ?? task.total_time_worked ?? 0) || 0;
}

function getBoardName(task) {
  return task.board_name || getNestedName(task.board) || task.kanban_name || '';
}

function getStageName(task) {
  return task.board_stage_name || task.stage_name || task.column_name || getNestedName(task.stage) || '';
}

function getTypeName(task) {
  return task.type_name || getNestedName(task.type) || task.task_type_name || 'Sem tipo';
}

function getTaskId(task) {
  return task.id ?? task.task_id ?? task.taskId ?? '';
}

function isMarketingBoard(boardName) {
  return matchesAny(boardName, MARKETING_BOARD_ALIASES);
}

function isCreationBoard(boardName) {
  return matchesAny(boardName, CREATION_BOARD_ALIASES);
}

function normalizeBoardScope(value) {
  const normalized = normalizeName(value || 'all');
  if (!normalized || normalized === 'all' || normalized === 'todos') return 'all';
  if (normalized.includes('mkt') || normalized.includes('marketing')) return 'marketing';
  if (normalized.includes('criacao') || normalized.includes('creation')) return 'creation';
  return 'all';
}

function taskMatchesBoardScope(task, boardScope) {
  const scope = normalizeBoardScope(boardScope);
  if (scope === 'all') return true;
  const boardName = getBoardName(task);
  if (scope === 'marketing') return isMarketingBoard(boardName);
  if (scope === 'creation') return isCreationBoard(boardName);
  return true;
}

function isScopedTask(task, options = {}) {
  const collaborators = options.collaborators || [];
  const collaborator = findConfiguredName(task, collaborators);
  if (!collaborator) return false;

  const boardName = getBoardName(task);
  const stageName = getStageName(task);
  const collaboratorKey = compactName(collaborator);
  const boardScope = normalizeBoardScope(options.boardScope);

  if (!taskMatchesBoardScope(task, boardScope)) return false;

  if (matchesConfiguredName(collaboratorKey, 'Bruno')) {
    return isCreationBoard(boardName) && matchesAny(stageName, BRUNO_STAGE_ALIASES);
  }

  if (MARKETING_COLLABORATORS.some((name) => matchesConfiguredName(collaborator, name))) {
    return isMarketingBoard(boardName);
  }

  const configuredBoards = options.boards || [];
  return configuredBoards.some((board) => matchesConfiguredText(boardName, board));
}

function inPeriod(date, start, end) {
  return Boolean(date && date >= start && date <= end);
}

function normalizePeriod(options = {}) {
  const range = options.start && options.end
    ? { start: options.start, end: options.end, label: options.label || 'Periodo personalizado' }
    : getPresetRange(options.cycle || 'this-month', options.referenceDate ? new Date(options.referenceDate) : new Date());
  const start = startOfDay(range.start);
  const end = endOfDay(range.end);
  if (!start || !end || start > end) {
    const error = new Error('Periodo invalido para calculo.');
    error.code = 'INVALID_ANALYTICS_PERIOD';
    throw error;
  }
  return {
    start,
    end,
    startKey: toDateKey(start),
    endKey: toDateKey(end),
    label: range.label,
  };
}

function buildTaskFlags(task, period) {
  const createdDate = getCreatedDate(task);
  const closeDate = getCloseDate(task);
  const dueDate = getDueDate(task);
  const closed = isClosed(task);
  const createdBeforeEnd = Boolean(createdDate && createdDate <= period.end);
  const closedBeforeStart = Boolean(closeDate && closeDate < period.start);
  const touchedPeriod = createdBeforeEnd && !closedBeforeStart;
  const openAtPeriodEnd = createdBeforeEnd && (!closeDate || closeDate > period.end);
  const delivered = Boolean(closed && closeDate && inPeriod(closeDate, period.start, period.end));
  const openedCreatedInPeriod = inPeriod(createdDate, period.start, period.end);
  const openedCarryover = Boolean(createdDate && createdDate < period.start && touchedPeriod);
  const deliveredCreatedInPeriod = Boolean(delivered && openedCreatedInPeriod);
  const deliveredFromCarryover = Boolean(delivered && createdDate && createdDate < period.start);
  const hasDeadline = Boolean(dueDate);
  const onTime = Boolean(delivered && hasDeadline && closeDate <= dueDate);
  const early = Boolean(delivered && hasDeadline && closeDate < dueDate);
  const late = Boolean(delivered && hasDeadline && closeDate > dueDate);
  const noDeadlineDelivered = Boolean(delivered && !hasDeadline);
  const noDeadlineOpen = Boolean(openAtPeriodEnd && !hasDeadline);
  const overdueOpen = Boolean(openAtPeriodEnd && hasDeadline && dueDate < period.end);
  const atRisk = Boolean(
    openAtPeriodEnd
    && hasDeadline
    && dueDate >= period.end
    && dueDate.getTime() - period.end.getTime() <= 2 * DAY_MS,
  );

  return {
    active: touchedPeriod,
    openedCreatedInPeriod,
    openedCarryover,
    opened: openedCreatedInPeriod || openedCarryover,
    delivered,
    deliveredCreatedInPeriod,
    deliveredFromCarryover,
    hasDeadline,
    onTime,
    early,
    late,
    noDeadlineDelivered,
    noDeadlineOpen,
    open: openAtPeriodEnd,
    overdueOpen,
    atRisk,
    closed,
    createdDate,
    closeDate,
    dueDate,
    dueDateBasis: hasDeadline ? CURRENT_DEADLINE_BASIS : null,
  };
}

function roundPercent(value) {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(100, Math.round(value)));
}

function roundDecimal(value, digits = 1) {
  if (!Number.isFinite(value)) return 0;
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}

function clampNumber(value, min, max) {
  if (!Number.isFinite(value)) return min;
  return Math.max(min, Math.min(max, value));
}

function normalizeProductivitySettings(options = {}) {
  const rawValue = options.latePenaltyPerDay
    ?? options.lateDailyPenalty
    ?? DEFAULT_LATE_PENALTY_PER_DAY;
  const latePenaltyPerDay = clampNumber(Number(rawValue), 0, MAX_LATE_PENALTY_PER_DAY);

  return {
    latePenaltyPerDay: roundDecimal(latePenaltyPerDay, 2),
  };
}

function normalizeIdList(value) {
  const values = Array.isArray(value) ? value : String(value || '').split(',');
  return [...new Set(values
    .map((item) => String(item ?? '').trim())
    .filter(Boolean))]
    .sort((a, b) => a.localeCompare(b, 'pt-BR', { numeric: true }));
}

function normalizeExcludedTaskIdsByPerson(options = {}, collaborators = []) {
  let raw = options.excludedTaskIdsByPerson
    ?? options.excludedCardsByPerson
    ?? {};

  if (typeof raw === 'string') {
    try {
      raw = raw ? JSON.parse(raw) : {};
    } catch (error) {
      raw = {};
    }
  }

  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return {};

  return Object.entries(raw).reduce((acc, [personName, ids]) => {
    const collaborator = collaborators.find((name) => matchesConfiguredName(personName, name)) || personName;
    const normalizedIds = normalizeIdList(ids);
    if (normalizedIds.length) acc[collaborator] = normalizedIds;
    return acc;
  }, {});
}

function getExcludedIdsForPerson(personName, excludedTaskIdsByPerson = {}) {
  const match = Object.entries(excludedTaskIdsByPerson).find(([configuredName]) => {
    return matchesConfiguredName(personName, configuredName);
  });
  return new Set(match ? match[1] : []);
}

function isTaskExcludedFromProductivity(task, collaborators = [], excludedTaskIdsByPerson = {}) {
  const personName = findConfiguredName(task, collaborators) || getAssigneeName(task);
  const taskId = String(getTaskId(task) ?? '').trim();
  if (!personName || !taskId) return false;
  return getExcludedIdsForPerson(personName, excludedTaskIdsByPerson).has(taskId);
}

function buildLateImpactFromFlags(flags, period, settingsInput = {}) {
  const settings = normalizeProductivitySettings(settingsInput);
  const comparisonDate = flags.late
    ? flags.closeDate
    : (flags.overdueOpen ? period.end : null);
  if (!flags.dueDate || !comparisonDate) {
    return {
      lateSeconds: 0,
      lateDays: 0,
      lostPoints: 0,
      reason: '',
    };
  }

  const lateSeconds = Math.max(0, Math.round((comparisonDate.getTime() - flags.dueDate.getTime()) / 1000));
  const lateDays = lateSeconds / DAY_SECONDS;
  const lostPoints = lateDays * settings.latePenaltyPerDay;

  return {
    lateSeconds,
    lateDays: roundDecimal(lateDays, 2),
    lostPoints: roundDecimal(lostPoints, 2),
    reason: flags.overdueOpen ? 'Aberta vencida' : 'Entrega atrasada',
  };
}

function ratioScore(value) {
  return clampNumber(Number(value || 0), 0, 1);
}

function hourEfficiencyScore(summary) {
  const workedSeconds = Number(summary.workedSeconds || 0);
  const estimatedSeconds = Number(summary.estimatedSeconds || 0);
  if (workedSeconds > 0 && estimatedSeconds > 0) {
    return ratioScore(estimatedSeconds / workedSeconds);
  }
  if (summary.delivered || summary.active) return 0.5;
  return 0;
}

function averageLateDays(summary) {
  const lateIssueCount = Number(summary.late || 0) + Number(summary.overdueOpen || 0);
  if (!lateIssueCount) return 0;
  const dailyWeight = Number(summary.productivitySettings?.latePenaltyPerDay || DEFAULT_LATE_PENALTY_PER_DAY);
  if (!dailyWeight) return 0;
  return Number(summary.latePenaltyPoints || 0) / dailyWeight / lateIssueCount;
}

function scoreBreakdown(summary) {
  const delivery = summary.active ? summary.delivered / summary.active : 0;
  const onTime = summary.deliveredWithDeadline ? summary.onTime / summary.deliveredWithDeadline : (summary.delivered ? 0.75 : 0);
  const deadlineReliability = summary.deliveredWithDeadline
    ? 1 - (summary.late / summary.deliveredWithDeadline)
    : (summary.delivered ? 0.75 : 0);
  const agingLimitDays = 30;
  const agingScore = 1 - Math.min(averageLateDays(summary), agingLimitDays) / agingLimitDays;
  const hasLatePressure = Boolean(summary.late || summary.overdueOpen);
  const delayControl = hasLatePressure
    ? (deadlineReliability * 0.6) + (agingScore * 0.4)
    : deadlineReliability;
  const backlogHealth = summary.open ? 1 - (summary.overdueOpen / summary.open) : 1;
  const hourEfficiency = hourEfficiencyScore(summary);

  return {
    delivery: { label: 'Entregas realizadas', value: roundPercent(delivery * 100), weight: 25 },
    onTime: { label: 'Entregas no prazo', value: roundPercent(onTime * 100), weight: 30 },
    delayControl: { label: 'Controle de atrasos', value: roundPercent(delayControl * 100), weight: 15 },
    backlogHealth: { label: 'Backlog vencido', value: roundPercent(backlogHealth * 100), weight: 20 },
    hourEfficiency: { label: 'Eficiencia de horas', value: roundPercent(hourEfficiency * 100), weight: 10 },
  };
}

function scoreBasePerson(summary) {
  const breakdown = scoreBreakdown(summary);
  const weighted = Object.values(breakdown).reduce((sum, item) => {
    return sum + (item.value * item.weight);
  }, 0);
  return roundPercent(weighted / 100);
}

function scorePerson(summary) {
  const baseScore = Number(summary.productivityBaseScore ?? scoreBasePerson(summary));
  return roundPercent(baseScore);
}

function averageDailyWip(tasks, period) {
  const totalDays = daysBetween(period.startKey, period.endKey) + 1;
  let total = 0;

  for (let index = 0; index < totalDays; index += 1) {
    const key = addDaysKey(period.startKey, index);
    const dayStart = startOfDay(key);
    const dayEnd = endOfDay(key);
    const count = tasks.reduce((sum, task) => {
      const flags = buildTaskFlags(task, { ...period, start: dayStart, end: dayEnd });
      return sum + (flags.active ? 1 : 0);
    }, 0);
    total += count;
  }

  return Math.round((total / Math.max(totalDays, 1)) * 10) / 10;
}

function summarizeTasks(tasks = [], period, settingsInput = {}) {
  const productivitySettings = normalizeProductivitySettings(settingsInput);
  const summary = {
    opened: 0,
    openedCreatedInPeriod: 0,
    openedCarryover: 0,
    delivered: 0,
    deliveredCreatedInPeriod: 0,
    deliveredFromCarryover: 0,
    deliveredWithDeadline: 0,
    noDeadlineDelivered: 0,
    noDeadlineOpen: 0,
    onTime: 0,
    onTimeRate: 0,
    early: 0,
    late: 0,
    open: 0,
    overdueOpen: 0,
    active: 0,
    atRisk: 0,
    workedSeconds: 0,
    estimatedSeconds: 0,
    deliveredWorkedSeconds: 0,
    averageExecutionSeconds: 0,
    throughput: 0,
    averageDailyWip: 0,
    cycleTimeDays: 0,
    flowEfficiency: 0,
    productivityBaseScore: 0,
    latePenaltyPoints: 0,
    averageLateDays: 0,
    productivityScore: 0,
    productivityMethodology: 'Kanban flow score: throughput, service level expectation, WIP aging, backlog health and effort efficiency.',
    productivitySettings,
    dueDateBasis: CURRENT_DEADLINE_BASIS,
  };

  let executionSeconds = 0;
  let executionCount = 0;

  for (const task of tasks) {
    const flags = buildTaskFlags(task, period);
    if (!flags.active && !flags.delivered) continue;

    if (flags.openedCreatedInPeriod) summary.openedCreatedInPeriod += 1;
    if (flags.openedCarryover) summary.openedCarryover += 1;
    if (flags.opened) summary.opened += 1;
    if (flags.active) summary.active += 1;
    if (flags.delivered) summary.delivered += 1;
    if (flags.deliveredCreatedInPeriod) summary.deliveredCreatedInPeriod += 1;
    if (flags.deliveredFromCarryover) summary.deliveredFromCarryover += 1;
    if (flags.delivered && flags.hasDeadline) summary.deliveredWithDeadline += 1;
    if (flags.noDeadlineDelivered) summary.noDeadlineDelivered += 1;
    if (flags.noDeadlineOpen) summary.noDeadlineOpen += 1;
    if (flags.onTime) summary.onTime += 1;
    if (flags.early) summary.early += 1;
    if (flags.late) summary.late += 1;
    if (flags.open) summary.open += 1;
    if (flags.overdueOpen) summary.overdueOpen += 1;
    if (flags.atRisk) summary.atRisk += 1;

    const lateImpact = buildLateImpactFromFlags(flags, period, productivitySettings);
    summary.latePenaltyPoints += lateImpact.lostPoints;

    if (flags.active) {
      summary.workedSeconds += getWorkedSeconds(task);
      summary.estimatedSeconds += getEstimateSeconds(task);
    }

    if (flags.delivered && flags.createdDate && flags.closeDate && flags.closeDate >= flags.createdDate) {
      const seconds = Math.round((flags.closeDate.getTime() - flags.createdDate.getTime()) / 1000);
      executionSeconds += seconds;
      executionCount += 1;
      summary.deliveredWorkedSeconds += getWorkedSeconds(task);
    }
  }

  summary.averageExecutionSeconds = executionCount ? Math.round(executionSeconds / executionCount) : 0;
  summary.onTimeRate = summary.deliveredWithDeadline ? roundPercent((summary.onTime / summary.deliveredWithDeadline) * 100) : 0;
  summary.throughput = summary.delivered;
  summary.averageDailyWip = averageDailyWip(tasks, period);
  const periodDays = daysBetween(period.startKey, period.endKey) + 1;
  const dailyThroughput = summary.throughput / Math.max(periodDays, 1);
  summary.cycleTimeDays = dailyThroughput ? Math.round((summary.averageDailyWip / dailyThroughput) * 10) / 10 : 0;
  summary.flowEfficiency = executionSeconds ? roundPercent((summary.deliveredWorkedSeconds / executionSeconds) * 100) : 0;
  summary.latePenaltyPoints = roundDecimal(summary.latePenaltyPoints, 2);
  summary.averageLateDays = roundDecimal(averageLateDays(summary), 1);
  summary.productivityBreakdown = scoreBreakdown(summary);
  summary.productivityBaseScore = scoreBasePerson(summary);
  summary.productivityScore = scorePerson(summary);

  return summary;
}

function groupByRows(tasks, period, keyFn) {
  const groups = new Map();
  for (const task of tasks) {
    const flags = buildTaskFlags(task, period);
    if (!flags.active && !flags.delivered) continue;
    const key = keyFn(task) || 'Sem classificacao';
    groups.set(key, (groups.get(key) || 0) + 1);
  }
  return [...groups.entries()]
    .map(([name, value]) => ({ name, value }))
    .sort((a, b) => b.value - a.value || a.name.localeCompare(b.name));
}

function buildBreakdowns(tasks, period) {
  return {
    boards: groupByRows(tasks, period, getBoardName),
    stages: groupByRows(tasks, period, getStageName),
    types: groupByRows(tasks, period, getTypeName),
  };
}

function previousPeriod(period) {
  const totalDays = daysBetween(period.startKey, period.endKey) + 1;
  const endKey = addDaysKey(period.startKey, -1);
  const startKey = addDaysKey(period.startKey, -totalDays);
  return {
    start: startOfDay(startKey),
    end: endOfDay(endKey),
    startKey,
    endKey,
    label: 'Periodo anterior similar',
  };
}

const COMPARISON_METRICS = [
  'productivityScore',
  'opened',
  'openedCreatedInPeriod',
  'openedCarryover',
  'delivered',
  'deliveredCreatedInPeriod',
  'deliveredFromCarryover',
  'deliveredWithDeadline',
  'noDeadlineDelivered',
  'onTime',
  'onTimeRate',
  'early',
  'late',
  'open',
  'overdueOpen',
  'active',
  'averageExecutionSeconds',
  'workedSeconds',
  'throughput',
  'cycleTimeDays',
  'flowEfficiency',
];

function buildMetricComparison(current, previous) {
  return COMPARISON_METRICS.reduce((acc, key) => {
    const value = Number(current[key] || 0);
    const previousValue = Number(previous[key] || 0);
    const change = value - previousValue;
    const changePercent = previousValue
      ? Math.round((change / Math.abs(previousValue)) * 100)
      : (value ? 100 : 0);
    acc[key] = {
      value,
      previous: previousValue,
      change,
      changePercent,
      direction: change > 0 ? 'up' : change < 0 ? 'down' : 'flat',
    };
    return acc;
  }, {});
}

function buildComparison(tasks, period, settingsInput = {}) {
  const previous = previousPeriod(period);
  const currentSummary = summarizeTasks(tasks, period, settingsInput);
  const previousSummary = summarizeTasks(tasks, previous, settingsInput);
  return {
    label: previous.label,
    range: {
      start: previous.startKey,
      end: previous.endKey,
    },
    metrics: buildMetricComparison(currentSummary, previousSummary),
  };
}

function distributePercentages(rows) {
  const total = rows.reduce((sum, row) => sum + row.totalSeconds, 0);
  if (!total) return rows.map((row) => ({ ...row, percentage: 0 }));

  const withRaw = rows.map((row) => {
    const raw = (row.totalSeconds / total) * 100;
    return { ...row, percentage: Math.floor(raw), remainder: raw - Math.floor(raw) };
  });
  let missing = 100 - withRaw.reduce((sum, row) => sum + row.percentage, 0);
  withRaw
    .sort((a, b) => b.remainder - a.remainder)
    .forEach((row) => {
      if (missing > 0) {
        row.percentage += 1;
        missing -= 1;
      }
    });

  return withRaw
    .map(({ remainder, ...row }) => row)
    .sort((a, b) => b.totalSeconds - a.totalSeconds || a.name.localeCompare(b.name));
}

function buildStageFunnel(tasks, period) {
  const groups = new Map();
  const candidates = tasks.filter((task) => buildTaskFlags(task, period).open);
  const sourceTasks = candidates.length ? candidates : tasks.filter((task) => buildTaskFlags(task, period).active);

  for (const task of sourceTasks) {
    const flags = buildTaskFlags(task, period);
    const stage = getStageName(task) || 'Sem etapa';
    const created = flags.createdDate && flags.createdDate > period.start ? flags.createdDate : period.start;
    const end = flags.closeDate && flags.closeDate < period.end ? flags.closeDate : period.end;
    const totalSeconds = Math.max(0, Math.round((end.getTime() - created.getTime()) / 1000));
    const current = groups.get(stage) || {
      name: stage,
      value: 0,
      totalSeconds: 0,
    };
    current.value += 1;
    current.totalSeconds += totalSeconds;
    groups.set(stage, current);
  }

  const rows = distributePercentages([...groups.values()].map((row) => ({
    ...row,
    averageSeconds: row.value ? Math.round(row.totalSeconds / row.value) : 0,
  })));

  return {
    basis: 'Tempo aproximado pela etapa atual do card; historico de mudanca entre colunas ainda nao esta disponivel.',
    rows,
  };
}

function auditTags(flags) {
  const tags = [];
  if (flags.openedCreatedInPeriod) tags.push('Criada no periodo');
  if (flags.openedCarryover) tags.push('Herdada');
  if (flags.delivered) tags.push('Entregue');
  if (flags.noDeadlineDelivered || flags.noDeadlineOpen || !flags.hasDeadline) tags.push('Sem prazo');
  if (flags.onTime) tags.push('No prazo');
  if (flags.early) tags.push('Adiantada');
  if (flags.late) tags.push('Atrasada');
  if (flags.overdueOpen) tags.push('Aberta vencida');
  if (flags.atRisk) tags.push('Risco de prazo');
  return [...new Set(tags)];
}

function buildAudit(tasks, period, collaborators, settingsInput = {}) {
  const productivitySettings = normalizeProductivitySettings(settingsInput);
  return tasks
    .map((task) => {
      const flags = buildTaskFlags(task, period);
      if (!flags.active && !flags.delivered) return null;
      const collaborator = findConfiguredName(task, collaborators) || getAssigneeName(task);
      const lateImpact = buildLateImpactFromFlags(flags, period, productivitySettings);
      return {
        id: task.id ?? task.task_id ?? '',
        title: task.title || task.name || 'Sem titulo',
        collaborator,
        assignee: getAssigneeName(task) || collaborator || 'Sem responsavel',
        board: getBoardName(task) || 'Sem quadro',
        stage: getStageName(task) || 'Sem etapa',
        type: getTypeName(task),
        project: task.project_name || getNestedName(task.project) || 'Sem projeto',
        client: task.client_name || getNestedName(task.client) || 'Sem cliente',
        createdAt: flags.createdDate ? flags.createdDate.toISOString() : null,
        closeDate: flags.closeDate ? flags.closeDate.toISOString() : null,
        dueDate: flags.dueDate ? flags.dueDate.toISOString() : null,
        dueDateBasis: flags.dueDateBasis,
        workedSeconds: getWorkedSeconds(task),
        estimateSeconds: getEstimateSeconds(task),
        lateSeconds: lateImpact.lateSeconds,
        lateDays: lateImpact.lateDays,
        lostPoints: lateImpact.lostPoints,
        impactReason: lateImpact.reason,
        tags: auditTags(flags),
        flags: {
          active: flags.active,
          delivered: flags.delivered,
          openedCreatedInPeriod: flags.openedCreatedInPeriod,
          openedCarryover: flags.openedCarryover,
          overdueOpen: flags.overdueOpen,
          late: flags.late,
          noDeadline: !flags.hasDeadline,
        },
      };
    })
    .filter(Boolean)
    .sort((a, b) => {
      const impactDiff = Number(b.lostPoints || 0) - Number(a.lostPoints || 0);
      if (impactDiff) return impactDiff;
      const aPriority = Number(a.flags.overdueOpen) * 4 + Number(a.flags.late) * 3 + Number(a.flags.noDeadline);
      const bPriority = Number(b.flags.overdueOpen) * 4 + Number(b.flags.late) * 3 + Number(b.flags.noDeadline);
      return bPriority - aPriority || String(a.title).localeCompare(String(b.title));
    });
}

function buildProductivityImpacts(audit = [], limit = PRODUCTIVITY_IMPACT_LIMIT) {
  return [...audit]
    .filter((row) => Number(row.lostPoints || 0) > 0)
    .sort((a, b) => Number(b.lostPoints || 0) - Number(a.lostPoints || 0)
      || Number(b.lateSeconds || 0) - Number(a.lateSeconds || 0)
      || String(a.title).localeCompare(String(b.title)))
    .slice(0, limit)
    .map((row) => ({
      id: row.id,
      title: row.title,
      collaborator: row.collaborator,
      assignee: row.assignee,
      board: row.board,
      stage: row.stage,
      dueDate: row.dueDate,
      closeDate: row.closeDate,
      lateSeconds: row.lateSeconds,
      lateDays: row.lateDays,
      lostPoints: row.lostPoints,
      reason: row.impactReason,
    }));
}

function buildCardSelection(tasks, period, collaborators, excludedTaskIdsByPerson = {}, settingsInput = {}) {
  const people = collaborators.map((name) => {
    const cards = tasks
      .filter((task) => matchesConfiguredName(findConfiguredName(task, collaborators), name))
      .map((task) => {
        const flags = buildTaskFlags(task, period);
        if (!flags.active && !flags.delivered) return null;
        const taskId = getTaskId(task);
        const lateImpact = buildLateImpactFromFlags(flags, period, settingsInput);
        const included = !isTaskExcludedFromProductivity(task, collaborators, excludedTaskIdsByPerson);
        return {
          id: taskId,
          title: task.title || task.name || 'Sem titulo',
          collaborator: name,
          assignee: getAssigneeName(task) || name,
          board: getBoardName(task) || 'Sem quadro',
          stage: getStageName(task) || 'Sem etapa',
          dueDate: flags.dueDate ? flags.dueDate.toISOString() : null,
          closeDate: flags.closeDate ? flags.closeDate.toISOString() : null,
          included,
          lostPoints: lateImpact.lostPoints,
          reason: lateImpact.reason,
          tags: auditTags(flags),
        };
      })
      .filter(Boolean)
      .sort((a, b) => {
        if (a.included !== b.included) return Number(b.included) - Number(a.included);
        const impactDiff = Number(b.lostPoints || 0) - Number(a.lostPoints || 0);
        if (impactDiff) return impactDiff;
        return String(a.title).localeCompare(String(b.title));
      });

    return {
      name,
      total: cards.length,
      included: cards.filter((card) => card.included).length,
      excluded: cards.filter((card) => !card.included).length,
      cards,
    };
  });

  return {
    total: people.reduce((sum, person) => sum + person.total, 0),
    included: people.reduce((sum, person) => sum + person.included, 0),
    excluded: people.reduce((sum, person) => sum + person.excluded, 0),
    people,
  };
}

function buildAlerts(audit, summary) {
  const alerts = [];

  for (const task of audit) {
    if (task.flags.overdueOpen) {
      alerts.push({
        severity: 'high',
        title: 'Tarefa aberta vencida',
        detail: `${task.title} esta em ${task.stage} com prazo atual vencido.`,
        assignee: task.assignee,
        action: 'Repriorizar ou renegociar prazo.',
        taskId: task.id,
      });
    } else if (task.tags.includes('Risco de prazo')) {
      alerts.push({
        severity: 'medium',
        title: 'Prazo proximo',
        detail: `${task.title} vence em ate dois dias e ainda esta aberta.`,
        assignee: task.assignee,
        action: 'Checar impedimentos antes do vencimento.',
        taskId: task.id,
      });
    }

    if (task.flags.late) {
      alerts.push({
        severity: 'medium',
        title: 'Entrega atrasada',
        detail: `${task.title} foi entregue depois do prazo atual definido.`,
        assignee: task.assignee,
        action: 'Verificar causa do atraso para evitar repeticao.',
        taskId: task.id,
      });
    }

    if (task.flags.noDeadline && task.flags.active) {
      alerts.push({
        severity: 'low',
        title: 'Demanda sem prazo',
        detail: `${task.title} entrou no calculo sem prazo definido.`,
        assignee: task.assignee,
        action: 'Definir prazo para melhorar leitura de cumprimento.',
        taskId: task.id,
      });
    }
  }

  if (summary.open && summary.overdueOpen / summary.open >= 0.3) {
    alerts.unshift({
      severity: 'high',
      title: 'Backlog vencido acima do aceitavel',
      detail: `${summary.overdueOpen} de ${summary.open} tarefas abertas estao vencidas.`,
      assignee: 'Departamento',
      action: 'Fazer triagem de fila e renegociar entregas.',
      taskId: '',
    });
  }

  if (summary.deliveredWithDeadline && summary.onTimeRate < 60) {
    alerts.unshift({
      severity: 'medium',
      title: 'Cumprimento de prazo baixo',
      detail: `Apenas ${summary.onTimeRate}% das entregas com prazo ficaram no prazo atual.`,
      assignee: 'Departamento',
      action: 'Revisar estimativas e gargalos por etapa.',
      taskId: '',
    });
  }

  return alerts.slice(0, 16);
}

function buildAnalytics(rawTasks = [], options = {}) {
  const collaborators = options.collaborators || [];
  const period = normalizePeriod(options);
  const boardScope = normalizeBoardScope(options.boardScope);
  const productivitySettings = normalizeProductivitySettings(options);
  const excludedTaskIdsByPerson = normalizeExcludedTaskIdsByPerson(options, collaborators);
  const normalizedTasks = expandTaskAssignments(rawTasks);
  const scopedTasks = normalizedTasks.filter((task) => isScopedTask(task, { ...options, boardScope }));
  const productivityTasks = scopedTasks.filter((task) => {
    return !isTaskExcludedFromProductivity(task, collaborators, excludedTaskIdsByPerson);
  });
  const cardSelection = buildCardSelection(scopedTasks, period, collaborators, excludedTaskIdsByPerson, productivitySettings);
  const summary = summarizeTasks(productivityTasks, period, productivitySettings);
  const audit = buildAudit(productivityTasks, period, collaborators, productivitySettings);

  const people = collaborators.map((name) => {
    const personTasks = productivityTasks.filter((task) => matchesConfiguredName(findConfiguredName(task, collaborators), name));
    const personSummary = summarizeTasks(personTasks, period, productivitySettings);
    const personAudit = buildAudit(personTasks, period, collaborators, productivitySettings);
    return {
      name,
      summary: personSummary,
      comparison: buildComparison(personTasks, period, productivitySettings),
      breakdowns: buildBreakdowns(personTasks, period),
      stageFunnel: buildStageFunnel(personTasks, period),
      productivityImpacts: buildProductivityImpacts(personAudit),
    };
  });

  return {
    period: {
      start: period.startKey,
      end: period.endKey,
    },
    scope: {
      collaborators,
      boards: options.boards || [],
      boardScope,
      boardScopeLabel: BOARD_SCOPE_LABELS[boardScope],
      excludedTaskIdsByPerson,
      rules: {
        marketing: 'Allana, Bruna e Beatriz: todas as colunas de Demandas MKT / Demandas de Marketing.',
        bruno: 'Bruno: apenas Criacao nas etapas Filas de demandas, Fazendo Bruno, Aprovacao de texto ou arte e Entregue.',
      },
    },
    rawTaskCount: rawTasks.length,
    normalizedTaskCount: normalizedTasks.length,
    scopedTaskCount: scopedTasks.length,
    productivityTaskCount: productivityTasks.length,
    summary,
    people,
    comparisons: [buildComparison(productivityTasks, period, productivitySettings)],
    breakdowns: buildBreakdowns(productivityTasks, period),
    stageFunnel: buildStageFunnel(productivityTasks, period),
    productivitySettings,
    productivityImpacts: buildProductivityImpacts(audit),
    cardSelection,
    alerts: buildAlerts(audit, summary),
    audit,
  };
}

module.exports = {
  buildAnalytics,
  buildTaskFlags,
  expandTaskAssignments,
  getPresetRange,
  matchesConfiguredName,
  matchesConfiguredText,
  normalizeName,
  normalizeBoardScope,
  scorePerson,
  summarizeTasks,
};
