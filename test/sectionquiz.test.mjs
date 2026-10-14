// Section quizzes: a pool of questions per section, a fresh draw each try, and the next section locked until passed.
import assert from 'node:assert/strict';
import { after, before, describe, test } from 'node:test';
import { ANGELA, JORDAN, OFFICE, lessonId, setup } from './helpers.mjs';

let t;
let angela;
let office;
let jordan;
let week1;
let week2;
before(async () => {
  t = await setup();
  angela = await t.as(ANGELA);
  office = await t.as(OFFICE);
  jordan = await t.as(JORDAN);
  const weeks = t.db.prepare('SELECT id FROM weeks ORDER BY position').all();
  week1 = weeks[0].id;
  week2 = weeks[1].id;
});
after(() => t.close());

const intake = () => lessonId(t.db, 'Intake and informed consent'); // first step of week 2
const lastOfWeek1 = () => lessonId(t.db, 'Faith-integrated care: our model');
const q = (n) => ({ prompt: `Question ${n}?`, options: [`Right ${n}`, `Wrong ${n}a`, `Wrong ${n}b`], correctIndex: 0, explanation: `Because ${n}.` });
/** The right answer for each question in an attempt (read from the stored snapshot, as the server grades it). */
const rightAnswers = (attemptId) => JSON.parse(t.db.prepare('SELECT items FROM quiz_attempts WHERE id = ?').get(attemptId).items).map((x) => x.correct);

describe('building the pool (admins)', () => {
  test('admins add questions and set the quiz up; staff cannot', async () => {
    assert.equal((await jordan.post(`/api/admin/sections/${week1}/questions`, q(0))).status, 403);
    assert.equal((await angela.post(`/api/admin/sections/${week1}/questions`, { prompt: 'x', options: ['only one'], correctIndex: 0 })).status, 400);
    assert.equal((await angela.post(`/api/admin/sections/${week1}/questions`, { ...q(0), correctIndex: 5 })).status, 400);
    for (let n = 1; n <= 6; n++) assert.equal((await office.post(`/api/admin/sections/${week1}/questions`, q(n))).status, 200);
    assert.equal((await angela.put(`/api/admin/sections/${week1}/quiz`, { passPercent: 20 })).status, 400);
    const r = await angela.put(`/api/admin/sections/${week1}/quiz`, { enabled: true, drawCount: 3, passPercent: 67 });
    assert.equal(r.status, 200);
    assert.equal(r.body.settings.active, true);
    assert.equal(r.body.questions.length, 6);
    const content = (await angela.get('/api/admin/content')).body;
    assert.deepEqual(content.weeks[0].quiz, { enabled: true, active: true, poolSize: 6, drawCount: 3, drawSetting: 3, passPercent: 67 });
  });

  test('the pool can start from the section’s quick checks, without duplicates', async () => {
    const before = (await angela.get(`/api/admin/sections/${week2}/quiz`)).body;
    assert.ok(before.importable >= 1);
    const r = await angela.post(`/api/admin/sections/${week2}/questions/import`);
    assert.equal(r.body.added, before.importable);
    const again = await angela.post(`/api/admin/sections/${week2}/questions/import`);
    assert.equal(again.body.added, 0);
  });
});

