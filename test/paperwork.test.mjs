// Paperwork (agreements + tax/employment forms), admin results, and uploaded videos.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { after, before, describe, test } from 'node:test';
import { ANGELA, JORDAN, OFFICE, setup } from './helpers.mjs';

let t;
let angela;
let office;
let jordan;
let jordanId;
before(async () => {
  t = await setup();
  angela = await t.as(ANGELA);
  office = await t.as(OFFICE);
  jordan = await t.as(JORDAN);
  jordanId = t.db.prepare('SELECT id FROM users WHERE email = ?').get(JORDAN).id;
});
after(() => t.close());

const raw = (c, method, url, bytes) => c.req(method, url, bytes, { raw: true, headers: { 'Content-Type': 'application/octet-stream' } });

describe('agreements', () => {
  let formId;
  test('admins write agreements; team members cannot', async () => {
    assert.equal((await jordan.post('/api/admin/forms', { kind: 'sign', title: 'x', body: 'y' })).status, 403);
    assert.equal((await angela.post('/api/admin/forms', { kind: 'sign', title: 'Confidentiality', body: '' })).status, 400);
    const r = await office.post('/api/admin/forms', { kind: 'sign', title: 'Confidentiality agreement', body: 'I will keep client information private.' });
    assert.equal(r.status, 200);
    formId = r.body.id;
  });

  test('signing needs consent and a full typed name, and keeps an audit record', async () => {
    const list = (await jordan.get('/api/forms')).body;
    assert.equal(list.length, 1);
    assert.equal(list[0].status, 'todo');
    assert.equal((await jordan.post(`/api/forms/${formId}/sign`, { typedName: 'Jordan Lee' })).status, 400);
    assert.equal((await jordan.post(`/api/forms/${formId}/sign`, { consent: true, typedName: 'Jordan' })).status, 400);
    const r = await jordan.post(`/api/forms/${formId}/sign`, { consent: true, typedName: 'Jordan Lee', version: 1 });
    assert.equal(r.status, 200);
    const rec = (await jordan.get(`/api/submissions/${r.body.id}`)).body;
    assert.equal(rec.typedName, 'Jordan Lee');
    assert.equal(rec.body, 'I will keep client information private.');
    assert.equal(rec.bodyHash.length, 64);
    assert.equal(rec.ip, undefined, 'the signer does not see the audit IP');
    const adminView = (await angela.get(`/api/submissions/${r.body.id}`)).body;
    assert.equal(typeof adminView.ip, 'string');
    assert.equal((await jordan.get('/api/forms')).body[0].status, 'done');
    assert.deepEqual((await angela.get('/api/forms')).body, [], 'owners are not asked to sign');
    const bell = (await angela.get('/api/notifications')).body;
    assert.ok(JSON.stringify(bell).includes('signed Confidentiality agreement'));
  });

  test('changing the wording makes a new version that must be signed again', async () => {
    const r = await angela.put(`/api/admin/forms/${formId}`, { body: 'I will keep all client information private.' });
    assert.equal(r.body.version, 2);
    assert.equal((await jordan.get('/api/forms')).body[0].status, 'resign');
    assert.equal((await jordan.post(`/api/forms/${formId}/sign`, { consent: true, typedName: 'Jordan Lee', version: 1 })).status, 409);
  });

  test('a signed agreement is archived, not deleted', async () => {
    const r = await angela.del(`/api/admin/forms/${formId}`);
    assert.equal(r.body.archived, true);
    assert.equal((await jordan.get('/api/forms')).body.length, 0);
    await angela.put(`/api/admin/forms/${formId}`, { active: true });
  });
});

