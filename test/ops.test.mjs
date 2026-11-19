// Error alerts (Nov 19): server 500s and browser errors are logged; the ops route reports them to the nightly check.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { setup } from './helpers.mjs';

let t;
before(async () => {
  process.env.OPS_TOKEN = 'ops-test-token-123';
  t = await setup();
});
after(() => t.close());

const ops = (token = 'ops-test-token-123') => fetch(`${t.base}/api/ops/errors?hours=24`, { headers: { Authorization: `Bearer ${token}` } });

test('the ops route needs the token, and says 404 otherwise', async () => {
  assert.equal((await ops('wrong')).status, 404);
  assert.equal((await fetch(`${t.base}/api/ops/errors`)).status, 404);
  const r = await (await ops()).json();
  assert.equal(r.count, 0);
});

test('a browser error is logged (cut short) and counted', async () => {
  const c = t.client();
  const r = await c.post('/api/client-errors', { message: 'TypeError: x is undefined\nsecond line', stack: 'at y', path: '/lesson/4' });
  assert.equal(r.status, 200);
  const body = await (await ops()).json();
  assert.equal(body.count, 1);
  assert.equal(body.recent[0].kind, 'browser');
  assert.equal(body.recent[0].message, 'TypeError: x is undefined second line');
  assert.equal(body.recent[0].path, '/lesson/4');
});

test('a server error (500) is logged with its route', async () => {
  // Force a 500: break a table the dashboard reads, then put it back
  t.db.exec('ALTER TABLE weeks RENAME TO weeks_x');
  try {
    const c = await t.as('jordan@thewell.test');
    const r = await c.get('/api/weeks');
    assert.equal(r.status, 500);
    assert.doesNotMatch(JSON.stringify(r.body), /weeks/, 'the visitor sees a plain message');
  } finally { t.db.exec('ALTER TABLE weeks_x RENAME TO weeks'); }
  const body = await (await ops()).json();
  const server = body.recent.find((e) => e.kind === 'server');
  assert.ok(server, 'logged');
  assert.equal(server.path, 'GET /api/weeks');
});

test('browser reports are capped at 20 an hour per address', async () => {
  const c = t.client();
  for (let i = 0; i < 25; i++) await c.post('/api/client-errors', { message: 'spam ' + i });
  const n = t.db.prepare("SELECT COUNT(*) n FROM errors WHERE kind = 'browser'").get().n;
  assert.ok(n <= 20, `${n} kept`);
});
