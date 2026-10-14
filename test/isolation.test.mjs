// Practice isolation (SPEC §2, the #1 rule): a user of practice A must never read or change practice B.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { after, before, describe, test } from 'node:test';
import { ANGELA, JORDAN, OFFICE, setup } from './helpers.mjs';

let t;
let bea; // owner of practice B
let angela; // owner of practice A (The Well)
let office; // admin of practice A
let jordan; // clinician of practice A
const B = {};

before(async () => {
  t = await setup();
  bea = t.client();
  const s = await bea.post('/api/signup', {
    practiceName: 'Brook Counseling', name: 'Bea Brook', email: 'bea@brook.test', password: 'brook-password-1',
  });
  B.practiceId = s.body.practice.id;
  B.ownerId = s.body.me.id;
  B.week = (await bea.post('/api/admin/weeks', { title: 'Week 1', subtitle: 'Brook basics' })).body.id;
  B.lesson = (await bea.post('/api/admin/lessons', { weekId: B.week, title: 'Brook secret lesson', durationMin: 5 })).body.id;
  B.quiz = (
    await bea.put(`/api/admin/lessons/${B.lesson}/quiz`, [{ prompt: 'Brook Q', options: ['a', 'b'], correctIndex: 1 }])
  ).body.quiz[0].id;
  B.item = (await bea.post('/api/admin/checklist', { title: 'Brook checklist item' })).body.id;
  B.resource = (
    await bea.req('POST', `/api/admin/resources?title=Brook+file&filename=brook.txt&lessonId=${B.lesson}`, Buffer.from('brook only'), {
      raw: true,
      headers: { 'Content-Type': 'text/plain' },
    })
  ).body.resource.id;
  await bea.put(`/api/lessons/${B.lesson}/note`, { body: 'Brook private note' });
  await bea.post('/api/questions', { lessonId: B.lesson, body: 'Brook question' });
  B.question = t.db.prepare('SELECT id FROM questions WHERE practice_id = ?').get(B.practiceId).id;
  B.invite = (await bea.post('/api/admin/invites', { email: 'brook-hire@brook.test' })).body.inviteUrl;

  angela = await t.as(ANGELA);
  office = await t.as(OFFICE);
  jordan = await t.as(JORDAN);
});
after(() => t.close());

const count = (sql, ...args) => t.db.prepare(sql).get(...args).n;

describe('learner routes: practice A cannot reach practice B', () => {
  test('lesson read -> 404', async () => {
    const r = await jordan.get(`/api/lessons/${B.lesson}`);
    assert.equal(r.status, 404);
    assert.ok(!JSON.stringify(r.body).includes('Brook'));
  });

  test('progress, complete and note on a foreign lesson -> 404, nothing written', async () => {
    assert.equal((await jordan.post(`/api/lessons/${B.lesson}/progress`, { positionSec: 30 })).status, 404);
    assert.equal((await jordan.post(`/api/lessons/${B.lesson}/complete`)).status, 404);
    assert.equal((await jordan.put(`/api/lessons/${B.lesson}/note`, { body: 'sneaky' })).status, 404);
    assert.equal(count('SELECT COUNT(*) AS n FROM lesson_progress WHERE lesson_id = ?', B.lesson), 0);
    assert.equal(count("SELECT COUNT(*) AS n FROM notes WHERE lesson_id = ? AND body = 'sneaky'", B.lesson), 0);
  });

  test('quiz answer on a foreign question -> 404 (no answer leaked)', async () => {
    const r = await jordan.post(`/api/quiz/${B.quiz}/answer`, { index: 0 });
    assert.equal(r.status, 404);
    assert.equal(r.body.correctIndex, undefined);
  });

  test('checklist toggle on a foreign item -> 404', async () => {
    assert.equal((await jordan.post(`/api/checklist/${B.item}`, { done: true })).status, 404);
    assert.equal(count('SELECT COUNT(*) AS n FROM checklist_done WHERE item_id = ?', B.item), 0);
  });

  test('foreign resource download -> 404', async () => {
    const r = await jordan.get(`/api/resources/${B.resource}/download`);
    assert.equal(r.status, 404);
    assert.ok(!r.headers.get('content-disposition'));
  });

  test('question about a foreign lesson -> 404', async () => {
    assert.equal((await jordan.post('/api/questions', { lessonId: B.lesson, body: 'hi' })).status, 404);
  });

  test('lists never include another practice', async () => {
    const bodies = await Promise.all(
      ['/api/dashboard', '/api/weeks', '/api/resources', '/api/team', '/api/questions'].map((u) => jordan.get(u)),
    );
    for (const r of bodies) {
      assert.equal(r.status, 200);
      assert.ok(!JSON.stringify(r.body).includes('Brook'), 'leaked practice B data');
      assert.ok(!JSON.stringify(r.body).includes('Bea'), 'leaked practice B user');
    }
    assert.equal((await jordan.get('/api/resources')).body.length, 9);
  });
});

