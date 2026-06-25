const { buildAnalytics, getPresetRange } = require('../src/analytics.cjs');
const { classifyBoard } = require('../src/history.cjs');
const {
  fetchRunrunSnapshot,
  attachTaskHistories,
  getDashboardConfig,
  sanitizeApiError,
} = require('../src/runrunit.cjs');
const { requireAuth } = require('../src/auth.cjs');

function sendJson(res, status, payload) {
  res.status(status).json(payload);
}

module.exports = async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store, max-age=0');
  res.setHeader('Pragma', 'no-cache');

  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return sendJson(res, 405, { ok: false, error: 'Metodo nao permitido.' });
  }

  const auth = await requireAuth(req, process.env);
  if (!auth.ok) return sendJson(res, 401, { ok: false, error: 'Faca login para acessar.' });

  try {
    const config = getDashboardConfig(process.env);
    const preset = req.query.preset || 'this-month';
    const boardScope = req.query.boardScope || 'all';
    const excludedTaskIdsByPerson = req.query.excludedTaskIdsByPerson;
    const range = req.query.start && req.query.end
      ? { start: req.query.start, end: req.query.end, label: 'Periodo personalizado' }
      : getPresetRange(preset, new Date());

    const snapshot = await fetchRunrunSnapshot({
      env: process.env,
      start: range.start,
      end: range.end,
    });

    // Histórico (comentários) é caro: o Runrun.it limita a 100 req/min. Buscamos comentários
    // APENAS para os cards das meninas com prazo que tocam o período — é o que precisa do
    // histórico para "pausar" o prazo enquanto o card esteve no quadro do Bruno. A execução do
    // Bruno e o excedente de aprovação usam campos estruturados (sem chamadas extras).
    let historyWarnings = [];
    if (req.query.history !== 'off') {
      const periodStart = new Date(`${range.start}T00:00:00-03:00`);
      const periodEnd = new Date(`${range.end}T23:59:59-03:00`);
      const touchesPeriod = (task) => {
        const created = new Date(task.task_created_at || task.created_at || task.start_date || 0);
        const close = task.close_date ? new Date(task.close_date) : null;
        const createdOk = Number.isNaN(created.getTime()) ? true : created <= periodEnd;
        const closedBeforeStart = close && !Number.isNaN(close.getTime()) ? close < periodStart : false;
        return createdOk && !closedBeforeStart;
      };
      const hasDeadline = (task) => Boolean(
        task.first_desired_date || task.desired_date || task.desired_date_with_time || task.due_date || task.estimated_delivery_date,
      );
      const needsHistory = snapshot.tasks.filter((task) => {
        const context = classifyBoard(task.board_name || task.board?.name, task.board_id ?? task.board?.id);
        return context === 'marketing' && hasDeadline(task) && touchesPeriod(task);
      });
      const result = await attachTaskHistories(needsHistory, {
        env: process.env,
        now: new Date().toISOString(),
        concurrency: 3,
        maxTasks: 60,
      });
      historyWarnings = result.warnings || [];
    }

    const analytics = buildAnalytics(snapshot.tasks, {
      ...config,
      start: range.start,
      end: range.end,
      cycle: preset,
      boardScope,
      excludedTaskIdsByPerson,
      referenceDate: new Date().toISOString(),
    });

    return sendJson(res, 200, {
      ok: true,
      range,
      ...analytics,
      source: {
        rawTaskCount: analytics.rawTaskCount,
        normalizedTaskCount: analytics.normalizedTaskCount,
        scopedTaskCount: analytics.scopedTaskCount,
        userCount: snapshot.users.length,
        boardCount: snapshot.boards.length,
        warnings: [...snapshot.sourceWarnings, ...historyWarnings],
      },
    });
  } catch (error) {
    const status = error.statusCode && error.statusCode >= 400 ? error.statusCode : 500;
    return sendJson(res, status, {
      ok: false,
      code: error.code || 'DASHBOARD_ERROR',
      error: sanitizeApiError(error.message, process.env),
    });
  }
};
