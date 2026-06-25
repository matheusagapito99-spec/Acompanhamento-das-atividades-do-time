/* =========================================================================
   Autenticação — login Google restrito a um domínio (@avalyst.com.br).
   Sem dependências externas: sessão assinada com HMAC via Web Crypto
   (disponível no runtime Node da Vercel) e validação do ID token do Google
   pelo endpoint tokeninfo. A auth só é exigida quando GOOGLE_CLIENT_ID e
   AUTH_SECRET estão configurados (em dev local, fica aberta).
   ========================================================================= */

const SESSION_COOKIE = 'mkt_session';
const STATE_COOKIE = 'mkt_oauth_state';
const SESSION_TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7 dias
const DEFAULT_ALLOWED_DOMAIN = 'avalyst.com.br';

const encoder = new TextEncoder();

function getCrypto() {
  const c = globalThis.crypto;
  if (!c || !c.subtle) throw new Error('Web Crypto indisponivel neste runtime.');
  return c;
}

function b64urlFromBytes(bytes) {
  return Buffer.from(bytes).toString('base64url');
}

function bytesFromB64url(value) {
  return Buffer.from(String(value || ''), 'base64url');
}

async function hmacKey(secret) {
  return getCrypto().subtle.importKey(
    'raw',
    encoder.encode(String(secret || '')),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign', 'verify'],
  );
}

async function signSession(payload, secret) {
  const body = b64urlFromBytes(encoder.encode(JSON.stringify(payload)));
  const key = await hmacKey(secret);
  const signature = await getCrypto().subtle.sign('HMAC', key, encoder.encode(body));
  return `${body}.${b64urlFromBytes(signature)}`;
}

async function verifySession(token, secret) {
  const [body, signature] = String(token || '').split('.');
  if (!body || !signature) return null;
  const key = await hmacKey(secret);
  let valid = false;
  try {
    valid = await getCrypto().subtle.verify('HMAC', key, bytesFromB64url(signature), encoder.encode(body));
  } catch {
    return null;
  }
  if (!valid) return null;
  let payload;
  try {
    payload = JSON.parse(bytesFromB64url(body).toString('utf8'));
  } catch {
    return null;
  }
  if (payload.exp && Date.now() > Number(payload.exp)) return null;
  return payload;
}

function getAllowedDomain(env = process.env) {
  return (env.AUTH_ALLOWED_DOMAIN || DEFAULT_ALLOWED_DOMAIN).toLowerCase().trim();
}

function isAllowedEmail(email, env = process.env) {
  const value = String(email || '').toLowerCase().trim();
  const domain = getAllowedDomain(env);
  return /^[^\s@]+@[^\s@]+$/.test(value) && value.endsWith(`@${domain}`);
}

function authEnabled(env = process.env) {
  return Boolean(env.GOOGLE_CLIENT_ID && env.GOOGLE_CLIENT_SECRET && env.AUTH_SECRET);
}

function parseCookies(req) {
  const header = req.headers?.cookie || '';
  return header.split(';').reduce((acc, part) => {
    const index = part.indexOf('=');
    if (index < 0) return acc;
    const name = part.slice(0, index).trim();
    const value = part.slice(index + 1).trim();
    if (name) acc[name] = decodeURIComponent(value);
    return acc;
  }, {});
}

function serializeCookie(name, value, { maxAgeMs, secure = true } = {}) {
  const parts = [`${name}=${encodeURIComponent(value)}`, 'Path=/', 'HttpOnly', 'SameSite=Lax'];
  if (secure) parts.push('Secure');
  if (maxAgeMs === 0) parts.push('Max-Age=0');
  else if (maxAgeMs) parts.push(`Max-Age=${Math.floor(maxAgeMs / 1000)}`);
  return parts.join('; ');
}

async function getSession(req, env = process.env) {
  if (!env.AUTH_SECRET) return null;
  const cookies = parseCookies(req);
  const token = cookies[SESSION_COOKIE];
  if (!token) return null;
  const payload = await verifySession(token, env.AUTH_SECRET);
  if (!payload || !isAllowedEmail(payload.email, env)) return null;
  return payload;
}

async function createSessionCookie(user, env = process.env, { now = Date.now() } = {}) {
  const payload = {
    email: String(user.email || '').toLowerCase(),
    name: user.name || '',
    picture: user.picture || '',
    exp: now + SESSION_TTL_MS,
  };
  const token = await signSession(payload, env.AUTH_SECRET);
  return serializeCookie(SESSION_COOKIE, token, { maxAgeMs: SESSION_TTL_MS });
}

function clearSessionCookie() {
  return serializeCookie(SESSION_COOKIE, '', { maxAgeMs: 0 });
}

// Para proteger handlers de API. Resolve { ok, session } ou { ok:false }.
// Quando a auth não está configurada (dev local), libera o acesso.
async function requireAuth(req, env = process.env) {
  if (!authEnabled(env)) return { ok: true, open: true, session: null };
  const session = await getSession(req, env);
  return session ? { ok: true, session } : { ok: false };
}

module.exports = {
  SESSION_COOKIE,
  STATE_COOKIE,
  SESSION_TTL_MS,
  authEnabled,
  isAllowedEmail,
  getAllowedDomain,
  signSession,
  verifySession,
  parseCookies,
  serializeCookie,
  getSession,
  createSessionCookie,
  clearSessionCookie,
  requireAuth,
};
