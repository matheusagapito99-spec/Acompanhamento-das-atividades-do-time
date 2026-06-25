const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const analyticsHandler = require('./api/analytics.js');
const healthHandler = require('./api/health.js');
const reportConfigHandler = require('./api/report-config.js');
const reportTestHandler = require('./api/report-test.js');
const reportRunHandler = require('./api/report-run.js');
const weeklyReportHandler = require('./api/cron/weekly-report.js');
const authLoginHandler = require('./api/auth/login.js');
const authCallbackHandler = require('./api/auth/callback.js');
const authLogoutHandler = require('./api/auth/logout.js');
const authMeHandler = require('./api/auth/me.js');

const PORT = Number(process.env.PORT || 4173);
const ROOT = __dirname;

const mime = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
};

function createVercelLikeResponse(res) {
  return {
    setHeader: (...args) => res.setHeader(...args),
    status(code) {
      res.statusCode = code;
      return this;
    },
    json(payload) {
      res.setHeader('Content-Type', 'application/json; charset=utf-8');
      res.end(JSON.stringify(payload));
    },
    end(...args) {
      res.end(...args);
    },
  };
}

function parseQuery(req) {
  const url = new URL(req.url, `http://${req.headers.host}`);
  req.query = Object.fromEntries(url.searchParams.entries());
  return url;
}

function serveStatic(url, res) {
  const pathname = url.pathname === '/' ? '/index.html' : url.pathname;
  const filePath = path.resolve(ROOT, `.${pathname}`);
  if (!filePath.startsWith(ROOT)) {
    res.writeHead(403);
    res.end('Forbidden');
    return;
  }
  if (!fs.existsSync(filePath) || fs.statSync(filePath).isDirectory()) {
    res.writeHead(404);
    res.end('Not found');
    return;
  }
  res.writeHead(200, { 'Content-Type': mime[path.extname(filePath)] || 'application/octet-stream' });
  fs.createReadStream(filePath).pipe(res);
}

const server = http.createServer(async (req, res) => {
  const url = parseQuery(req);
  if (url.pathname === '/api/health') return healthHandler(req, createVercelLikeResponse(res));
  if (url.pathname === '/api/analytics') return analyticsHandler(req, createVercelLikeResponse(res));
  if (url.pathname === '/api/report-config') return reportConfigHandler(req, createVercelLikeResponse(res));
  if (url.pathname === '/api/report-test') return reportTestHandler(req, createVercelLikeResponse(res));
  if (url.pathname === '/api/report-run') return reportRunHandler(req, createVercelLikeResponse(res));
  if (url.pathname === '/api/cron/weekly-report') return weeklyReportHandler(req, createVercelLikeResponse(res));
  if (url.pathname === '/api/auth/login') return authLoginHandler(req, createVercelLikeResponse(res));
  if (url.pathname === '/api/auth/callback') return authCallbackHandler(req, createVercelLikeResponse(res));
  if (url.pathname === '/api/auth/logout') return authLogoutHandler(req, createVercelLikeResponse(res));
  if (url.pathname === '/api/auth/me') return authMeHandler(req, createVercelLikeResponse(res));
  return serveStatic(url, res);
});

server.listen(PORT, () => {
  console.log(`Dashboard local: http://localhost:${PORT}`);
});
