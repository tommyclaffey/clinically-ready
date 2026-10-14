// Backups: snapshot + tar to a (fake) S3 bucket, retention, owner-only trigger, and a real restore round-trip.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { after, before, describe, test } from 'node:test';
import { listBackups, restoreBackup, runBackup, tarDirectory, untar } from '../server/backup.mjs';
import { startServer } from '../server/index.mjs';
import { S3 } from '../server/s3.mjs';
import { seed } from '../server/seed.mjs';
import { ANGELA, JORDAN, OFFICE, PASSWORD } from './helpers.mjs';

// ---- a fake S3 (path-style): PUT/GET/DELETE objects, LIST with prefix. Checks every request is SigV4-signed. ----
const store = new Map();
const seenAuth = [];
let fake;
let s3;
let srv;
let dataDir;

before(async () => {
  fake = http.createServer((req, res) => {
    seenAuth.push(req.headers.authorization || '');
    const u = new URL(req.url, 'http://x');
    const key = decodeURIComponent(u.pathname.replace(/^\/backups\/?/, ''));
    if (req.method === 'PUT') {
      const chunks = [];
      req.on('data', (c) => chunks.push(c));
      req.on('end', () => { store.set(key, Buffer.concat(chunks)); res.end(); });
      return;
    }
    if (req.method === 'DELETE') { store.delete(key); res.statusCode = 204; return res.end(); }
    if (req.method === 'GET' && u.searchParams.get('list-type') === '2') {
      const prefix = u.searchParams.get('prefix') || '';
      const keys = [...store.keys()].filter((k) => k.startsWith(prefix)).sort();
      res.setHeader('Content-Type', 'application/xml');
      return res.end(`<ListBucketResult>${keys.map((k) => `<Contents><Key>${k.replace(/&/g, '&amp;')}</Key></Contents>`).join('')}</ListBucketResult>`);
    }
    if (req.method === 'GET') {
      if (!store.has(key)) { res.statusCode = 404; return res.end(); }
      return res.end(store.get(key));
    }
    res.statusCode = 400; res.end();
  });
  await new Promise((r) => fake.listen(0, '127.0.0.1', r));
  s3 = new S3({ endpoint: `http://127.0.0.1:${fake.address().port}`, bucket: 'backups', key: 'AKIA', secret: 'shh', pathStyle: true });
  dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'coa-bk-'));
  await seed(dataDir);
  srv = await startServer({ port: 0, dataDir, s3, backups: false });
  srv.base = `http://127.0.0.1:${srv.port}`;
});
after(async () => {
  await srv.close();
  await new Promise((r) => fake.close(r));
  fs.rmSync(dataDir, { recursive: true, force: true });
});