describe('tax and employment forms', () => {
  let w4;
  test('off by default: cannot be created until the owner switches them on', async () => {
    assert.equal((await angela.post('/api/admin/forms', { kind: 'upload', title: 'W-4' })).status, 400);
    assert.equal((await office.put('/api/admin/practice', { paperworkEnabled: true })).status, 403, 'only the owner');
    assert.equal((await angela.put('/api/admin/practice', { paperworkEnabled: true })).status, 200);
    const r = await angela.post('/api/admin/forms', { kind: 'upload', title: 'Form W-4', templateUrl: 'https://www.irs.gov/pub/irs-pdf/fw4.pdf' });
    assert.equal(r.status, 200);
    w4 = r.body.id;
  });

  test('uploads are encrypted at rest and only admins can open them', async () => {
    assert.equal((await raw(jordan, 'POST', `/api/forms/${w4}/upload?filename=w4.exe`, Buffer.from('x'))).status, 400);
    const pdf = Buffer.from('%PDF-1.4 secret SSN 123-45-6789');
    assert.equal((await raw(jordan, 'POST', `/api/forms/${w4}/upload?filename=w4.pdf`, pdf)).status, 200);
    const dir = path.join(t.dataDir, 'uploads', String(t.db.prepare('SELECT practice_id FROM users WHERE id = ?').get(jordanId).practice_id), 'paperwork');
    const files = fs.readdirSync(dir);
    assert.equal(files.length, 1);
    assert.ok(!fs.readFileSync(path.join(dir, files[0])).includes(Buffer.from('123-45-6789')), 'not stored in plain text');
    const sub = t.db.prepare('SELECT id FROM form_submissions WHERE form_id = ?').get(w4);
    assert.equal((await jordan.get(`/api/admin/submissions/${sub.id}/file`)).status, 403);
    const got = await angela.get(`/api/admin/submissions/${sub.id}/file`);
    assert.equal(got.status, 200);
    assert.deepEqual(Buffer.from(got.body), pdf);
  });

  test('a new copy replaces the old file; admins can delete the stored copy', async () => {
    assert.equal((await raw(jordan, 'POST', `/api/forms/${w4}/upload?filename=w4.pdf`, Buffer.from('%PDF second'))).status, 200);
    const subs = t.db.prepare('SELECT id, file_deleted_at FROM form_submissions WHERE form_id = ? ORDER BY id').all(w4);
    assert.ok(subs[0].file_deleted_at, 'old copy removed');
    assert.equal((await angela.del(`/api/admin/submissions/${subs[1].id}/file`)).status, 200);
    assert.equal((await angela.get(`/api/admin/submissions/${subs[1].id}/file`)).status, 404);
    const mine = (await jordan.get('/api/forms')).body.find((f) => f.id === w4);
    assert.equal(mine.status, 'done', 'still counts as handed in');
  });

  test('switching them off hides upload forms from the team again', async () => {
    await angela.put('/api/admin/practice', { paperworkEnabled: false });
    assert.ok((await jordan.get('/api/forms')).body.every((f) => f.kind === 'sign'));
    assert.equal((await raw(jordan, 'POST', `/api/forms/${w4}/upload?filename=w4.pdf`, Buffer.from('%PDF'))).status, 404);
  });
});

describe('results', () => {
  test('every quiz answer is recorded; admins see a person’s full record', async () => {
    const qn = t.db.prepare('SELECT id, correct_index, options FROM quiz_questions ORDER BY id LIMIT 1').get();
    const wrong = qn.correct_index === 0 ? 1 : 0;
    await jordan.post(`/api/quiz/${qn.id}/answer`, { index: wrong });
    await jordan.post(`/api/quiz/${qn.id}/answer`, { index: qn.correct_index });
    assert.equal((await jordan.get(`/api/admin/people/${jordanId}`)).status, 403);
    const rec = (await office.get(`/api/admin/people/${jordanId}`)).body;
    assert.equal(rec.person.email, JORDAN);
    const q = rec.sections.flatMap((s) => s.lessons).flatMap((l) => l.quiz).find((x) => x.id === qn.id);
    assert.equal(q.attempts, 2);
    assert.equal(q.firstTry, false);
    assert.equal(q.correct, true);
    assert.ok(rec.summary.quizCorrect >= 1);
    assert.ok(Array.isArray(rec.checklist) && Array.isArray(rec.paperwork));
  });

  test('CSV export: admins only, one row per person, formulas neutralised', async () => {
    assert.equal((await jordan.get('/api/admin/results.csv')).status, 403);
    t.db.prepare('UPDATE users SET name = ? WHERE id = ?').run('=HYPERLINK("x")', jordanId);
    const r = await angela.get('/api/admin/results.csv');
    assert.equal(r.status, 200);
    const text = Buffer.from(r.body).toString('utf8');
    assert.ok(text.startsWith('﻿Name,Email'));
    assert.ok(text.includes(`"'=HYPERLINK(""x"")"`));
    t.db.prepare('UPDATE users SET name = ? WHERE id = ?').run('Jordan Lee', jordanId);
  });
});

describe('uploaded videos', () => {
  test('admins upload; anyone signed in can play with seeking; lessons can use it', async () => {
    const bytes = Buffer.alloc(5000, 7);
    assert.equal((await raw(jordan, 'POST', '/api/admin/videos?filename=a.mp4', bytes)).status, 403);
    assert.equal((await raw(angela, 'POST', '/api/admin/videos?filename=a.exe', bytes)).status, 400);
    const up = await raw(angela, 'POST', '/api/admin/videos?filename=welcome.mp4', bytes);
    assert.equal(up.status, 200);
    const full = await jordan.get(up.body.url);
    assert.equal(full.status, 200);
    assert.equal(Buffer.from(full.body).length, 5000);
    const part = await jordan.get(up.body.url, { headers: { Range: 'bytes=100-199' } });
    assert.equal(part.status, 206);
    assert.equal(Buffer.from(part.body).length, 100);
    const lesson = t.db.prepare('SELECT id FROM lessons ORDER BY id LIMIT 1').get();
    assert.equal((await angela.put(`/api/admin/lessons/${lesson.id}`, { videoUrl: up.body.url })).status, 200);
    assert.equal((await angela.put(`/api/admin/lessons/${lesson.id}`, { videoUrl: '/etc/passwd' })).status, 400);
    assert.equal((await angela.del(`/api/admin/videos/${up.body.id}`)).status, 200);
    assert.equal(t.db.prepare('SELECT video_url FROM lessons WHERE id = ?').get(lesson.id).video_url, '');
    const other = await t.client();
    assert.equal((await other.get(up.body.url)).status, 401);
  });
});
