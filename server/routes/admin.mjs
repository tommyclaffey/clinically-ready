// Admin endpoints (owner/admin; practice settings owner-only). Every query is scoped to the admin's practice.
import { notInDemo } from './demo.mjs';
import { daysFromNow, INVITE_DAYS, newToken, sha256 } from '../auth.mjs';
import { now, tx } from '../db.mjs';
import { fail, intId, readJson } from '../http.mjs';
import * as q from '../queries.mjs';
import { TERM_KEYS, signInOf, initials, lessonShape, parseList, practiceShape, resourceShape, weekShape } from '../shapes.mjs';
import * as v from '../validate.mjs';
import { formStatus, formsFor, latestSubmissions } from './paperwork.mjs';
import { completeBlocks, firstVideoUrl, pageBlocksOf, validatePageBlocks, withVideo } from '../pageblocks.mjs';
import { everyoneIds, notify } from '../notify.mjs';
import { loadReplies } from './messages.mjs';
import { listBackups, runBackup } from '../backup.mjs';
import { ownLesson } from './learner.mjs';
import { poolSizes, quizSettings } from '../sectionquiz.mjs';

const admin = { auth: 'admin' };
const ROLES = ['owner', 'admin', 'clinician'];

function ownRow(ctx, table, id, what) {
  const row = ctx.db.prepare(`SELECT * FROM ${table} WHERE id = ? AND practice_id = ?`).get(intId(id), ctx.user.practice_id);
  if (!row) fail(404, `That ${what} was not found.`);
  return row;
}

const nextPosition = (ctx, table, where = '', ...args) =>
  ctx.db
    .prepare(`SELECT COALESCE(MAX(position), 0) + 1 AS p FROM ${table} WHERE practice_id = ? ${where}`)
    .get(ctx.user.practice_id, ...args).p;

/** Positions (e.g. Associate, Intern) with a count of people and checklist items in each. */
function positionsOf(db, practiceId) {
  return db
    .prepare(
      `SELECT t.id, t.name, t.position,
         (SELECT COUNT(*) FROM users u WHERE u.track_id = t.id AND u.practice_id = t.practice_id) AS people,
         (SELECT COUNT(*) FROM checklist_items c WHERE c.track_id = t.id AND c.practice_id = t.practice_id) AS items
       FROM tracks t WHERE t.practice_id = ? ORDER BY t.position, t.id`,
    )
    .all(practiceId)
    .map((t) => ({ id: t.id, name: t.name, position: t.position, people: t.people, items: t.items }));
}

/** A position id from the client: null/'' clears it; otherwise it must belong to this practice. */
function trackField(ctx, value) {
  if (value === null || value === '' || value === undefined) return null;
  return ownRow(ctx, 'tracks', value, 'position').id;
}

function deleteLesson(ctx, lessonId) {
  const pid = ctx.user.practice_id;
  for (const table of ['quiz_questions', 'quiz_answers', 'lesson_progress', 'notes']) {
    ctx.db.prepare(`DELETE FROM ${table} WHERE lesson_id = ? AND practice_id = ?`).run(lessonId, pid);
  }
  // Keep the files and questions; just detach them from the lesson.
  ctx.db.prepare('UPDATE resources SET lesson_id = NULL WHERE lesson_id = ? AND practice_id = ?').run(lessonId, pid);
  ctx.db.prepare('UPDATE questions SET lesson_id = NULL WHERE lesson_id = ? AND practice_id = ?').run(lessonId, pid);
  ctx.db.prepare('DELETE FROM lessons WHERE id = ? AND practice_id = ?').run(lessonId, pid);
}

/** WCAG contrast ratio of a #RRGGBB colour against white. */
export function contrastOnWhite(hex) {
  const lum = [1, 3, 5]
    .map((i) => parseInt(hex.slice(i, i + 2), 16) / 255)
    .map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
  const L = 0.2126 * lum[0] + 0.7152 * lum[1] + 0.0722 * lum[2];
  return 1.05 / (L + 0.05);
}

function adminLesson(ctx, l) {
  const quiz = ctx.db
    .prepare('SELECT * FROM quiz_questions WHERE lesson_id = ? AND practice_id = ? ORDER BY id')
    .all(l.id, ctx.user.practice_id)
    .map((x) => ({
      id: x.id,
      prompt: x.prompt,
      options: parseList(x.options),
      correctIndex: x.correct_index,
      explanation: x.explanation || '',
    }));
  const hasFiles = Boolean(ctx.db.prepare('SELECT 1 FROM resources WHERE lesson_id = ? AND practice_id = ? LIMIT 1').get(l.id, ctx.user.practice_id));
  const shape = lessonShape(l);
  return { ...shape, blocks: completeBlocks(shape.blocks, { hasQuiz: quiz.length > 0, hasFiles }), quiz };
}

