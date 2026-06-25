const { clearSessionCookie } = require('../../src/auth.cjs');

module.exports = function handler(req, res) {
  res.setHeader('Set-Cookie', clearSessionCookie());
  res.setHeader('Location', '/');
  res.status(302).end();
};
