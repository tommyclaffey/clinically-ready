// "Continue with Google / Microsoft". Invites still decide who gets in:
//   • Invite link + provider account whose email matches the invite  -> account created and linked
//   • Provider account already linked to a user                      -> signed in
//   • Verified Google email that matches an existing user            -> linked, signed in
//   • Signed-in user pressing "Connect" on the Account page           -> linked to them
// Anything else is refused with a plain reason on the sign-in page.
import { createSession, newToken, sessionCookie, sha256, SSO_SESSION_HOURS } from '../auth.mjs';
import { now, tx } from '../db.mjs';
import { fail } from '../http.mjs';
import { authorizeUrl, emailOf, exchangeCode, newVerifier, OidcError, verifyIdToken } from '../oidc.mjs';
import { signInOf } from '../shapes.mjs';

const STATE_COOKIE = 'coa_oauth';
const STATE_MINUTES = 10;

/** Only same-site paths, never "//evil.com" or "https://…". */
export function safeNext(next) {
  return typeof next === 'string' && /^\/(?!\/)[\w\-./?=&%#]*$/.test(next) ? next : '/';
}

function origin(ctx) {
  if (ctx.app.publicOrigin) return ctx.app.publicOrigin;
  if (ctx.app.secure) fail(503, 'Sign-in with Google or Microsoft needs PUBLIC_ORIGIN set on the server.');
  return `http://${ctx.req.headers.host}`; // local dev only
}

const redirectUri = (ctx, provider) => `${origin(ctx)}/api/auth/oauth/${provider}/callback`;

function redirect(ctx, location, cookies = []) {
  const headers = { Location: location, 'Cache-Control': 'no-store' };
  const all = [...cookies, ...(ctx.headers['Set-Cookie'] ? [ctx.headers['Set-Cookie']] : [])];
  if (all.length) headers['Set-Cookie'] = all;
  ctx.res.writeHead(302, headers);
  ctx.res.end();
}

function stateCookie(value, { secure, maxAge }) {
  return `${STATE_COOKIE}=${value}; HttpOnly; SameSite=Lax; Path=/api/auth/oauth; Max-Age=${maxAge}${secure ? '; Secure' : ''}`;
}

/** Back to the sign-in page with a reason code the front end turns into a sentence. */
function refuse(ctx, code, org) {
  const q = new URLSearchParams({ error: code });
  if (org) q.set('org', org);
  redirect(ctx, `/signin?${q}`, [stateCookie('', { secure: ctx.app.secure, maxAge: 0 })]);
}

function provider(ctx) {
  const name = ctx.params.provider;
  const p = ctx.app.oidc[name];
  if (!p) fail(404, 'That sign-in method isn’t set up.');
  return [name, p];
}

const practiceOf = (db, id) => db.prepare('SELECT * FROM practices WHERE id = ?').get(id);

function link(db, name, claims, email, userId) {
  db.prepare('INSERT INTO user_identities(provider, subject, user_id, email, created_at) VALUES (?,?,?,?,?)').run(
    name, claims.sub, userId, email, now(),
  );
}

export default function register(router) {
  router.add('GET', '/api/auth/providers', (ctx) => ({
    google: Boolean(ctx.app.oidc.google),
    microsoft: Boolean(ctx.app.oidc.microsoft),
  }));

  // Step 1: remember who's asking (state + PKCE verifier + nonce), then send them to the provider.
  router.add('GET', '/api/auth/oauth/:provider/start', (ctx) => {
    const [name, p] = provider(ctx);
    const inviteToken = ctx.query.get('invite');
    const linking = ctx.query.get('link') === '1';
    if (linking && !ctx.user) fail(401, 'Sign in first.');
    const state = newToken();
    const verifier = newVerifier();
    const nonce = newToken();
    ctx.db
      .prepare(
        `INSERT INTO oauth_states(state_hash, provider, verifier, nonce, invite_hash, link_user_id, next, created_at, expires_at)
         VALUES (?,?,?,?,?,?,?,?,?)`,
      )
      .run(
        sha256(state), name, verifier, nonce,
        inviteToken ? sha256(inviteToken) : null,
        linking ? ctx.user.id : null,
        safeNext(ctx.query.get('next') || (linking ? '/account' : '/')),
        now(), new Date(Date.now() + STATE_MINUTES * 60_000).toISOString(),
      );
    // Housekeeping: abandoned attempts.
    ctx.db.prepare('DELETE FROM oauth_states WHERE expires_at < ?').run(now());
    redirect(ctx, authorizeUrl(p, { redirectUri: redirectUri(ctx, name), state, nonce, verifier }), [
      stateCookie(state, { secure: ctx.app.secure, maxAge: STATE_MINUTES * 60 }),
    ]);
  }, { auth: undefined, optionalUser: true });

  // Step 2: the provider sends them back with a one-time code.
  router.add('GET', '/api/auth/oauth/:provider/callback', async (ctx) => {
    const [name, p] = provider(ctx);
    const state = ctx.query.get('state') || '';
    const cookieState = ctx.cookies[STATE_COOKIE] || '';
    // The state must match this browser's cookie (stops someone pasting their callback URL into your browser).
    if (!state || state !== cookieState) return refuse(ctx, 'state');
    const row = ctx.db.prepare('SELECT * FROM oauth_states WHERE state_hash = ? AND provider = ?').get(sha256(state), name);
    ctx.db.prepare('DELETE FROM oauth_states WHERE state_hash = ?').run(sha256(state)); // one use
    if (!row || row.expires_at < now()) return refuse(ctx, 'state');
    if (ctx.query.get('error')) return refuse(ctx, 'cancelled'); // they closed or declined the provider page
    const code = ctx.query.get('code');
    if (!code) return refuse(ctx, 'state');

    let claims;
    try {
      const idToken = await exchangeCode(p, { code, redirectUri: redirectUri(ctx, name), verifier: row.verifier });
      claims = await verifyIdToken(p, idToken, { nonce: row.nonce });
    } catch (err) {
      if (err instanceof OidcError) return refuse(ctx, 'provider');
      throw err;
    }
    const { email, trusted } = emailOf(name, claims);
    const linked = ctx.db
      .prepare('SELECT u.* FROM user_identities i JOIN users u ON u.id = i.user_id WHERE i.provider = ? AND i.subject = ?')
      .get(name, claims.sub);

    // A. "Connect Google/Microsoft" from the Account page.
    if (row.link_user_id) {
      if (linked && linked.id !== row.link_user_id) return refuse(ctx, 'taken');
      if (!linked) link(ctx.db, name, claims, email, row.link_user_id);
      return redirect(ctx, `${row.next}${row.next.includes('?') ? '&' : '?'}connected=${name}`, [
        stateCookie('', { secure: ctx.app.secure, maxAge: 0 }),
      ]);
    }

    let user = null;
    if (row.invite_hash) {
      // B. Accepting an invite.
      const invite = ctx.db
        .prepare('SELECT * FROM invites WHERE token_hash = ? AND accepted_at IS NULL AND expires_at > ?')
        .get(row.invite_hash, now());
      if (!invite) return refuse(ctx, 'invite');
      const practice = practiceOf(ctx.db, invite.practice_id);
      if (!signInOf(practice)[name]) return refuse(ctx, 'not_allowed', practice.slug);
      if (name === 'google' && !trusted) return refuse(ctx, 'unverified', practice.slug);
      if (!email || email !== String(invite.email).toLowerCase()) return refuse(ctx, 'email_mismatch', practice.slug);
      if (linked) return refuse(ctx, 'taken', practice.slug);
      try {
        user = tx(ctx.db, () => {
          const claimed = ctx.db
            .prepare('UPDATE invites SET accepted_at = ? WHERE token_hash = ? AND accepted_at IS NULL')
            .run(now(), invite.token_hash);
          if (claimed.changes !== 1) throw new OidcError('invite');
          if (ctx.db.prepare('SELECT 1 FROM users WHERE email = ?').get(invite.email)) throw new OidcError('exists');
          const name_ = (invite.name || claims.name || email.split('@')[0]).slice(0, 120);
          const u = ctx.db
            .prepare(
              `INSERT INTO users(practice_id, email, name, title, role, password_hash, active, created_at, track_id)
               VALUES (?,?,?,?,?,NULL,1,?,?)`,
            )
            .run(invite.practice_id, invite.email, name_, invite.title || '', invite.role, now(), invite.track_id ?? null);
          link(ctx.db, name, claims, email, u.lastInsertRowid);
          return ctx.db.prepare('SELECT * FROM users WHERE id = ?').get(u.lastInsertRowid);
        });
      } catch (err) {
        if (err instanceof OidcError) return refuse(ctx, err.code, practice.slug);
        throw err;
      }
    } else if (linked) {
      // C. Returning user.
      user = linked;
    } else if (trusted) {
      // D. First Google sign-in for someone who already has an account under that verified email.
      user = ctx.db.prepare('SELECT * FROM users WHERE email = ?').get(email) || null;
      if (user && user.active) link(ctx.db, name, claims, email, user.id);
    }

    if (!user) return refuse(ctx, 'no_account');
    const practice = practiceOf(ctx.db, user.practice_id);
    if (!user.active) return refuse(ctx, 'inactive', practice.slug);
    if (!signInOf(practice)[name]) return refuse(ctx, 'not_allowed', practice.slug);

    const token = createSession(ctx.db, user.id, { hours: SSO_SESSION_HOURS });
    ctx.db.prepare('UPDATE users SET last_seen_at = ? WHERE id = ?').run(now(), user.id);
    return redirect(ctx, row.next, [
      sessionCookie(token, { secure: ctx.app.secure, hours: SSO_SESSION_HOURS }),
      stateCookie('', { secure: ctx.app.secure, maxAge: 0 }),
    ]);
  });

  // Account page: which sign-ins this user has, and unlinking one.
  router.add('GET', '/api/account', (ctx) => {
    const ids = ctx.db.prepare('SELECT provider, email, created_at FROM user_identities WHERE user_id = ? ORDER BY provider').all(ctx.user.id);
    return {
      email: ctx.user.email,
      hasPassword: Boolean(ctx.user.password_hash),
      identities: ids.map((i) => ({ provider: i.provider, email: i.email || '', connectedAt: i.created_at })),
      available: { google: Boolean(ctx.app.oidc.google), microsoft: Boolean(ctx.app.oidc.microsoft) },
      allowed: signInOf(ctx.practice),
    };
  }, { auth: 'user' });

  router.add('DELETE', '/api/account/identities/:provider', (ctx) => {
    const name = ctx.params.provider;
    const ids = ctx.db.prepare('SELECT provider FROM user_identities WHERE user_id = ?').all(ctx.user.id).map((r) => r.provider);
    if (!ids.includes(name)) fail(404, 'That sign-in isn’t connected.');
    const allowed = signInOf(ctx.practice);
    const remaining = ids.filter((p) => p !== name && allowed[p]).length + (ctx.user.password_hash && allowed.password ? 1 : 0);
    if (remaining === 0) fail(400, 'This is your only way to sign in. Connect another one first.');
    ctx.db.prepare('DELETE FROM user_identities WHERE user_id = ? AND provider = ?').run(ctx.user.id, name);
    return { ok: true };
  }, { auth: 'user' });
}

export { STATE_COOKIE };
