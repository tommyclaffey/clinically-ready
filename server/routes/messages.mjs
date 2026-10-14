// Replies on questions (a short thread between the asker and the practice's staff) and the notification bell.
import { now } from '../db.mjs';
import { fail, intId, readJson } from '../http.mjs';
import { notify, preview, staffIds } from '../notify.mjs';
import { initials } from '../shapes.mjs';
import * as v from '../validate.mjs';

const isStaff = (u) => u.role === 'owner' || u.role === 'admin';

/** Replies for a set of questions, grouped by question id. Scoped to the practice. */
export function loadReplies(db, practiceId, questionIds, viewerId) {
  const out = new Map(questionIds.map((id) => [id, []]));
  if (!questionIds.length) return out;
  const rows = db
    .prepare(
      `SELECT r.*, u.name AS author_name, u.role AS author_role, q.user_id AS asker_id
       FROM question_replies r
       JOIN questions q ON q.id = r.question_id AND q.practice_id = r.practice_id
       LEFT JOIN users u ON u.id = r.user_id AND u.practice_id = r.practice_id
       WHERE r.practice_id = ? AND r.question_id IN (${questionIds.map(() => '?').join(',')})
       ORDER BY r.id`,
    )
    .all(practiceId, ...questionIds);
  for (const r of rows) {
    out.get(r.question_id)?.push({
      id: r.id,
      body: r.body,
      authorName: r.author_name || 'Former team member',
      authorInitials: initials(r.author_name || '?'),
      fromAsker: r.user_id === r.asker_id,
      mine: r.user_id === viewerId,
      createdAt: r.created_at,
    });
  }
  return out;
}

export default function register(router) {
  router.add('POST', '/api/questions/:id/replies', async (ctx) => {
    const q = ctx.db
      .prepare('SELECT * FROM questions WHERE id = ? AND practice_id = ?')
      .get(intId(ctx.params.id), ctx.user.practice_id);
    // Askers can follow up on their own question; staff can answer any. Everyone else gets 404, not 403.
    if (!q || !(q.user_id === ctx.user.id || isStaff(ctx.user))) fail(404, 'Question not found.');
    const body = v.text((await readJson(ctx.req)).body, 'Reply', { max: 4000 });
    const t = now();
    const id = Number(
      ctx.db
        .prepare('INSERT INTO question_replies(practice_id, question_id, user_id, body, created_at) VALUES (?,?,?,?,?)')
        .run(ctx.user.practice_id, q.id, ctx.user.id, body, t).lastInsertRowid,
    );
    const fromAsker = q.user_id === ctx.user.id;
    if (fromAsker) {
      // A follow-up reopens the question so it shows up as open for staff again.
      ctx.db.prepare('UPDATE questions SET resolved_at = NULL WHERE id = ? AND practice_id = ?').run(q.id, ctx.user.practice_id);
      notify(ctx.db, {
        practiceId: ctx.user.practice_id, userIds: staffIds(ctx.db, ctx.user.practice_id), except: ctx.user.id,
        kind: 'followup', title: `${ctx.user.name} replied to their question`, body: preview(body), link: `/admin#q-${q.id}`,
      });
    } else {
      notify(ctx.db, {
        practiceId: ctx.user.practice_id, userIds: [q.user_id], except: ctx.user.id,
        kind: 'reply', title: `${ctx.user.name} answered your question`, body: preview(body), link: `/support#q-${q.id}`,
      });
    }
    return { ok: true, id };
  }, { auth: 'user' });

  router.add('GET', '/api/notifications', (ctx) => {
    const rows = ctx.db
      .prepare('SELECT * FROM notifications WHERE user_id = ? AND practice_id = ? ORDER BY id DESC LIMIT 30')
      .all(ctx.user.id, ctx.user.practice_id);
    const unread = ctx.db
      .prepare('SELECT COUNT(*) AS n FROM notifications WHERE user_id = ? AND practice_id = ? AND read_at IS NULL')
      .get(ctx.user.id, ctx.user.practice_id).n;
    return {
      unread,
      items: rows.map((n) => ({
        id: n.id, kind: n.kind, title: n.title, body: n.body || '', link: n.link || '',
        createdAt: n.created_at, read: Boolean(n.read_at),
      })),
    };
  }, { auth: 'user' });

  router.add('POST', '/api/notifications/read', async (ctx) => {
    const body = await readJson(ctx.req);
    const t = now();
    if (Array.isArray(body.ids)) {
      const ids = body.ids.slice(0, 100).map((x) => intId(x));
      if (ids.length) {
        ctx.db
          .prepare(`UPDATE notifications SET read_at = COALESCE(read_at, ?) WHERE user_id = ? AND id IN (${ids.map(() => '?').join(',')})`)
          .run(t, ctx.user.id, ...ids);
      }
    } else {
      ctx.db.prepare('UPDATE notifications SET read_at = ? WHERE user_id = ? AND read_at IS NULL').run(t, ctx.user.id);
    }
    return { ok: true };
  }, { auth: 'user' });
}
