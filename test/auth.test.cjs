const test = require('node:test');
const assert = require('node:assert/strict');

const {
  signSession,
  verifySession,
  isAllowedEmail,
  authEnabled,
  parseCookies,
  getSession,
  requireAuth,
  createSessionCookie,
  SESSION_COOKIE,
} = require('../src/auth.cjs');

const SECRET = 'segredo-de-teste-bem-grande-1234567890';

test('signSession/verifySession round-trips the payload', async () => {
  const token = await signSession({ email: 'allana@avalyst.com.br', name: 'Allana' }, SECRET);
  const payload = await verifySession(token, SECRET);
  assert.equal(payload.email, 'allana@avalyst.com.br');
  assert.equal(payload.name, 'Allana');
});

test('verifySession rejects tampering and wrong secret', async () => {
  const token = await signSession({ email: 'allana@avalyst.com.br' }, SECRET);
  assert.equal(await verifySession(token, 'outro-segredo'), null);
  assert.equal(await verifySession(`${token}x`, SECRET), null);
  assert.equal(await verifySession('lixo', SECRET), null);
});

test('verifySession rejects expired sessions', async () => {
  const token = await signSession({ email: 'a@avalyst.com.br', exp: Date.now() - 1000 }, SECRET);
  assert.equal(await verifySession(token, SECRET), null);
});

test('isAllowedEmail enforces the configured domain', () => {
  assert.equal(isAllowedEmail('allana@avalyst.com.br'), true);
  assert.equal(isAllowedEmail('intruso@gmail.com'), false);
  assert.equal(isAllowedEmail('', {}), false);
  assert.equal(isAllowedEmail('x@empresa.com', { AUTH_ALLOWED_DOMAIN: 'empresa.com' }), true);
});

test('authEnabled only when client id, secret and auth secret are set', () => {
  assert.equal(authEnabled({}), false);
  assert.equal(authEnabled({ GOOGLE_CLIENT_ID: 'a', GOOGLE_CLIENT_SECRET: 'b' }), false);
  assert.equal(authEnabled({ GOOGLE_CLIENT_ID: 'a', GOOGLE_CLIENT_SECRET: 'b', AUTH_SECRET: 'c' }), true);
});

test('parseCookies reads the cookie header', () => {
  const cookies = parseCookies({ headers: { cookie: 'a=1; mkt_session=abc.def; b=2' } });
  assert.equal(cookies.mkt_session, 'abc.def');
  assert.equal(cookies.a, '1');
});

test('getSession validates cookie + domain', async () => {
  const env = { AUTH_SECRET: SECRET, AUTH_ALLOWED_DOMAIN: 'avalyst.com.br' };
  const cookie = await createSessionCookie({ email: 'bruna@avalyst.com.br', name: 'Bruna' }, env);
  const token = cookie.match(/mkt_session=([^;]+)/)[1];
  const req = { headers: { cookie: `${SESSION_COOKIE}=${token}` } };
  const session = await getSession(req, env);
  assert.equal(session.email, 'bruna@avalyst.com.br');

  // Sessão válida porém de domínio não permitido é rejeitada.
  const otherCookie = await createSessionCookie({ email: 'x@gmail.com' }, env);
  const otherToken = otherCookie.match(/mkt_session=([^;]+)/)[1];
  assert.equal(await getSession({ headers: { cookie: `${SESSION_COOKIE}=${otherToken}` } }, env), null);
});

test('requireAuth is open when unconfigured and gated when configured', async () => {
  assert.equal((await requireAuth({ headers: {} }, {})).ok, true); // dev/local aberto
  const env = { GOOGLE_CLIENT_ID: 'a', GOOGLE_CLIENT_SECRET: 'b', AUTH_SECRET: SECRET };
  assert.equal((await requireAuth({ headers: {} }, env)).ok, false); // sem cookie -> bloqueia
  const cookie = await createSessionCookie({ email: 'beatriz@avalyst.com.br' }, env);
  const token = cookie.match(/mkt_session=([^;]+)/)[1];
  const authed = await requireAuth({ headers: { cookie: `${SESSION_COOKIE}=${token}` } }, env);
  assert.equal(authed.ok, true);
  assert.equal(authed.session.email, 'beatriz@avalyst.com.br');
});
