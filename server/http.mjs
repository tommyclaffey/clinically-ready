// Tiny HTTP toolkit: router, JSON helpers, cookies and size-limited body reading.
// Zero dependencies on purpose (see SPEC §1).

export const JSON_LIMIT = 1024 * 1024; // 1 MB
export const UPLOAD_LIMIT = 25 * 1024 * 1024; // 25 MB

export class HttpError extends Error {
  constructor(status, message, data = null) {
    super(message);
    this.status = status;
    this.data = data; // extra JSON fields for the client (e.g. which quiz unlocks a section)
  }
}

/** Throw a JSON error: `{ error: message }` with the given status. */
export function fail(status, message, data = null) {
  throw new HttpError(status, message, data);
}

export function sendJson(res, status, body, headers = {}) {
  const data = JSON.stringify(body);
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Content-Length': Buffer.byteLength(data),
    'Cache-Control': 'no-store',
    ...headers,
  });
  res.end(data);
}

export function parseCookies(header = '') {
  const out = {};
  for (const part of header.split(';')) {
    const i = part.indexOf('=');
    if (i < 1) continue;
    const key = part.slice(0, i).trim();
    try {
      out[key] = decodeURIComponent(part.slice(i + 1).trim());
    } catch {
      // A malformed cookie is ignored rather than failing the request.
    }
  }
  return out;
}

/**
 * Read the raw body, refusing anything over `limit` bytes with a 413.
 * Oversized bodies up to 2x the limit are drained first so the client actually receives the 413
 * (replying mid-upload makes browsers and fetch report a network error instead). Past that we hang up.
 */
export function readBody(req, limit) {
  const drainCap = limit * 2;
  const tooLarge = () => new HttpError(413, 'That is too large. The limit is ' + (limit >= 1024 * 1024 ? `${limit / 1024 / 1024} MB.` : `${limit} bytes.`));
  const declared = Number(req.headers['content-length'] || 0);
  if (declared > drainCap) {
    req.tooLarge = true;
    return Promise.reject(tooLarge());
  }
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    let settled = false;
    const settle = (fn, value) => {
      if (settled) return;
      settled = true;
      fn(value);
    };
    req.on('data', (chunk) => {
      size += chunk.length;
      if (size > drainCap) {
        req.tooLarge = true;
        settle(reject, tooLarge());
        req.pause();
      } else if (size <= limit) {
        chunks.push(chunk);
      }
    });
    req.on('end', () => settle(...(size > limit ? [reject, tooLarge()] : [resolve, Buffer.concat(chunks)])));
    req.on('error', (err) => settle(reject, err));
  });
}

/** Parse a JSON body (max 1 MB). An empty body is `{}`. Objects or arrays only. */
export async function readJson(req) {
  const buf = await readBody(req, JSON_LIMIT);
  if (buf.length === 0) return {};
  let body;
  try {
    body = JSON.parse(buf.toString('utf8'));
  } catch {
    fail(400, 'The request body is not valid JSON.');
  }
  if (!body || typeof body !== 'object') fail(400, 'The request body must be a JSON object.');
  return body;
}

/** Path params arrive as strings; ids must be positive integers or it's a 404. */
export function intId(value) {
  if (!/^\d{1,15}$/.test(String(value ?? ''))) fail(404, 'Not found.');
  const n = Number(value);
  if (n < 1) fail(404, 'Not found.');
  return n;
}

export class Router {
  constructor() {
    this.routes = [];
  }

  /** `opts.auth`: 'user' | 'admin' | 'owner' | undefined (public). */
  add(method, path, handler, opts = {}) {
    const keys = [];
    const pattern = path.replace(/:(\w+)/g, (_, key) => {
      keys.push(key);
      return '([^/]+)';
    });
    this.routes.push({ method, regex: new RegExp(`^${pattern}/?$`), keys, handler, opts });
  }

  match(method, pathname) {
    for (const route of this.routes) {
      if (route.method !== method) continue;
      const m = route.regex.exec(pathname);
      if (!m) continue;
      const params = {};
      route.keys.forEach((key, i) => {
        try {
          params[key] = decodeURIComponent(m[i + 1]);
        } catch {
          params[key] = m[i + 1];
        }
      });
      return { route, params };
    }
    return null;
  }
}

/** Discard an unread request body (up to `cap` bytes) so an early error reply reaches the client. */
export function drain(req, cap = 2 * UPLOAD_LIMIT) {
  if (req.complete || req.readableEnded) return Promise.resolve();
  return new Promise((resolve) => {
    let size = 0;
    req.on('data', (chunk) => {
      size += chunk.length;
      if (size > cap) {
        req.tooLarge = true;
        resolve();
      }
    });
    req.on('end', resolve);
    req.on('error', resolve);
    req.resume();
  });
}
