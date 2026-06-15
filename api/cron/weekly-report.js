const { sendScheduledReports } = require('../../src/reports.cjs');
const { sanitizeApiError } = require('../../src/runrunit.cjs');

function sendJson(res, status, payload) {
  res.status(status).json(payload);
}

function isAuthorized(req, env = process.env) {
  const secret = env.CRON_SECRET;
  if (!secret) return false;
  return req.headers.authorization === `Bearer ${secret}`;
}

module.exports = async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store, max-age=0');

  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return sendJson(res, 405, { ok: false, error: 'Metodo nao permitido.' });
  }

  if (!isAuthorized(req, process.env)) {
    return sendJson(res, 401, { ok: false, error: 'Nao autorizado.' });
  }

  try {
    const result = await sendScheduledReports({
      env: process.env,
      boardScope: req.query?.boardScope || 'all',
    });

    return sendJson(res, 200, {
      ok: true,
      ...result,
    });
  } catch (error) {
    const status = error.statusCode && error.statusCode >= 400 ? error.statusCode : 500;
    return sendJson(res, status, {
      ok: false,
      code: error.code || 'REPORT_CRON_ERROR',
      error: sanitizeApiError(error.message, process.env),
    });
  }
};