/** Validates lesson fields; `partial` allows omitting anything (PUT). */
function lessonFields(ctx, body, partial, existingBlocks = null) {
  const f = {};
  const has = (k) => !partial || body[k] !== undefined;
  if (has('weekId')) f.week_id = ownRow(ctx, 'weeks', body.weekId, 'week').id;
  if (has('title')) f.title = v.text(body.title, 'Title', { max: 200 });
  if (has('label')) f.label = v.text(body.label, 'Label', { max: 80, optional: true });
  if (has('presenter')) f.presenter = v.text(body.presenter, 'Presenter', { max: 120, optional: true });
  if (has('durationMin')) f.duration_min = v.int(body.durationMin ?? 0, 'Duration', { max: 1000 });
  if (has('videoUrl')) f.video_url = v.url(body.videoUrl, 'Video URL', { allowLocalVideo: true });
  if (has('posterUrl')) f.poster_url = v.url(body.posterUrl, 'Poster URL');
  if (has('overview')) f.overview = v.text(body.overview, 'Overview', { max: 5000, optional: true });
  if (has('takeaways')) f.takeaways = JSON.stringify(v.stringList(body.takeaways, 'Takeaways'));
  if (has('transcript')) f.transcript = v.text(body.transcript, 'Transcript', { max: 200000, optional: true });
  if (body.links !== undefined) f.links = JSON.stringify(v.links(body.links, 'Lesson links'));
  if (body.content !== undefined) f.content = JSON.stringify(v.contentBlocks(body.content));
  if (body.blocks !== undefined) {
    const blocks = validatePageBlocks(ctx, body.blocks);
    f.blocks = JSON.stringify(blocks);
    f.video_url = firstVideoUrl(blocks); // keeps "has a video", thumbnails and the Videos page in step
  } else if (f.video_url !== undefined && partial && existingBlocks) {
    // The Videos page sets just the link: put it in the step's video block.
    f.blocks = JSON.stringify(withVideo(existingBlocks, f.video_url));
  }
  if (body.position !== undefined) f.position = v.int(body.position, 'Position', { max: 10000 });
  return f;
}

function update(ctx, table, id, fields) {
  const keys = Object.keys(fields);
  if (!keys.length) return;
  ctx.db
    .prepare(`UPDATE ${table} SET ${keys.map((k) => `${k} = ?`).join(', ')} WHERE id = ? AND practice_id = ?`)
    .run(...Object.values(fields), id, ctx.user.practice_id);
}

function insert(ctx, table, fields) {
  const all = { practice_id: ctx.user.practice_id, ...fields };
  const keys = Object.keys(all);
  return Number(
    ctx.db
      .prepare(`INSERT INTO ${table}(${keys.join(', ')}) VALUES (${keys.map(() => '?').join(', ')})`)
      .run(...Object.values(all)).lastInsertRowid,
  );
}

/** Required paperwork this person has finished, for the team table. */
function paperworkCounts(ctx, u) {
  const full = ctx.db.prepare('SELECT * FROM users WHERE id = ?').get(u.id);
  const forms = formsFor(ctx.db, ctx.practice, full).filter((f) => f.required);
  const subs = latestSubmissions(ctx.db, ctx.user.practice_id, u.id);
  return { paperworkDone: forms.filter((f) => formStatus(f, subs.get(f.id)) === 'done').length, paperworkTotal: forms.length };
}

