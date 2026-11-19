// Fixes from the Nov 19 security review (launch Gate A). Each test fails without its fix.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { setup, ANGELA, OFFICE, JORDAN, PASSWORD } from './helpers.mjs';
import { renderIndex } from '../server/share.mjs';
import { unzip, MAX_UNZIPPED } from '../server/previews.mjs';
import { deflateRawSync } from 'node:zlib';
import { hashPassword } from '../server/auth.mjs';

let t;
before(async () => {
  process.env.TRUST_PROXY = '1'; // as on Railway
  t = await setup();
});
after(() => { delete process.env.TRUST_PROXY; return t.close(); });

const loginFrom = (ip, email, password) =>
  fetch(`${t.base}/api/auth/login`, { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-COA': '1', 'X-Forwarded-For': ip }, body: JSON.stringify({ email, password }) });

test('a made-up X-Forwarded-For no longer gets round the sign-in limit; and 20 wrong an hour locks the account', async () => {
  // The browser's own entry comes first; the proxy's (the real address) is last. Changing the first doesn't help.
  let blocked = false;
  for (let i = 0; i < 12 && !blocked; i++) blocked = (await loginFrom(`10.0.0.${i}, 203.0.113.9`, OFFICE, 'wrong-password-x')).status === 429;
  assert.ok(blocked, 'same real address: blocked after 8');
  // Different real addresses each time: the per-account cap still stops it
  let locked = false;
  for (let i = 0; i < 25 && !locked; i++) locked = (await loginFrom(`198.51.100.${i}`, JORDAN, 'wrong-password-y')).status === 429;
  assert.ok(locked, 'per account: blocked by 20 wrong an hour');
});

test('a practice owner (or a demo owner) can’t start a server backup', async () => {
  const angela = await t.as(ANGELA);
  assert.equal((await angela.post('/api/admin/backup')).status, 404);
  const demo = t.client();
  assert.equal((await demo.post('/api/demo/start', { as: 'owner' }, { headers: { 'X-Forwarded-For': '192.0.2.50' } })).status, 200);
  assert.equal((await demo.post('/api/admin/backup')).status, 404);
  assert.equal((await demo.post('/api/ops/backup')).status, 404);
});

test('an admin can’t turn a deactivated owner back on', async () => {
  const pid = t.db.prepare("SELECT practice_id p FROM users WHERE email = ?").get(ANGELA).p;
  const id = Number(t.db.prepare("INSERT INTO users(practice_id, email, name, role, active, created_at) VALUES (?, 'co-owner@thewell.test', 'Co Owner', 'owner', 0, 'x')").run(pid).lastInsertRowid);
  const office = await t.as(OFFICE);
  assert.equal((await office.put(`/api/admin/users/${id}`, { active: true })).status, 403);
  assert.equal(t.db.prepare('SELECT active FROM users WHERE id = ?').get(id).active, 0);
  const angela = await t.as(ANGELA);
  assert.equal((await angela.put(`/api/admin/users/${id}`, { active: true })).status, 200, 'an owner still can');
});

test('$` and $\' in a URL stay text in the link-preview tags', () => {
  const html = '<head><title>x</title></head><body>SECRET-PAGE-BODY</body>';
  const out = renderIndex(html, '<meta property="og:url" content="https://a.test/$`x$\'y" />');
  assert.match(out, /content="https:\/\/a\.test\/\$`x\$'y"/);
  assert.equal(out.split('SECRET-PAGE-BODY').length, 2, 'the page wasn’t pasted into the tag');
});

test('a Word file that expands too far is refused, not unzipped', () => {
  const big = Buffer.alloc(MAX_UNZIPPED + 1024, 0x41);
  const comp = deflateRawSync(big);
  const name = Buffer.from('word/document.xml');
  const local = Buffer.alloc(30); local.writeUInt32LE(0x04034b50, 0); local.writeUInt16LE(8, 8); local.writeUInt32LE(comp.length, 18); local.writeUInt32LE(big.length, 22); local.writeUInt16LE(name.length, 26);
  const central = Buffer.alloc(46); central.writeUInt32LE(0x02014b50, 0); central.writeUInt16LE(8, 10); central.writeUInt32LE(comp.length, 20); central.writeUInt32LE(big.length, 24); central.writeUInt16LE(name.length, 28); central.writeUInt32LE(0, 42);
  const cdStart = 30 + name.length + comp.length;
  const end = Buffer.alloc(22); end.writeUInt32LE(0x06054b50, 0); end.writeUInt16LE(1, 8); end.writeUInt16LE(1, 10); end.writeUInt32LE(46 + name.length, 12); end.writeUInt32LE(cdStart, 16);
  const zip = Buffer.concat([local, name, comp, central, name, end]);
  assert.throws(() => unzip(zip, ['word/document.xml']), /too large/);
});

test('a demo account can’t link a real Google or Microsoft account', async () => {
  const demo = t.client();
  await demo.post('/api/demo/start', { as: 'clinician' }, { headers: { 'X-Forwarded-For': '192.0.2.51' } });
  const r = await demo.get('/api/auth/oauth/google/start?link=1');
  assert.equal(r.status, 403);
});

test('a quick check that sits in the section quiz doesn’t give away its answer before the quiz is passed', async () => {
  const pid = t.db.prepare("SELECT practice_id p FROM users WHERE email = ?").get(JORDAN).p;
  const qq = t.db.prepare('SELECT q.*, l.week_id FROM quiz_questions q JOIN lessons l ON l.id = q.lesson_id WHERE q.practice_id = ? ORDER BY l.position LIMIT 1').get(pid);
  assert.ok(qq, 'the seed has a quick check');
  t.db.prepare('INSERT INTO section_questions(practice_id, week_id, prompt, options, correct_index, active) VALUES (?,?,?,?,?,1)').run(pid, qq.week_id, qq.prompt, qq.options, qq.correct_index);
  // a fresh clinician (Jordan's account is locked by the first test, on purpose)
  t.db.prepare("INSERT INTO users(practice_id, email, name, role, password_hash, active, created_at) VALUES (?, 'quiz-check@thewell.test', 'Quiz Check', 'clinician', ?, 1, 'x')").run(pid, await hashPassword(PASSWORD));
  const jordan = await t.as('quiz-check@thewell.test');
  const opts = JSON.parse(qq.options);
  const wrong = (qq.correct_index + 1) % opts.length;
  const r = await jordan.post(`/api/quiz/${qq.id}/answer`, { index: wrong });
  assert.equal(r.status, 200);
  assert.equal(r.body.correct, false);
  assert.equal(r.body.correctIndex, null, 'right answer held back');
  assert.equal(r.body.hidden, true);
  const angela = await t.as(ANGELA);
  const a = await angela.post(`/api/quiz/${qq.id}/answer`, { index: wrong });
  assert.equal(a.body.correctIndex, qq.correct_index, 'owners and admins still see it');
});

test('security headers: scripts only from the app, plugins off', async () => {
  const r = await fetch(`${t.base}/healthz`);
  const csp = r.headers.get('content-security-policy');
  assert.match(csp, /script-src 'self'/);
  assert.match(csp, /object-src 'none'/);
  assert.match(csp, /frame-ancestors 'self' https:\/\/tommyclaffey\.com/);
});
