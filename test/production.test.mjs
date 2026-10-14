// Production mode: dist/ static serving with SPA fallback, Secure cookies.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { after, before, describe, test } from 'node:test';
import { startServer } from '../server/index.mjs';
import { seed } from '../server/seed.mjs';
import { JORDAN, PASSWORD } from './helpers.mjs';

let srv;
let base;
let tmp;
before(async () => {
  tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'coa-prod-'));
  const distDir = path.join(tmp, 'dist');
  fs.mkdirSync(path.join(distDir, 'assets'), { recursive: true });
  fs.writeFileSync(path.join(distDir, 'index.html'), '<!doctype html><title>COA</title>');
  fs.writeFileSync(path.join(distDir, 'assets', 'app-abc.js'), 'console.log(1)');
  fs.writeFileSync(path.join(tmp, 'secret.txt'), 'outside dist');
  await seed(path.join(tmp, 'data'));
  srv = await startServer({ port: 0, dataDir: path.join(tmp, 'data'), production: true, distDir });
  base = `http://127.0.0.1:${srv.port}`;
});
after(async () => {
  await srv.close();
  fs.rmSync(tmp, { recursive: true, force: true });
});

test('serves dist files with security headers', async () => {
  const r = await fetch(`${base}/assets/app-abc.js`);
  assert.equal(r.status, 200);
  assert.match(r.headers.get('content-type'), /javascript/);
  assert.match(r.headers.get('cache-control'), /immutable/);
  assert.equal(r.headers.get('x-frame-options'), 'DENY');
  assert.equal(r.headers.get('x-content-type-options'), 'nosniff');
  assert.equal(r.headers.get('referrer-policy'), 'same-origin');
});

test('SPA fallback to index.html for app routes', async () => {
  for (const url of ['/', '/lesson/4', '/admin/team']) {
    const r = await fetch(base + url);
    assert.equal(r.status, 200, url);
    assert.match(await r.text(), /og:image/);
  }
});

test('never serves files outside dist', async () => {
  for (const url of ['/../secret.txt', '/%2e%2e/secret.txt', '/assets/..%2f..%2fsecret.txt']) {
    const text = await (await fetch(base + url)).text();
    assert.ok(!text.includes('outside dist'), url);
  }
});

test('/healthz and unknown /api routes', async () => {
  assert.equal((await fetch(`${base}/healthz`)).status, 200);
  assert.equal((await fetch(`${base}/api/nope`)).status, 404);
});

test('session cookie is Secure in production', async () => {
  const r = await fetch(`${base}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-COA': '1' },
    body: JSON.stringify({ email: JORDAN, password: PASSWORD }),
  });
  assert.equal(r.status, 200);
  assert.match(r.headers.get('set-cookie'), /; Secure/);
});

describe('production safety', () => {
  test('public sign-up is closed in production unless SIGNUP_OPEN=1', async () => {
    const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'coa-prod-'));
    const srv = await startServer({ port: 0, dataDir, production: true, signupOpen: false, distDir: dataDir });
    try {
      const r = await fetch(`http://127.0.0.1:${srv.port}/api/signup`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-COA': '1' },
        body: JSON.stringify({ practiceName: 'Spam Co', name: 'S', email: 's@spam.test', password: 'long-enough-password' }),
      });
      assert.equal(r.status, 403);
    } finally {
      await srv.close();
      fs.rmSync(dataDir, { recursive: true, force: true });
    }
  });

  test('seedIfEmpty refuses weak or public passwords, seeds once, never wipes', async () => {
    const { seedIfEmpty, SEED_PASSWORD } = await import('../server/seed.mjs');
    const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'coa-seed-'));
    try {
      await assert.rejects(seedIfEmpty(dataDir, 'short'));
      await assert.rejects(seedIfEmpty(dataDir, SEED_PASSWORD));
      assert.ok(await seedIfEmpty(dataDir, 'a-private-password-123'));
      assert.equal(await seedIfEmpty(dataDir, 'a-private-password-123'), null, 'second boot does nothing');
    } finally {
      fs.rmSync(dataDir, { recursive: true, force: true });
    }
  });
});
