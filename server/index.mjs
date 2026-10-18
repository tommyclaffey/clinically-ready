// Entry point: startServer() for tests and `node server/index.mjs` for dev/production.
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { LoginLimiter, SESSION_COOKIE, sessionUser } from './auth.mjs';
import { now, openDb } from './db.mjs';
import { HttpError, Router, drain, parseCookies, sendJson } from './http.mjs';
import registerAdmin from './routes/admin.mjs';
import registerAuth from './routes/auth.mjs';
import registerOauth from './routes/oauth.mjs';
import registerMessages from './routes/messages.mjs';
import { loadProviders } from './oidc.mjs';
import { s3FromEnv } from './s3.mjs';
import { scheduleBackups } from './backup.mjs';
import registerFiles, { backfillPreviews } from './routes/files.mjs';
import registerLearner from './routes/learner.mjs';
import registerPaperwork from './routes/paperwork.mjs';
import registerPeople from './routes/people.mjs';
import registerVideos from './routes/videos.mjs';
import registerApps from './routes/apps.mjs';
import registerSectionQuiz from './routes/sectionquiz.mjs';
import registerDemo from './routes/demo.mjs';
import { scheduleDemoSweep } from './demo.mjs';
import { paperworkKeyFromEnv } from './vault.mjs';
import { cardExists, practiceForUrl, renderIndex, shareTags } from './share.mjs';
import { serveStatic } from './static.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const WRITE_METHODS = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);
const SECURITY_HEADERS = {
  'X-Content-Type-Options': 'nosniff',
  'Referrer-Policy': 'same-origin',
  'X-Frame-Options': 'DENY',
};

function buildRouter() {
  const router = new Router();
  registerAuth(router);
  registerOauth(router);
  registerMessages(router);
  registerLearner(router);
  registerFiles(router);
  registerAdmin(router);
  registerPaperwork(router);
  registerPeople(router);
  registerVideos(router);
  registerApps(router);
  registerSectionQuiz(router);
  registerDemo(router);
  return router;
}

/** CSRF guard: custom header (forces a CORS preflight we never grant) + same-origin check. */
function writeAllowed(req) {
  if (req.headers['x-coa'] !== '1') return false;
  const origin = req.headers.origin;
  if (origin === undefined) return true;
  try {
    return new URL(origin).host === req.headers.host;
  } catch {
    return false;
  }
}

function clientIp(req, trustProxy) {
  const fwd = trustProxy && req.headers['x-forwarded-for'];
  return (fwd ? String(fwd).split(',')[0].trim() : req.socket.remoteAddress) || 'unknown';
}

const ROLE_OK = {
  user: () => true,
  admin: (role) => role === 'owner' || role === 'admin',
  owner: (role) => role === 'owner',
};

async function handleApi(app, router, req, res, url) {
  if (WRITE_METHODS.has(req.method) && !writeAllowed(req)) {
    throw new HttpError(403, 'This request was blocked for your security. Reload the page and try again.');
  }
  const found = router.match(req.method, url.pathname);
  if (!found) throw new HttpError(404, 'Not found.');
  const { route, params } = found;

  const cookies = parseCookies(req.headers.cookie);
  const sessionToken = cookies[SESSION_COOKIE] || null;
  const ctx = {
    app,
    db: app.db,
    req,
    res,
    params,
    query: url.searchParams,
    headers: {},
    ip: clientIp(req, app.trustProxy),
    sessionToken,
    cookies,
    user: null,
    practice: null,
  };

  if (!route.opts.auth && route.opts.optionalUser) {
    // Public route that behaves differently when signed in (e.g. "Connect Google").
    ctx.user = sessionUser(app.db, sessionToken);
  }
  if (route.opts.auth) {
    const user = sessionUser(app.db, sessionToken);
    if (!user) throw new HttpError(401, 'Please sign in.');
    if (!ROLE_OK[route.opts.auth](user.role)) throw new HttpError(403, "You don't have access to that.");
    ctx.user = user;
    ctx.practice = app.db.prepare('SELECT * FROM practices WHERE id = ?').get(user.practice_id);
    // Throttled so every request doesn't write.
    if (!user.last_seen_at || Date.now() - Date.parse(user.last_seen_at) > 5 * 60 * 1000) {
      app.db.prepare('UPDATE users SET last_seen_at = ? WHERE id = ?').run(now(), user.id);
    }
  }

  const result = await route.handler(ctx);
  if (!res.headersSent) sendJson(res, 200, result ?? { ok: true }, ctx.headers);
}

