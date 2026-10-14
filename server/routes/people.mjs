// Results for admins: one person's whole onboarding record, and a CSV of everyone.
import { fail, intId } from '../http.mjs';
import { initials, parseList } from '../shapes.mjs';
import { formStatus, formsFor, latestSubmissions, submissionShape } from './paperwork.mjs';
import { poolSizes, quizSettings } from '../sectionquiz.mjs';

/** Quiz results per lesson for one person: latest answer per question decides "passed". */
function quizResults(db, pid, userId) {
  const questions = db.prepare('SELECT id, lesson_id, prompt, options, correct_index FROM quiz_questions WHERE practice_id = ? ORDER BY id').all(pid);
  const answers = db.prepare('SELECT question_id, choice, correct, answered_at FROM quiz_answers WHERE practice_id = ? AND user_id = ? ORDER BY id').all(pid, userId);
  const byQ = new Map();
  for (const a of answers) {
    const e = byQ.get(a.question_id) ?? { attempts: 0, first: null, last: null };
    e.attempts += 1;
    e.first ??= a;
    e.last = a;
    byQ.set(a.question_id, e);
  }
  const byLesson = new Map();
  for (const qn of questions) {
    const e = byQ.get(qn.id);
    const options = parseList(qn.options);
    const list = byLesson.get(qn.lesson_id) ?? [];
    list.push({
      id: qn.id,
      prompt: qn.prompt,
      answered: Boolean(e),
      attempts: e?.attempts ?? 0,
      correct: e ? Boolean(e.last.correct) : null,
      firstTry: e ? Boolean(e.first.correct) : null,
      answer: e && e.last.choice != null ? options[e.last.choice] ?? '' : '',
      rightAnswer: options[qn.correct_index] ?? '',
      answeredAt: e?.last.answered_at ?? null,
    });
    byLesson.set(qn.lesson_id, list);
  }
  return byLesson;
}

function personRecord(db, practice, user) {
  const pid = practice.id;
  const weeks = db.prepare('SELECT * FROM weeks WHERE practice_id = ? ORDER BY position, id').all(pid);
  const lessons = db.prepare('SELECT id, week_id, title, position FROM lessons WHERE practice_id = ? ORDER BY position, id').all(pid);
  const progress = new Map(db.prepare('SELECT * FROM lesson_progress WHERE practice_id = ? AND user_id = ?').all(pid, user.id).map((p) => [p.lesson_id, p]));
  const quiz = quizResults(db, pid, user.id);
  const pools = poolSizes(db, pid);
  const tries = db.prepare('SELECT week_id, correct, total, passed, submitted_at FROM quiz_attempts WHERE practice_id = ? AND user_id = ? AND submitted_at IS NOT NULL ORDER BY id').all(pid, user.id);
  const sectionQuizOf = (w) => {
    const s = quizSettings(w, pools.get(w.id) ?? 0);
    const mine = tries.filter((t) => t.week_id === w.id).map((t) => ({ percent: t.total ? Math.round((t.correct / t.total) * 100) : 0, passed: Boolean(t.passed), at: t.submitted_at }));
    if (!s.active && !mine.length) return null;
    return {
      passPercent: s.passPercent, passed: mine.some((t) => t.passed), tries: mine.length,
      best: mine.length ? Math.max(...mine.map((t) => t.percent)) : null, history: mine.slice(-10).reverse(),
    };
  };
  const sections = weeks.map((w) => ({
    id: w.id,
    title: w.title,
    subtitle: w.subtitle || '',
    sectionQuiz: sectionQuizOf(w),
    lessons: lessons.filter((l) => l.week_id === w.id).map((l) => {
      const p = progress.get(l.id);
      const qs = quiz.get(l.id) ?? [];
      return {
        id: l.id,
        title: l.title,
        status: p?.status || 'not_started',
        completedAt: p?.completed_at || null,
        quiz: qs,
        quizPassed: qs.length ? qs.every((x) => x.correct) : null,
      };
    }),
  }));
  const checklist = db
    .prepare(
      `SELECT c.id, c.title, c.section, d.done_at FROM checklist_items c
       LEFT JOIN checklist_done d ON d.item_id = c.id AND d.user_id = ? AND d.practice_id = c.practice_id
       WHERE c.practice_id = ? AND (c.track_id IS NULL OR c.track_id = ?) ORDER BY c.position, c.id`,
    )
    .all(user.id, pid, user.track_id ?? -1)
    .map((c) => ({ id: c.id, title: c.title, section: c.section || '', done: Boolean(c.done_at), doneAt: c.done_at || null }));
  const forms = formsFor(db, practice, user);
  const subs = latestSubmissions(db, pid, user.id);
  const paperwork = forms.map((f) => ({
    id: f.id,
    kind: f.kind,
    title: f.title,
    required: Boolean(f.required),
    status: formStatus(f, subs.get(f.id)),
    submission: submissionShape(subs.get(f.id)),
  }));
  const allLessons = sections.flatMap((s) => s.lessons);
  const allQ = allLessons.flatMap((l) => l.quiz);
  return {
    summary: {
      lessonsDone: allLessons.filter((l) => l.status === 'complete').length,
      lessonsTotal: allLessons.length,
      quizAnswered: allQ.filter((x) => x.answered).length,
      quizCorrect: allQ.filter((x) => x.correct).length,
      quizTotal: allQ.length,
      checklistDone: checklist.filter((c) => c.done).length,
      checklistTotal: checklist.length,
      paperworkDone: paperwork.filter((f) => f.status === 'done').length,
      paperworkTotal: paperwork.filter((f) => f.required).length,
      sectionQuizzesPassed: sections.filter((s) => s.sectionQuiz?.passed).length,
      sectionQuizzesTotal: sections.filter((s) => s.sectionQuiz).length,
    },
    sections,
    checklist,
    paperwork,
  };
}

