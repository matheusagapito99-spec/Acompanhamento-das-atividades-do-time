const {
  fetchRunrunSnapshot,
  getDashboardConfig,
  sanitizeApiError,
} = require('../src/runrunit.cjs');
const {
  getReportTemplate,
  getReportFromOptions,
  resolveCollaboratorRecipients,
} = require('../src/reports.cjs');
const { requireAuth } = require('../src/auth.cjs');

function sendJson(res, status, payload) {
  res.status(status).json(payload);
}

module.exports = async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store, max-age=0');

  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return sendJson(res, 405, { ok: false, error: 'Metodo nao permitido.' });
  }

  const auth = await requireAuth(req, process.env);
  if (!auth.ok) return sendJson(res, 401, { ok: false, error: 'Faca login para acessar.' });

  try {
    const config = getDashboardConfig(process.env);
    const snapshot = await fetchRunrunSnapshot({ env: process.env });
    const recipients = resolveCollaboratorRecipients(snapshot.users, config.collaborators);

    return sendJson(res, 200, {
      ok: true,
      fromOptions: getReportFromOptions(process.env),
      defaultFrom: getReportFromOptions(process.env)[0],
      collaborators: config.collaborators,
      recipients,
      template: getReportTemplate(process.env),
    });
  } catch (error) {
    const status = error.statusCode && error.statusCode >= 400 ? error.statusCode : 500;
    return sendJson(res, status, {
      ok: false,
      code: error.code || 'REPORT_CONFIG_ERROR',
      error: sanitizeApiError(error.message, process.env),
    });
  }
};
