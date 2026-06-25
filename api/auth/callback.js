const {
  authEnabled,
  STATE_COOKIE,
  parseCookies,
  isAllowedEmail,
  createSessionCookie,
  serializeCookie,
} = require('../../src/auth.cjs');

function redirect(res, location, cookies) {
  if (cookies) res.setHeader('Set-Cookie', cookies);
  res.setHeader('Location', location);
  res.status(302).end();
}

module.exports = async function handler(req, res) {
  const env = process.env;
  if (!authEnabled(env)) return redirect(res, '/');

  try {
    const proto = req.headers['x-forwarded-proto'] || 'https';
    const url = new URL(req.url, `${proto}://${req.headers.host}`);
    const code = url.searchParams.get('code');
    const state = url.searchParams.get('state');
    const cookies = parseCookies(req);
    if (!code || !state || state !== cookies[STATE_COOKIE]) {
      return redirect(res, '/?auth=estado', serializeCookie(STATE_COOKIE, '', { maxAgeMs: 0 }));
    }

    const redirectUri = `${proto}://${req.headers.host}/api/auth/callback`;
    const tokenResponse = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        code,
        client_id: env.GOOGLE_CLIENT_ID,
        client_secret: env.GOOGLE_CLIENT_SECRET,
        redirect_uri: redirectUri,
        grant_type: 'authorization_code',
      }).toString(),
    });
    const tokens = await tokenResponse.json();
    if (!tokenResponse.ok || !tokens.id_token) throw new Error('token_exchange');

    const infoResponse = await fetch(`https://oauth2.googleapis.com/tokeninfo?id_token=${encodeURIComponent(tokens.id_token)}`);
    const info = await infoResponse.json();
    if (!infoResponse.ok || info.aud !== env.GOOGLE_CLIENT_ID) throw new Error('token_invalid');
    if (info.email_verified !== 'true' && info.email_verified !== true) throw new Error('email_unverified');

    if (!isAllowedEmail(info.email, env)) {
      return redirect(res, '/?auth=dominio', serializeCookie(STATE_COOKIE, '', { maxAgeMs: 0 }));
    }

    const sessionCookie = await createSessionCookie(
      { email: info.email, name: info.name, picture: info.picture },
      env,
    );
    return redirect(res, '/', [sessionCookie, serializeCookie(STATE_COOKIE, '', { maxAgeMs: 0 })]);
  } catch (error) {
    return redirect(res, '/?auth=erro', serializeCookie(STATE_COOKIE, '', { maxAgeMs: 0 }));
  }
};
