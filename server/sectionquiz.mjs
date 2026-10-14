// Section quizzes: each section can end with a quiz. Every try draws a fresh set of questions from the section's
// pool (questions from the last try are used last), with the answers shuffled. Staff must pass it before the next
// section opens. Owners and admins are never locked out, so they can check the content.
import { randomInt } from 'node:crypto';
import { parseList } from './shapes.mjs';

export const PASS_MARKS = [60, 70, 75, 80, 85, 90, 100];
const STAFF = new Set(['owner', 'admin']);

export function shuffle(list) {
  const a = [...list];
  for (let i = a.length - 1; i > 0; i--) {
    const j = randomInt(i + 1);
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

export const poolSizes = (db, pid) =>
  new Map(db.prepare('SELECT week_id, COUNT(*) AS n FROM section_questions WHERE practice_id = ? AND active = 1 GROUP BY week_id').all(pid).map((r) => [r.week_id, r.n]));

/** The quiz as the admin set it up. `active` = switched on and has at least one question. */
export function quizSettings(week, pool) {
  const enabled = Boolean(week.quiz_on);
  return {
    enabled,
    active: enabled && pool > 0,
    poolSize: pool,
    drawCount: Math.min(week.quiz_draw ?? 5, Math.max(pool, 1)),
    drawSetting: week.quiz_draw ?? 5,
    passPercent: week.quiz_pass ?? 80,
  };
}

/** How many right answers out of `total` it takes to pass. */
export const toPass = (total, passPercent) => Math.ceil((total * passPercent) / 100 - 1e-9);

/**
 * Per section, for one person: the quiz status, and whether the section is locked behind an earlier quiz.
 * `lessons` = q.orderedLessons rows (with status). Returns Map(weekId -> state).
 */
export function sectionStates(db, user, weeks, lessons) {
  const pid = user.practice_id;
  const pools = poolSizes(db, pid);
  const attempts = db
    .prepare('SELECT week_id, correct, total, passed, submitted_at FROM quiz_attempts WHERE practice_id = ? AND user_id = ? AND submitted_at IS NOT NULL')
    .all(pid, user.id);
  const exempt = STAFF.has(user.role);
  const out = new Map();
  let blocker = null;
  for (const w of weeks) {
    const s = quizSettings(w, pools.get(w.id) ?? 0);
    const mine = attempts.filter((a) => a.week_id === w.id);
    const best = mine.reduce((m, a) => Math.max(m, a.total ? Math.round((a.correct / a.total) * 100) : 0), -1);
    const passed = mine.some((a) => a.passed);
    const steps = lessons.filter((l) => l.week_id === w.id);
    const stepsDone = steps.filter((l) => l.status === 'complete').length;
    out.set(w.id, {
      locked: !exempt && blocker !== null,
      lockedBy: !exempt && blocker ? { weekId: blocker.id, title: blocker.subtitle || blocker.title } : null,
      quiz: s.active
        ? {
            drawCount: s.drawCount, passPercent: s.passPercent, poolSize: s.poolSize,
            passed, bestPercent: best < 0 ? null : best, attempts: mine.length,
            ready: stepsDone === steps.length,
          }
        : null,
    });
    if (s.active && !passed && !blocker) blocker = w;
  }
  return out;
}

/** Draw a new set: questions not asked last time first, then the rest; answers shuffled. */
export function drawQuestions(db, pid, weekId, count, lastItems = []) {
  const pool = db.prepare('SELECT * FROM section_questions WHERE practice_id = ? AND week_id = ? AND active = 1').all(pid, weekId);
  const recent = new Set(lastItems.map((x) => x.qid));
  const fresh = shuffle(pool.filter((p) => !recent.has(p.id)));
  const seen = shuffle(pool.filter((p) => recent.has(p.id)));
  const picked = [...fresh, ...seen].slice(0, Math.min(count, pool.length));
  return shuffle(picked).map((p) => {
    const options = parseList(p.options).map((text, i) => ({ text, i }));
    const order = shuffle(options);
    return {
      qid: p.id,
      prompt: p.prompt,
      options: order.map((o) => o.text),
      correct: order.findIndex((o) => o.i === p.correct_index),
      explanation: p.explanation || '',
    };
  });
}

/** An attempt as the learner sees it. Answers only show once it's submitted (right answers only after a pass). */
export function attemptShape(a) {
  const items = JSON.parse(a.items);
  const done = Boolean(a.submitted_at);
  return {
    id: a.id,
    weekId: a.week_id,
    passPercent: a.pass_percent,
    startedAt: a.started_at,
    submittedAt: a.submitted_at,
    total: items.length,
    toPass: toPass(items.length, a.pass_percent),
    correct: done ? a.correct : null,
    percent: done && a.total ? Math.round((a.correct / a.total) * 100) : null,
    passed: done ? Boolean(a.passed) : null,
    questions: items.map((x, i) => ({
      n: i + 1,
      prompt: x.prompt,
      options: x.options,
      ...(done
        ? {
            choice: x.choice,
            correct: x.choice === x.correct,
            explanation: x.explanation,
            ...(a.passed ? { correctIndex: x.correct } : {}),
          }
        : {}),
    })),
  };
}
