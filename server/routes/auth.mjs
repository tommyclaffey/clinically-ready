// Sign in/out, signup (new practice), and invite acceptance.
import { notInDemo } from './demo.mjs';
import { mailOn, resetEmail, sendMail } from '../mail.mjs';
import {
  MIN_PASSWORD,
  RESET_HOURS,
  burnPasswordCheck,
  newToken,
  clearCookie,
  createSession,
  hashPassword,
  PASSWORD_SESSION_HOURS,
  sessionCookies,
  sha256,
  verifyPassword,
} from '../auth.mjs';
import { now, tx } from '../db.mjs';
import { fail, readJson } from '../http.mjs';
import { meShape, practiceShape, publicOrgShape, signInOf, termsOf } from '../shapes.mjs';
import * as v from '../validate.mjs';

const BAD_LOGIN = 'Email or password is incorrect.';

function signedIn(ctx, user) {
  const token = createSession(ctx.db, user.id, { hours: PASSWORD_SESSION_HOURS });
  ctx.db.prepare('UPDATE users SET last_seen_at = ? WHERE id = ?').run(now(), user.id);
  ctx.headers['Set-Cookie'] = sessionCookies(token, { secure: ctx.app.secure, hours: PASSWORD_SESSION_HOURS });
  const practice = ctx.db.prepare('SELECT * FROM practices WHERE id = ?').get(user.practice_id);
  return { me: meShape(user), practice: practiceShape(practice) };
}

function slugFor(db, name) {
  const base =
    name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 40) || 'practice';
  let slug = base;
  for (let i = 2; db.prepare('SELECT 1 FROM practices WHERE slug = ?').get(slug); i++) slug = `${base}-${i}`;
  return slug;
}

/** The user behind an unused, unexpired reset link, or null. */
function findReset(db, token) {
  return (
    db
      .prepare(
        `SELECT r.token_hash, u.* FROM password_resets r JOIN users u ON u.id = r.user_id
         WHERE r.token_hash = ? AND r.used_at IS NULL AND r.expires_at > ? AND u.active = 1`,
      )
      .get(sha256(token), now()) || null
  );
}

/** Pending, unexpired invite for a raw token, or null. */
function findInvite(db, token) {
  return (
    db
      .prepare('SELECT * FROM invites WHERE token_hash = ? AND accepted_at IS NULL AND expires_at > ?')
      .get(sha256(token), now()) || null
  );
}

