// Resource upload (admin), download (any signed-in user) and delete (admin).
// Files live at data/uploads/<practice_id>/<random>.<ext>; the client's filename never touches disk.
import { notInDemo } from './demo.mjs';
import fs from 'node:fs';
import path from 'node:path';
import { randomBytes } from 'node:crypto';
import { now } from '../db.mjs';
import { UPLOAD_LIMIT, fail, intId, readBody } from '../http.mjs';
import { resourceShape } from '../shapes.mjs';
import * as v from '../validate.mjs';
import { ownLesson } from './learner.mjs';
import { analyseFile } from '../previews.mjs';
import { DEMO_LIBRARY } from '../demolib.mjs';

// Demo rows point at the shared library with a `demo-library/` stored_name, so visitor copies share one
// set of files. Stored names are only ever set by the server.
const LIB = 'demo-library/';

export const ALLOWED = {
  pdf: 'application/pdf',
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  doc: 'application/msword',
  xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  pptx: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  zip: 'application/zip',
  png: 'image/png',
  jpg: 'image/jpeg',
  txt: 'text/plain; charset=utf-8',
  mp4: 'video/mp4',
};

export const extOf = (filename) => path.extname(String(filename || '')).slice(1).toLowerCase();

export function filePath(dataDir, practiceId, storedName) {
  if (String(storedName).startsWith(LIB)) return path.join(DEMO_LIBRARY, path.basename(storedName));
  return path.join(dataDir, 'uploads', String(practiceId), path.basename(storedName));
}

/** Page count + first-page preview for a stored resource; saves both on the row. Never throws. */
export async function describeResource(db, dataDir, row) {
  const ext = extOf(row.stored_name);
  let bytes;
  try {
    bytes = fs.readFileSync(filePath(dataDir, row.practice_id, row.stored_name));
  } catch {
    db.prepare("UPDATE resources SET preview_name = '' WHERE id = ?").run(row.id);
    return;
  }
  const { pages, png } = await analyseFile(ext, bytes);
  let previewName = '';
  if (png) {
    previewName = `${path.basename(row.stored_name, path.extname(row.stored_name))}.preview.png`;
    fs.writeFileSync(filePath(dataDir, row.practice_id, previewName), png);
  }
  db.prepare('UPDATE resources SET page_count = ?, preview_name = ? WHERE id = ?').run(pages, previewName, row.id);
}

/** Boot-time backfill: files uploaded before previews existed get them, one at a time, in the background. */
export function backfillPreviews(db, dataDir) {
  let stopped = false;
  const run = async () => {
    const rows = db.prepare("SELECT * FROM resources WHERE preview_name IS NULL AND stored_name NOT LIKE 'demo-library/%' ORDER BY id").all();
    for (const row of rows) {
      if (stopped) return;
      try {
        await describeResource(db, dataDir, row);
      } catch (err) {
        if (!stopped) console.warn(`Preview backfill skipped resource ${row.id}: ${err.message}`);
      }
    }
  };
  const timer = setTimeout(run, 3000);
  timer.unref?.();
  return () => { stopped = true; clearTimeout(timer); };
}

/** Store bytes for a practice and return the random stored name. Also used by the seed. */
export function storeFile(dataDir, practiceId, ext, bytes) {
  const dir = path.join(dataDir, 'uploads', String(practiceId));
  fs.mkdirSync(dir, { recursive: true });
  const storedName = `${randomBytes(16).toString('hex')}.${ext}`;
  fs.writeFileSync(path.join(dir, storedName), bytes);
  return storedName;
}

/** "Clinician handbook" + pdf -> a header-safe download name. */
function downloadName(title, ext) {
  const base = title.replace(/[^\w .()-]+/g, '').trim().slice(0, 100) || 'download';
  return `${base}.${ext}`;
}

