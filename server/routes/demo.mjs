// The public demo: one click makes a visitor their own copy of the sample practice and signs them in.
import { createSession, sessionCookie } from '../auth.mjs';
import { createDemo } from '../demo.mjs';
import { fail, readJson } from '../http.mjs';
import { meShape, practiceShape } from '../shapes.mjs';

const DEMO_SESSION_HOURS = 12;
const MAX_LIVE_DEMOS = 500;
export const OWNER_NAME = 'You (practice owner)';
export const CLINICIAN_NAME = 'You (new clinician)';

function signIn(ctx, userId) {
  const token = createSession(ctx.db, userId, { hours: DEMO_SESSION_HOURS });
  ctx.headers['Set-Cookie'] = sessionCookie(token, { secure: ctx.app.secure, hours: DEMO_SESSION_HOURS });
  const user = ctx.db.prepare('SELECT * FROM users WHERE id = ?').get(userId);
  const practice = ctx.db.prepare('SELECT * FROM practices WHERE id = ?').get(user.practice_id);
  return { me: meShape(user), practice: practiceShape(practice) };
}

export default function register(router) {
  router.add('POST', '/api/demo/start', async (ctx) => {
    const body = await readJson(ctx.req);
    const as = body.as === 'owner' ? 'owner' : 'clinician';
    const key = `demo:${ctx.ip}`;
    if (ctx.app.demoLimiter.blocked(key)) fail(429, 'You’ve started a lot of demos. Try again in an hour.');
    const live = ctx.db.prepare('SELECT COUNT(*) AS n FROM practices WHERE is_demo = 1').get().n;
    if (live >= MAX_LIVE_DEMOS) fail(503, 'The demo is busy right now. Try again soon.');
    ctx.app.demoLimiter.fail(key);
    const demo = createDemo(ctx.db, ctx.app.dataDir);
    return signIn(ctx, as === 'owner' ? demo.owner : demo.clinician);
  });

  // Switch between the owner and the new clinician inside your own demo copy.
  router.add('POST', '/api/demo/switch', (ctx) => {
    if (!ctx.practice?.is_demo) fail(404, 'Not found.');
    const target = ctx.user.name === OWNER_NAME ? CLINICIAN_NAME : OWNER_NAME;
    const other = ctx.db.prepare('SELECT id FROM users WHERE practice_id = ? AND name = ? AND active = 1').get(ctx.user.practice_id, target);
    if (!other) fail(404, 'That demo account is gone. Start a new demo.');
    if (ctx.sessionToken) ctx.db.prepare('DELETE FROM sessions WHERE user_id = ?').run(ctx.user.id);
    return signIn(ctx, other.id);
  }, { auth: 'user' });
}

/** Call at the top of anything a demo visitor shouldn't do (uploads, invites, settings, passwords). */
export function notInDemo(ctx) {
  if (ctx.practice?.is_demo) fail(403, 'That’s turned off in the demo.');
}