export default function register(router) {
  router.add('POST', '/api/auth/login', async (ctx) => {
    const body = await readJson(ctx.req);
    const email = typeof body.email === 'string' ? body.email.trim().toLowerCase() : '';
    const password = typeof body.password === 'string' ? body.password : '';
    const key = `${email}|${ctx.ip}`;
    if (ctx.app.limiter.blocked(key)) fail(429, 'Too many sign-in attempts. Try again in 15 minutes.');
    if (email && ctx.app.accountLimiter.blocked(email)) fail(429, 'Too many sign-in attempts for this account. Try again in an hour.');

    const user = email ? ctx.db.prepare('SELECT * FROM users WHERE email = ?').get(email) : null;
    let ok = false;
    if (user && user.active) ok = await verifyPassword(password, user.password_hash);
    else await burnPasswordCheck(password);

    if (!ok) {
      ctx.app.limiter.fail(key);
      if (email) ctx.app.accountLimiter.fail(email);
      fail(401, BAD_LOGIN);
    }
    ctx.app.limiter.reset(key);
    // Only said after a correct password, so it never reveals which emails exist.
    const practice = ctx.db.prepare('SELECT * FROM practices WHERE id = ?').get(user.practice_id);
    if (!signInOf(practice).password) fail(403, 'Your organisation signs in with Google or Microsoft. Use those buttons instead.');
    return signedIn(ctx, user);
  });

  // Change (or first set) your own password. Needs the current one if you have one; signs out your
  // other devices afterwards, so a password someone else knew stops working everywhere.
  router.add('PUT', '/api/account/password', async (ctx) => {
    notInDemo(ctx);
    const body = await readJson(ctx.req);
    if (!signInOf(ctx.practice).password) fail(403, 'Your organisation has turned passwords off.');
    const key = `pw|${ctx.user.id}`;
    if (ctx.app.limiter.blocked(key)) fail(429, 'Too many attempts. Try again in 15 minutes.');
    if (ctx.user.password_hash) {
      const current = typeof body.current === 'string' ? body.current : '';
      if (!(await verifyPassword(current, ctx.user.password_hash))) {
        ctx.app.limiter.fail(key);
        fail(400, 'Your current password is incorrect.');
      }
    }
    const next = v.password(body.next, MIN_PASSWORD);
    if (ctx.user.password_hash && (await verifyPassword(next, ctx.user.password_hash))) fail(400, 'Choose a password you haven’t used here already.');
    ctx.app.limiter.reset(key);
    const hash = await hashPassword(next);
    tx(ctx.db, () => {
      ctx.db.prepare('UPDATE users SET password_hash = ? WHERE id = ?').run(hash, ctx.user.id);
      ctx.db.prepare('DELETE FROM sessions WHERE user_id = ? AND token_hash != ?').run(ctx.user.id, sha256(ctx.sessionToken || ''));
    });
    return { ok: true };
  }, { auth: 'user' });

  router.add('POST', '/api/auth/logout', (ctx) => {
    if (ctx.sessionToken) ctx.db.prepare('DELETE FROM sessions WHERE token_hash = ?').run(sha256(ctx.sessionToken));
    ctx.headers['Set-Cookie'] = clearCookie({ secure: ctx.app.secure });
    return { ok: true };
  });

  router.add('GET', '/api/me', (ctx) => ({ me: meShape(ctx.user), practice: practiceShape(ctx.practice) }), {
    auth: 'user',
  });

  router.add('POST', '/api/signup', async (ctx) => {
    if (!ctx.app.signupOpen) fail(403, 'Sign-ups aren’t open yet. Ask your organisation for an invite.');
    const body = await readJson(ctx.req);
    const practiceName = v.text(body.practiceName, 'Practice name', { max: 120 });
    const name = v.text(body.name, 'Your name', { max: 120 });
    const email = v.email(body.email);
    const password = v.password(body.password, MIN_PASSWORD);
    if (ctx.db.prepare('SELECT 1 FROM users WHERE email = ?').get(email)) {
      fail(409, 'That email already has an account. Sign in instead.');
    }
    const hash = await hashPassword(password);
    const user = tx(ctx.db, () => {
      const t = now();
      const p = ctx.db
        .prepare('INSERT INTO practices(name, slug, created_at) VALUES (?,?,?)')
        .run(practiceName, slugFor(ctx.db, practiceName), t);
      const u = ctx.db
        .prepare(
          `INSERT INTO users(practice_id, email, name, title, role, password_hash, active, created_at)
           VALUES (?,?,?,?, 'owner', ?, 1, ?)`,
        )
        .run(p.lastInsertRowid, email, name, 'Owner', hash, t);
      return ctx.db.prepare('SELECT * FROM users WHERE id = ?').get(u.lastInsertRowid);
    });
    return signedIn(ctx, user);
  });

  // Branded sign-in page: /signin?org=<slug>. Public, so it returns only what the page shows.
  router.add('GET', '/api/orgs/:slug', (ctx) => {
    const p = ctx.db.prepare('SELECT * FROM practices WHERE slug = ?').get(String(ctx.params.slug).toLowerCase());
    if (!p) fail(404, 'No organisation at that address.');
    return publicOrgShape(p);
  });

  router.add('GET', '/api/invites/:token', (ctx) => {
    const invite = findInvite(ctx.db, ctx.params.token);
    if (!invite) fail(404, 'This invite link is invalid or has expired.');
    const practice = ctx.db.prepare('SELECT * FROM practices WHERE id = ?').get(invite.practice_id);
    return { email: invite.email, name: invite.name || '', practiceName: practice.name, terms: termsOf(practice), org: publicOrgShape(practice) };
  });

  // Forgot Password (Nov 19). Always the same answer, whether or not the email has an account, so it never reveals who
  // does. When mail is on and the account can use a password, a single-use link goes out (newer cancels older).
  router.add('POST', '/api/auth/forgot', async (ctx) => {
    const body = await readJson(ctx.req);
    const email = typeof body.email === 'string' ? body.email.trim().toLowerCase().slice(0, 254) : '';
    if (!mailOn(ctx.app)) return { ok: true, sent: false };
    if (!email || !email.includes('@')) fail(400, 'Enter the email you sign in with.');
    // 30 an hour per network (a whole office shares one address)
    if (ctx.app.mailLimiter.blocked(`forgot-ip|${ctx.ip}`)) fail(429, 'We’ve sent a few links already. Check your inbox, or try again in an hour.');
    ctx.app.mailLimiter.fail(`forgot-ip|${ctx.ip}`);
    // Nov 19 (security review): the answer goes back at once and the email goes out in the background, so the time it
    // takes never shows whether the account exists. Over 3 links an hour for one email, the extras are quietly not sent
    // (no error), so a stranger can't tell or prove they've used up someone's links.
    const user = ctx.db.prepare('SELECT * FROM users WHERE email = ? AND active = 1').get(email);
    const practice = user && ctx.db.prepare('SELECT * FROM practices WHERE id = ?').get(user.practice_id);
    if (user && practice && !practice.is_demo && signInOf(practice).password && !ctx.app.resetLimiter.blocked(`forgot|${email}`)) {
      ctx.app.resetLimiter.fail(`forgot|${email}`);
      const token = newToken();
      tx(ctx.db, () => {
        ctx.db.prepare('DELETE FROM password_resets WHERE user_id = ? AND used_at IS NULL').run(user.id);
        ctx.db
          .prepare('INSERT INTO password_resets(token_hash, user_id, created_at, expires_at) VALUES (?,?,?,?)')
          .run(sha256(token), user.id, now(), new Date(Date.now() + RESET_HOURS * 3600_000).toISOString());
      });
      const mail = resetEmail({ name: user.name, practice: practice.name, url: `${ctx.app.publicOrigin}/reset/${token}`, hours: RESET_HOURS });
      sendMail({ to: user.email, ...mail }).catch((e) => console.error('reset email', e.message));
    }
    return { ok: true, sent: true };
  });

  router.add('GET', '/api/auth/reset/:token', (ctx) => {
    const user = findReset(ctx.db, ctx.params.token);
    if (!user) fail(404, 'This reset link has expired or was already used.');
    const practice = ctx.db.prepare('SELECT * FROM practices WHERE id = ?').get(user.practice_id);
    return { email: user.email, practiceName: practice.name, org: publicOrgShape(practice) };
  });

  router.add('POST', '/api/auth/reset/:token', async (ctx) => {
    const body = await readJson(ctx.req);
    const found = findReset(ctx.db, ctx.params.token);
    if (!found) fail(404, 'This reset link has expired or was already used.');
    const practice = ctx.db.prepare('SELECT * FROM practices WHERE id = ?').get(found.practice_id);
    if (!signInOf(practice).password) fail(403, 'Your organisation signs in with Google or Microsoft. Use those buttons instead.');
    const password = v.password(body.password, MIN_PASSWORD);
    const hash = await hashPassword(password);
    tx(ctx.db, () => {
      // Re-check inside the transaction so a link can only be used once.
      const claimed = ctx.db
        .prepare('UPDATE password_resets SET used_at = ? WHERE token_hash = ? AND used_at IS NULL')
        .run(now(), found.token_hash);
      if (claimed.changes !== 1) fail(404, 'This reset link has expired or was already used.');
      ctx.db.prepare('UPDATE users SET password_hash = ? WHERE id = ?').run(hash, found.id);
      ctx.db.prepare('DELETE FROM sessions WHERE user_id = ?').run(found.id); // signed out everywhere
      ctx.db.prepare('DELETE FROM password_resets WHERE user_id = ? AND used_at IS NULL').run(found.id);
    });
    ctx.app.limiter.reset(`${found.email}|${ctx.ip}`);
    const user = ctx.db.prepare('SELECT * FROM users WHERE id = ?').get(found.id);
    return signedIn(ctx, user);
  });

  router.add('POST', '/api/invites/:token/accept', async (ctx) => {
    const body = await readJson(ctx.req);
    const invite = findInvite(ctx.db, ctx.params.token);
    if (!invite) fail(404, 'This invite link is invalid or has expired.');
    const practice = ctx.db.prepare('SELECT * FROM practices WHERE id = ?').get(invite.practice_id);
    if (!signInOf(practice).password) fail(403, 'This organisation signs in with Google or Microsoft. Use those buttons instead.');
    const name = v.text(body.name ?? invite.name, 'Your name', { max: 120 });
    const password = v.password(body.password, MIN_PASSWORD);
    const hash = await hashPassword(password);
    const user = tx(ctx.db, () => {
      // Re-check inside the transaction so a token can only be used once.
      const claimed = ctx.db
        .prepare('UPDATE invites SET accepted_at = ? WHERE token_hash = ? AND accepted_at IS NULL')
        .run(now(), invite.token_hash);
      if (claimed.changes !== 1) fail(404, 'This invite link is invalid or has expired.');
      if (ctx.db.prepare('SELECT 1 FROM users WHERE email = ?').get(invite.email)) {
        fail(409, 'That email already has an account. Sign in instead.');
      }
      const u = ctx.db
        .prepare(
          `INSERT INTO users(practice_id, email, name, title, role, password_hash, active, created_at, track_id)
           VALUES (?,?,?,?,?,?,1,?,?)`,
        )
        .run(invite.practice_id, invite.email, name, invite.title || '', invite.role, hash, now(), invite.track_id ?? null);
      return ctx.db.prepare('SELECT * FROM users WHERE id = ?').get(u.lastInsertRowid);
    });
    return signedIn(ctx, user);
  });
}
