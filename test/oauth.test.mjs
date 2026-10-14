// Sign in with Google / Microsoft, end to end against a local fake provider that signs real RS256 ID tokens.
import assert from 'node:assert/strict';
import { createHash, generateKeyPairSync, sign } from 'node:crypto';
import fs from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { after, before, beforeEach, describe, test } from 'node:test';
import { startServer } from '../server/index.mjs';
import { seed } from '../server/seed.mjs';
import { ANGELA, JORDAN, PASSWORD } from './helpers.mjs';

const MS_TID = '11111111-2222-3333-4444-555555555555';
const { privateKey, publicKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
const other = generateKeyPairSync('rsa', { modulusLength: 2048 }); // an attacker's key
const jwk = { ...publicKey.export({ format: 'jwk' }), kid: 'k1', alg: 'RS256', use: 'sig' };

const b64 = (o) => Buffer.from(JSON.stringify(o)).toString('base64url');
function idToken(claims, key = privateKey, kid = 'k1') {
  const head = b64({ alg: 'RS256', kid, typ: 'JWT' });
  const body = b64(claims);
  return `${head}.${body}.${sign('RSA-SHA256', Buffer.from(`${head}.${body}`), key).toString('base64url')}`;
}

// ---- fake provider ----
const fake = { claims: null, key: privateKey, lastTokenBody: null, base: '' };
let fakeServer;
let app;
let dataDir;

function providers() {
  const common = { authorize: `${fake.base}/auth`, token: `${fake.base}/token`, jwks: `${fake.base}/jwks` };
  return {
    google: { ...common, label: 'Google', clientId: 'g-client', clientSecret: 'g-secret',
      issuerOk: (iss) => iss === 'https://accounts.google.com' },
    microsoft: { ...common, label: 'Microsoft', clientId: 'm-client', clientSecret: 'm-secret',
      issuerOk: (iss, c) => typeof c.tid === 'string' && iss === `https://login.microsoftonline.com/${c.tid}/v2.0` },
  };
}

before(async () => {
  fakeServer = http.createServer((req, res) => {
    if (req.url === '/jwks') return res.end(JSON.stringify({ keys: [jwk] }));
    if (req.url === '/token' && req.method === 'POST') {
      let raw = '';
      req.on('data', (c) => { raw += c; });
      req.on('end', () => {
        fake.lastTokenBody = new URLSearchParams(raw);
        res.setHeader('Content-Type', 'application/json');
        res.end(JSON.stringify({ id_token: idToken(fake.claims, fake.key), token_type: 'Bearer' }));
      });
      return;
    }
    res.statusCode = 404;
    res.end();
  });
  await new Promise((r) => fakeServer.listen(0, '127.0.0.1', r));
  fake.base = `http://127.0.0.1:${fakeServer.address().port}`;
});

after(async () => {
  await new Promise((r) => fakeServer.close(r));
});

beforeEach(async () => {
  if (app) {
    await app.close();
    fs.rmSync(dataDir, { recursive: true, force: true });
  }
  dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'coa-oauth-'));
  await seed(dataDir);
  app = await startServer({ port: 0, dataDir, oidc: providers(), publicOrigin: 'http://placeholder' });
  app.base = `http://127.0.0.1:${app.port}`;
  app.app.publicOrigin = app.base;
  fake.key = privateKey;
});

after(async () => {
  if (app) await app.close();
  if (dataDir) fs.rmSync(dataDir, { recursive: true, force: true });
});