describe('admin routes: practice A admins cannot reach practice B', () => {
  test('edit a foreign user -> 404', async () => {
    assert.equal((await angela.put(`/api/admin/users/${B.ownerId}`, { active: false })).status, 404);
    assert.equal((await angela.put(`/api/admin/users/${B.ownerId}`, { role: 'clinician' })).status, 404);
    assert.equal((await office.put(`/api/admin/users/${B.ownerId}`, { title: 'pwned' })).status, 404);
    const bOwner = t.db.prepare('SELECT role, active, title FROM users WHERE id = ?').get(B.ownerId);
    assert.deepEqual({ ...bOwner }, { role: 'owner', active: 1, title: 'Owner' });
  });

  test('weeks, lessons, quiz -> 404', async () => {
    assert.equal((await angela.put(`/api/admin/weeks/${B.week}`, { title: 'x' })).status, 404);
    assert.equal((await angela.del(`/api/admin/weeks/${B.week}`)).status, 404);
    assert.equal((await angela.put(`/api/admin/lessons/${B.lesson}`, { title: 'x' })).status, 404);
    assert.equal((await angela.del(`/api/admin/lessons/${B.lesson}`)).status, 404);
    assert.equal((await angela.put(`/api/admin/lessons/${B.lesson}/quiz`, [])).status, 404);
    assert.equal((await angela.post('/api/admin/lessons', { weekId: B.week, title: 'Planted' })).status, 404);
    assert.equal(count("SELECT COUNT(*) AS n FROM lessons WHERE title = 'Planted'"), 0);
    assert.equal(count('SELECT COUNT(*) AS n FROM quiz_questions WHERE id = ?', B.quiz), 1);
  });

  test('a lesson cannot be moved into a foreign week', async () => {
    assert.equal((await angela.put('/api/admin/lessons/1', { weekId: B.week })).status, 404);
    assert.equal(count('SELECT COUNT(*) AS n FROM lessons WHERE week_id = ?', B.week), 1);
  });

  test('checklist -> 404', async () => {
    assert.equal((await angela.put(`/api/admin/checklist/${B.item}`, { title: 'x' })).status, 404);
    assert.equal((await angela.del(`/api/admin/checklist/${B.item}`)).status, 404);
  });

  test('resources: delete or attach to a foreign lesson -> 404, file kept', async () => {
    assert.equal((await angela.del(`/api/admin/resources/${B.resource}`)).status, 404);
    const { stored_name } = t.db.prepare('SELECT stored_name FROM resources WHERE id = ?').get(B.resource);
    assert.ok(fs.existsSync(path.join(t.dataDir, 'uploads', String(B.practiceId), stored_name)));
    const r = await angela.req('POST', `/api/admin/resources?filename=a.txt&lessonId=${B.lesson}`, Buffer.from('x'), {
      raw: true,
      headers: { 'Content-Type': 'text/plain' },
    });
    assert.equal(r.status, 404);
  });

  test('questions and invites -> 404', async () => {
    assert.equal((await angela.post(`/api/admin/questions/${B.question}/resolve`)).status, 404);
    assert.equal(count('SELECT COUNT(*) AS n FROM questions WHERE id = ? AND resolved_at IS NULL', B.question), 1);
    assert.equal((await angela.del('/api/admin/invites/brook-hire@brook.test')).status, 404);
    assert.equal((await t.client().get(`/api/invites/${B.invite.split('/').pop()}`)).status, 200);
  });

  test('admin lists never include another practice', async () => {
    for (const url of ['/api/admin/team', '/api/admin/content', '/api/admin/questions']) {
      const r = await angela.get(url);
      assert.equal(r.status, 200);
      const raw = JSON.stringify(r.body);
      assert.ok(!raw.includes('Brook') && !raw.includes('brook'), `${url} leaked practice B`);
    }
  });

  test('practice settings only change your own practice', async () => {
    await angela.put('/api/admin/practice', { name: 'The Well' });
    assert.equal(t.db.prepare('SELECT name FROM practices WHERE id = ?').get(B.practiceId).name, 'Brook Counseling');
  });
});

describe('and the other direction: practice B cannot reach The Well', () => {
  test('lesson, download, quiz, checklist, user', async () => {
    assert.equal((await bea.get('/api/lessons/4')).status, 404);
    assert.equal((await bea.get('/api/resources/1/download')).status, 404);
    const qid = t.db.prepare('SELECT id FROM quiz_questions WHERE practice_id = 1').get().id;
    assert.equal((await bea.post(`/api/quiz/${qid}/answer`, { index: 0 })).status, 404);
    assert.equal((await bea.post('/api/checklist/1', { done: true })).status, 404);
    const jordanId = t.db.prepare('SELECT id FROM users WHERE email = ?').get(JORDAN).id;
    assert.equal((await bea.put(`/api/admin/users/${jordanId}`, { active: false })).status, 404);
    assert.equal((await bea.del('/api/admin/lessons/4')).status, 404);
    assert.equal((await bea.del('/api/admin/resources/1')).status, 404);
  });

  test("B's own view is only B's content", async () => {
    const d = (await bea.get('/api/dashboard')).body;
    assert.equal(d.practice.name, 'Brook Counseling');
    assert.equal(d.progress.total, 1);
    assert.deepEqual(d.people, []);
    assert.equal(d.resources.length, 1);
    const lesson = (await bea.get(`/api/lessons/${B.lesson}`)).body;
    assert.equal(lesson.note, 'Brook private note');
    assert.deepEqual(lesson.position, { index: 1, total: 1 });
  });
});
