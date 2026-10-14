// Section quizzes: taking them (staff) and building the question pool (admins).
import { now } from '../db.mjs';
import { fail, intId, readJson } from '../http.mjs';
import { notify, staffIds } from '../notify.mjs';
import * as q from '../queries.mjs';
import { PASS_MARKS, attemptShape, drawQuestions, poolSizes, quizSettings, sectionStates } from '../sectionquiz.mjs';
import { parseList } from '../shapes.mjs';
import * as v from '../validate.mjs';

const auth = { auth: 'user' };
const admin = { auth: 'admin' };
const OPEN_FOR_MS = 24 * 60 * 60 * 1000; // an unfinished try is resumed for a day, so refreshing can't re-roll it

function ownWeek(ctx, id) {
  const w = ctx.db.prepare('SELECT * FROM weeks WHERE id = ? AND practice_id = ?').get(intId(id), ctx.user.practice_id);
  if (!w) fail(404, 'That section was not found.');
  return w;
}

const sectionName = (w) => w.subtitle || w.title;

function myState(ctx, week) {
  const { db, user } = ctx;
  const weeks = q.weeks(db, user.practice_id);
  const lessons = q.orderedLessons(db, user.practice_id, user.id);
  return sectionStates(db, user, weeks, lessons).get(week.id);
}

function nextWeekAfter(ctx, week) {
  const weeks = q.weeks(ctx.db, ctx.user.practice_id);
  const i = weeks.findIndex((w) => w.id === week.id);
  const next = weeks[i + 1];
  if (!next) return null;
  const first = ctx.db.prepare('SELECT id FROM lessons WHERE week_id = ? AND practice_id = ? ORDER BY position, id LIMIT 1').get(next.id, ctx.user.practice_id);
  return { weekId: next.id, title: sectionName(next), firstLessonId: first?.id ?? null };
}

function openAttempt(ctx, weekId) {
  const a = ctx.db
    .prepare('SELECT * FROM quiz_attempts WHERE practice_id = ? AND user_id = ? AND week_id = ? AND submitted_at IS NULL ORDER BY id DESC LIMIT 1')
    .get(ctx.user.practice_id, ctx.user.id, weekId);
  return a && Date.now() - Date.parse(a.started_at) < OPEN_FOR_MS ? a : null;
}

function questionFields(body, partial = false) {
  const f = {};
  if (!partial || body.prompt !== undefined) f.prompt = v.text(body.prompt, 'Question', { max: 1000 });
  if (!partial || body.options !== undefined) {
    const options = v.stringList(body.options, 'Answers', { max: 6, maxLen: 300 });
    if (options.length < 2) fail(400, 'A question needs at least two answers.');
    f.options = JSON.stringify(options);
  }
  if (!partial || body.correctIndex !== undefined) {
    const n = f.options ? JSON.parse(f.options).length : 6;
    f.correct_index = v.int(body.correctIndex, 'Correct answer', { max: n - 1 });
  }
  if (body.explanation !== undefined) f.explanation = v.text(body.explanation, 'Why', { max: 2000, optional: true });
  return f;
}

/** Per question: how often it's been asked and answered right, from every submitted try. */
function questionStats(db, pid, weekId) {
  const stats = new Map();
  for (const a of db.prepare('SELECT items FROM quiz_attempts WHERE practice_id = ? AND week_id = ? AND submitted_at IS NOT NULL').all(pid, weekId)) {
    for (const x of JSON.parse(a.items)) {
      const s = stats.get(x.qid) ?? { asked: 0, right: 0 };
      s.asked += 1;
      if (x.choice === x.correct) s.right += 1;
      stats.set(x.qid, s);
    }
  }
  return stats;
}

function adminQuiz(ctx, week) {
  const { db } = ctx;
  const pid = ctx.user.practice_id;
  const rows = db.prepare('SELECT * FROM section_questions WHERE practice_id = ? AND week_id = ? AND active = 1 ORDER BY id').all(pid, week.id);
  const stats = questionStats(db, pid, week.id);
  const attempts = db.prepare('SELECT user_id, passed FROM quiz_attempts WHERE practice_id = ? AND week_id = ? AND submitted_at IS NOT NULL').all(pid, week.id);
  const people = new Set(attempts.map((a) => a.user_id));
  const passedPeople = new Set(attempts.filter((a) => a.passed).map((a) => a.user_id));
  const prompts = new Set(rows.map((r) => r.prompt.trim().toLowerCase()));
  const importable = db
    .prepare('SELECT qq.prompt FROM quiz_questions qq JOIN lessons l ON l.id = qq.lesson_id WHERE l.week_id = ? AND qq.practice_id = ?')
    .all(week.id, pid)
    .filter((r) => !prompts.has(r.prompt.trim().toLowerCase())).length;
  return {
    section: { id: week.id, title: week.title, subtitle: week.subtitle || '' },
    settings: { ...quizSettings(week, rows.length), passMarks: PASS_MARKS },
    questions: rows.map((r) => ({
      id: r.id, prompt: r.prompt, options: parseList(r.options), correctIndex: r.correct_index, explanation: r.explanation || '',
      asked: stats.get(r.id)?.asked ?? 0, right: stats.get(r.id)?.right ?? 0,
    })),
    stats: { tries: attempts.length, people: people.size, passed: passedPeople.size },
    importable,
  };
}