export function startServer({
  port = 4500,
  dataDir = path.join(ROOT, 'data'),
  host = '127.0.0.1',
  production = process.env.NODE_ENV === 'production',
  distDir = path.join(ROOT, 'dist'),
  // Public sign-up is closed in production unless SIGNUP_OPEN=1, so strangers can't create organisations.
  signupOpen = !production || process.env.SIGNUP_OPEN === '1',
  // Google/Microsoft sign-in: from env (GOOGLE_CLIENT_ID/SECRET, MICROSOFT_CLIENT_ID/SECRET), or test overrides.
  oidc = null,
  publicOrigin = process.env.PUBLIC_ORIGIN ? process.env.PUBLIC_ORIGIN.replace(/\/+$/, '') : '',
  // Backups go to an S3 bucket when BACKUP_S3_* is set (tests pass their own client and skip the schedule).
  s3 = s3FromEnv(),
  backups = production,
} = {}) {
  const hasCard = cardExists(distDir);
  const app = {
    db: openDb(dataDir),
    dataDir,
    secure: production,
    trustProxy: process.env.TRUST_PROXY === '1',
    limiter: new LoginLimiter(),
    demoLimiter: new LoginLimiter({ max: 12, windowMs: 60 * 60 * 1000 }),
    signupOpen,
    oidc: loadProviders(process.env, oidc),
    publicOrigin,
    s3,
    // Encrypts handed-in tax/employment forms. Production needs PAPERWORK_KEY; dev/tests use a throwaway key.
    paperworkKey: paperworkKeyFromEnv(process.env, { production }),
  };
  const stopBackups = s3 && backups ? scheduleBackups({ db: app.db, dataDir, s3 }) : null;
  const stopDemoSweep = scheduleDemoSweep(app.db, dataDir, () => {});
  const stopBackfill = backfillPreviews(app.db, dataDir);
  if (production && !s3) console.warn('No BACKUP_S3_* variables: backups are OFF.');
  const router = buildRouter();

  const server = http.createServer(async (req, res) => {
    for (const [k, val] of Object.entries(SECURITY_HEADERS)) res.setHeader(k, val);
    let url;
    try {
      url = new URL(req.url, 'http://localhost');
    } catch {
      return sendJson(res, 400, { error: 'Bad request.' });
    }
    try {
      if (url.pathname === '/healthz') return sendJson(res, 200, { ok: true });
      if (url.pathname === '/api' || url.pathname.startsWith('/api/')) {
        return await handleApi(app, router, req, res, url);
      }
      if (production && serveStatic(req, res, url.pathname, distDir, {
        indexHtml: (html) => renderIndex(html, shareTags({
          practice: practiceForUrl(app.db, url),
          origin: app.publicOrigin || `${app.secure ? 'https' : 'http'}://${req.headers.host}`,
          url,
          imageFor: hasCard,
        })),
      })) return;
      sendJson(res, 404, { error: 'Not found.' });
    } catch (err) {
      const status = err instanceof HttpError ? err.status : 500;
      if (status === 500) console.error(err);
      if (res.headersSent) return res.destroy();
      // Drain an unread body so the client sees this reply, not a broken pipe; hang up if it's huge.
      if (!req.tooLarge) await drain(req);
      const extra = req.complete ? {} : { Connection: 'close' };
      sendJson(res, status, { ...(status !== 500 && err.data ? err.data : {}), error: status === 500 ? 'Something went wrong on our side.' : err.message }, extra);
    }
  });

  return new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(port, host, () => {
      const close = () =>
        new Promise((done) => {
          stopBackups?.();
          stopDemoSweep();
          stopBackfill();
          server.close(() => {
            app.db.close();
            done();
          });
          server.closeAllConnections();
        });
      resolve({ server, port: server.address().port, close, app });
    });
  });
}

// CLI entry: `node server/index.mjs`
if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  const production = process.env.NODE_ENV === 'production';
  const { port } = await startServer({
    port: Number(process.env.PORT) || 4500,
    host: process.env.HOST || (production ? '0.0.0.0' : '127.0.0.1'),
    dataDir: process.env.DATA_DIR ? path.resolve(process.env.DATA_DIR) : undefined,
  });
  console.log(`Clinical Onboarding API on http://${production ? '0.0.0.0' : '127.0.0.1'}:${port}${production ? ' (production)' : ''}`);
}
