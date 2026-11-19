// Error alerts (Nov 19, launch Gate A, App Buildout Standard stage 3), the same way as Mise: no outside account.
//   • Server errors (500s) and browser errors are kept in the `errors` table for 90 days.
//   • GET /api/ops/errors?hours=24 (Authorization: Bearer OPS_TOKEN) says how many came in. The nightly GitHub Action
//     (.github/workflows/ops.yml) fails when any did, and GitHub emails Tommy. An hourly run checks /healthz.
//   • Without OPS_TOKEN on the server the ops route answers 404.
// Messages are cut short and never include request bodies, so no one's answers or paperwork end up in the log.
import { timingSafeEqual } from 'node:crypto';
import { now } from '../db.mjs';
import { fail, readJson } from '../http.mjs';
import { LoginLimiter } from '../auth.mjs';

const KEEP_DAYS = 90;
const cut = (s, n) => String(s ?? '').replace(/[\r\n]+/g, ' ').slice(0, n);
const browserLimiter = new LoginLimiter({ max: 20, windowMs: 60 * 60 * 1000 });

export function logError(db, { kind = 'server', message, stack = '', path = '', userId = null, practiceId = null }) {
  try {
    db.prepare('INSERT INTO errors(at, kind, message, stack, path, user_id, practice_id) VALUES (?,?,?,?,?,?,?)')
      .run(now(), kind, cut(message, 500), String(stack || '').slice(0, 2000), cut(path, 300), userId, practiceId);
  } catch (e) {
    console.error('could not log error', e.message);
  }
}

export function purgeErrors(db) {
  db.prepare('DELETE FROM errors WHERE at < ?').run(new Date(Date.now() - KEEP_DAYS * 864e5).toISOString());
}

function opsAllowed(ctx) {
  const want = process.env.OPS_TOKEN;
  if (!want) fail(404, 'Not found.');
  const got = String(ctx.req.headers.authorization || '').replace(/^Bearer\s+/i, '');
  const a = Buffer.from(got), b = Buffer.from(want);
  if (a.length !== b.length || !timingSafeEqual(a, b)) fail(404, 'Not found.');
}

export default function register(router) {
  // The browser reports its own errors (src/lib/errors.ts). Anyone may send one; 20 an hour per address.
  router.add('POST', '/api/client-errors', async (ctx) => {
    if (browserLimiter.blocked(ctx.ip)) return { ok: true };
    browserLimiter.fail(ctx.ip);
    const b = await readJson(ctx.req);
    logError(ctx.db, { kind: 'browser', message: b.message, stack: b.stack, path: b.path, userId: ctx.user?.id ?? null, practiceId: ctx.user?.practice_id ?? null });
    return { ok: true };
  }, { optionalUser: true });

  router.add('GET', '/api/ops/errors', (ctx) => {
    opsAllowed(ctx);
    const hours = Math.min(Math.max(Number(ctx.query.get('hours')) || 24, 1), 24 * 30);
    const since = new Date(Date.now() - hours * 3600e3).toISOString();
    const rows = ctx.db.prepare('SELECT at, kind, message, path FROM errors WHERE at > ? ORDER BY id DESC LIMIT 20').all(since);
    const count = ctx.db.prepare('SELECT COUNT(*) n FROM errors WHERE at > ?').get(since).n;
    return { hours, count, recent: rows };
  });
}