function registerTeam(router) {
  router.add(
    'GET',
    '/api/admin/team',
    (ctx) => {
      const pid = ctx.user.practice_id;
      const lessonsTotal = ctx.db.prepare('SELECT COUNT(*) AS n FROM lessons WHERE practice_id = ?').get(pid).n;
      const checklistTotal = ctx.db.prepare('SELECT COUNT(*) AS n FROM checklist_items WHERE practice_id = ?').get(pid).n;
      const users = ctx.db
        .prepare(
          `SELECT u.id, u.name, u.email, u.title, u.role, u.active, u.created_at, u.last_seen_at,
             (u.password_hash IS NOT NULL) AS has_password,
             (SELECT COUNT(*) FROM lesson_progress lp JOIN lessons l ON l.id = lp.lesson_id AND l.practice_id = lp.practice_id
               WHERE lp.user_id = u.id AND lp.practice_id = u.practice_id AND lp.status = 'complete') AS lessons_done,
             (SELECT COUNT(*) FROM checklist_done d JOIN checklist_items c ON c.id = d.item_id AND c.practice_id = d.practice_id
               WHERE d.user_id = u.id AND d.practice_id = u.practice_id
                 AND (c.track_id IS NULL OR c.track_id = u.track_id)) AS checklist_done,
             (SELECT COUNT(*) FROM checklist_items c
               WHERE c.practice_id = u.practice_id AND (c.track_id IS NULL OR c.track_id = u.track_id)) AS checklist_total,
             u.track_id, (SELECT name FROM tracks t WHERE t.id = u.track_id AND t.practice_id = u.practice_id) AS track_name
           FROM users u WHERE u.practice_id = ? ORDER BY u.active DESC, u.name COLLATE NOCASE`,
        )
        .all(pid);
      const invites = ctx.db
        .prepare(
          `SELECT email, name, title, role, created_at, expires_at FROM invites
           WHERE practice_id = ? AND accepted_at IS NULL AND expires_at > ? ORDER BY created_at DESC`,
        )
        .all(pid, now());
      const idRows = ctx.db
        .prepare('SELECT i.user_id, i.provider FROM user_identities i JOIN users u ON u.id = i.user_id WHERE u.practice_id = ?')
        .all(pid);
      const signInFor = (u) => [
        ...(u.has_password ? ['password'] : []),
        ...idRows.filter((r) => r.user_id === u.id).map((r) => r.provider),
      ];
      return {
        users: users.map((u) => ({
          id: u.id,
          name: u.name,
          email: u.email,
          title: u.title || '',
          role: u.role,
          initials: initials(u.name),
          active: Boolean(u.active),
          progressPercent: lessonsTotal ? Math.round((u.lessons_done / lessonsTotal) * 100) : 0,
          lessonsDone: u.lessons_done,
          lessonsTotal,
          checklistDone: u.checklist_done,
          checklistTotal: u.checklist_total,
          positionId: u.track_id ?? null,
          positionName: u.track_name || null,
          lastSeenAt: u.last_seen_at || null,
          createdAt: u.created_at,
          signsInWith: signInFor(u),
          ...paperworkCounts(ctx, u),
        })),
        invites: invites.map((i) => ({
          email: i.email,
          name: i.name || '',
          title: i.title || '',
          role: i.role,
          positionId: i.track_id ?? null,
          createdAt: i.created_at,
          expiresAt: i.expires_at,
        })),
      };
    },
    admin,
  );

  router.add(
    'POST',
    '/api/admin/invites',
    async (ctx) => {
      notInDemo(ctx);
      const body = await readJson(ctx.req);
      const email = v.email(body.email);
      const name = v.text(body.name, 'Name', { max: 120, optional: true });
      const title = v.text(body.title, 'Title', { max: 120, optional: true });
      const role = v.oneOf(body.role || 'clinician', 'Role', ROLES);
      if (role === 'owner' && ctx.user.role !== 'owner') fail(403, 'Only an owner can invite another owner.');
      const trackId = trackField(ctx, body.positionId);
      if (ctx.db.prepare('SELECT 1 FROM users WHERE email = ?').get(email)) {
        fail(409, 'That email already has an account.');
      }
      const token = newToken();
      const expiresAt = daysFromNow(INVITE_DAYS);
      tx(ctx.db, () => {
        // A fresh invite replaces any older pending one for the same person.
        ctx.db
          .prepare('DELETE FROM invites WHERE practice_id = ? AND email = ? AND accepted_at IS NULL')
          .run(ctx.user.practice_id, email);
        ctx.db
          .prepare(
            `INSERT INTO invites(token_hash, practice_id, email, name, title, role, created_by, created_at, expires_at, track_id)
             VALUES (?,?,?,?,?,?,?,?,?,?)`,
          )
          .run(sha256(token), ctx.user.practice_id, email, name, title, role, ctx.user.id, now(), expiresAt, trackId);
      });
      return { inviteUrl: `/invite/${token}`, expiresAt };
    },
    admin,
  );

  router.add(
    'DELETE',
    '/api/admin/invites/:email',
    (ctx) => {
      const res = ctx.db
        .prepare('DELETE FROM invites WHERE practice_id = ? AND email = ? AND accepted_at IS NULL')
        .run(ctx.user.practice_id, String(ctx.params.email).trim().toLowerCase());
      if (!res.changes) fail(404, 'No pending invite for that email.');
      return { ok: true };
    },
    admin,
  );

  router.add(
    'PUT',
    '/api/admin/users/:id',
    async (ctx) => {
      const me = ctx.user;
      const target = ownRow(ctx, 'users', ctx.params.id, 'person');
      const body = await readJson(ctx.req);
      const fields = {};
      if (body.title !== undefined) fields.title = v.text(body.title, 'Title', { max: 120, optional: true });
      if (body.role !== undefined) fields.role = v.oneOf(body.role, 'Role', ROLES);
      if (body.positionId !== undefined) fields.track_id = trackField(ctx, body.positionId);
      if (body.active !== undefined) {
        if (typeof body.active !== 'boolean') fail(400, 'active must be true or false.');
        fields.active = body.active ? 1 : 0;
      }
      const changingRole = fields.role !== undefined && fields.role !== target.role;
      const deactivating = fields.active === 0 && target.active === 1;

      if (changingRole && (target.role === 'owner' || fields.role === 'owner') && me.role !== 'owner') {
        fail(403, 'Only an owner can change owner roles.');
      }
      if (deactivating && target.role === 'owner' && me.role !== 'owner') {
        fail(403, 'Only an owner can deactivate an owner.');
      }
      if ((changingRole || deactivating) && target.id === me.id) {
        fail(409, "You can't change your own role or deactivate yourself.");
      }
      if (target.role === 'owner' && ((changingRole && fields.role !== 'owner') || deactivating)) {
        const others = ctx.db
          .prepare("SELECT COUNT(*) AS n FROM users WHERE practice_id = ? AND role = 'owner' AND active = 1 AND id != ?")
          .get(me.practice_id, target.id).n;
        if (!others) fail(409, "You can't remove the practice's last owner.");
      }
      tx(ctx.db, () => {
        update(ctx, 'users', target.id, fields);
        if (deactivating) ctx.db.prepare('DELETE FROM sessions WHERE user_id = ?').run(target.id);
      });
      const u = ctx.db.prepare('SELECT * FROM users WHERE id = ?').get(target.id);
      return {
        ok: true,
        user: { id: u.id, name: u.name, email: u.email, title: u.title || '', role: u.role, initials: initials(u.name), active: Boolean(u.active), positionId: u.track_id ?? null },
      };
    },
    admin,
  );
}