async function login(email) {
  const r = await fetch(`${srv.base}/api/auth/login`, { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-COA': '1' }, body: JSON.stringify({ email, password: PASSWORD }) });
  return /coa_session=[^;]+/.exec(r.headers.get('set-cookie'))[0];
}
const call = (cookie, method, url, body) => fetch(srv.base + url, { method, headers: { Cookie: cookie, 'Content-Type': 'application/json', 'X-COA': '1' }, body: body && JSON.stringify(body) });

describe('tar', () => {
  test('round-trips a directory tree, including nested dirs and empty files', () => {
    const d = fs.mkdtempSync(path.join(os.tmpdir(), 'coa-tar-'));
    fs.mkdirSync(path.join(d, '1'));
    fs.writeFileSync(path.join(d, '1', 'a.pdf'), Buffer.from('hello pdf'));
    fs.writeFileSync(path.join(d, '1', 'empty.txt'), '');
    fs.writeFileSync(path.join(d, 'top.bin'), Buffer.alloc(1000, 7));
    const files = [...untar(tarDirectory(d))];
    assert.deepEqual(files.map((f) => f.name), ['1/a.pdf', '1/empty.txt', 'top.bin']);
    assert.equal(files[0].data.toString(), 'hello pdf');
    assert.equal(files[2].data.length, 1000);
    fs.rmSync(d, { recursive: true, force: true });
  });
});

describe('backup and restore', () => {
  test('writes a signed db + uploads backup, then restores it into a working data dir', async () => {
    const r = await runBackup({ db: srv.app.db, dataDir, s3, date: '2026-10-09' });
    assert.deepEqual(r.keys, ['backups/2026-10-09/app.db.gz', 'backups/2026-10-09/uploads.tar.gz']);
    assert.ok(store.has('backups/2026-10-09/app.db.gz'));
    assert.ok(seenAuth.every((a) => a.startsWith('AWS4-HMAC-SHA256 Credential=AKIA/')), 'every request is signed');
    assert.deepEqual(await listBackups(s3), ['2026-10-09']);

    // The live server keeps working after a snapshot.
    const cookie = await login(JORDAN);
    assert.equal((await call(cookie, 'GET', '/api/dashboard')).status, 200);

    const out = fs.mkdtempSync(path.join(os.tmpdir(), 'coa-restore-'));
    fs.rmSync(out, { recursive: true });
    const res = await restoreBackup({ s3, date: '2026-10-09', dataDir: out });
    assert.equal(res.practices, 1);
    assert.ok(res.files >= 9, `restored ${res.files} uploaded files`);
    const db = new DatabaseSync(path.join(out, 'app.db'));
    assert.equal(db.prepare('SELECT COUNT(*) AS n FROM users').get().n, 3);
    const stored = db.prepare('SELECT stored_name, practice_id FROM resources LIMIT 1').get();
    db.close();
    const orig = fs.readFileSync(path.join(dataDir, 'uploads', String(stored.practice_id), stored.stored_name));
    const copy = fs.readFileSync(path.join(out, 'uploads', String(stored.practice_id), stored.stored_name));
    assert.ok(orig.equals(copy), 'uploaded file bytes identical after restore');
    fs.rmSync(out, { recursive: true, force: true });
  });

  test('refuses to restore into a non-empty directory, and a missing date', async () => {
    await assert.rejects(restoreBackup({ s3, date: '2026-10-09', dataDir }), /not empty/);
    const empty = fs.mkdtempSync(path.join(os.tmpdir(), 'coa-r2-'));
    await assert.rejects(restoreBackup({ s3, date: '1999-01-01', dataDir: empty }), /no backup/);
    fs.rmSync(empty, { recursive: true, force: true });
  });

  test('retention keeps the last 30 days and drops older ones', async () => {
    store.set('backups/2026-08-01/app.db.gz', Buffer.from('old'));
    store.set('backups/2026-08-01/uploads.tar.gz', Buffer.from('old'));
    store.set('backups/2026-10-01/app.db.gz', Buffer.from('recent'));
    const r = await runBackup({ db: srv.app.db, dataDir, s3, date: '2026-10-10' });
    assert.deepEqual(r.removed, ['2026-08-01']);
    assert.deepEqual(await listBackups(s3), ['2026-10-10', '2026-10-09', '2026-10-01']);
  });

  test('only owners can list or trigger backups', async () => {
    const angela = await login(ANGELA);
    const office = await login(OFFICE);
    assert.equal((await call(office, 'POST', '/api/admin/backup')).status, 403);
    assert.equal((await call(office, 'GET', '/api/admin/backups')).status, 403);
    const r = await call(angela, 'POST', '/api/admin/backup');
    assert.equal(r.status, 200);
    const body = await r.json();
    assert.ok(body.bytes > 0);
    const list = await (await call(angela, 'GET', '/api/admin/backups')).json();
    assert.equal(list.enabled, true);
    assert.ok(list.dates.includes(body.date));
  });
});

test('presigned GET matches the AWS SigV4 documented example', async () => {
  const { S3 } = await import('../server/s3.mjs');
  const s3 = new S3({ endpoint: 'https://s3.amazonaws.com', bucket: 'examplebucket', region: 'us-east-1', key: 'AKIAIOSFODNN7EXAMPLE', secret: 'wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY' });
  const url = s3.presignGet('test.txt', { expires: 86400, now: new Date('2013-05-24T00:00:00Z') });
  const { strict: assert } = await import('node:assert');
  assert.ok(url.endsWith('X-Amz-Signature=aeeed9bbccd4d02ee5c0109b86d86835f995330da4c265957d157751f604d404'), url);
});