// ---- a tiny cookie-keeping browser ----
class Browser {
  constructor() { this.jar = {}; }
  cookieHeader() { return Object.entries(this.jar).map(([k, v]) => `${k}=${v}`).join('; '); }
  keep(res) {
    for (const c of res.headers.getSetCookie()) {
      const [pair] = c.split(';');
      const i = pair.indexOf('=');
      const k = pair.slice(0, i);
      const v = pair.slice(i + 1);
      if (v === '' || /Max-Age=0/.test(c)) delete this.jar[k];
      else this.jar[k] = v;
    }
  }
  async get(url) {
    const res = await fetch(app.base + url, { redirect: 'manual', headers: { Cookie: this.cookieHeader() } });
    this.keep(res);
    return res;
  }
  async send(method, url, body) {
    const res = await fetch(app.base + url, {
      method, redirect: 'manual',
      headers: { Cookie: this.cookieHeader(), 'Content-Type': 'application/json', 'X-COA': '1' },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    this.keep(res);
    return res;
  }
  async login(email) {
    const r = await this.send('POST', '/api/auth/login', { email, password: PASSWORD });
    assert.equal(r.status, 200);
  }
}

async function makeInvite(email, extra = {}) {
  const angela = new Browser();
  await angela.login(ANGELA);
  const r = await angela.send('POST', '/api/admin/invites', { email, name: 'New Hire', title: 'Associate clinician', role: 'clinician', ...extra });
  assert.equal(r.status, 200);
  return (await r.json()).inviteUrl.split('/invite/')[1];
}

/** Runs start -> (provider) -> callback. `claims` are what the provider says about the account. */
async function signInWith(browser, provider, claims, { query = '', tamper } = {}) {
  const start = await browser.get(`/api/auth/oauth/${provider}/start${query}`);
  assert.equal(start.status, 302);
  const auth = new URL(start.headers.get('location'));
  const state = auth.searchParams.get('state');
  const nonce = auth.searchParams.get('nonce');
  const p = providers()[provider];
  fake.claims = {
    iss: provider === 'google' ? 'https://accounts.google.com' : `https://login.microsoftonline.com/${MS_TID}/v2.0`,
    aud: p.clientId,
    sub: `${provider}-sub-1`,
    exp: Math.floor(Date.now() / 1000) + 600,
    iat: Math.floor(Date.now() / 1000),
    nonce,
    ...(provider === 'microsoft' ? { tid: MS_TID } : {}),
    ...claims,
  };
  if (tamper) tamper({ state });
  const cb = await browser.get(`/api/auth/oauth/${provider}/callback?state=${encodeURIComponent(tamper?.state ?? state)}&code=one-time-code`);
  return { status: cb.status, location: cb.headers.get('location'), cookies: cb.headers.getSetCookie(), auth };
}

const userBy = (email) => app.app.db.prepare('SELECT * FROM users WHERE email = ?').get(email);
const identities = (userId) => app.app.db.prepare('SELECT provider FROM user_identities WHERE user_id = ?').all(userId).map((r) => r.provider);

describe('invite + Google', () => {
  test('matching verified email creates the account, links Google, and signs in for 12 hours', async () => {
    const token = await makeInvite('new.hire@thewellchristian.com');
    const b = new Browser();
    const r = await signInWith(b, 'google', { email: 'New.Hire@thewellchristian.com', email_verified: true, name: 'Nia Hire' }, { query: `?invite=${token}` });
    assert.equal(r.status, 302);
    assert.equal(r.location, '/');
    const session = r.cookies.find((c) => c.startsWith('coa_session='));
    assert.match(session, /Max-Age=43200/);
    assert.match(session, /HttpOnly/);
    const me = await b.get('/api/me');
    assert.equal(me.status, 200);
    const u = userBy('new.hire@thewellchristian.com');
    assert.equal(u.password_hash, null, 'no password for Google-only accounts');
    assert.deepEqual(identities(u.id), ['google']);
    // The invite is used up.
    const again = await signInWith(new Browser(), 'google', { email: 'new.hire@thewellchristian.com', email_verified: true, sub: 'someone-else' }, { query: `?invite=${token}` });
    assert.match(again.location, /error=invite/);
  });

  test('PKCE: the token request carries a verifier that matches the challenge', async () => {
    const token = await makeInvite('pkce@thewellchristian.com');
    const r = await signInWith(new Browser(), 'google', { email: 'pkce@thewellchristian.com', email_verified: true }, { query: `?invite=${token}` });
    const verifier = fake.lastTokenBody.get('code_verifier');
    const challenge = createHash('sha256').update(verifier).digest('base64url');
    assert.equal(r.auth.searchParams.get('code_challenge'), challenge);
    assert.equal(r.auth.searchParams.get('code_challenge_method'), 'S256');
    assert.equal(fake.lastTokenBody.get('client_secret'), 'g-secret');
  });

  test('a different email is refused, and nothing is created', async () => {
    const token = await makeInvite('right@thewellchristian.com');
    const r = await signInWith(new Browser(), 'google', { email: 'wrong@gmail.com', email_verified: true }, { query: `?invite=${token}` });
    assert.match(r.location, /^\/signin\?error=email_mismatch&org=the-well$/);
    assert.equal(userBy('right@thewellchristian.com'), undefined);
  });

  test('an unverified Google email is refused', async () => {
    const token = await makeInvite('unverified@thewellchristian.com');
    const r = await signInWith(new Browser(), 'google', { email: 'unverified@thewellchristian.com', email_verified: false }, { query: `?invite=${token}` });
    assert.match(r.location, /error=unverified/);
  });
});

describe('returning users', () => {
  test('a linked Google account signs straight in, no invite needed', async () => {
    const token = await makeInvite('back@thewellchristian.com');
    await signInWith(new Browser(), 'google', { email: 'back@thewellchristian.com', email_verified: true, sub: 'g-back' }, { query: `?invite=${token}` });
    const b = new Browser();
    const r = await signInWith(b, 'google', { email: 'back@thewellchristian.com', email_verified: true, sub: 'g-back' });
    assert.equal(r.location, '/');
    assert.equal((await b.get('/api/me')).status, 200);
  });

  test('a verified Google email matching an existing account links it', async () => {
    const r = await signInWith(new Browser(), 'google', { email: JORDAN, email_verified: true, sub: 'g-jordan' });
    assert.equal(r.location, '/');
    assert.deepEqual(identities(userBy(JORDAN).id), ['google']);
  });

  test('Microsoft email alone never finds an account (stops the "nOAuth" email spoof)', async () => {
    const r = await signInWith(new Browser(), 'microsoft', { email: JORDAN, sub: 'm-attacker' });
    assert.match(r.location, /error=no_account/);
    assert.deepEqual(identities(userBy(JORDAN).id), []);
  });

  test('Microsoft works with an invite whose email matches', async () => {
    const token = await makeInvite('ms.user@contoso.test');
    const b = new Browser();
    const r = await signInWith(b, 'microsoft', { preferred_username: 'MS.User@contoso.test', sub: 'm-1' }, { query: `?invite=${token}` });
    assert.equal(r.location, '/');
    assert.deepEqual(identities(userBy('ms.user@contoso.test').id), ['microsoft']);
  });

  test('a deactivated user is refused even with a linked account', async () => {
    await signInWith(new Browser(), 'google', { email: JORDAN, email_verified: true, sub: 'g-jordan' });
    app.app.db.prepare('UPDATE users SET active = 0 WHERE email = ?').run(JORDAN);
    const r = await signInWith(new Browser(), 'google', { email: JORDAN, email_verified: true, sub: 'g-jordan' });
    assert.match(r.location, /error=inactive/);
  });

  test('no account and no invite -> refused', async () => {
    const r = await signInWith(new Browser(), 'google', { email: 'stranger@gmail.com', email_verified: true, sub: 'g-stranger' });
    assert.match(r.location, /error=no_account/);
  });
});

describe('token checks', () => {
  const cases = [
    ['wrong audience', { aud: 'someone-elses-app' }],
    ['wrong issuer', { iss: 'https://evil.example' }],
    ['expired', { exp: Math.floor(Date.now() / 1000) - 3600 }],
    ['wrong nonce', { nonce: 'replayed' }],
  ];
  for (const [label, claims] of cases) {
    test(`refuses a token with ${label}`, async () => {
      const r = await signInWith(new Browser(), 'google', { email: JORDAN, email_verified: true, ...claims });
      assert.match(r.location, /error=provider/);
      assert.deepEqual(identities(userBy(JORDAN).id), []);
    });
  }

  test('refuses a token signed with someone else’s key', async () => {
    fake.key = other.privateKey;
    const r = await signInWith(new Browser(), 'google', { email: JORDAN, email_verified: true });
    assert.match(r.location, /error=provider/);
  });

  test('Microsoft issuer must match the tenant in the token', async () => {
    const token = await makeInvite('tenant@contoso.test');
    const r = await signInWith(new Browser(), 'microsoft', { preferred_username: 'tenant@contoso.test', tid: 'another-tenant' }, { query: `?invite=${token}` });
    assert.match(r.location, /error=provider/);
  });

  test('state must match this browser’s cookie and can only be used once', async () => {
    const b = new Browser();
    const start = await b.get('/api/auth/oauth/google/start');
    const state = new URL(start.headers.get('location')).searchParams.get('state');
    // Another browser (an attacker's link) can't finish this sign-in.
    const stranger = new Browser();
    const r1 = await stranger.get(`/api/auth/oauth/google/callback?state=${state}&code=x`);
    assert.match(r1.headers.get('location'), /error=state/);
    // The stranger's attempt doesn't burn the real sign-in (that would let anyone block it)...
    const nonce = new URL(start.headers.get('location')).searchParams.get('nonce');
    fake.claims = { iss: 'https://accounts.google.com', aud: 'g-client', sub: 'g-j', email: JORDAN, email_verified: true,
      exp: Math.floor(Date.now() / 1000) + 600, iat: Math.floor(Date.now() / 1000), nonce };
    const cookie = b.jar.coa_oauth;
    const ok = await b.get(`/api/auth/oauth/google/callback?state=${state}&code=x`);
    assert.equal(ok.headers.get('location'), '/');
    // ...but once used, replaying the same callback fails.
    b.jar.coa_oauth = cookie;
    const replay = await b.get(`/api/auth/oauth/google/callback?state=${state}&code=x`);
    assert.match(replay.headers.get('location'), /error=state/);
  });

  test('next= can only point inside the app', async () => {
    const r = await signInWith(new Browser(), 'google', { email: JORDAN, email_verified: true }, { query: '?next=//evil.com/steal' });
    assert.equal(r.location, '/');
    const ok = await signInWith(new Browser(), 'google', { email: JORDAN, email_verified: true }, { query: '?next=/lesson/4' });
    assert.equal(ok.location, '/lesson/4');
  });

  test('cancelling on the provider page comes back with a plain reason', async () => {
    const b = new Browser();
    const start = await b.get('/api/auth/oauth/google/start');
    const state = new URL(start.headers.get('location')).searchParams.get('state');
    const r = await b.get(`/api/auth/oauth/google/callback?state=${state}&error=access_denied`);
    assert.match(r.headers.get('location'), /error=cancelled/);
  });

  test('unconfigured providers are 404 and listed as off', async () => {
    const r = await new Browser().get('/api/auth/oauth/github/start');
    assert.equal(r.status, 404);
    const list = await (await new Browser().get('/api/auth/providers')).json();
    assert.deepEqual(list, { google: true, microsoft: true });
  });
});

describe('organisation sign-in methods', () => {
  test('an org that turns Google off refuses Google sign-in', async () => {
    const angela = new Browser();
    await angela.login(ANGELA);
    assert.equal((await angela.send('PUT', '/api/admin/practice', { signInMethods: { google: false } })).status, 200);
    const r = await signInWith(new Browser(), 'google', { email: JORDAN, email_verified: true });
    assert.match(r.location, /error=not_allowed/);
  });

  test('turning off passwords: owner must connect Google first; then password logins are refused', async () => {
    const angela = new Browser();
    await angela.login(ANGELA);
    const locked = await angela.send('PUT', '/api/admin/practice', { signInMethods: { password: false } });
    assert.equal(locked.status, 400);
    assert.match((await locked.json()).error, /lock you out/);
    // Angela connects Google from her Account page (link mode keeps her session).
    const link = await signInWith(angela, 'google', { email: 'angela@thewellchristian.com', email_verified: true, sub: 'g-angela' }, { query: '?link=1' });
    assert.match(link.location, /^\/account\?connected=google$/);
    assert.equal((await angela.send('PUT', '/api/admin/practice', { signInMethods: { password: false } })).status, 200);
    // Correct password, but the org signs in with Google now.
    const pw = await new Browser().send('POST', '/api/auth/login', { email: JORDAN, password: PASSWORD });
    assert.equal(pw.status, 403);
    assert.match((await pw.json()).error, /Google or Microsoft/);
    // Wrong password still says the generic thing (no hint about which emails exist).
    const wrong = await new Browser().send('POST', '/api/auth/login', { email: JORDAN, password: 'nope-nope-nope' });
    assert.equal(wrong.status, 401);
    // Can't turn everything off.
    assert.equal((await angela.send('PUT', '/api/admin/practice', { signInMethods: { google: false, microsoft: false } })).status, 400);
  });

  test('connecting an account someone else already linked is refused', async () => {
    await signInWith(new Browser(), 'google', { email: JORDAN, email_verified: true, sub: 'g-shared' });
    const angela = new Browser();
    await angela.login(ANGELA);
    const r = await signInWith(angela, 'google', { email: 'x@gmail.com', email_verified: true, sub: 'g-shared' }, { query: '?link=1' });
    assert.match(r.location, /error=taken/);
  });

  test('you can’t remove your only way in', async () => {
    const token = await makeInvite('only@thewellchristian.com');
    const b = new Browser();
    await signInWith(b, 'google', { email: 'only@thewellchristian.com', email_verified: true, sub: 'g-only' }, { query: `?invite=${token}` });
    const acct = await (await b.get('/api/account')).json();
    assert.equal(acct.hasPassword, false);
    assert.deepEqual(acct.identities.map((i) => i.provider), ['google']);
    const r = await b.send('DELETE', '/api/account/identities/google');
    assert.equal(r.status, 400);
  });

  test('admin team list shows how each person signs in', async () => {
    await signInWith(new Browser(), 'google', { email: JORDAN, email_verified: true, sub: 'g-j' });
    const angela = new Browser();
    await angela.login(ANGELA);
    const team = await (await angela.get('/api/admin/team')).json();
    const jordan = team.users.find((u) => u.email === JORDAN);
    assert.deepEqual(jordan.signsInWith, ['password', 'google']);
  });
});