function registerContent(router) {
  router.add(
    'GET',
    '/api/admin/content',
    (ctx) => {
      const pid = ctx.user.practice_id;
      const lessons = ctx.db.prepare('SELECT * FROM lessons WHERE practice_id = ? ORDER BY position, id').all(pid);
      const pools = poolSizes(ctx.db, pid);
      return {
        weeks: q.weeks(ctx.db, pid).map((w) => ({
          ...weekShape(w),
          quiz: quizSettings(w, pools.get(w.id) ?? 0),
          lessons: lessons.filter((l) => l.week_id === w.id).map((l) => adminLesson(ctx, l)),
        })),
        checklist: ctx.db
          .prepare('SELECT * FROM checklist_items WHERE practice_id = ? ORDER BY position, id')
          .all(pid)
          .map((c) => ({ id: c.id, title: c.title, detail: c.detail || '', section: c.section || '', positionId: c.track_id ?? null, position: c.position })),
        positions: positionsOf(ctx.db, pid),
        resources: q.resources(ctx.db, pid).map(resourceShape),
      };
    },
    admin,
  );

  // Weeks
  const weekFields = (body, partial) => {
    const f = {};
    if (!partial || body.title !== undefined) f.title = v.text(body.title, 'Title', { max: 120 });
    if (!partial || body.subtitle !== undefined) f.subtitle = v.text(body.subtitle, 'Subtitle', { max: 160, optional: true });
    if (body.links !== undefined) f.links = JSON.stringify(v.links(body.links, 'Section links'));
    if (body.position !== undefined) f.position = v.int(body.position, 'Position', { max: 10000 });
    return f;
  };
  router.add('POST', '/api/admin/weeks', async (ctx) => {
    const f = weekFields(await readJson(ctx.req), false);
    const id = insert(ctx, 'weeks', { position: nextPosition(ctx, 'weeks'), ...f });
    return { ok: true, id, week: weekShape(ownRow(ctx, 'weeks', id, 'week')) };
  }, admin);
  router.add('PUT', '/api/admin/weeks/:id', async (ctx) => {
    const week = ownRow(ctx, 'weeks', ctx.params.id, 'week');
    update(ctx, 'weeks', week.id, weekFields(await readJson(ctx.req), true));
    return { ok: true, id: week.id, week: weekShape(ownRow(ctx, 'weeks', week.id, 'week')) };
  }, admin);
  router.add('DELETE', '/api/admin/weeks/:id', (ctx) => {
    const week = ownRow(ctx, 'weeks', ctx.params.id, 'week');
    tx(ctx.db, () => {
      const ids = ctx.db.prepare('SELECT id FROM lessons WHERE week_id = ? AND practice_id = ?').all(week.id, ctx.user.practice_id);
      for (const { id } of ids) deleteLesson(ctx, id);
      ctx.db.prepare('DELETE FROM section_questions WHERE week_id = ? AND practice_id = ?').run(week.id, ctx.user.practice_id);
      ctx.db.prepare('DELETE FROM quiz_attempts WHERE week_id = ? AND practice_id = ?').run(week.id, ctx.user.practice_id);
      ctx.db.prepare('DELETE FROM weeks WHERE id = ? AND practice_id = ?').run(week.id, ctx.user.practice_id);
    });
    return { ok: true };
  }, admin);

  // Outline order: sections in order, each with its steps in order. Moving a step to another section
  // is just listing it there. Every id must belong to this practice; anything not listed keeps its place.
  router.add('PUT', '/api/admin/outline', async (ctx) => {
    const body = await readJson(ctx.req);
    const pid = ctx.user.practice_id;
    if (!Array.isArray(body.sections) || body.sections.length > 200) fail(400, 'Send the outline as a list of sections.');
    const seen = new Set();
    const plan = body.sections.map((s) => {
      const week = ownRow(ctx, 'weeks', s?.id, 'section');
      if (!Array.isArray(s.lessonIds) || s.lessonIds.length > 500) fail(400, 'Each section needs a list of steps.');
      const lessons = s.lessonIds.map((id) => {
        const l = ownLesson(ctx, id);
        if (seen.has(l.id)) fail(400, 'A step can only be in one place.');
        seen.add(l.id);
        return l.id;
      });
      return { weekId: week.id, lessons };
    });
    tx(ctx.db, () => {
      const setWeek = ctx.db.prepare('UPDATE weeks SET position = ? WHERE id = ? AND practice_id = ?');
      const setLesson = ctx.db.prepare('UPDATE lessons SET week_id = ?, position = ? WHERE id = ? AND practice_id = ?');
      plan.forEach((s, i) => {
        setWeek.run(i + 1, s.weekId, pid);
        s.lessons.forEach((id, j) => setLesson.run(s.weekId, j + 1, id, pid));
      });
    });
    return { ok: true };
  }, admin);

  // Lessons
  router.add('POST', '/api/admin/lessons', async (ctx) => {
    const body = await readJson(ctx.req);
    const f = lessonFields(ctx, body, false);
    f.position ??= nextPosition(ctx, 'lessons', 'AND week_id = ?', f.week_id);
    const id = insert(ctx, 'lessons', { ...f, updated_at: now() });
    // Bulk imports pass notify: false so the team isn't sent one alert per lesson.
    if (body.notify !== false) {
      notify(ctx.db, {
        practiceId: ctx.user.practice_id, userIds: everyoneIds(ctx.db, ctx.user.practice_id), except: ctx.user.id,
        kind: 'lesson', title: `New lesson: ${f.title}`, link: `/lesson/${id}`,
      });
    }
    return { ok: true, id, lesson: adminLesson(ctx, ownRow(ctx, 'lessons', id, 'lesson')) };
  }, admin);
  router.add('PUT', '/api/admin/lessons/:id', async (ctx) => {
    const lesson = ownLesson(ctx, ctx.params.id);
    const f = lessonFields(ctx, await readJson(ctx.req), true, pageBlocksOf(lesson));
    update(ctx, 'lessons', lesson.id, { ...f, updated_at: now() });
    return { ok: true, id: lesson.id, lesson: adminLesson(ctx, ownLesson(ctx, lesson.id)) };
  }, admin);
  router.add('DELETE', '/api/admin/lessons/:id', (ctx) => {
    const lesson = ownLesson(ctx, ctx.params.id);
    tx(ctx.db, () => deleteLesson(ctx, lesson.id));
    return { ok: true };
  }, admin);

  router.add('PUT', '/api/admin/lessons/:id/quiz', async (ctx) => {
    const lesson = ownLesson(ctx, ctx.params.id);
    const body = await readJson(ctx.req);
    const list = Array.isArray(body) ? body : body.quiz;
    if (!Array.isArray(list) || list.length > 20) fail(400, 'Send the quiz as a list of up to 20 questions.');
    const rows = list.map((item, n) => {
      const label = `Question ${n + 1}`;
      if (!item || typeof item !== 'object') fail(400, `${label} is not valid.`);
      const options = v.stringList(item.options, `${label} options`, { max: 6 });
      if (options.length < 2) fail(400, `${label} needs at least two options.`);
      return {
        prompt: v.text(item.prompt, `${label} prompt`, { max: 1000 }),
        options: JSON.stringify(options),
        correct_index: v.int(item.correctIndex, `${label} correct answer`, { max: options.length - 1 }),
        explanation: v.text(item.explanation, `${label} explanation`, { max: 2000, optional: true }),
      };
    });
    tx(ctx.db, () => {
      ctx.db.prepare('DELETE FROM quiz_questions WHERE lesson_id = ? AND practice_id = ?').run(lesson.id, ctx.user.practice_id);
      for (const r of rows) insert(ctx, 'quiz_questions', { lesson_id: lesson.id, ...r });
    });
    return { ok: true, quiz: adminLesson(ctx, lesson).quiz };
  }, admin);

  // Positions
  router.add('GET', '/api/admin/positions', (ctx) => positionsOf(ctx.db, ctx.user.practice_id), admin);
  router.add('POST', '/api/admin/positions', async (ctx) => {
    const name = v.text((await readJson(ctx.req)).name, 'Position name', { max: 60 });
    const id = insert(ctx, 'tracks', { name, position: nextPosition(ctx, 'tracks') });
    return { ok: true, id, positions: positionsOf(ctx.db, ctx.user.practice_id) };
  }, admin);
  router.add('PUT', '/api/admin/positions/:id', async (ctx) => {
    const t = ownRow(ctx, 'tracks', ctx.params.id, 'position');
    const body = await readJson(ctx.req);
    const f = {};
    if (body.name !== undefined) f.name = v.text(body.name, 'Position name', { max: 60 });
    if (body.position !== undefined) f.position = v.int(body.position, 'Order', { max: 10000 });
    update(ctx, 'tracks', t.id, f);
    return { ok: true, positions: positionsOf(ctx.db, ctx.user.practice_id) };
  }, admin);
  router.add('DELETE', '/api/admin/positions/:id', (ctx) => {
    const t = ownRow(ctx, 'tracks', ctx.params.id, 'position');
    const items = ctx.db.prepare('SELECT COUNT(*) AS n FROM checklist_items WHERE track_id = ? AND practice_id = ?').get(t.id, ctx.user.practice_id).n;
    if (items) fail(409, `This position still has ${items} checklist item${items === 1 ? '' : 's'}. Move or delete them first.`);
    tx(ctx.db, () => {
      ctx.db.prepare('UPDATE users SET track_id = NULL WHERE track_id = ? AND practice_id = ?').run(t.id, ctx.user.practice_id);
      ctx.db.prepare('UPDATE invites SET track_id = NULL WHERE track_id = ? AND practice_id = ?').run(t.id, ctx.user.practice_id);
      ctx.db.prepare('DELETE FROM tracks WHERE id = ? AND practice_id = ?').run(t.id, ctx.user.practice_id);
    });
    return { ok: true, positions: positionsOf(ctx.db, ctx.user.practice_id) };
  }, admin);

  // Checklist
  const itemFields = (ctx, body, partial) => {
    const f = {};
    if (!partial || body.title !== undefined) f.title = v.text(body.title, 'Title', { max: 200 });
    if (!partial || body.detail !== undefined) f.detail = v.text(body.detail, 'Detail', { max: 1000, optional: true });
    if (body.section !== undefined) f.section = v.text(body.section, 'Section', { max: 80, optional: true });
    if (body.positionId !== undefined) f.track_id = trackField(ctx, body.positionId);
    if (body.position !== undefined) f.position = v.int(body.position, 'Position', { max: 10000 });
    return f;
  };
  const itemShape = (c) => ({ id: c.id, title: c.title, detail: c.detail || '', section: c.section || '', positionId: c.track_id ?? null, position: c.position });
  router.add('POST', '/api/admin/checklist', async (ctx) => {
    const f = itemFields(ctx, await readJson(ctx.req), false);
    const id = insert(ctx, 'checklist_items', { position: nextPosition(ctx, 'checklist_items'), ...f });
    return { ok: true, id, item: itemShape(ownRow(ctx, 'checklist_items', id, 'checklist item')) };
  }, admin);
  router.add('PUT', '/api/admin/checklist/:id', async (ctx) => {
    const item = ownRow(ctx, 'checklist_items', ctx.params.id, 'checklist item');
    update(ctx, 'checklist_items', item.id, itemFields(ctx, await readJson(ctx.req), true));
    return { ok: true, id: item.id, item: itemShape(ownRow(ctx, 'checklist_items', item.id, 'checklist item')) };
  }, admin);
  router.add('DELETE', '/api/admin/checklist/:id', (ctx) => {
    const item = ownRow(ctx, 'checklist_items', ctx.params.id, 'checklist item');
    tx(ctx.db, () => {
      ctx.db.prepare('DELETE FROM checklist_done WHERE item_id = ? AND practice_id = ?').run(item.id, ctx.user.practice_id);
      ctx.db.prepare('DELETE FROM checklist_items WHERE id = ? AND practice_id = ?').run(item.id, ctx.user.practice_id);
    });
    return { ok: true };
  }, admin);
}

