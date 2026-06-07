const API_BASE = 'https://runrun.it/api/v1.0';

const DEFAULT_COLLABORATORS = ['Allana', 'Bruno', 'Bruna', 'Beatriz'];
const DEFAULT_BOARDS = ['Demandas de Marketing', 'Criacao'];

function assertCredentials(env = process.env) {
  if (!env.RUNRUNIT_APP_KEY || !env.RUNRUNIT_USER_TOKEN) {
    const error = new Error('Configure RUNRUNIT_APP_KEY e RUNRUNIT_USER_TOKEN para conectar ao Runrun.it.');
    error.statusCode = 500;
    error.code = 'MISSING_RUNRUNIT_CREDENTIALS';
    throw error;
  }
}

function buildRunrunHeaders(env = process.env) {
  assertCredentials(env);
  return {
    'App-Key': env.RUNRUNIT_APP_KEY,
    'User-Token': env.RUNRUNIT_USER_TOKEN,
    'Content-Type': 'application/json',
  };
}

function sanitizeApiError(message, env = process.env) {
  let result = String(message || 'Erro ao consultar Runrun.it.');
  for (const secret of [env.RUNRUNIT_APP_KEY, env.RUNRUNIT_USER_TOKEN]) {
    if (secret) result = result.split(secret).join('[oculto]');
  }
  return result;
}

function toQuery(params = {}) {
  const entries = Object.entries(params).filter(([, value]) => value !== undefined && value !== null && value !== '');
  if (!entries.length) return '';
  return `?${new URLSearchParams(entries).toString()}`;
}

async function runrunRequest(path, options = {}) {
  const env = options.env || process.env;
  const fetchImpl = options.fetchImpl || globalThis.fetch;
  if (!fetchImpl) throw new Error('Fetch API indisponivel neste runtime.');
  const url = path.startsWith('http') ? path : `${API_BASE}${path}`;

  const response = await fetchImpl(url, {
    method: 'GET',
    headers: buildRunrunHeaders(env),
  });

  const text = await response.text();
  let payload = null;
  if (text) {
    try {
      payload = JSON.parse(text);
    } catch {
      payload = text;
    }
  }

  if (!response.ok) {
    const error = new Error(sanitizeApiError(
      `Runrun.it respondeu ${response.status}: ${typeof payload === 'string' ? payload : JSON.stringify(payload)}`,
      env,
    ));
    error.statusCode = response.status;
    error.code = 'RUNRUNIT_API_ERROR';
    throw error;
  }

  return payload;
}

function extractTaskList(payload) {
  if (Array.isArray(payload)) return payload;
  if (Array.isArray(payload?.tasks)) return payload.tasks;
  if (Array.isArray(payload?.data)) return payload.data;
  if (Array.isArray(payload?.items)) return payload.items;
  if (Array.isArray(payload?.task_evaluations)) {
    return payload.task_evaluations.map((evaluation) => evaluation.task).filter(Boolean);
  }
  return [];
}

async function fetchFirstSuccessful(paths, options) {
  const errors = [];
  for (const path of paths) {
    try {
      return await runrunRequest(path, options);
    } catch (error) {
      errors.push(error.message);
    }
  }
  const error = new Error(errors[0] || 'Nao foi possivel consultar o Runrun.it.');
  error.statusCode = 502;
  error.code = 'RUNRUNIT_SOURCE_ERROR';
  throw error;
}

function getTaskTimestamp(task, field) {
  const date = new Date(task?.[field] || '');
  return Number.isNaN(date.getTime()) ? null : date;
}

async function fetchTaskPages(query, options = {}) {
  const limit = Number(options.limit || 100);
  const maxPages = Number(options.maxPages || 10);
  const periodStart = options.periodStart ? new Date(options.periodStart) : null;
  const tasks = [];

  for (let page = 1; page <= maxPages; page += 1) {
    const payload = await runrunRequest(`/tasks${toQuery({ ...query, limit, page })}`, options);
    const pageTasks = extractTaskList(payload);
    tasks.push(...pageTasks);

    if (pageTasks.length < limit) break;
    if (query.is_closed === true && periodStart && pageTasks.every((task) => {
      const closeDate = getTaskTimestamp(task, 'close_date');
      return closeDate && closeDate < periodStart;
    })) {
      break;
    }
  }

  return tasks;
}

function dedupeTasks(tasks) {
  const seen = new Map();
  for (const task of tasks) {
    const key = String(task.id ?? task.uid ?? JSON.stringify(task));
    if (!seen.has(key)) seen.set(key, task);
  }
  return [...seen.values()];
}

async function fetchRunrunSnapshot(options = {}) {
  const env = options.env || process.env;
  assertCredentials(env);

  const fetchOptions = {
    env,
    fetchImpl: options.fetchImpl,
  };

  const [usersPayload, boardsPayload, openTasksPayload, closedTasksPayload] = await Promise.all([
    fetchFirstSuccessful(['/users', '/users?per_page=1000'], fetchOptions).catch((error) => ({ error })),
    fetchFirstSuccessful(['/boards', '/boards?per_page=1000'], fetchOptions).catch((error) => ({ error })),
    fetchTaskPages({ is_closed: false }, { ...fetchOptions, maxPages: 10 }).catch((error) => ({ error })),
    fetchTaskPages(
      { is_closed: true, sort: 'close_date', sort_dir: 'desc' },
      { ...fetchOptions, maxPages: 10, periodStart: options.start },
    ).catch((error) => ({ error })),
  ]);

  if (openTasksPayload.error && closedTasksPayload.error) {
    const error = new Error(openTasksPayload.error.message || closedTasksPayload.error.message);
    error.statusCode = 502;
    error.code = 'RUNRUNIT_SOURCE_ERROR';
    throw error;
  }

  const openTasks = Array.isArray(openTasksPayload) ? openTasksPayload : [];
  const closedTasks = Array.isArray(closedTasksPayload) ? closedTasksPayload : [];
  const tasks = dedupeTasks([...openTasks, ...closedTasks]);
  const users = Array.isArray(usersPayload) ? usersPayload : usersPayload.users || [];
  const boards = Array.isArray(boardsPayload) ? boardsPayload : boardsPayload.boards || [];

  return {
    tasks,
    users,
    boards,
    sourceWarnings: [
      usersPayload.error ? `Usuarios: ${sanitizeApiError(usersPayload.error.message, env)}` : null,
      boardsPayload.error ? `Quadros: ${sanitizeApiError(boardsPayload.error.message, env)}` : null,
      openTasksPayload.error ? `Tarefas abertas: ${sanitizeApiError(openTasksPayload.error.message, env)}` : null,
      closedTasksPayload.error ? `Tarefas fechadas: ${sanitizeApiError(closedTasksPayload.error.message, env)}` : null,
    ].filter(Boolean),
  };
}

function getDashboardConfig(env = process.env) {
  const collaborators = (env.MARKETING_COLLABORATORS || DEFAULT_COLLABORATORS.join(','))
    .split(',')
    .map((name) => name.trim())
    .filter(Boolean);
  const boards = (env.RUNRUNIT_BOARD_NAMES || DEFAULT_BOARDS.join(','))
    .split(',')
    .map((name) => name.trim())
    .filter(Boolean);

  return { collaborators, boards };
}

module.exports = {
  API_BASE,
  DEFAULT_BOARDS,
  DEFAULT_COLLABORATORS,
  assertCredentials,
  buildRunrunHeaders,
  extractTaskList,
  fetchRunrunSnapshot,
  fetchTaskPages,
  getDashboardConfig,
  runrunRequest,
  sanitizeApiError,
};
