const { buildAnalytics, getPresetRange } = require('../src/analytics.cjs');
const {
  fetchRunrunSnapshot,
  getDashboardConfig,
  sanitizeApiError,
} = require('../src/runrunit.cjs');

function sendJson(res, status, payload) {
  res.status(status).json(payload);
}

module.exports = async function handler(req, res) {
  res.setHeader('Cache-Control', 's-maxage=60, stale-while-revalidate=300');

  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return sendJson(res, 405, { ok: false, error: 'Metodo nao permitido.' });
  }

  try {
    const config = getDashboardConfig(process.env);
    const preset = req.query.preset || 'this-month';
    const range = req.query.start && req.query.end
      ? { start: req.query.start, end: req.query.end, label: 'Periodo personalizado' }
      : getPresetRange(preset, new Date());

    const snapshot = await fetchRunrunSnapshot({
      env: process.env,
      start: range.start,
      end: range.end,
    });
    const analytics = buildAnalytics(snapshot.tasks, {
      ...config,
      start: range.start,
      end: range.end,
      cycle: preset,
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
        warnings: snapshot.sourceWarnings,
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
