const { authEnabled, getSession } = require('../../src/auth.cjs');

module.exports = async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  const env = process.env;
  if (!authEnabled(env)) {
    return res.status(200).json({ ok: true, authenticated: true, open: true, user: null });
  }
  const session = await getSession(req, env);
  if (!session) {
    return res.status(401).json({ ok: false, authenticated: false });
  }
  return res.status(200).json({
    ok: true,
    authenticated: true,
    user: { email: session.email, name: session.name, picture: session.picture },
  });
};