export default function register(router) {
  router.add(
    'GET',
    '/api/resources/:id/download',
    (ctx) => {
      const pid = ctx.user.practice_id;
      const r = ctx.db.prepare('SELECT * FROM resources WHERE id = ? AND practice_id = ?').get(intId(ctx.params.id), pid);
      if (!r) fail(404, 'That resource was not found.');
      const file = filePath(ctx.app.dataDir, pid, r.stored_name);
      let stat;
      try {
        stat = fs.statSync(file);
      } catch {
        fail(404, 'That file is missing. Ask your practice admin to upload it again.');
      }
      const ext = extOf(r.stored_name);
      const name = downloadName(r.title, ext);
      ctx.res.writeHead(200, {
        'Content-Type': ALLOWED[ext] || 'application/octet-stream',
        'Content-Length': stat.size,
        'Content-Disposition': `attachment; filename="${name}"; filename*=UTF-8''${encodeURIComponent(name)}`,
        'Cache-Control': 'private, no-store',
      });
      fs.createReadStream(file).pipe(ctx.res);
    },
    { auth: 'user' },
  );

  router.add(
    'GET',
    '/api/resources/:id/preview',
    (ctx) => {
      const pid = ctx.user.practice_id;
      const r = ctx.db.prepare('SELECT * FROM resources WHERE id = ? AND practice_id = ?').get(intId(ctx.params.id), pid);
      if (!r || !r.preview_name) fail(404, 'No preview for that file.');
      let png;
      try {
        png = fs.readFileSync(filePath(ctx.app.dataDir, pid, r.preview_name));
      } catch {
        fail(404, 'No preview for that file.');
      }
      ctx.res.writeHead(200, { 'Content-Type': 'image/png', 'Content-Length': png.length, 'Cache-Control': 'private, max-age=86400' });
      ctx.res.end(png);
    },
    { auth: 'user' },
  );

  router.add(
    'POST',
    '/api/admin/resources',
    async (ctx) => {
      notInDemo(ctx);
      const pid = ctx.user.practice_id;
      const qs = ctx.query;
      const ext = extOf(qs.get('filename'));
      if (!ALLOWED[ext]) fail(400, `That file type isn't allowed. Use: ${Object.keys(ALLOWED).join(', ')}.`);
      const category = v.oneOf(qs.get('category') || 'Resource', 'Category', ['Resource', 'Policy']);
      let lessonId = null;
      if (qs.get('lessonId')) lessonId = ownLesson(ctx, qs.get('lessonId')).id;
      const fallbackTitle = path.basename(qs.get('filename'), path.extname(qs.get('filename')));
      const title = v.text(qs.get('title') || fallbackTitle, 'Title', { max: 160 });

      const bytes = await readBody(ctx.req, UPLOAD_LIMIT);
      if (!bytes.length) fail(400, 'The file is empty.');
      const storedName = storeFile(ctx.app.dataDir, pid, ext, bytes);
      const res = ctx.db
        .prepare(
          `INSERT INTO resources(practice_id, lesson_id, category, title, file_type, size_bytes, stored_name, created_at, updated_at)
           VALUES (?,?,?,?,?,?,?,?,?)`,
        )
        .run(pid, lessonId, category, title, ext.toUpperCase(), bytes.length, storedName, now(), now());
      let row = ctx.db.prepare('SELECT * FROM resources WHERE id = ?').get(res.lastInsertRowid);
      await describeResource(ctx.db, ctx.app.dataDir, row);
      row = ctx.db.prepare('SELECT * FROM resources WHERE id = ?').get(row.id);
      return { ok: true, resource: resourceShape(row) };
    },
    { auth: 'admin' },
  );

  router.add(
    'DELETE',
    '/api/admin/resources/:id',
    (ctx) => {
      const pid = ctx.user.practice_id;
      const r = ctx.db.prepare('SELECT * FROM resources WHERE id = ? AND practice_id = ?').get(intId(ctx.params.id), pid);
      if (!r) fail(404, 'That resource was not found.');
      ctx.db.prepare('DELETE FROM resources WHERE id = ? AND practice_id = ?').run(r.id, pid);
      if (!r.stored_name.startsWith(LIB)) {
        fs.rmSync(filePath(ctx.app.dataDir, pid, r.stored_name), { force: true });
        if (r.preview_name) fs.rmSync(filePath(ctx.app.dataDir, pid, r.preview_name), { force: true });
      }
      return { ok: true };
    },
    { auth: 'admin' },
  );
}