function registerPractice(router) {
  router.add('GET', '/api/admin/questions', (ctx) => {
    const rows = ctx.db
      .prepare(
        `SELECT qn.*, u.name AS asker_name, l.title AS lesson_title FROM questions qn
         LEFT JOIN users u ON u.id = qn.user_id AND u.practice_id = qn.practice_id
         LEFT JOIN lessons l ON l.id = qn.lesson_id AND l.practice_id = qn.practice_id
         WHERE qn.practice_id = ? ORDER BY (qn.resolved_at IS NOT NULL), qn.id DESC`,
      )
      .all(ctx.user.practice_id);
    const replies = loadReplies(ctx.db, ctx.user.practice_id, rows.map((x) => x.id), ctx.user.id);
    return rows.map((x) => ({
        id: x.id,
        body: x.body,
        askerId: x.user_id,
        askerName: x.asker_name || 'Former team member',
        lessonId: x.lesson_id ?? null,
        lessonTitle: x.lesson_title || null,
        createdAt: x.created_at,
        resolvedAt: x.resolved_at || null,
        replies: replies.get(x.id) ?? [],
      }));
  }, admin);

  router.add('POST', '/api/admin/questions/:id/resolve', (ctx) => {
    const row = ownRow(ctx, 'questions', ctx.params.id, 'question');
    ctx.db.prepare('UPDATE questions SET resolved_at = COALESCE(resolved_at, ?) WHERE id = ? AND practice_id = ?').run(
      now(),
      row.id,
      ctx.user.practice_id,
    );
    return { ok: true };
  }, admin);

  router.add('PUT', '/api/admin/practice', async (ctx) => {
    notInDemo(ctx);
    const body = await readJson(ctx.req);
    const f = {};
    if (body.name !== undefined) f.name = v.text(body.name, 'Practice name', { max: 120 });
    if (body.logoUrl !== undefined) f.logo_url = v.url(body.logoUrl, 'Logo URL');
    if (body.brandColor !== undefined) {
      const color = v.text(body.brandColor, 'Brand colour', { max: 7 });
      if (!/^#[0-9a-f]{6}$/i.test(color)) fail(400, 'Brand colour must be a hex colour like #22688A.');
      const ratio = contrastOnWhite(color);
      if (ratio < 4.5) fail(400, `Brand colour contrast on white is ${ratio.toFixed(2)}:1. It needs at least 4.5:1.`);
      f.brand_color = color.toUpperCase();
    }
    if (body.signInMethods !== undefined) {
      const m = body.signInMethods;
      if (!m || typeof m !== 'object' || Array.isArray(m)) fail(400, 'Sign-in methods must be an object.');
      const next = { ...signInOf(ctx.practice) };
      for (const k of ['password', 'google', 'microsoft']) if (typeof m[k] === 'boolean') next[k] = m[k];
      if (!next.password && !next.google && !next.microsoft) fail(400, 'Keep at least one way to sign in.');
      // Don't let the owner switch off the only method they can use.
      const mine = ctx.db.prepare('SELECT provider FROM user_identities WHERE user_id = ?').all(ctx.user.id).map((r) => r.provider);
      const ownerCanSignIn = (next.password && ctx.user.password_hash) || mine.some((p) => next[p]);
      if (!ownerCanSignIn) fail(400, 'That would lock you out. Connect Google or Microsoft on your Account page first.');
      f.signin_methods = JSON.stringify(next);
    }
    if (body.clientMessaging !== undefined) {
      const c = body.clientMessaging;
      if (c === null || (c && !c.label && !c.url)) f.client_messaging = null;
      else {
        if (typeof c !== 'object' || Array.isArray(c)) fail(400, 'Client messaging must be an object.');
        const label = v.text(c.label, 'Client messaging app name', { max: 40 });
        const url = v.url(c.url, 'Client messaging link');
        if (!url) fail(400, 'Add the link people use to open that app.');
        f.client_messaging = JSON.stringify({ label, url });
      }
    }
    if (body.paperworkEnabled !== undefined) {
      if (typeof body.paperworkEnabled !== 'boolean') fail(400, 'paperworkEnabled must be true or false.');
      if (body.paperworkEnabled && !ctx.app.paperworkKey) fail(503, 'Secure storage for forms isn’t set up on this server yet.');
      f.paperwork_enabled = body.paperworkEnabled ? 1 : 0;
    }
    if (body.welcome !== undefined) {
      if (!body.welcome || typeof body.welcome !== 'object' || Array.isArray(body.welcome)) fail(400, 'Welcome must be an object.');
      const w = body.welcome;
      if (w.quote !== undefined) f.welcome_quote = w.quote === '' ? '' : v.text(w.quote, 'Welcome quote', { max: 300 });
      if (w.ref !== undefined) f.welcome_quote_ref = w.ref === '' ? '' : v.text(w.ref, 'Quote reference', { max: 60 });
      if (w.photoUrl !== undefined) f.welcome_photo_url = v.url(w.photoUrl, 'Sign-in photo URL');
    }
    if (body.terms !== undefined) {
      if (!body.terms || typeof body.terms !== 'object' || Array.isArray(body.terms)) fail(400, 'Terms must be an object.');
      // Merge into what's saved, so a form that sends one word doesn't wipe the others.
      const current = ctx.db.prepare('SELECT terms FROM practices WHERE id = ?').get(ctx.user.practice_id);
      let clean = {};
      try { clean = JSON.parse(current?.terms || '{}') || {}; } catch { clean = {}; }
      for (const k of Object.keys(clean)) if (!TERM_KEYS.includes(k)) delete clean[k];
      for (const k of TERM_KEYS) {
        if (body.terms[k] === undefined) continue;
        clean[k] = v.text(body.terms[k], `Term "${k}"`, { max: 40 });
      }
      f.terms = JSON.stringify(clean);
    }
    const keys = Object.keys(f);
    if (keys.length) {
      ctx.db
        .prepare(`UPDATE practices SET ${keys.map((k) => `${k} = ?`).join(', ')} WHERE id = ?`)
        .run(...Object.values(f), ctx.user.practice_id);
    }
    const p = ctx.db.prepare('SELECT * FROM practices WHERE id = ?').get(ctx.user.practice_id);
    return { ok: true, practice: practiceShape(p) };
  }, { auth: 'owner' });
}

function registerBackups(router) {
  const owner = { auth: 'owner' };
  router.add('GET', '/api/admin/backups', async (ctx) => {
    if (!ctx.app.s3) return { enabled: false, dates: [] };
    return { enabled: true, dates: await listBackups(ctx.app.s3) };
  }, owner);
  router.add('POST', '/api/admin/backup', async (ctx) => {
    if (!ctx.app.s3) fail(503, 'Backups aren’t set up on this server.');
    const r = await runBackup({ db: ctx.db, dataDir: ctx.app.dataDir, s3: ctx.app.s3 });
    return { ok: true, date: r.date, bytes: r.bytes };
  }, owner);
}

export default function register(router) {
  registerBackups(router);
  registerTeam(router);
  registerContent(router);
  registerPractice(router);
}
