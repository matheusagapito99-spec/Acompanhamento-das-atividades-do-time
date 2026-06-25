const crypto = require('node:crypto');
const { authEnabled, STATE_COOKIE, serializeCookie, getAllowedDomain } = require('../../src/auth.cjs');

module.exports = function handler(req, res) {
  const env = process.env;
  if (!authEnabled(env)) {
    res.setHeader('Location', '/');
    res.status(302).end();
    return;
  }
  const proto = req.headers['x-forwarded-proto'] || 'https';
  const redirectUri = `${proto}://${req.headers.host}/api/auth/callback`;
  const state = crypto.randomBytes(16).toString('hex');
  const params = new URLSearchParams({
    client_id: env.GOOGLE_CLIENT_ID,
    redirect_uri: redirectUri,
    response_type: 'code',
    scope: 'openid email profile',
    access_type: 'online',
    prompt: 'select_account',
    hd: getAllowedDomain(env),
    state,
  });
  res.setHeader('Set-Cookie', serializeCookie(STATE_COOKIE, state, { maxAgeMs: 10 * 60 * 1000, secure: proto === 'https' }));
  res.setHeader('Location', `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`);
  res.status(302).end();
};