export default function register(router) {
  // ---- Staff ----
  router.add('GET', '/api/sections/:id/quiz', (ctx) => {
    const week = ownWeek(ctx, ctx.params.id);
    const state = myState(ctx, week);
    if (!state.quiz) fail(404, 'This section has no quiz.');
    const history = ctx.db
      .prepare('SELECT * FROM quiz_attempts WHERE practice_id = ? AND user_id = ? AND week_id = ? AND submitted_at IS NOT NULL ORDER BY id DESC LIMIT 10')
      .all(ctx.user.practice_id, ctx.user.id, week.id)
      .map((a) => ({ id: a.id, percent: a.total ? Math.round((a.correct / a.total) * 100) : 0, passed: Boolean(a.passed), submittedAt: a.submitted_at }));
    const open = openAttempt(ctx, week.id);
    return {
      section: { id: week.id, title: week.title, subtitle: week.subtitle || '' },
      quiz: state.quiz,
      locked: state.locked,
      lockedBy: state.lockedBy,
      attempt: open ? attemptShape(open) : null,
      history,
      next: nextWeekAfter(ctx, week),
    };
  }, auth);

  router.add('POST', '/api/sections/:id/quiz/start', (ctx) => {
    const week = ownWeek(ctx, ctx.params.id);
    const state = myState(ctx, week);
    if (!state.quiz) fail(404, 'This section has no quiz.');
    if (state.locked) fail(403, `Pass the ${state.lockedBy.title} quiz first.`, { locked: state.lockedBy });
    if (!state.quiz.ready) fail(409, 'Finish every step in this section first.');
    const open = openAttempt(ctx, week.id);
    if (open) return { attempt: attemptShape(open) };
    const last = ctx.db
      .prepare('SELECT items FROM quiz_attempts WHERE practice_id = ? AND user_id = ? AND week_id = ? AND submitted_at IS NOT NULL ORDER BY id DESC LIMIT 1')
      .get(ctx.user.practice_id, ctx.user.id, week.id);
    const items = drawQuestions(ctx.db, ctx.user.practice_id, week.id, state.quiz.drawCount, last ? JSON.parse(last.items) : []);
    const id = Number(ctx.db
      .prepare('INSERT INTO quiz_attempts(practice_id, user_id, week_id, items, pass_percent, started_at) VALUES (?,?,?,?,?,?)')
      .run(ctx.user.practice_id, ctx.user.id, week.id, JSON.stringify(items), state.quiz.passPercent, now()).lastInsertRowid);
    return { attempt: attemptShape(ctx.db.prepare('SELECT * FROM quiz_attempts WHERE id = ?').get(id)) };
  }, auth);

  router.add('POST', '/api/quiz-attempts/:id/submit', async (ctx) => {
    const a = ctx.db.prepare('SELECT * FROM quiz_attempts WHERE id = ? AND practice_id = ? AND user_id = ?').get(intId(ctx.params.id), ctx.user.practice_id, ctx.user.id);
    if (!a) fail(404, 'That quiz was not found.');
    if (a.submitted_at) fail(409, 'This try was already handed in. Start a new one.');
    const items = JSON.parse(a.items);
    const body = await readJson(ctx.req);
    if (!Array.isArray(body.answers) || body.answers.length !== items.length) fail(400, 'Answer every question first.');
    items.forEach((x, i) => {
      const c = body.answers[i];
      if (!Number.isInteger(c) || c < 0 || c >= x.options.length) fail(400, `Answer question ${i + 1} first.`);
      x.choice = c;
    });
    const correct = items.filter((x) => x.choice === x.correct).length;
    const passed = correct >= Math.ceil((items.length * a.pass_percent) / 100 - 1e-9);
    ctx.db
      .prepare('UPDATE quiz_attempts SET items = ?, submitted_at = ?, correct = ?, total = ?, passed = ? WHERE id = ?')
      .run(JSON.stringify(items), now(), correct, items.length, passed ? 1 : 0, a.id);
    if (passed) {
      const week = ctx.db.prepare('SELECT * FROM weeks WHERE id = ?').get(a.week_id);
      const firstPass = !ctx.db.prepare('SELECT 1 FROM quiz_attempts WHERE practice_id = ? AND user_id = ? AND week_id = ? AND passed = 1 AND id != ?').get(a.practice_id, a.user_id, a.week_id, a.id);
      if (firstPass) {
        notify(ctx.db, {
          practiceId: a.practice_id, userIds: staffIds(ctx.db, a.practice_id), except: ctx.user.id, kind: 'quiz',
          title: `${ctx.user.name} passed the ${sectionName(week)} quiz (${Math.round((correct / items.length) * 100)}%)`,
          link: `/admin/people/${ctx.user.id}`,
        });
      }
    }
    const done = ctx.db.prepare('SELECT * FROM quiz_attempts WHERE id = ?').get(a.id);
    const week = ctx.db.prepare('SELECT * FROM weeks WHERE id = ?').get(a.week_id);
    return { attempt: attemptShape(done), next: passed ? nextWeekAfter(ctx, week) : null };
  }, auth);

  // ---- Admins: build the pool ----
  router.add('GET', '/api/admin/sections/:id/quiz', (ctx) => adminQuiz(ctx, ownWeek(ctx, ctx.params.id)), admin);

  router.add('PUT', '/api/admin/sections/:id/quiz', async (ctx) => {
    const week = ownWeek(ctx, ctx.params.id);
    const body = await readJson(ctx.req);
    const f = {};
    if (body.enabled !== undefined) {
      if (typeof body.enabled !== 'boolean') fail(400, 'enabled must be true or false.');
      f.quiz_on = body.enabled ? 1 : 0;
    }
    if (body.drawCount !== undefined) f.quiz_draw = v.int(body.drawCount, 'Questions per try', { min: 1, max: 50 });
    if (body.passPercent !== undefined) {
      f.quiz_pass = v.int(body.passPercent, 'Pass mark', { min: 50, max: 100 });
    }
    const keys = Object.keys(f);
    if (keys.length) ctx.db.prepare(`UPDATE weeks SET ${keys.map((k) => `${k} = ?`).join(', ')} WHERE id = ? AND practice_id = ?`).run(...Object.values(f), week.id, ctx.user.practice_id);
    return adminQuiz(ctx, ownWeek(ctx, week.id));
  }, admin);

  router.add('POST', '/api/admin/sections/:id/questions', async (ctx) => {
    const week = ownWeek(ctx, ctx.params.id);
    const f = questionFields(await readJson(ctx.req));
    ctx.db
      .prepare('INSERT INTO section_questions(practice_id, week_id, prompt, options, correct_index, explanation, created_at, updated_at) VALUES (?,?,?,?,?,?,?,?)')
      .run(ctx.user.practice_id, week.id, f.prompt, f.options, f.correct_index, f.explanation ?? '', now(), now());
    return adminQuiz(ctx, week);
  }, admin);

  // Start the pool from the quick checks already on this section's steps (skips ones already in it).
  router.add('POST', '/api/admin/sections/:id/questions/import', (ctx) => {
    const week = ownWeek(ctx, ctx.params.id);
    const pid = ctx.user.practice_id;
    const have = new Set(ctx.db.prepare('SELECT prompt FROM section_questions WHERE practice_id = ? AND week_id = ? AND active = 1').all(pid, week.id).map((r) => r.prompt.trim().toLowerCase()));
    const rows = ctx.db
      .prepare('SELECT qq.* FROM quiz_questions qq JOIN lessons l ON l.id = qq.lesson_id WHERE l.week_id = ? AND qq.practice_id = ? ORDER BY l.position, qq.id')
      .all(week.id, pid);
    const ins = ctx.db.prepare('INSERT INTO section_questions(practice_id, week_id, prompt, options, correct_index, explanation, created_at, updated_at) VALUES (?,?,?,?,?,?,?,?)');
    let added = 0;
    for (const r of rows) {
      const key = r.prompt.trim().toLowerCase();
      if (have.has(key)) continue;
      have.add(key);
      ins.run(pid, week.id, r.prompt, r.options, r.correct_index, r.explanation || '', now(), now());
      added += 1;
    }
    return { ...adminQuiz(ctx, week), added };
  }, admin);

  const ownQuestion = (ctx, id) => {
    const r = ctx.db.prepare('SELECT * FROM section_questions WHERE id = ? AND practice_id = ? AND active = 1').get(intId(id), ctx.user.practice_id);
    if (!r) fail(404, 'That question was not found.');
    return r;
  };
  router.add('PUT', '/api/admin/section-questions/:id', async (ctx) => {
    const r = ownQuestion(ctx, ctx.params.id);
    const body = await readJson(ctx.req);
    const f = questionFields(body, true);
    if (f.correct_index === undefined && f.options) {
      // New answer list without a correct one picked: keep the old pick if it still fits.
      f.correct_index = Math.min(r.correct_index, JSON.parse(f.options).length - 1);
    }
    const keys = Object.keys(f);
    if (keys.length) ctx.db.prepare(`UPDATE section_questions SET ${keys.map((k) => `${k} = ?`).join(', ')}, updated_at = ? WHERE id = ?`).run(...Object.values(f), now(), r.id);
    return adminQuiz(ctx, ownWeek(ctx, r.week_id));
  }, admin);
  // Retired, not deleted: past tries keep their own copy of what was asked.
  router.add('DELETE', '/api/admin/section-questions/:id', (ctx) => {
    const r = ownQuestion(ctx, ctx.params.id);
    ctx.db.prepare('UPDATE section_questions SET active = 0, updated_at = ? WHERE id = ?').run(now(), r.id);
    return adminQuiz(ctx, ownWeek(ctx, r.week_id));
  }, admin);
}

export { poolSizes };
