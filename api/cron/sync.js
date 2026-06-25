const {
  fetchRunrunSnapshot,
  attachTaskHistories,
  sanitizeApiError,
} = require('../../src/runrunit.cjs');
const { classifyBoard } = require('../../src/history.cjs');
const {
  dbEnabled,
  getSql,
  ensureSchema,
  writeSnapshot,
  setSyncState,
} = require('../../src/db.cjs');

function sendJson(res, status, payload) {
  res.status(status).json(payload);
}

function isAuthorized(req, env = process.env) {
  const secret = env.CRON_SECRET;
  return Boolean(secret) && req.headers.authorization === `Bearer ${secret}`;
}

const DAY_MS = 86400000;

module.exports = async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store, max-age=0');

  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return sendJson(res, 405, { ok: false, error: 'Metodo nao permitido.' });
  }
  if (!isAuthorized(req, process.env)) {
    return sendJson(res, 401, { ok: false, error: 'Nao autorizado.' });
  }
  if (!dbEnabled(process.env)) {
    return sendJson(res, 200, { ok: true, skipped: true, reason: 'DATABASE_URL nao configurado.' });
  }

  const env = process.env;
  try {
    const start = new Date(Date.now() - 90 * DAY_MS).toISOString().slice(0, 10);
    const end = new Date().toISOString().slice(0, 10);
    const snapshot = await fetchRunrunSnapshot({ env, start, end });

    // Anexa o histórico (pausa de prazo) aos cards das meninas com prazo, abertos ou fechados há pouco.
    const recentCut = Date.now() - 60 * DAY_MS;
    const hasDeadline = (task) => Boolean(
      task.first_desired_date || task.desired_date || task.desired_date_with_time || task.due_date || task.estimated_delivery_date,
    );
    const needsHistory = snapshot.tasks.filter((task) => {
      const context = classifyBoard(task.board_name || task.board?.name, task.board_id ?? task.board?.id);
      if (context !== 'marketing' || !hasDeadline(task)) return false;
      const close = task.close_date ? new Date(task.close_date).getTime() : null;
      return !close || close >= recentCut;
    });
    await attachTaskHistories(needsHistory, { env, now: new Date().toISOString(), concurrency: 3, maxTasks: 100 });

    const sql = getSql(env);
    await ensureSchema(sql);
    const result = await writeSnapshot(sql, {
      tasks: snapshot.tasks,
      users: snapshot.users,
      boards: snapshot.boards,
      source: { warnings: snapshot.sourceWarnings || [], historyAttached: needsHistory.length },
    });
    await setSyncState(sql, { ok: true, cardCount: result.cardCount, note: '' });
    return sendJson(res, 200, { ok: true, syncedAt: new Date().toISOString(), ...result });
  } catch (error) {
    try {
      await setSyncState(getSql(env), { ok: false, note: sanitizeApiError(error.message, env).slice(0, 300) });
    } catch (stateError) {
      // ignora falha ao registrar o estado
    }
    const status = error.statusCode && error.statusCode >= 400 ? error.statusCode : 500;
    return sendJson(res, status, { ok: false, error: sanitizeApiError(error.message, env) });
  }
};
