import assert from 'node:assert/strict';
import { after, before, describe, test } from 'node:test';
import { initials, sizeLabel } from '../server/shapes.mjs';
import { ANGELA, JORDAN, OFFICE, lessonId, setup } from './helpers.mjs';

let t;
let jordan;
before(async () => {
  t = await setup();
  jordan = await t.as(JORDAN);
});
after(() => t.close());

const CARD_KEYS = ['durationMin', 'hasQuiz', 'hasVideo', 'id', 'label', 'posterUrl', 'resourceCount', 'status', 'title', 'videoPlanned'];
const RESOURCE_KEYS = ['category', 'fileType', 'id', 'lessonId', 'sizeLabel', 'title'];

describe('helpers', () => {
  test('sizeLabel', () => {
    assert.equal(sizeLabel(84 * 1024), '84 KB');
    assert.equal(sizeLabel(2.4 * 1024 * 1024), '2.4 MB');
    assert.equal(sizeLabel(500), '500 B');
    assert.equal(sizeLabel(12 * 1024 * 1024), '12 MB');
  });
  test('initials skip honorifics', () => {
    assert.equal(initials('Dr. Angela Claffey'), 'AC');
    assert.equal(initials('Jordan Lee'), 'JL');
    assert.equal(initials('Office manager'), 'OM');
    assert.equal(initials('Cher'), 'C');
  });
});

describe('GET /api/dashboard', () => {
  test("matches the seed: Jordan is 3 of 9, resuming lesson 4", async () => {
    const r = await jordan.get('/api/dashboard');
    assert.equal(r.status, 200);
    const d = r.body;
    assert.deepEqual(Object.keys(d).sort(), ['checklist', 'continue', 'me', 'path', 'people', 'position', 'practice', 'progress', 'quizDue', 'resources']);
    assert.equal(d.me.name, 'Jordan Lee');
    // 9 lessons = 134 min; 40 done; lesson 4 has 18 - 7 watched = 11 left; 5 untouched = 77.
    assert.deepEqual(d.progress, { done: 3, total: 9, percent: 33, minutesLeft: 88 });

    assert.equal(d.continue.lesson.title, 'Faith-integrated care: our model');
    assert.equal(d.continue.lesson.status, 'started');
    assert.deepEqual(Object.keys(d.continue.lesson).sort(), CARD_KEYS);
    assert.equal(d.continue.weekTitle, 'Week 1 · Foundations');
    assert.deepEqual(d.continue.position, { index: 4, total: 9 });
    assert.equal(d.continue.presenter, 'Dr. Angela Claffey');
    assert.match(d.continue.overview, /^Faith is part of how many/);

    assert.equal(d.path.length, 3);
    assert.deepEqual(d.path.map((w) => w.lessons.length), [4, 3, 2]);
    assert.deepEqual(Object.keys(d.path[0]).sort(), ['lessons', 'links', 'locked', 'lockedBy', 'quiz', 'subtitle', 'title', 'weekId']);
    assert.equal(d.path[0].title, 'Week 1');
    assert.equal(d.path[0].subtitle, 'Foundations');
    assert.deepEqual(d.path[0].lessons.map((l) => l.status), ['complete', 'complete', 'complete', 'started']);

    assert.equal(d.checklist.length, 5);
    assert.deepEqual(d.checklist.map((c) => c.done), [true, true, false, false, false]);
    assert.equal(d.checklist[0].title, 'Sign your employment agreement');

    assert.deepEqual(d.people.map((p) => p.name), ['Dr. Angela Claffey', 'Office manager']);
    assert.deepEqual(d.people[0], { id: d.people[0].id, name: 'Dr. Angela Claffey', title: 'Clinical supervisor', initials: 'AC' });

    assert.equal(d.resources.length, 6);
    assert.deepEqual(Object.keys(d.resources[0]).sort(), RESOURCE_KEYS);
    assert.deepEqual(d.resources[0], {
      id: d.resources[0].id, title: 'Clinician handbook', fileType: 'PDF', sizeLabel: '2.4 MB', category: 'Resource', lessonId: null,
    });
  });

  test('people excludes me', async () => {
    const angela = await t.as(ANGELA);
    const d = (await angela.get('/api/dashboard')).body;
    assert.deepEqual(d.people.map((p) => p.name), ['Office manager']);
    const office = await t.as(OFFICE);
    assert.deepEqual((await office.get('/api/dashboard')).body.people.map((p) => p.name), ['Dr. Angela Claffey']);
  });

  test('continue: first not-started for a new user, null when everything is done', async () => {
    const angela = await t.as(ANGELA);
    let d = (await angela.get('/api/dashboard')).body;
    assert.equal(d.continue.lesson.title, 'Welcome from Dr. Claffey');
    assert.deepEqual(d.continue.position, { index: 1, total: 9 });
    for (const w of d.path) for (const l of w.lessons) await angela.post(`/api/lessons/${l.id}/complete`);
    d = (await angela.get('/api/dashboard')).body;
    assert.equal(d.continue, null);
    assert.deepEqual(d.progress, { done: 9, total: 9, percent: 100, minutesLeft: 0 });
  });
});

