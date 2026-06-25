const { getDashboardConfig } = require('../src/runrunit.cjs');
const { requireAuth } = require('../src/auth.cjs');

module.exports = async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  const auth = await requireAuth(req, process.env);
  if (!auth.ok) return res.status(401).json({ ok: false, error: 'Faca login para acessar.' });
  const config = getDashboardConfig(process.env);
  res.status(200).json({
    ok: true,
    configured: Boolean(process.env.RUNRUNIT_APP_KEY && process.env.RUNRUNIT_USER_TOKEN),
    scope: config,
  });
};