describe('taking it (staff)', () => {
  let first;
  test('the next section is locked until the quiz is passed', async () => {
    const weeks = (await jordan.get('/api/weeks')).body;
    assert.equal(weeks[0].locked, false);
    assert.equal(weeks[1].locked, true);
    assert.equal(weeks[1].lockedBy.weekId, week1);
    const r = await jordan.get(`/api/lessons/${intake()}`);
    assert.equal(r.status, 403);
    assert.equal(r.body.locked.weekId, week1);
    assert.equal((await jordan.post(`/api/lessons/${intake()}/complete`)).status, 403);
    assert.equal((await angela.get(`/api/lessons/${intake()}`)).status, 200, 'owners are never locked out');
  });

  test('the quiz opens once every step in the section is done', async () => {
    assert.equal((await jordan.post(`/api/sections/${week1}/quiz/start`)).status, 409);
    const lesson = (await jordan.get(`/api/lessons/${lastOfWeek1()}`)).body;
    assert.equal(lesson.quizNext, true);
    const c = await jordan.post(`/api/lessons/${lastOfWeek1()}/complete`);
    assert.equal(c.body.quizWeekId, week1);
    const dash = (await jordan.get('/api/dashboard')).body;
    assert.equal(dash.quizDue.weekId, week1);
  });

  test('a try draws questions from the pool and never sends the answers', async () => {
    const r = await jordan.post(`/api/sections/${week1}/quiz/start`);
    assert.equal(r.status, 200);
    first = r.body.attempt;
    assert.equal(first.questions.length, 3);
    assert.equal(first.toPass, 3, '67% of 3 rounds up to 3');
    const raw = JSON.stringify(first.questions);
    assert.ok(!raw.includes('correct'), 'no correct answers before submitting');
    assert.equal(first.correct, null);
    assert.ok(!raw.includes('Because'), 'no explanations before submitting');
    const again = await jordan.post(`/api/sections/${week1}/quiz/start`);
    assert.equal(again.body.attempt.id, first.id, 'refreshing resumes the same try');
  });

  test('failing shows what was wrong, but not the right answers; the next try asks different questions', async () => {
    assert.equal((await jordan.post(`/api/quiz-attempts/${first.id}/submit`, { answers: [0] })).status, 400);
    const right = rightAnswers(first.id);
    const wrong = right.map((c) => (c === 0 ? 1 : 0));
    const r = await jordan.post(`/api/quiz-attempts/${first.id}/submit`, { answers: wrong });
    assert.equal(r.body.attempt.passed, false);
    assert.equal(r.body.attempt.correct, 0);
    assert.ok(r.body.attempt.questions.every((x) => x.correct === false && x.explanation && x.correctIndex === undefined));
    assert.equal((await jordan.post(`/api/quiz-attempts/${first.id}/submit`, { answers: wrong })).status, 409);
    const second = (await jordan.post(`/api/sections/${week1}/quiz/start`)).body.attempt;
    const prompts = (a) => new Set(a.questions.map((x) => x.prompt));
    const overlap = [...prompts(second)].filter((p) => prompts(first).has(p));
    assert.equal(overlap.length, 0, 'a pool of 6 with 3 per try gives a whole new set');
    first = second;
  });

  test('passing unlocks the next section and tells the staff', async () => {
    const r = await jordan.post(`/api/quiz-attempts/${first.id}/submit`, { answers: rightAnswers(first.id) });
    assert.equal(r.body.attempt.passed, true);
    assert.equal(r.body.attempt.percent, 100);
    assert.ok(r.body.attempt.questions.every((x) => typeof x.correctIndex === 'number'));
    assert.equal(r.body.next.weekId, week2);
    assert.equal(r.body.next.firstLessonId, intake());
    assert.equal((await jordan.get(`/api/lessons/${intake()}`)).status, 200);
    const bell = (await angela.get('/api/notifications')).body;
    assert.ok(JSON.stringify(bell).includes('passed the Foundations quiz (100%)'));
    const status = (await jordan.get(`/api/sections/${week1}/quiz`)).body;
    assert.equal(status.quiz.passed, true);
    assert.equal(status.history.length, 2);
  });

  test('another person cannot see or submit my try', async () => {
    const mine = t.db.prepare('SELECT id FROM quiz_attempts ORDER BY id DESC LIMIT 1').get().id;
    assert.equal((await office.post(`/api/quiz-attempts/${mine}/submit`, { answers: [0, 0, 0] })).status, 404);
  });
});

describe('results and upkeep', () => {
  test('admins see per-question stats and each person’s tries', async () => {
    const quiz = (await angela.get(`/api/admin/sections/${week1}/quiz`)).body;
    assert.equal(quiz.stats.tries, 2);
    assert.equal(quiz.stats.passed, 1);
    assert.equal(quiz.questions.reduce((n, x) => n + x.asked, 0), 6);
    const jordanId = t.db.prepare('SELECT id FROM users WHERE email = ?').get(JORDAN).id;
    const rec = (await angela.get(`/api/admin/people/${jordanId}`)).body;
    assert.equal(rec.sections[0].sectionQuiz.passed, true);
    assert.equal(rec.sections[0].sectionQuiz.tries, 2);
    assert.equal(rec.summary.sectionQuizzesPassed, 1);
  });

  test('editing and retiring questions keeps past tries intact', async () => {
    const quiz = (await angela.get(`/api/admin/sections/${week1}/quiz`)).body;
    const id = quiz.questions[0].id;
    assert.equal((await angela.put(`/api/admin/section-questions/${id}`, { prompt: 'Edited?' })).body.questions[0].prompt, 'Edited?');
    const after = (await angela.del(`/api/admin/section-questions/${id}`)).body;
    assert.equal(after.questions.length, 5);
    assert.equal((await jordan.get(`/api/sections/${week1}/quiz`)).body.history.length, 2);
    assert.equal((await angela.put(`/api/admin/section-questions/${id}`, { prompt: 'x' })).status, 404);
  });

  test('switching the quiz off unlocks everything again', async () => {
    await angela.put(`/api/admin/sections/${week2}/quiz`, { enabled: true });
    const weeks = (await jordan.get('/api/weeks')).body;
    assert.equal(weeks[2].locked, true, 'week 3 waits on the week 2 quiz');
    await angela.put(`/api/admin/sections/${week2}/quiz`, { enabled: false });
    assert.equal((await jordan.get('/api/weeks')).body[2].locked, false);
  });
});