describe('GET /api/weeks', () => {
  test('weeks with lesson cards', async () => {
    const r = await jordan.get('/api/weeks');
    assert.equal(r.status, 200);
    assert.equal(r.body.length, 3);
    assert.deepEqual(Object.keys(r.body[1]).sort(), ['id', 'lessons', 'links', 'locked', 'lockedBy', 'quiz', 'subtitle', 'title']);
    assert.equal(r.body[1].subtitle, 'Intake and informed consent');
    assert.deepEqual(Object.keys(r.body[0].lessons[0]).sort(), CARD_KEYS);
  });
});

describe('GET /api/lessons/:id', () => {
  test('full lesson, never the correct answer', async () => {
    const id = lessonId(t.db, 'Faith-integrated care: our model');
    const r = await jordan.get(`/api/lessons/${id}`);
    assert.equal(r.status, 200);
    const b = r.body;
    assert.deepEqual(
      Object.keys(b).sort(),
      ['apps', 'forms', 'lesson', 'nextId', 'note', 'noteUpdatedAt', 'position', 'prevId', 'progress', 'quiz', 'quizNext', 'resources', 'sectionQuiz', 'week'],
    );
    assert.equal(b.lesson.label, 'FAITH-INTEGRATED CARE');
    assert.equal(b.lesson.durationMin, 18);
    assert.equal(b.lesson.presenter, 'Dr. Angela Claffey');
    assert.equal(b.lesson.videoUrl, '');
    assert.equal(b.lesson.takeaways.length, 3);
    assert.equal(b.lesson.takeaways[0], 'The client sets the pace. Faith comes in only when they invite it.');
    assert.deepEqual(b.week, { id: b.week.id, title: 'Week 1', subtitle: 'Foundations', links: [] });
    assert.deepEqual(b.position, { index: 4, total: 9 });
    assert.equal(b.prevId, lessonId(t.db, 'HIPAA and client privacy'));
    assert.equal(b.nextId, lessonId(t.db, 'Intake and informed consent'));
    assert.deepEqual(b.progress, { status: 'started', positionSec: 432, quizCorrect: null, completedAt: null });
    assert.deepEqual(b.resources.map((x) => x.title), [
      'Faith-integration framework', 'Consent language for spiritual care', 'Reflection worksheet',
    ]);
    assert.deepEqual(b.resources.map((x) => x.sizeLabel), ['1.1 MB', '42 KB', '120 KB']);

    assert.equal(b.quiz.length, 1);
    assert.deepEqual(Object.keys(b.quiz[0]).sort(), ['id', 'options', 'prompt']);
    assert.equal(b.quiz[0].options.length, 3);
    const raw = JSON.stringify(b);
    assert.ok(!/correct_?index/i.test(raw), 'quiz answer leaked');
    assert.ok(!raw.includes('explanation'));
  });

  test('first lesson has no prevId, last has no nextId', async () => {
    const first = (await jordan.get(`/api/lessons/${lessonId(t.db, 'Welcome from Dr. Claffey')}`)).body;
    assert.equal(first.prevId, null);
    const last = (await jordan.get(`/api/lessons/${lessonId(t.db, 'Insurance, billing and scheduling')}`)).body;
    assert.equal(last.nextId, null);
    assert.deepEqual(last.position, { index: 9, total: 9 });
  });

  test('bad ids -> 404', async () => {
    assert.equal((await jordan.get('/api/lessons/99999')).status, 404);
    assert.equal((await jordan.get('/api/lessons/abc')).status, 404);
    assert.equal((await jordan.get('/api/lessons/-1')).status, 404);
  });
});

