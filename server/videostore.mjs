// Uploaded lesson videos. Production: the S3 bucket (durable, kept out of the volume and the nightly
// backup tarball), played through short-lived signed links. Local/tests without a bucket: data/videos.
import fs from 'node:fs';
import path from 'node:path';
import { Transform } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { HttpError } from './http.mjs';

export const VIDEO_LIMIT = 1024 * 1024 * 1024; // 1 GB
export const VIDEO_TYPES = { mp4: 'video/mp4', m4v: 'video/mp4', mov: 'video/quicktime', webm: 'video/webm' };

/** Counts bytes and refuses anything over the limit while streaming. */
function limiter(limit, req) {
  let size = 0;
  return new Transform({
    transform(chunk, _enc, cb) {
      size += chunk.length;
      if (size > limit) {
        req.tooLarge = true;
        cb(new HttpError(413, `That video is too large. The limit is ${limit / 1024 / 1024 / 1024} GB.`));
      } else cb(null, chunk);
    },
  });
}

export async function saveVideo({ app, req, practiceId, key, ext, size }) {
  if (app.s3) {
    await app.s3.putStream(`videos/${practiceId}/${key}`, req, size, VIDEO_TYPES[ext]);
    return;
  }
  const dir = path.join(app.dataDir, 'videos', String(practiceId));
  fs.mkdirSync(dir, { recursive: true });
  const file = path.join(dir, path.basename(key));
  try {
    await pipeline(req, limiter(VIDEO_LIMIT, req), fs.createWriteStream(file));
  } catch (err) {
    fs.rmSync(file, { force: true });
    throw err;
  }
}

export function deleteVideo(app, practiceId, key) {
  if (app.s3) return app.s3.del(`videos/${practiceId}/${key}`).catch(() => {});
  fs.rmSync(path.join(app.dataDir, 'videos', String(practiceId), path.basename(key)), { force: true });
}

/** Play a video: redirect to a signed bucket link, or stream from disk honouring Range (so seeking works). */
export function serveVideo({ app, req, res, practiceId, key, ext }) {
  if (app.s3) {
    res.writeHead(302, { Location: app.s3.presignGet(`videos/${practiceId}/${key}`, { expires: 3600 }), 'Cache-Control': 'private, no-store' });
    return res.end();
  }
  const file = path.join(app.dataDir, 'videos', String(practiceId), path.basename(key));
  let stat;
  try {
    stat = fs.statSync(file);
  } catch {
    throw new HttpError(404, 'That video file is missing.');
  }
  const type = VIDEO_TYPES[ext] || 'application/octet-stream';
  const range = /^bytes=(\d*)-(\d*)$/.exec(req.headers.range || '');
  if (range && (range[1] || range[2])) {
    let start = range[1] ? Number(range[1]) : stat.size - Number(range[2]);
    let end = range[1] && range[2] ? Number(range[2]) : stat.size - 1;
    start = Math.max(0, start);
    end = Math.min(end, stat.size - 1);
    if (start > end) {
      res.writeHead(416, { 'Content-Range': `bytes */${stat.size}` });
      return res.end();
    }
    res.writeHead(206, {
      'Content-Type': type, 'Accept-Ranges': 'bytes', 'Content-Length': end - start + 1,
      'Content-Range': `bytes ${start}-${end}/${stat.size}`, 'Cache-Control': 'private, no-store',
    });
    return fs.createReadStream(file, { start, end }).pipe(res);
  }
  res.writeHead(200, { 'Content-Type': type, 'Accept-Ranges': 'bytes', 'Content-Length': stat.size, 'Cache-Control': 'private, no-store' });
  fs.createReadStream(file).pipe(res);
}
