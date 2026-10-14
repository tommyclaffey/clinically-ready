// Production static server for dist/: files inside dist only, SPA fallback to index.html.
import fs from 'node:fs';
import path from 'node:path';

const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
  '.txt': 'text/plain; charset=utf-8',
  '.webmanifest': 'application/manifest+json',
  '.mp4': 'video/mp4',
  '.webm': 'video/webm',
};

function sendFile(req, res, file, cache) {
  const stat = fs.statSync(file);
  const type = TYPES[path.extname(file).toLowerCase()] || 'application/octet-stream';
  // Byte ranges, so video seeks and plays in Safari (it won't play an mp4 without them).
  const m = /^bytes=(\d*)-(\d*)$/.exec(req.headers.range || '');
  if (m && (m[1] || m[2])) {
    let start = m[1] ? Number(m[1]) : stat.size - Number(m[2]);
    let end = m[1] && m[2] ? Number(m[2]) : stat.size - 1;
    start = Math.max(0, start);
    end = Math.min(end, stat.size - 1);
    if (start > end) {
      res.writeHead(416, { 'Content-Range': `bytes */${stat.size}` });
      return res.end();
    }
    res.writeHead(206, { 'Content-Type': type, 'Content-Length': end - start + 1, 'Content-Range': `bytes ${start}-${end}/${stat.size}`, 'Accept-Ranges': 'bytes', 'Cache-Control': cache });
    if (req.method === 'HEAD') return res.end();
    return fs.createReadStream(file, { start, end }).pipe(res);
  }
  res.writeHead(200, { 'Content-Type': type, 'Content-Length': stat.size, 'Accept-Ranges': 'bytes', 'Cache-Control': cache });
  if (req.method === 'HEAD') return res.end();
  fs.createReadStream(file).pipe(res);
}

/** Returns true if it handled the request. */
export function serveStatic(req, res, pathname, distDir, { indexHtml } = {}) {
  if (req.method !== 'GET' && req.method !== 'HEAD') return false;
  const root = path.resolve(distDir);
  let rel;
  try {
    rel = decodeURIComponent(pathname);
  } catch {
    return false;
  }
  const file = path.resolve(root, `.${path.posix.normalize(rel)}`);
  // Never serve anything outside dist/ (path traversal) or dotfiles.
  const inside = file === root || file.startsWith(root + path.sep);
  if (inside && !rel.split('/').some((p) => p.startsWith('.')) && fs.existsSync(file) && fs.statSync(file).isFile()) {
    const hashed = rel.startsWith('/assets/');
    sendFile(req, res, file, hashed ? 'public, max-age=31536000, immutable' : 'no-cache');
    return true;
  }
  const index = path.join(root, 'index.html');
  if (!fs.existsSync(index)) return false;
  if (indexHtml) {
    // Pages: index.html with per-request tags (link previews). Never let a failure here break the page.
    let body;
    try {
      body = Buffer.from(indexHtml(fs.readFileSync(index, 'utf8')));
    } catch (err) {
      console.error('index render failed:', err);
      return sendFile(req, res, index, 'no-cache'), true;
    }
    res.writeHead(200, { 'Content-Type': TYPES['.html'], 'Content-Length': body.length, 'Cache-Control': 'no-cache' });
    if (req.method === 'HEAD') return res.end(), true;
    res.end(body);
    return true;
  }
  sendFile(req, res, index, 'no-cache');
  return true;
}
