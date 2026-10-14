// Shared reads. Every function takes the practice id explicitly so isolation is visible at the call site.

/** All lessons in course order, joined with one user's progress and per-lesson counts. */
export function orderedLessons(db, practiceId, userId) {
  return db
    .prepare(
      `SELECT l.*, w.title AS week_title, w.subtitle AS week_subtitle,
              lp.status, lp.position_sec, lp.quiz_correct, lp.completed_at,
              (SELECT COUNT(*) FROM resources r WHERE r.lesson_id = l.id AND r.practice_id = l.practice_id) AS resource_count,
              (SELECT COUNT(*) FROM quiz_questions q WHERE q.lesson_id = l.id AND q.practice_id = l.practice_id) AS quiz_count
       FROM lessons l
       JOIN weeks w ON w.id = l.week_id AND w.practice_id = l.practice_id
       LEFT JOIN lesson_progress lp ON lp.lesson_id = l.id AND lp.user_id = ? AND lp.practice_id = l.practice_id
       WHERE l.practice_id = ?
       ORDER BY w.position, w.id, l.position, l.id`,
    )
    .all(userId, practiceId);
}

export function weeks(db, practiceId) {
  return db.prepare('SELECT * FROM weeks WHERE practice_id = ? ORDER BY position, id').all(practiceId);
}

export function resources(db, practiceId) {
  return db.prepare('SELECT * FROM resources WHERE practice_id = ? ORDER BY id').all(practiceId);
}

/** Checklist with a `done` flag for one user. */
export function checklist(db, practiceId, userId) {
  return db
    .prepare(
      `SELECT c.*, (d.item_id IS NOT NULL) AS done
       FROM checklist_items c
       LEFT JOIN checklist_done d ON d.item_id = c.id AND d.user_id = ? AND d.practice_id = c.practice_id
       WHERE c.practice_id = ?
         AND (c.track_id IS NULL OR c.track_id = (SELECT track_id FROM users WHERE id = ?))
       ORDER BY c.position, c.id`,
    )
    .all(userId, practiceId, userId);
}

/** "Week 1 · Foundations" */
export const weekTitle = (title, subtitle) => (subtitle ? `${title} · ${subtitle}` : title);

/** The user's position (track), or null. */
export function trackOf(db, practiceId, trackId) {
  if (!trackId) return null;
  const t = db.prepare('SELECT id, name FROM tracks WHERE id = ? AND practice_id = ?').get(trackId, practiceId);
  return t ? { id: t.id, name: t.name } : null;
}
