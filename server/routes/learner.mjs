// Learner endpoints (any signed-in role). Every query is scoped to ctx.user.practice_id.
import { now } from '../db.mjs';
import { completeBlocks } from '../pageblocks.mjs';
import { formStatus, formsFor, latestSubmissions, myFormShape, submissionShape } from './paperwork.mjs';
import { appShape } from './apps.mjs';
import { sectionStates } from '../sectionquiz.mjs';
import { fail, intId, readJson } from '../http.mjs';
import * as q from '../queries.mjs';
import {
  lessonCard,
  lessonShape,
  meShape,
  parseList,
  personShape,
  practiceShape,
  resourceShape,
  linksOf,
} from '../shapes.mjs';
import * as v from '../validate.mjs';
import { notify, preview, staffIds } from '../notify.mjs';
import { loadReplies } from './messages.mjs';

const auth = { auth: 'user' };

/** Lesson row in the user's practice, or 404. */
export function ownLesson(ctx, id) {
  const lesson = ctx.db
    .prepare('SELECT * FROM lessons WHERE id = ? AND practice_id = ?')
    .get(intId(id), ctx.user.practice_id);
  if (!lesson) fail(404, 'That lesson was not found.');
  return lesson;
}

/** Section states (quiz + locked) for this person. */
const statesFor = (ctx, weeks, lessons) => sectionStates(ctx.db, ctx.user, weeks, lessons);

/** The quiz this person should take next: a ready, unpassed quiz (its steps are all done). */
function quizDue(weeks, states) {
  for (const w of weeks) {
    const s = states.get(w.id);
    if (s.locked) return null;
    if (s.quiz && !s.quiz.passed) return s.quiz.ready ? { weekId: w.id, title: w.subtitle || w.title, ...s.quiz } : null;
  }
  return null;
}

/** 403 if the step sits in a section that's locked behind an earlier quiz. */
function assertOpen(ctx, lesson) {
  const weeks = q.weeks(ctx.db, ctx.user.practice_id);
  const lessons = q.orderedLessons(ctx.db, ctx.user.practice_id, ctx.user.id);
  const s = statesFor(ctx, weeks, lessons).get(lesson.week_id);
  if (s?.locked) fail(403, `This section opens once you pass the ${s.lockedBy.title} quiz.`, { locked: s.lockedBy });
  return { weeks, lessons, states: statesFor(ctx, weeks, lessons) };
}

const weekState = (s) => ({ locked: s.locked, lockedBy: s.lockedBy, quiz: s.quiz });

function groupByWeek(weeks, lessons) {
  return weeks.map((w) => ({ week: w, lessons: lessons.filter((l) => l.week_id === w.id) }));
}

function minutesLeft(lessons) {
  let total = 0;
  for (const l of lessons) {
    if (l.status === 'complete') continue;
    const watched = l.status === 'started' ? Math.floor((l.position_sec || 0) / 60) : 0;
    total += Math.max(0, (l.duration_min || 0) - watched);
  }
  return total;
}

/** Started-but-incomplete first, else first not started, else null. */
function continueLesson(lessons) {
  let i = lessons.findIndex((l) => l.status === 'started');
  if (i < 0) i = lessons.findIndex((l) => !l.status);
  if (i < 0) return null;
  const l = lessons[i];
  return {
    lesson: lessonCard(l),
    weekTitle: q.weekTitle(l.week_title, l.week_subtitle),
    position: { index: i + 1, total: lessons.length },
    presenter: l.presenter || '',
    overview: l.overview || '',
    positionSec: l.position_sec || 0, // additive: lets the card show "10:50 left"
  };
}

/** Upsert progress without ever downgrading a completed lesson. */
function touchProgress(ctx, lessonId, fields) {
  const { user, db } = ctx;
  db.prepare(
    `INSERT INTO lesson_progress(user_id, lesson_id, practice_id, status, position_sec)
     VALUES (?,?,?, 'started', 0) ON CONFLICT(user_id, lesson_id) DO NOTHING`,
  ).run(user.id, lessonId, user.practice_id);
  const sets = Object.keys(fields).map((k) => `${k} = ?`);
  db.prepare(
    `UPDATE lesson_progress SET ${sets.join(', ')} WHERE user_id = ? AND lesson_id = ? AND practice_id = ?`,
  ).run(...Object.values(fields), user.id, lessonId, user.practice_id);
}