describe('quiz', () => {
  test('answer returns correctness and records quiz_correct', async () => {
    const id = lessonId(t.db, 'Faith-integrated care: our model');
    const qid = (await jordan.get(`/api/lessons/${id}`)).body.quiz[0].id;
    const wrong = await jordan.post(`/api/quiz/${qid}/answer`, { index: 1 });
    assert.equal(wrong.status, 200);
    assert.equal(wrong.body.correct, false);
    assert.equal(wrong.body.correctIndex, 0);
    assert.match(wrong.body.explanation, /client sets the pace/);
    assert.equal((await jordan.get(`/api/lessons/${id}`)).body.progress.quizCorrect, false);

    const right = await jordan.post(`/api/quiz/${qid}/answer`, { index: 0 });
    assert.equal(right.body.correct, true);
    const after = (await jordan.get(`/api/lessons/${id}`)).body.progress;
    assert.equal(after.quizCorrect, true);
    assert.equal(after.status, 'started'); // answering doesn't complete or reset
    assert.equal(after.positionSec, 432);
  });

  test('out-of-range index -> 400, unknown question -> 404', async () => {
    const id = lessonId(t.db, 'Faith-integrated care: our model');
    const qid = (await jordan.get(`/api/lessons/${id}`)).body.quiz[0].id;
    assert.equal((await jordan.post(`/api/quiz/${qid}/answer`, { index: 7 })).status, 400);
    assert.equal((await jordan.post('/api/quiz/99999/answer', { index: 0 })).status, 404);
  });
});

describe('progress and complete', () => {
  test('progress marks started; complete returns nextId and counts', async () => {
    const intake = lessonId(t.db, 'Intake and informed consent');
    const p = await jordan.post(`/api/lessons/${intake}/progress`, { positionSec: 65 });
    assert.deepEqual(p.body, { ok: true });
    let lesson = (await jordan.get(`/api/lessons/${intake}`)).body;
    assert.equal(lesson.progress.status, 'started');
    assert.equal(lesson.progress.positionSec, 65);

    const c = await jordan.post(`/api/lessons/${intake}/complete`);
    assert.deepEqual(c.body, { ok: true, nextId: lessonId(t.db, 'Documentation and session notes'), quizWeekId: null });
    lesson = (await jordan.get(`/api/lessons/${intake}`)).body;
    assert.equal(lesson.progress.status, 'complete');
    assert.ok(lesson.progress.completedAt);

    // Saving position later must not un-complete it.
    await jordan.post(`/api/lessons/${intake}/progress`, { positionSec: 10 });
    assert.equal((await jordan.get(`/api/lessons/${intake}`)).body.progress.status, 'complete');
    assert.equal((await jordan.get('/api/dashboard')).body.progress.done, 4);

    // Continue still points at the started lesson 4.
    assert.equal((await jordan.get('/api/dashboard')).body.continue.lesson.title, 'Faith-integrated care: our model');
  });

  test('completing the last lesson -> nextId null; bad positionSec -> 400', async () => {
    const last = lessonId(t.db, 'Insurance, billing and scheduling');
    assert.equal((await jordan.post(`/api/lessons/${last}/complete`)).body.nextId, null);
    assert.equal((await jordan.post(`/api/lessons/${last}/progress`, { positionSec: -4 })).status, 400);
    assert.equal((await jordan.post(`/api/lessons/${last}/progress`, { positionSec: 'abc' })).status, 400);
  });
});