const csvCell = (value) => {
  let s = String(value ?? '');
  if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`; // stop spreadsheet formula injection
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

export default function register(router) {
  router.add('GET', '/api/admin/people/:id', (ctx) => {
    const user = ctx.db.prepare('SELECT * FROM users WHERE id = ? AND practice_id = ?').get(intId(ctx.params.id), ctx.user.practice_id);
    if (!user) fail(404, 'That person was not found.');
    const track = user.track_id ? ctx.db.prepare('SELECT name FROM tracks WHERE id = ? AND practice_id = ?').get(user.track_id, user.practice_id) : null;
    return {
      person: {
        id: user.id, name: user.name, email: user.email, title: user.title || '', role: user.role, initials: initials(user.name),
        active: Boolean(user.active), positionName: track?.name || null, createdAt: user.created_at, lastSeenAt: user.last_seen_at || null,
      },
      ...personRecord(ctx.db, ctx.practice, user),
    };
  }, { auth: 'admin' });

  router.add('GET', '/api/admin/results.csv', (ctx) => {
    const users = ctx.db.prepare('SELECT * FROM users WHERE practice_id = ? ORDER BY active DESC, name COLLATE NOCASE').all(ctx.user.practice_id);
    const tracks = new Map(ctx.db.prepare('SELECT id, name FROM tracks WHERE practice_id = ?').all(ctx.user.practice_id).map((t) => [t.id, t.name]));
    const header = ['Name', 'Email', 'Role', 'Position', 'Active', 'Lessons done', 'Lessons total', 'Quiz correct', 'Quiz total',
      'Section quizzes passed', 'Section quizzes', 'Checklist done', 'Checklist total', 'Paperwork done', 'Paperwork required', 'Last seen'];
    const lines = [header.map(csvCell).join(',')];
    for (const u of users) {
      const s = personRecord(ctx.db, ctx.practice, u).summary;
      lines.push([u.name, u.email, u.role, tracks.get(u.track_id) || '', u.active ? 'yes' : 'no', s.lessonsDone, s.lessonsTotal,
        s.quizCorrect, s.quizTotal, s.sectionQuizzesPassed, s.sectionQuizzesTotal, s.checklistDone, s.checklistTotal, s.paperworkDone, s.paperworkTotal, u.last_seen_at || ''].map(csvCell).join(','));
    }
    const body = Buffer.from(`﻿${lines.join('\r\n')}\r\n`);
    const date = new Date().toISOString().slice(0, 10);
    ctx.res.writeHead(200, {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Length': body.length,
      'Content-Disposition': `attachment; filename="onboarding-results-${date}.csv"`,
      'Cache-Control': 'private, no-store',
    });
    ctx.res.end(body);
  }, { auth: 'admin' });
}

export { personRecord };
