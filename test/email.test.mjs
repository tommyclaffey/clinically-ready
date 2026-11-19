// Email (Nov 19, launch Gate A): invites and Forgot Password links through Resend, off until it's set up.
// A fake Resend server records what would have been sent.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { setup, ANGELA, JORDAN, PASSWORD } from './helpers.mjs';

const sent = [];
let fake, t;
const ORIGIN = 'https://app.example.test';

before(async () => {
  fake = http.createServer((req, res) => {
    let b = '';
    req.on('data', (c) => (b += c));
    req.on('end', () => {
      sent.push({ auth: req.headers.authorization, ...JSON.parse(b) });
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end('{"id":"fake"}');
    });
  });
  await new Promise((r) => fake.listen(0, '127.0.0.1', r));
  process.env.RESEND_API_URL = `http://127.0.0.1:${fake.address().port}/emails`;
  process.env.PUBLIC_ORIGIN = ORIGIN;
  t = await setup();
});
after(async () => {
  await t.close();
  fake.close();
});

const linkIn = (mail, kind) => new RegExp(`${ORIGIN}/${kind}/([A-Za-z0-9_-]+)`).exec(mail.text)?.[1];
const mailOn = () => { process.env.RESEND_API_KEY = 're_test'; process.env.MAIL_FROM = 'Clinically Ready <hello@example.test>'; };
const mailOff = () => { delete process.env.RESEND_API_KEY; delete process.env.MAIL_FROM; };

test('mail off: nothing is sent, and the app says so', async () => {
  mailOff();
  const anon = t.client();
  assert.equal((await anon.get('/api/auth/providers')).body.email, false);
  assert.deepEqual((await anon.post('/api/auth/forgot', { email: JORDAN })).body, { ok: true, sent: false });
  const owner = await t.as(ANGELA);
  const inv = await owner.post('/api/admin/invites', { email: 'nomail@thewell.test', name: 'No Mail' });
  assert.equal(inv.status, 200);
  assert.equal(inv.body.emailed, false);
  assert.match(inv.body.inviteUrl, /^\/invite\//, 'the link to copy is still there');
  assert.equal(sent.length, 0);
});

test('mail on: an invite is emailed with a single-use link that lasts 14 days', async () => {
  mailOn();
  assert.equal((await t.client().get('/api/auth/providers')).body.email, true);
  const owner = await t.as(ANGELA);
  const inv = await owner.post('/api/admin/invites', { email: 'newhire@thewell.test', name: 'Sam New' });
  assert.equal(inv.body.emailed, true);
  const mail = sent.at(-1);
  assert.deepEqual(mail.to, ['newhire@thewell.test']);
  assert.equal(mail.auth, 'Bearer re_test');
  assert.match(mail.subject, /invited to .+ onboarding/);
  assert.match(mail.text, /Hi Sam/);
  assert.match(mail.text, /14 days/);
  const token = linkIn(mail, 'invite');
  assert.ok(token, 'the link uses PUBLIC_ORIGIN');
  const days = (Date.parse(inv.body.expiresAt) - Date.now()) / 864e5;
  assert.ok(days > 13.9 && days <= 14, 'expires in 14 days');
  const guest = t.client();
  assert.equal((await guest.post(`/api/invites/${token}/accept`, { name: 'Sam New', password: 'a-long-password-1' })).status, 200);
  assert.equal((await t.client().post(`/api/invites/${token}/accept`, { name: 'Sam', password: 'a-long-password-2' })).status, 404, 'single use');
});

test('Forgot Password: a link that works once, signs out everywhere, and the new password works', async () => {
  mailOn();
  const elsewhere = await t.as(JORDAN); // a session on another device
  const before = sent.length;
  const r = await t.client().post('/api/auth/forgot', { email: JORDAN.toUpperCase() });
  assert.deepEqual(r.body, { ok: true, sent: true });
  assert.equal(sent.length, before + 1);
  const mail = sent.at(-1);
  assert.deepEqual(mail.to, [JORDAN]);
  assert.match(mail.subject, /Reset your password/);
  const token = linkIn(mail, 'reset');
  const info = await t.client().get(`/api/auth/reset/${token}`);
  assert.equal(info.status, 200);
  assert.equal(info.body.email, JORDAN);
  const me = t.client();
  assert.equal((await me.post(`/api/auth/reset/${token}`, { password: 'short' })).status, 400, 'too short');
  const done = await me.post(`/api/auth/reset/${token}`, { password: 'brand-new-password-1' });
  assert.equal(done.status, 200);
  assert.equal(done.body.me.email, JORDAN, 'signed in');
  assert.equal((await elsewhere.get('/api/me')).status, 401, 'the other device is signed out');
  assert.equal((await t.client().post(`/api/auth/reset/${token}`, { password: 'another-password-12' })).status, 404, 'single use');
  assert.equal((await t.client().post('/api/auth/login', { email: JORDAN, password: PASSWORD })).status, 401, 'the old password is gone');
  assert.equal((await t.client().post('/api/auth/login', { email: JORDAN, password: 'brand-new-password-1' })).status, 200);
});

test('Forgot Password: same answer for an unknown email, nothing sent; a newer link cancels the older one', async () => {
  mailOn();
  const before = sent.length;
  const r = await t.client().post('/api/auth/forgot', { email: 'nobody@nowhere.test' });
  assert.deepEqual(r.body, { ok: true, sent: true });
  assert.equal(sent.length, before, 'no email for an address with no account');
  await t.client().post('/api/auth/forgot', { email: ANGELA });
  const first = linkIn(sent.at(-1), 'reset');
  await t.client().post('/api/auth/forgot', { email: ANGELA });
  const second = linkIn(sent.at(-1), 'reset');
  assert.notEqual(first, second);
  assert.equal((await t.client().get(`/api/auth/reset/${first}`)).status, 404, 'the older link stopped working');
  assert.equal((await t.client().get(`/api/auth/reset/${second}`)).status, 200);
  assert.equal((await t.client().post('/api/auth/forgot', { email: ANGELA })).status, 200);
  assert.equal((await t.client().post('/api/auth/forgot', { email: ANGELA })).status, 429, '3 an hour per address');
});

test('reset links are stored only as hashes', async () => {
  const rows = t.db.prepare('SELECT token_hash FROM password_resets').all();
  assert.ok(rows.length > 0);
  for (const r of rows) assert.match(r.token_hash, /^[0-9a-f]{64}$/);
});