describe('notes', () => {
  test('PUT saves, GET lesson returns it', async () => {
    const id = lessonId(t.db, 'Our story and mission');
    const r = await jordan.put(`/api/lessons/${id}/note`, { body: 'Ask about the founding story.' });
    assert.equal(r.status, 200);
    assert.equal(r.body.ok, true);
    assert.ok(Date.parse(r.body.updatedAt));
    const lesson = (await jordan.get(`/api/lessons/${id}`)).body;
    assert.equal(lesson.note, 'Ask about the founding story.');
    assert.equal(lesson.noteUpdatedAt, r.body.updatedAt);
    await jordan.put(`/api/lessons/${id}/note`, { body: 'Updated.' });
    assert.equal((await jordan.get(`/api/lessons/${id}`)).body.note, 'Updated.');
    // Notes are per user.
    const office = await t.as(OFFICE);
    assert.equal((await office.get(`/api/lessons/${id}`)).body.note, '');
  });
});

describe('checklist', () => {
  test('toggle on and off', async () => {
    const items = (await jordan.get('/api/dashboard')).body.checklist;
    const third = items[2];
    assert.deepEqual((await jordan.post(`/api/checklist/${third.id}`, { done: true })).body, { ok: true });
    assert.equal((await jordan.get('/api/dashboard')).body.checklist[2].done, true);
    await jordan.post(`/api/checklist/${third.id}`, { done: true }); // idempotent
    await jordan.post(`/api/checklist/${third.id}`, { done: false });
    assert.equal((await jordan.get('/api/dashboard')).body.checklist[2].done, false);
    assert.equal((await jordan.post(`/api/checklist/${third.id}`, { done: 'yes' })).status, 400);
    assert.equal((await jordan.post('/api/checklist/99999', { done: true })).status, 404);
  });
});

describe('resources, team, questions', () => {
  test('GET /api/resources returns every resource for the practice', async () => {
    const r = await jordan.get('/api/resources');
    assert.equal(r.body.length, 9);
    const crisis = r.body.find((x) => x.title === 'Crisis and safety protocol');
    assert.equal(crisis.category, 'Policy');
    assert.equal(r.body.find((x) => x.title === 'Brand kit and email signature').sizeLabel, '6.8 MB');
  });

  test('GET /api/team lists active users', async () => {
    const r = await jordan.get('/api/team');
    assert.equal(r.status, 200);
    for (const u of r.body) assert.deepEqual(Object.keys(u).sort(), ['id', 'initials', 'name', 'role', 'title']);
    assert.ok(r.body.some((u) => u.name === 'Jordan Lee' && u.role === 'clinician'));
  });

  test('POST /api/questions with and without a lesson', async () => {
    const id = lessonId(t.db, 'Faith-integrated care: our model');
    const asked = (await jordan.post('/api/questions', { lessonId: id, body: 'Where do I record consent?' })).body;
    assert.equal(asked.ok, true);
    assert.equal(typeof asked.id, 'number');
    assert.equal((await jordan.post('/api/questions', { body: 'General question' })).status, 200);
    assert.equal((await jordan.post('/api/questions', { body: '  ' })).status, 400);
    assert.equal((await jordan.post('/api/questions', { lessonId: 99999, body: 'x' })).status, 404);
    const mine = (await jordan.get('/api/questions')).body;
    assert.equal(mine.length, 2);
    assert.equal(mine[1].lessonTitle, 'Faith-integrated care: our model');
  });
});
