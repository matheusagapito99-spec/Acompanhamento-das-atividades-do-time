const { sendScheduledReports } = require('../src/reports.cjs');
const { sanitizeApiError } = require('../src/runrunit.cjs');
const { requireAuth } = require('../src/auth.cjs');

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

// Disparo MANUAL do relatório real para todos os colaboradores (além do cron de segunda).
// Exige confirm:true para não ser acionado por engano. Atenção: o painel não tem autenticação,
// então proteja a URL — qualquer pessoa com ela poderia acionar este envio.
module.exports = async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store, max-age=0');

  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return sendJson(res, 405, { ok: false, error: 'Metodo nao permitido.' });
  }

  const auth = await requireAuth(req, process.env);
  if (!auth.ok) return sendJson(res, 401, { ok: false, error: 'Faca login para acessar.' });

  try {
    const body = await readJsonBody(req);
    if (body.confirm !== true) {
      return sendJson(res, 400, { ok: false, error: 'Confirme o envio real enviando confirm:true.' });
    }
    const result = await sendScheduledReports({
      env: process.env,
      boardScope: body.boardScope || 'all',
    });
    return sendJson(res, 200, { ok: true, ...result });
  } catch (error) {
    const status = error.statusCode && error.statusCode >= 400 ? error.statusCode : 500;
    return sendJson(res, status, {
      ok: false,
      code: error.code || 'REPORT_RUN_ERROR',
      error: sanitizeApiError(error.message, process.env),
    });
  }
};
