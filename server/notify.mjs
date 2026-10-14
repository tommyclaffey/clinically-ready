// In-app notifications (the bell). One row per recipient. Email alerts can hook in here later.
import { now } from './db.mjs';

/** Sends one notification to each user id (deduplicated, never to `except`). */
export function notify(db, { practiceId, userIds, kind, title, body = '', link = '', except = null }) {
  const ids = [...new Set(userIds)].filter((id) => id && id !== except);
  const stmt = db.prepare(
    'INSERT INTO notifications(practice_id, user_id, kind, title, body, link, created_at) VALUES (?,?,?,?,?,?,?)',
  );
  const t = now();
  for (const id of ids) stmt.run(practiceId, id, kind, title.slice(0, 200), body.slice(0, 300), link, t);
  return ids.length;
}

/** Active owners and admins of a practice. */
export const staffIds = (db, practiceId) =>
  db.prepare("SELECT id FROM users WHERE practice_id = ? AND active = 1 AND role IN ('owner','admin')").all(practiceId).map((r) => r.id);

/** Every active user in a practice. */
export const everyoneIds = (db, practiceId) =>
  db.prepare('SELECT id FROM users WHERE practice_id = ? AND active = 1').all(practiceId).map((r) => r.id);

/** First line of a message, trimmed for a notification preview. */
export const preview = (text, n = 120) => {
  const line = String(text).replace(/\s+/g, ' ').trim();
  return line.length > n ? `${line.slice(0, n - 1)}…` : line;
};
