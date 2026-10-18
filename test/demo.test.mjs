// The public demo: each visitor gets their own sample practice; nothing leaks to real practices or other visitors.
import assert from 'node:assert/strict';
import { after, before, describe, test } from 'node:test';
import { sweepDemos } from '../server/demo.mjs';
import { ANGELA, setup } from './helpers.mjs';

let t;
before(async () => {
  t = await setup();
});
after(() => t.close());

describe('starting a demo', () => {
  let visitor;
  test('one click makes a fresh sample practice and signs you in as a new clinician', async () => {
    visitor = await t.client();
    const r = await visitor.post('/api/demo/start', { as: 'clinician' });
    assert.equal(r.status, 200);
    assert.equal(r.body.practice.isDemo, true);
    assert.equal(r.body.practice.name, 'Cedar Grove Counseling');
    assert.equal(r.body.me.role, 'clinician');
    const weeks = (await visitor.get('/api/weeks')).body;
    assert.equal(weeks.length, 3);
    assert.equal(weeks[1].locked, true, 'the quiz gate works in the demo');
    const first = weeks[0].lessons[0].id;
    const lesson = (await visitor.get(`/api/lessons/${first}`)).body.lesson;
    assert.equal(lesson.videoUrl, '/demo/welcome.mp4');
  });

  test('the owner view has a sample team with results to look at', async () => {
    const owner = await t.client();
    const r = await owner.post('/api/demo/start', { as: 'owner' });
    assert.equal(r.body.me.role, 'owner');
    const team = (await owner.get('/api/admin/team')).body.users;
    assert.ok(team.some((u) => u.name === 'Tess Alvarez' && u.lessonsDone === 6));
    assert.ok(!team.some((u) => /Maya|Priya/.test(u.name)), 'the demo uses its own cast');
    const maya = team.find((u) => u.name === 'Tess Alvarez');
    const rec = (await owner.get(`/api/admin/people/${maya.id}`)).body;
    assert.equal(rec.summary.sectionQuizzesPassed, 2);
    const quiz = (await owner.get(`/api/admin/sections/${(await owner.get('/api/admin/content')).body.weeks[0].id}/quiz`)).body;
    assert.ok(quiz.stats.passed >= 2);
    assert.ok(quiz.questions.some((x) => x.asked > 0), 'sample tries count toward question stats');
    const files = (await owner.get('/api/resources')).body;
    const list = files.resources ?? files;
    assert.equal(list.length, 9, 'the Resources page is full (3 x 3)');
    assert.deepEqual(list.map((f) => f.category).sort(), [...Array(4).fill('Policy'), ...Array(5).fill('Resource')]);
    for (const f of list) {
      assert.ok(f.pages > 0 && f.previewUrl && f.updatedAt, `${f.title} has pages, a preview and a date`);
    }
    const handbook = list.find((f) => f.title === 'Clinician handbook');
    assert.equal(handbook.pages, 42);
    const dl = await owner.get(`/api/resources/${handbook.id}/download`);
    assert.equal(dl.status, 200);
    assert.equal(dl.body.subarray(0, 5).toString(), '%PDF-');
    assert.equal((await owner.get(handbook.previewUrl)).headers.get('content-type'), 'image/png');
  });

  test('switching between owner and clinician stays inside your own copy', async () => {
    const before = (await visitor.get('/api/dashboard')).body.practice.id;
    const r = await visitor.post('/api/demo/switch');
    assert.equal(r.body.me.role, 'owner');
    assert.equal(r.body.practice.id, before);
    const back = await visitor.post('/api/demo/switch');
    assert.equal(back.body.me.role, 'clinician');
  });

  test('visitors can’t see each other or a real practice', async () => {
    const other = await t.client();
    await other.post('/api/demo/start', { as: 'clinician' });
    const a = (await visitor.get('/api/dashboard')).body.practice.id;
    const b = (await other.get('/api/dashboard')).body.practice.id;
    assert.notEqual(a, b);
    const theWell = t.db.prepare("SELECT id FROM lessons WHERE practice_id = (SELECT id FROM practices WHERE slug = 'the-well') LIMIT 1").get().id;
    assert.equal((await visitor.get(`/api/lessons/${theWell}`)).status, 404);
    const angela = await t.as(ANGELA);
    assert.equal((await angela.post('/api/demo/switch')).status, 404, 'real practices have no demo switch');
  });

  test('uploads, invites, settings and passwords are turned off in a demo', async () => {
    const owner = await t.client();
    await owner.post('/api/demo/start', { as: 'owner' });
    const raw = (url) => owner.req('POST', url, Buffer.from('x'), { raw: true, headers: { 'Content-Type': 'application/octet-stream' } });
    assert.equal((await raw('/api/admin/resources?filename=a.pdf&title=a')).status, 403);
    assert.equal((await raw('/api/admin/videos?filename=a.mp4')).status, 403);
    assert.equal((await owner.post('/api/admin/invites', { email: 'x@example.com', name: 'X', title: '', role: 'clinician' })).status, 403);
    assert.equal((await owner.put('/api/admin/practice', { name: 'Hacked' })).status, 403);
    assert.equal((await owner.put('/api/account/password', { next: 'a-long-new-password' })).status, 403);
    // Editing the course is allowed: that's the point of the demo.
    const w = (await owner.get('/api/admin/content')).body.weeks[0];
    assert.equal((await owner.put(`/api/admin/weeks/${w.id}`, { title: 'Week 1', subtitle: 'Renamed' })).status, 200);
  });

  test('old demo copies are deleted, and only demo copies', async () => {
    const realBefore = t.db.prepare('SELECT COUNT(*) AS n FROM practices WHERE is_demo = 0').get().n;
    t.db.prepare("UPDATE practices SET created_at = '2000-01-01T00:00:00.000Z'").run();
    const removed = sweepDemos(t.db, t.dataDir);
    assert.ok(removed >= 4);
    assert.equal(t.db.prepare('SELECT COUNT(*) AS n FROM practices WHERE is_demo = 1').get().n, 0);
    assert.equal(t.db.prepare('SELECT COUNT(*) AS n FROM practices WHERE is_demo = 0').get().n, realBefore);
    assert.equal(t.db.prepare("SELECT COUNT(*) AS n FROM users WHERE email LIKE '%@demo.invalid'").get().n, 0);
    assert.equal((await visitor.get('/api/dashboard')).status, 401, 'their session ended with the copy');
  });
});

