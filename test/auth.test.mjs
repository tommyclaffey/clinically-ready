import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { after, before, describe, test } from 'node:test';
import { ANGELA, JORDAN, OFFICE, PASSWORD, seenBodies, setup } from './helpers.mjs';

let t;
before(async () => {
  t = await setup();
});
after(() => t.close());

describe('signup', () => {
  test('creates a practice with the new user as owner and signs them in', async () => {
    const c = t.client();
    const r = await c.post('/api/signup', {
      practiceName: 'Quiet Waters Counseling',
      name: 'Sam Rivera',
      email: 'Sam@QuietWaters.test',
      password: 'long-enough-password',
    });
    assert.equal(r.status, 200);
    assert.deepEqual(Object.keys(r.body.me).sort(), ['email', 'id', 'initials', 'name', 'role', 'title']);
    assert.equal(r.body.me.role, 'owner');
    assert.equal(r.body.me.email, 'sam@quietwaters.test');
    assert.equal(r.body.me.initials, 'SR');
    assert.deepEqual(Object.keys(r.body.practice).sort(), ['brandColor', 'clientMessaging', 'id', 'isDemo', 'logoUrl', 'name', 'paperworkEnabled', 'signIn', 'slug', 'terms', 'welcome']);
    assert.equal(r.body.practice.terms.member, 'team member', 'new organisations start with general wording');
    assert.equal(r.body.practice.slug, 'quiet-waters-counseling');
    assert.equal((await c.get('/api/me')).status, 200);
  });

  test('rejects duplicate email (409) and short passwords (400)', async () => {
    const c = t.client();
    const dup = await c.post('/api/signup', { practiceName: 'X', name: 'Y', email: JORDAN, password: 'long-enough-password' });
    assert.equal(dup.status, 409);
    const short = await c.post('/api/signup', { practiceName: 'X', name: 'Y', email: 'new@x.test', password: 'short' });
    assert.equal(short.status, 400);
    assert.match(short.body.error, /10 characters/);
  });
});

