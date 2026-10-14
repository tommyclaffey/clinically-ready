// Paperwork: things a new team member signs or hands in during onboarding.
//   • kind 'sign'   — an agreement the practice writes (confidentiality, handbook acknowledgement…).
//                     Signed electronically: they read it, confirm consent, and type their full name.
//                     We keep an audit record: the exact text signed (and its hash), version, time, IP, browser.
//   • kind 'upload' — tax / employment forms (W-4, W-9, direct deposit…). They download the official blank
//                     form, fill it in, and upload the completed copy. Files are encrypted at rest and only
//                     owners/admins can open them. These are OFF unless the practice switches them on.
import { notInDemo } from './demo.mjs';
import fs from 'node:fs';
import path from 'node:path';
import { randomBytes } from 'node:crypto';
import { sha256 } from '../auth.mjs';
import { now, tx } from '../db.mjs';
import { UPLOAD_LIMIT, fail, intId, readBody, readJson } from '../http.mjs';
import { notify, preview, staffIds } from '../notify.mjs';
import * as v from '../validate.mjs';
import { open, seal } from '../vault.mjs';

const PAPERWORK_TYPES = { pdf: 'application/pdf', png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg' };
const extOf = (filename) => path.extname(String(filename || '')).slice(1).toLowerCase();

const paperworkOn = (practice) => Boolean(practice.paperwork_enabled);

function paperDir(app, practiceId) {
  const dir = path.join(app.dataDir, 'uploads', String(practiceId), 'paperwork');
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

/** Forms this person must deal with: active, for everyone (but owners) or their position, uploads only when switched on. */
export function formsFor(db, practice, user) {
  // Owners run onboarding; they don't sign their own agreements.
  if (user.role === 'owner') return [];
  return db
    .prepare(
      `SELECT * FROM forms WHERE practice_id = ? AND active = 1 AND (track_id IS NULL OR track_id = ?)
       ${paperworkOn(practice) ? '' : "AND kind = 'sign'"} ORDER BY position, id`,
    )
    .all(practice.id, user.track_id ?? -1);
}

/** Latest submission per form for one person. */
export function latestSubmissions(db, practiceId, userId) {
  const rows = db
    .prepare('SELECT * FROM form_submissions WHERE practice_id = ? AND user_id = ? ORDER BY id')
    .all(practiceId, userId);
  const map = new Map();
  for (const r of rows) map.set(r.form_id, r);
  return map;
}

/** done = they've signed the current version / handed the form in. */
export function formStatus(form, sub) {
  if (!sub) return 'todo';
  if (form.kind === 'sign' && sub.version !== form.version) return 'resign';
  return 'done';
}

export const myFormShape = (f) => formShape(f, new Map());

const formShape = (f, tracks) => ({
  id: f.id,
  kind: f.kind,
  title: f.title,
  body: f.body || '',
  templateUrl: f.template_url || '',
  positionId: f.track_id ?? null,
  positionName: f.track_id ? tracks.get(f.track_id) ?? null : null,
  required: Boolean(f.required),
  active: Boolean(f.active),
  version: f.version,
  updatedAt: f.updated_at,
});

export const submissionShape = (s) =>
  s && {
    id: s.id,
    version: s.version,
    typedName: s.typed_name || '',
    submittedAt: s.submitted_at,
    hasFile: Boolean(s.stored_name && !s.file_deleted_at),
    fileDeletedAt: s.file_deleted_at || null,
    fileType: s.file_ext ? s.file_ext.toUpperCase() : '',
    sizeBytes: s.size_bytes || 0,
  };

const trackNames = (db, pid) => new Map(db.prepare('SELECT id, name FROM tracks WHERE practice_id = ?').all(pid).map((t) => [t.id, t.name]));

function ownForm(ctx, id) {
  const f = ctx.db.prepare('SELECT * FROM forms WHERE id = ? AND practice_id = ?').get(intId(id), ctx.user.practice_id);
  if (!f) fail(404, 'That form was not found.');
  return f;
}

function formFields(ctx, body, existing) {
  const f = {};
  const kind = existing ? existing.kind : v.oneOf(body.kind, 'Type', ['sign', 'upload']);
  if (!existing) f.kind = kind;
  if (kind === 'upload' && !paperworkOn(ctx.practice)) {
    fail(400, 'Turn on tax and employment forms first (Paperwork → settings).');
  }
  if (body.title !== undefined || !existing) f.title = v.text(body.title, 'Title', { max: 160 });
  if (body.body !== undefined || !existing) {
    f.body = v.text(body.body, kind === 'sign' ? 'Agreement text' : 'Instructions', { max: 40000, optional: kind === 'upload' });
    if (kind === 'sign' && !f.body) fail(400, 'Write the agreement text people will sign.');
  }
  if (body.templateUrl !== undefined) f.template_url = v.url(body.templateUrl, 'Blank form link');
  if (body.positionId !== undefined) {
    f.track_id =
      body.positionId === null || body.positionId === ''
        ? null
        : (() => {
            const t = ctx.db.prepare('SELECT id FROM tracks WHERE id = ? AND practice_id = ?').get(intId(body.positionId), ctx.user.practice_id);
            if (!t) fail(404, 'That position was not found.');
            return t.id;
          })();
  }
  if (body.required !== undefined) f.required = body.required ? 1 : 0;
  if (body.active !== undefined) f.active = body.active ? 1 : 0;
  if (body.position !== undefined) f.position = v.int(body.position, 'Position', { max: 10000 });
  return f;
}

export default function register(router) {
  // ---------------- team member side ----------------
  router.add('GET', '/api/forms', (ctx) => {
    const forms = formsFor(ctx.db, ctx.practice, ctx.user);
    const subs = latestSubmissions(ctx.db, ctx.user.practice_id, ctx.user.id);
    const tracks = trackNames(ctx.db, ctx.user.practice_id);
    return forms.map((f) => ({ ...formShape(f, tracks), status: formStatus(f, subs.get(f.id)), submission: submissionShape(subs.get(f.id)) }));
  }, { auth: 'user' });

  router.add('POST', '/api/forms/:id/sign', async (ctx) => {
    const form = ownForm(ctx, ctx.params.id);
    if (!form.active || form.kind !== 'sign') fail(404, 'That agreement was not found.');
    if (form.track_id && form.track_id !== ctx.user.track_id) fail(404, 'That agreement was not found.');
    const body = await readJson(ctx.req);
    if (body.consent !== true) fail(400, 'Tick the box to agree to sign electronically.');
    const typed = v.text(body.typedName, 'Your full name', { max: 120 });
    if (typed.replace(/\s+/g, ' ').trim().split(' ').length < 2) fail(400, 'Type your full name: first and last.');
    if (body.version !== undefined && Number(body.version) !== form.version) {
      fail(409, 'This agreement was just updated. Reload to read the latest version before signing.');
    }
    const at = now();
    const id = Number(
      ctx.db
        .prepare(
          `INSERT INTO form_submissions(practice_id, form_id, user_id, version, title, body, body_hash, typed_name, ip, user_agent, submitted_at)
           VALUES (?,?,?,?,?,?,?,?,?,?,?)`,
        )
        .run(ctx.user.practice_id, form.id, ctx.user.id, form.version, form.title, form.body, sha256(form.body || ''), typed,
          ctx.ip || '', String(ctx.req.headers['user-agent'] || '').slice(0, 300), at).lastInsertRowid,
    );
    notify(ctx.db, {
      practiceId: ctx.user.practice_id, userIds: staffIds(ctx.db, ctx.user.practice_id), except: ctx.user.id,
      kind: 'paperwork', title: `${ctx.user.name} signed ${preview(form.title, 60)}`, link: `/admin/people/${ctx.user.id}`,
    });
    return { ok: true, id, signedAt: at };
  }, { auth: 'user' });

  router.add('POST', '/api/forms/:id/upload', async (ctx) => {
    notInDemo(ctx);
    const form = ownForm(ctx, ctx.params.id);
    if (!form.active || form.kind !== 'upload' || !paperworkOn(ctx.practice)) fail(404, 'That form was not found.');
    if (form.track_id && form.track_id !== ctx.user.track_id) fail(404, 'That form was not found.');
    if (!ctx.app.paperworkKey) fail(503, 'Secure storage for forms isn’t set up on this server yet.');
    const ext = extOf(ctx.query.get('filename'));
    if (!PAPERWORK_TYPES[ext]) fail(400, 'Upload a PDF, PNG or JPG.');
    const bytes = await readBody(ctx.req, UPLOAD_LIMIT);
    if (!bytes.length) fail(400, 'The file is empty.');
    const stored = `${randomBytes(16).toString('hex')}.bin`;
    fs.writeFileSync(path.join(paperDir(ctx.app, ctx.user.practice_id), stored), seal(ctx.app.paperworkKey, bytes));
    const at = now();
    tx(ctx.db, () => {
      // A new copy replaces the old one: remove the previous file so only one copy of their details exists.
      const old = ctx.db
        .prepare('SELECT * FROM form_submissions WHERE practice_id = ? AND form_id = ? AND user_id = ? AND stored_name IS NOT NULL AND file_deleted_at IS NULL')
        .all(ctx.user.practice_id, form.id, ctx.user.id);
      for (const o of old) {
        fs.rmSync(path.join(paperDir(ctx.app, ctx.user.practice_id), path.basename(o.stored_name)), { force: true });
        ctx.db.prepare('UPDATE form_submissions SET file_deleted_at = ? WHERE id = ?').run(at, o.id);
      }
      ctx.db
        .prepare(
          `INSERT INTO form_submissions(practice_id, form_id, user_id, version, title, stored_name, file_ext, size_bytes, ip, user_agent, submitted_at)
           VALUES (?,?,?,?,?,?,?,?,?,?,?)`,
        )
        .run(ctx.user.practice_id, form.id, ctx.user.id, form.version, form.title, stored, ext, bytes.length, ctx.ip || '',
          String(ctx.req.headers['user-agent'] || '').slice(0, 300), at);
    });
    notify(ctx.db, {
      practiceId: ctx.user.practice_id, userIds: staffIds(ctx.db, ctx.user.practice_id), except: ctx.user.id,
      kind: 'paperwork', title: `${ctx.user.name} handed in ${preview(form.title, 60)}`, link: `/admin/people/${ctx.user.id}`,
    });
    return { ok: true, submittedAt: at };
  }, { auth: 'user' });

  // The signed record (their own; admins can open anyone's in their practice).
  router.add('GET', '/api/submissions/:id', (ctx) => {
    const s = ctx.db.prepare('SELECT * FROM form_submissions WHERE id = ? AND practice_id = ?').get(intId(ctx.params.id), ctx.user.practice_id);
    const isStaff = ctx.user.role === 'owner' || ctx.user.role === 'admin';
    if (!s || (s.user_id !== ctx.user.id && !isStaff)) fail(404, 'That record was not found.');
    const who = ctx.db.prepare('SELECT name, email FROM users WHERE id = ?').get(s.user_id);
    return {
      ...submissionShape(s),
      title: s.title,
      body: s.body || '',
      bodyHash: s.body_hash || '',
      signer: { name: who?.name || '', email: who?.email || '' },
      ip: isStaff ? s.ip : undefined,
      userAgent: isStaff ? s.user_agent : undefined,
    };
  }, { auth: 'user' });

  // ---------------- admin side ----------------
  router.add('GET', '/api/admin/forms', (ctx) => {
    const pid = ctx.user.practice_id;
    const tracks = trackNames(ctx.db, pid);
    const forms = ctx.db.prepare('SELECT * FROM forms WHERE practice_id = ? ORDER BY active DESC, position, id').all(pid);
    const people = ctx.db.prepare("SELECT id, track_id FROM users WHERE practice_id = ? AND active = 1 AND role != 'owner'").all(pid);
    const subs = ctx.db.prepare('SELECT form_id, user_id, version FROM form_submissions WHERE practice_id = ? ORDER BY id').all(pid);
    const latest = new Map();
    for (const s of subs) latest.set(`${s.form_id}:${s.user_id}`, s);
    return {
      paperworkEnabled: paperworkOn(ctx.practice),
      secureStorage: Boolean(ctx.app.paperworkKey),
      forms: forms.map((f) => {
        const who = people.filter((u) => !f.track_id || u.track_id === f.track_id);
        const done = who.filter((u) => formStatus(f, latest.get(`${f.id}:${u.id}`)) === 'done').length;
        return { ...formShape(f, tracks), assigned: who.length, done };
      }),
    };
  }, { auth: 'admin' });

  router.add('POST', '/api/admin/forms', async (ctx) => {
    const body = await readJson(ctx.req);
    const f = formFields(ctx, body, null);
    const pos = ctx.db.prepare('SELECT COALESCE(MAX(position), 0) + 1 AS n FROM forms WHERE practice_id = ?').get(ctx.user.practice_id).n;
    const at = now();
    const all = { practice_id: ctx.user.practice_id, position: pos, version: 1, created_at: at, updated_at: at, ...f };
    const keys = Object.keys(all);
    const id = Number(ctx.db.prepare(`INSERT INTO forms(${keys.join(',')}) VALUES (${keys.map(() => '?').join(',')})`).run(...Object.values(all)).lastInsertRowid);
    return { ok: true, id };
  }, { auth: 'admin' });

  router.add('PUT', '/api/admin/forms/:id', async (ctx) => {
    const form = ownForm(ctx, ctx.params.id);
    const body = await readJson(ctx.req);
    const f = formFields(ctx, body, form);
    // Changing the words of an agreement makes it a new version: people who signed the old text sign again.
    if (form.kind === 'sign' && f.body !== undefined && f.body !== form.body) f.version = form.version + 1;
    f.updated_at = now();
    const keys = Object.keys(f);
    ctx.db.prepare(`UPDATE forms SET ${keys.map((k) => `${k} = ?`).join(', ')} WHERE id = ? AND practice_id = ?`).run(...Object.values(f), form.id, ctx.user.practice_id);
    return { ok: true, version: f.version ?? form.version };
  }, { auth: 'admin' });

  // Delete only when nobody has signed/handed it in; otherwise it's archived so the records stay.
  router.add('DELETE', '/api/admin/forms/:id', (ctx) => {
    const form = ownForm(ctx, ctx.params.id);
    const used = ctx.db.prepare('SELECT 1 FROM form_submissions WHERE form_id = ? AND practice_id = ?').get(form.id, ctx.user.practice_id);
    if (used) {
      ctx.db.prepare('UPDATE forms SET active = 0, updated_at = ? WHERE id = ?').run(now(), form.id);
      return { ok: true, archived: true };
    }
    ctx.db.prepare('DELETE FROM forms WHERE id = ? AND practice_id = ?').run(form.id, ctx.user.practice_id);
    return { ok: true, archived: false };
  }, { auth: 'admin' });

  // Open a handed-in form (decrypted on the fly; never cached).
  router.add('GET', '/api/admin/submissions/:id/file', (ctx) => {
    const s = ctx.db.prepare('SELECT * FROM form_submissions WHERE id = ? AND practice_id = ?').get(intId(ctx.params.id), ctx.user.practice_id);
    if (!s || !s.stored_name || s.file_deleted_at) fail(404, 'That file was not found.');
    if (!ctx.app.paperworkKey) fail(503, 'Secure storage for forms isn’t set up on this server.');
    let bytes;
    try {
      bytes = open(ctx.app.paperworkKey, fs.readFileSync(path.join(paperDir(ctx.app, ctx.user.practice_id), path.basename(s.stored_name))));
    } catch {
      fail(404, 'That file could not be opened.');
    }
    const who = ctx.db.prepare('SELECT name FROM users WHERE id = ?').get(s.user_id);
    const name = `${(who?.name || 'person').replace(/[^\w .-]+/g, '')} - ${String(s.title).replace(/[^\w .()-]+/g, '')}.${s.file_ext}`.slice(0, 150);
    ctx.res.writeHead(200, {
      'Content-Type': PAPERWORK_TYPES[s.file_ext] || 'application/octet-stream',
      'Content-Length': bytes.length,
      'Content-Disposition': `attachment; filename="${name}"; filename*=UTF-8''${encodeURIComponent(name)}`,
      'Cache-Control': 'private, no-store',
    });
    ctx.res.end(bytes);
  }, { auth: 'admin' });

  // Delete the stored copy (e.g. once it's been entered into payroll). The record that it was handed in stays.
  router.add('DELETE', '/api/admin/submissions/:id/file', (ctx) => {
    const s = ctx.db.prepare('SELECT * FROM form_submissions WHERE id = ? AND practice_id = ?').get(intId(ctx.params.id), ctx.user.practice_id);
    if (!s || !s.stored_name || s.file_deleted_at) fail(404, 'That file was not found.');
    fs.rmSync(path.join(paperDir(ctx.app, ctx.user.practice_id), path.basename(s.stored_name)), { force: true });
    ctx.db.prepare('UPDATE form_submissions SET file_deleted_at = ? WHERE id = ?').run(now(), s.id);
    return { ok: true };
  }, { auth: 'admin' });
}
