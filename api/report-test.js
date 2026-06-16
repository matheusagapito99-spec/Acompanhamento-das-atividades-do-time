const { sendTestReport } = require('../src/reports.cjs');
const { sanitizeApiError } = require('../src/runrunit.cjs');

function sendJson(res, status, payload) {
  res.status(status).json(payload);
}

async function readJsonBody(req) {
  if (req.body && typeof req.body === 'object') return req.body;
  if (typeof req.body === 'string') return req.body ? JSON.parse(req.body) : {};
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  const text = Buffer.concat(chunks).toString('utf8');
  return text ? JSON.parse(text) : {};
}

module.exports = async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store, max-age=0');

  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return sendJson(res, 405, { ok: false, error: 'Metodo nao permitido.' });
  }

  try {
    const body = await readJsonBody(req);
    const result = await sendTestReport({
      from: body.from,
      to: body.to,
      collaborator: body.collaborator,
      template: body.template,
      env: process.env,
      boardScope: body.boardScope || 'all',
    });

    return sendJson(res, 200, {
      ok: true,
      ...result,
    });
  } catch (error) {
    const status = error.statusCode && error.statusCode >= 400 ? error.statusCode : 500;
    return sendJson(res, status, {
      ok: false,
      code: error.code || 'REPORT_TEST_ERROR',
      error: sanitizeApiError(error.message, process.env),
    });
  }
};