describe('login, me, logout', () => {
  test('login sets a hardened session cookie and returns me + practice', async () => {
    const c = t.client();
    const r = await c.post('/api/auth/login', { email: JORDAN, password: PASSWORD });
    assert.equal(r.status, 200);
    assert.equal(r.body.me.name, 'Jordan Lee');
    assert.equal(r.body.me.initials, 'JL');
    assert.equal(r.body.practice.name, 'The Well');
    const cookie = r.headers.get('set-cookie');
    assert.match(cookie, /coa_session=[\w-]{40,}/);
    assert.match(cookie, /HttpOnly/);
    assert.match(cookie, /SameSite=Lax/);
    assert.match(cookie, /Path=\//);
    assert.doesNotMatch(cookie, /Secure/); // not production

    const me = await c.get('/api/me');
    assert.equal(me.status, 200);
    assert.equal(me.body.me.email, JORDAN);

    const out = await c.post('/api/auth/logout');
    assert.deepEqual(out.body, { ok: true });
    assert.equal((await c.get('/api/me')).status, 401);
  });

  test('only the SHA-256 of the session token is stored', async () => {
    const c = t.client();
    await c.login(JORDAN);
    const token = c.cookie.split('=')[1];
    const hash = createHash('sha256').update(token).digest('hex');
    assert.ok(t.db.prepare('SELECT 1 FROM sessions WHERE token_hash = ?').get(hash));
    assert.equal(t.db.prepare('SELECT 1 FROM sessions WHERE token_hash = ?').get(token), undefined);
  });

  test('passwords are stored as scrypt$N$r$p$salt$hash', () => {
    const { password_hash } = t.db.prepare('SELECT password_hash FROM users WHERE email = ?').get(JORDAN);
    assert.match(password_hash, /^scrypt\$\d+\$\d+\$\d+\$[A-Za-z0-9+/=]+\$[A-Za-z0-9+/=]+$/);
  });

  test('email lookup is case-insensitive', async () => {
    const r = await t.client().post('/api/auth/login', { email: ' Jordan@TheWell.test ', password: PASSWORD });
    assert.equal(r.status, 200);
  });

  test('wrong password and unknown email get the same 401 message', async () => {
    const c = t.client();
    const wrong = await c.post('/api/auth/login', { email: OFFICE, password: 'not-the-password' });
    const unknown = await c.post('/api/auth/login', { email: 'nobody@thewell.test', password: 'whatever-password' });
    assert.equal(wrong.status, 401);
    assert.equal(unknown.status, 401);
    assert.equal(wrong.body.error, 'Email or password is incorrect.');
    assert.equal(unknown.body.error, wrong.body.error);
  });

  test('8 failures per email+IP -> 429, even with the right password', async () => {
    const c = t.client();
    const email = 'ratelimit@x.test';
    await c.post('/api/signup', { practiceName: 'RL', name: 'Rate Limit', email, password: 'right-password-1' });
    for (let i = 0; i < 8; i++) {
      const r = await c.post('/api/auth/login', { email, password: `wrong-password-${i}` });
      assert.equal(r.status, 401, `attempt ${i + 1}`);
    }
    const blocked = await c.post('/api/auth/login', { email, password: 'right-password-1' });
    assert.equal(blocked.status, 429);
    assert.match(blocked.body.error, /Too many/);
    // A different email from the same IP is unaffected.
    assert.equal((await t.client().post('/api/auth/login', { email: OFFICE, password: PASSWORD })).status, 200);
  });
});

describe('CSRF guard on writes', () => {
  test('missing X-COA header -> 403', async () => {
    const c = t.client();
    const r = await c.post('/api/auth/login', { email: JORDAN, password: PASSWORD }, { coa: false });
    assert.equal(r.status, 403);
    const j = await t.as(JORDAN);
    const note = await j.put('/api/lessons/1/note', { body: 'x' }, { coa: false });
    assert.equal(note.status, 403);
  });

  test('foreign Origin -> 403, same Origin -> allowed', async () => {
    const c = t.client();
    const bad = await c.post('/api/auth/login', { email: JORDAN, password: PASSWORD }, { headers: { Origin: 'https://evil.example' } });
    assert.equal(bad.status, 403);
    const nul = await c.post('/api/auth/login', { email: JORDAN, password: PASSWORD }, { headers: { Origin: 'null' } });
    assert.equal(nul.status, 403);
    const good = await c.post('/api/auth/login', { email: JORDAN, password: PASSWORD }, { headers: { Origin: t.base } });
    assert.equal(good.status, 200);
  });

  test('GET requests do not need the header', async () => {
    const j = await t.as(JORDAN);
    assert.equal((await j.get('/api/dashboard', { coa: false })).status, 200);
  });
});

describe('access', () => {
  test('signed-out requests get 401 on learner and admin routes', async () => {
    const c = t.client();
    for (const url of ['/api/dashboard', '/api/weeks', '/api/lessons/1', '/api/resources', '/api/team', '/api/admin/team']) {
      assert.equal((await c.get(url)).status, 401, url);
    }
  });

  test('unknown API route -> 404 JSON', async () => {
    const r = await t.client().get('/api/nope');
    assert.equal(r.status, 404);
    assert.ok(r.body.error);
  });

  test('security headers and /healthz', async () => {
    const res = await fetch(`${t.base}/healthz`);
    assert.equal(res.status, 200);
    assert.equal(res.headers.get('x-content-type-options'), 'nosniff');
    assert.equal(res.headers.get('referrer-policy'), 'same-origin');
    assert.equal(res.headers.get('x-frame-options'), 'DENY');
  });

  test('bad JSON -> 400, body over 1 MB -> 413', async () => {
    const c = t.client();
    const bad = await c.req('POST', '/api/auth/login', '{nope', { raw: true, headers: { 'Content-Type': 'application/json' } });
    assert.equal(bad.status, 400);
    const big = await c.req('POST', '/api/auth/login', JSON.stringify({ email: 'x'.repeat(1024 * 1024 + 10) }), {
      raw: true,
      headers: { 'Content-Type': 'application/json' },
    });
    assert.equal(big.status, 413);
  });
});

describe('deactivated users', () => {
  test("can't log in, and their existing sessions stop working", async () => {
    const owner = await t.as(ANGELA);
    const invite = await owner.post('/api/admin/invites', { email: 'temp@thewell.test', name: 'Temp Person', role: 'clinician' });
    const token = invite.body.inviteUrl.split('/').pop();
    const temp = t.client();
    const acc = await temp.post(`/api/invites/${token}/accept`, { name: 'Temp Person', password: 'temp-password-1' });
    assert.equal(acc.status, 200);
    assert.equal((await temp.get('/api/me')).status, 200);

    const off = await owner.put(`/api/admin/users/${acc.body.me.id}`, { active: false });
    assert.equal(off.status, 200);
    assert.equal(off.body.user.active, false);
    assert.equal((await temp.get('/api/me')).status, 401);
    const login = await t.client().post('/api/auth/login', { email: 'temp@thewell.test', password: 'temp-password-1' });
    assert.equal(login.status, 401);
    assert.equal(login.body.error, 'Email or password is incorrect.');
  });
});

describe('secrets never leak', () => {
  test('no response body ever contained a hash, token hash or password', async () => {
    // Touch the routes that return user rows, then scan every body this file saw.
    const owner = await t.as(ANGELA);
    await owner.get('/api/admin/team');
    await owner.get('/api/team');
    await owner.get('/api/dashboard');
    const all = seenBodies.join('\n');
    assert.ok(seenBodies.length > 20);
    for (const bad of ['password_hash', 'passwordHash', 'token_hash', 'tokenHash', 'scrypt$', PASSWORD, 'right-password-1']) {
      assert.ok(!all.includes(bad), `leaked ${bad}`);
    }
  });
});