describe('static files', () => {
  test('the sample video is served as video with byte ranges (Safari needs them)', async () => {
    const fs = await import('node:fs');
    const path = await import('node:path');
    const { serveStatic } = await import('../server/static.mjs');
    const dir = fs.mkdtempSync(path.join((await import('node:os')).tmpdir(), 'static-'));
    fs.mkdirSync(path.join(dir, 'demo'));
    fs.writeFileSync(path.join(dir, 'demo', 'v.mp4'), Buffer.alloc(1000, 1));
    fs.writeFileSync(path.join(dir, 'index.html'), '<title>x</title>');
    const call = (range) => new Promise((resolve) => {
      const res = { headers: {}, writeHead(code, h) { this.code = code; this.headers = h; }, end() { resolve(this); }, write() {}, on() {}, once() {}, emit() {}, removeListener() {} };
      const chunks = [];
      res.write = (c) => { chunks.push(c); return true; };
      res.end = (c) => { if (c) chunks.push(c); res.body = Buffer.concat(chunks.map((x) => Buffer.from(x))); resolve(res); };
      serveStatic({ method: 'GET', headers: range ? { range } : {} }, res, '/demo/v.mp4', dir);
    });
    const full = await call();
    assert.equal(full.code, 200);
    assert.equal(full.headers['Content-Type'], 'video/mp4');
    assert.equal(full.headers['Accept-Ranges'], 'bytes');
    const part = await call('bytes=100-199');
    assert.equal(part.code, 206);
    assert.equal(part.headers['Content-Range'], 'bytes 100-199/1000');
    assert.equal(part.headers['Content-Length'], 100);
    assert.equal((await call('bytes=5000-')).code, 416);
  });
});
