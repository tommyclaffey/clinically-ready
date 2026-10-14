// Uploaded lesson videos (the other options are a YouTube, Vimeo or Loom link).
// Upload: PUT the raw file with ?filename= and a Content-Length. Lessons then use "/api/videos/<id>".
import { notInDemo } from './demo.mjs';
import path from 'node:path';
import { randomBytes } from 'node:crypto';
import { now } from '../db.mjs';
import { fail, intId } from '../http.mjs';
import * as v from '../validate.mjs';
import { VIDEO_LIMIT, VIDEO_TYPES, deleteVideo, saveVideo, serveVideo } from '../videostore.mjs';

export default function register(router) {
  router.add('POST', '/api/admin/videos', async (ctx) => {
    notInDemo(ctx);
    const filename = ctx.query.get('filename') || '';
    const ext = path.extname(filename).slice(1).toLowerCase();
    if (!VIDEO_TYPES[ext]) fail(400, 'Upload an MP4, MOV, M4V or WebM video.');
    const size = Number(ctx.req.headers['content-length']);
    if (!Number.isFinite(size) || size <= 0) fail(411, 'The upload needs a file size.');
    if (size > VIDEO_LIMIT) {
      ctx.req.tooLarge = true;
      fail(413, 'That video is too large. The limit is 1 GB.');
    }
    const title = v.text(ctx.query.get('title') || path.basename(filename, path.extname(filename)), 'Title', { max: 160 });
    const key = `${randomBytes(16).toString('hex')}.${ext}`;
    await saveVideo({ app: ctx.app, req: ctx.req, practiceId: ctx.user.practice_id, key, ext, size });
    const id = Number(
      ctx.db
        .prepare('INSERT INTO videos(practice_id, stored_key, ext, size_bytes, title, created_at) VALUES (?,?,?,?,?,?)')
        .run(ctx.user.practice_id, key, ext, size, title, now()).lastInsertRowid,
    );
    return { ok: true, id, url: `/api/videos/${id}` };
  }, { auth: 'admin' });

  router.add('GET', '/api/videos/:id', (ctx) => {
    const row = ctx.db.prepare('SELECT * FROM videos WHERE id = ? AND practice_id = ?').get(intId(ctx.params.id), ctx.user.practice_id);
    if (!row) fail(404, 'That video was not found.');
    serveVideo({ app: ctx.app, req: ctx.req, res: ctx.res, practiceId: row.practice_id, key: row.stored_key, ext: row.ext });
  }, { auth: 'user' });

  router.add('DELETE', '/api/admin/videos/:id', async (ctx) => {
    const row = ctx.db.prepare('SELECT * FROM videos WHERE id = ? AND practice_id = ?').get(intId(ctx.params.id), ctx.user.practice_id);
    if (!row) fail(404, 'That video was not found.');
    const url = `/api/videos/${row.id}`;
    ctx.db.prepare("UPDATE lessons SET video_url = '' WHERE practice_id = ? AND video_url = ?").run(ctx.user.practice_id, url);
    ctx.db.prepare('DELETE FROM videos WHERE id = ? AND practice_id = ?').run(row.id, ctx.user.practice_id);
    await deleteVideo(ctx.app, row.practice_id, row.stored_key);
    return { ok: true };
  }, { auth: 'admin' });
}