export default function register(router) {
  router.add(
    'GET',
    '/api/dashboard',
    (ctx) => {
      const { db, user } = ctx;
      const pid = user.practice_id;
      const lessons = q.orderedLessons(db, pid, user.id);
      const done = lessons.filter((l) => l.status === 'complete').length;
      const weeks = q.weeks(db, pid);
      const states = statesFor(ctx, weeks, lessons);
      const open = lessons.filter((l) => !states.get(l.week_id)?.locked);
      const people = db
        .prepare(
          `SELECT * FROM users WHERE practice_id = ? AND active = 1 AND role IN ('owner','admin') AND id != ?
           ORDER BY CASE role WHEN 'owner' THEN 0 ELSE 1 END, id`,
        )
        .all(pid, user.id);
      return {
        me: meShape(user),
        practice: practiceShape(ctx.practice),
        progress: {
          done,
          total: lessons.length,
          percent: lessons.length ? Math.round((done / lessons.length) * 100) : 0,
          minutesLeft: minutesLeft(lessons),
        },
        continue: continueLesson(open),
        quizDue: quizDue(weeks, states),
        path: groupByWeek(weeks, lessons).map(({ week, lessons: ls }) => ({
          weekId: week.id,
          title: week.title,
          subtitle: week.subtitle || '',
          links: linksOf(week.links),
          lessons: ls.map(lessonCard),
          ...weekState(states.get(week.id)),
        })),
        checklist: q.checklist(db, pid, user.id).map((c) => ({
          id: c.id,
          title: c.title,
          detail: c.detail || '',
          section: c.section || '',
          done: Boolean(c.done),
        })),
        position: q.trackOf(db, pid, user.track_id),
        people: people.map(personShape),
        resources: q.resources(db, pid).slice(0, 6).map(resourceShape),
      };
    },
    auth,
  );

  router.add(
    'GET',
    '/api/weeks',
    (ctx) => {
      const pid = ctx.user.practice_id;
      const lessons = q.orderedLessons(ctx.db, pid, ctx.user.id);
      const weeks = q.weeks(ctx.db, pid);
      const states = statesFor(ctx, weeks, lessons);
      return groupByWeek(weeks, lessons).map(({ week, lessons: ls }) => ({
        id: week.id,
        title: week.title,
        subtitle: week.subtitle || '',
        links: linksOf(week.links),
        lessons: ls.map(lessonCard),
        ...weekState(states.get(week.id)),
      }));
    },
    auth,
  );

  router.add(
    'GET',
    '/api/lessons/:id',
    (ctx) => {
      const { db, user } = ctx;
      const pid = user.practice_id;
      const lesson = ownLesson(ctx, ctx.params.id);
      const { lessons: all, states } = assertOpen(ctx, lesson);
      const i = all.findIndex((l) => l.id === lesson.id);
      const sectionQuiz = states.get(lesson.week_id)?.quiz ?? null;
      const lastInSection = !all.slice(i + 1).some((l) => l.week_id === lesson.week_id);
      const row = all[i];
      const week = db.prepare('SELECT * FROM weeks WHERE id = ? AND practice_id = ?').get(lesson.week_id, pid);
      const quiz = db
        .prepare('SELECT id, prompt, options FROM quiz_questions WHERE lesson_id = ? AND practice_id = ? ORDER BY id')
        .all(lesson.id, pid)
        .map((x) => ({ id: x.id, prompt: x.prompt, options: parseList(x.options) })); // never correct_index
      const resources = db
        .prepare('SELECT * FROM resources WHERE lesson_id = ? AND practice_id = ? ORDER BY id')
        .all(lesson.id, pid);
      const note = db
        .prepare('SELECT body, updated_at FROM notes WHERE user_id = ? AND lesson_id = ? AND practice_id = ?')
        .get(user.id, lesson.id, pid);
      const shape = lessonShape(lesson);
      const blocks = completeBlocks(shape.blocks, { hasQuiz: quiz.length > 0, hasFiles: resources.length > 0 });
      // Paperwork and tools placed on this page, as this person sees them.
      const formIds = blocks.filter((b) => b.type === 'form').map((b) => b.formId);
      const appIds = blocks.filter((b) => b.type === 'app').map((b) => b.appId);
      const mine = new Map(formsFor(db, ctx.practice, user).map((f) => [f.id, f]));
      const subs = latestSubmissions(db, pid, user.id);
      const forms = formIds.filter((id) => mine.has(id)).map((id) => {
        const f = mine.get(id);
        return { ...myFormShape(f), status: formStatus(f, subs.get(f.id)), submission: submissionShape(subs.get(f.id)) };
      });
      const apps = appIds.length
        ? db.prepare(`SELECT * FROM apps WHERE practice_id = ? AND id IN (${appIds.map(() => '?').join(',')})`).all(pid, ...appIds).map(appShape)
        : [];
      return {
        lesson: { ...shape, blocks },
        forms,
        apps,
        week: { id: week.id, title: week.title, subtitle: week.subtitle || '', links: linksOf(week.links) },
        quiz,
        resources: resources.map(resourceShape),
        progress: {
          status: row?.status || 'not_started',
          positionSec: row?.position_sec || 0,
          quizCorrect: row?.quiz_correct == null ? null : Boolean(row.quiz_correct),
          completedAt: row?.completed_at || null,
        },
        note: note?.body || '',
        noteUpdatedAt: note?.updated_at || null,
        prevId: i > 0 ? all[i - 1].id : null,
        nextId: i >= 0 && i < all.length - 1 ? all[i + 1].id : null,
        position: { index: i + 1, total: all.length },
        // The section's quiz, and whether it comes straight after this step.
        sectionQuiz,
        quizNext: Boolean(sectionQuiz && !sectionQuiz.passed && lastInSection),
      };
    },
    auth,
  );

  router.add(
    'POST',
    '/api/lessons/:id/progress',
    async (ctx) => {
      const lesson = ownLesson(ctx, ctx.params.id);
      assertOpen(ctx, lesson);
      const body = await readJson(ctx.req);
      const positionSec = v.int(body.positionSec ?? 0, 'positionSec', { max: 86400 });
      touchProgress(ctx, lesson.id, { position_sec: positionSec });
      return { ok: true };
    },
    auth,
  );

  router.add(
    'POST',
    '/api/lessons/:id/complete',
    (ctx) => {
      const lesson = ownLesson(ctx, ctx.params.id);
      assertOpen(ctx, lesson);
      touchProgress(ctx, lesson.id, { status: 'complete', completed_at: now() });
      const all = q.orderedLessons(ctx.db, ctx.user.practice_id, ctx.user.id);
      const i = all.findIndex((l) => l.id === lesson.id);
      // Finished the section and it has a quiz to pass: send them to the quiz, not the next step.
      const s = statesFor(ctx, q.weeks(ctx.db, ctx.user.practice_id), all).get(lesson.week_id);
      const quizWeekId = s?.quiz && !s.quiz.passed && s.quiz.ready ? lesson.week_id : null;
      return { ok: true, nextId: i >= 0 && i < all.length - 1 ? all[i + 1].id : null, quizWeekId };
    },
    auth,
  );

  router.add(
    'POST',
    '/api/quiz/:id/answer',
    async (ctx) => {
      const question = ctx.db
        .prepare('SELECT * FROM quiz_questions WHERE id = ? AND practice_id = ?')
        .get(intId(ctx.params.id), ctx.user.practice_id);
      if (!question) fail(404, 'That question was not found.');
      const body = await readJson(ctx.req);
      const options = parseList(question.options);
      const index = v.int(body.index, 'index', { max: Math.max(0, options.length - 1) });
      const correct = index === question.correct_index;
      touchProgress(ctx, question.lesson_id, { quiz_correct: correct ? 1 : 0 });
      // Every answer is kept so admins can see results (first try, attempts, latest answer).
      ctx.db
        .prepare('INSERT INTO quiz_answers(practice_id, user_id, lesson_id, question_id, choice, correct, answered_at) VALUES (?,?,?,?,?,?,?)')
        .run(ctx.user.practice_id, ctx.user.id, question.lesson_id, question.id, index, correct ? 1 : 0, now());
      return { correct, correctIndex: question.correct_index, explanation: question.explanation || '' };
    },
    auth,
  );

  router.add(
    'PUT',
    '/api/lessons/:id/note',
    async (ctx) => {
      const lesson = ownLesson(ctx, ctx.params.id);
      const body = await readJson(ctx.req);
      const text = v.text(body.body, 'Note', { max: 20000, optional: true });
      const updatedAt = now();
      ctx.db
        .prepare(
          `INSERT INTO notes(user_id, lesson_id, practice_id, body, updated_at) VALUES (?,?,?,?,?)
           ON CONFLICT(user_id, lesson_id) DO UPDATE SET body = excluded.body, updated_at = excluded.updated_at`,
        )
        .run(ctx.user.id, lesson.id, ctx.user.practice_id, text, updatedAt);
      return { ok: true, updatedAt };
    },
    auth,
  );

  router.add(
    'POST',
    '/api/checklist/:id',
    async (ctx) => {
      const { db, user } = ctx;
      const item = db
        .prepare('SELECT id FROM checklist_items WHERE id = ? AND practice_id = ? AND (track_id IS NULL OR track_id = ?)')
        .get(intId(ctx.params.id), user.practice_id, user.track_id ?? -1);
      if (!item) fail(404, 'That checklist item was not found.');
      const body = await readJson(ctx.req);
      if (typeof body.done !== 'boolean') fail(400, 'done must be true or false.');
      if (body.done) {
        db.prepare(
          `INSERT INTO checklist_done(user_id, item_id, practice_id, done_at) VALUES (?,?,?,?)
           ON CONFLICT(user_id, item_id) DO NOTHING`,
        ).run(user.id, item.id, user.practice_id, now());
      } else {
        db.prepare('DELETE FROM checklist_done WHERE user_id = ? AND item_id = ? AND practice_id = ?').run(
          user.id,
          item.id,
          user.practice_id,
        );
      }
      return { ok: true };
    },
    auth,
  );

  router.add('GET', '/api/resources', (ctx) => q.resources(ctx.db, ctx.user.practice_id).map(resourceShape), auth);

  router.add(
    'GET',
    '/api/team',
    (ctx) =>
      ctx.db
        .prepare('SELECT * FROM users WHERE practice_id = ? AND active = 1 ORDER BY name COLLATE NOCASE')
        .all(ctx.user.practice_id)
        .map((u) => ({ ...personShape(u), role: u.role })),
    auth,
  );

  router.add(
    'POST',
    '/api/questions',
    async (ctx) => {
      const body = await readJson(ctx.req);
      const text = v.text(body.body, 'Question', { max: 4000 });
      let lessonId = null;
      if (body.lessonId != null && body.lessonId !== '') lessonId = ownLesson(ctx, body.lessonId).id;
      const id = Number(
        ctx.db
          .prepare('INSERT INTO questions(practice_id, user_id, lesson_id, body, created_at) VALUES (?,?,?,?,?)')
          .run(ctx.user.practice_id, ctx.user.id, lessonId, text, now()).lastInsertRowid,
      );
      notify(ctx.db, {
        practiceId: ctx.user.practice_id, userIds: staffIds(ctx.db, ctx.user.practice_id), except: ctx.user.id,
        kind: 'question', title: `${ctx.user.name} asked a question`, body: preview(text), link: `/admin#q-${id}`,
      });
      return { ok: true, id };
    },
    auth,
  );

  // Not in the SPEC table, but the Support screen lists "my past questions".
  router.add(
    'GET',
    '/api/questions',
    (ctx) => {
      const rows = ctx.db
        .prepare(
          `SELECT qn.*, l.title AS lesson_title FROM questions qn
           LEFT JOIN lessons l ON l.id = qn.lesson_id AND l.practice_id = qn.practice_id
           WHERE qn.practice_id = ? AND qn.user_id = ? ORDER BY qn.id DESC`,
        )
        .all(ctx.user.practice_id, ctx.user.id);
      const replies = loadReplies(ctx.db, ctx.user.practice_id, rows.map((x) => x.id), ctx.user.id);
      return rows.map((x) => ({
          id: x.id,
          body: x.body,
          lessonId: x.lesson_id ?? null,
          lessonTitle: x.lesson_title || null,
          createdAt: x.created_at,
          resolvedAt: x.resolved_at || null,
          replies: replies.get(x.id) ?? [],
        }));
    },
    auth,
  );
}
