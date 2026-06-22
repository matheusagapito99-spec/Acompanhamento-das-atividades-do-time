const { buildAnalytics, getPresetRange } = require('../src/analytics.cjs');
const { classifyBoard } = require('../src/history.cjs');
const {
  fetchRunrunSnapshot,
  attachTaskHistories,
  getDashboardConfig,
  sanitizeApiError,
} = require('../src/runrunit.cjs');

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

    // Histórico (comentários) só para os quadros relevantes: Criação (Bruno) e Demandas de MKT (meninas).
    // É o que permite pausar o prazo das meninas e medir a execução do Bruno.
    let historyWarnings = [];
    if (req.query.history !== 'off') {
      const relevant = snapshot.tasks.filter((task) => {
        const context = classifyBoard(task.board_name || task.board?.name, task.board_id ?? task.board?.id);
        return context === 'bruno' || context === 'marketing';
      });
      const result = await attachTaskHistories(relevant, {
        env: process.env,
        now: new Date().toISOString(),
        concurrency: 6,
        maxTasks: 160,
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
