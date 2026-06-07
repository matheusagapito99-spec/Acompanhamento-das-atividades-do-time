const { getDashboardConfig } = require('../src/runrunit.cjs');

module.exports = function handler(req, res) {
  const config = getDashboardConfig(process.env);
  res.setHeader('Cache-Control', 'no-store');
  res.status(200).json({
    ok: true,
    configured: Boolean(process.env.RUNRUNIT_APP_KEY && process.env.RUNRUNIT_USER_TOKEN),
    scope: config,
  });
};
