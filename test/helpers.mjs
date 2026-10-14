// Test helpers: a fresh server on a temp dataDir (optionally seeded) and a cookie-keeping client.
// (node --test also loads this file; it defines no tests, so it's a no-op there.)
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { startServer } from '../server/index.mjs';
import { SEED_PASSWORD, seed } from '../server/seed.mjs';

export const PASSWORD = SEED_PASSWORD;
export const ANGELA = 'angela@thewell.test';
export const OFFICE = 'office@thewell.test';
export const JORDAN = 'jordan@thewell.test';

/** Every response body seen by any client, so tests can assert nothing secret ever leaked. */
export const seenBodies = [];

export class Client {
  constructor(base) {
    this.base = base;
    this.cookie = '';
  }

  async req(method, url, body, { headers = {}, coa = true, raw = false } = {}) {
    const h = { ...headers };
    if (coa && method !== 'GET') h['X-COA'] = '1';
    if (this.cookie) h.Cookie = this.cookie;
    let payload = body;
    if (body !== undefined && !raw) {
      h['Content-Type'] = 'application/json';
      payload = JSON.stringify(body);
    }
    const res = await fetch(this.base + url, { method, headers: h, body: payload });
    const setCookie = res.headers.get('set-cookie');
    if (setCookie) {
      const m = /coa_session=([^;]*)/.exec(setCookie);
      this.cookie = m && m[1] ? `coa_session=${m[1]}` : '';
    }
    const type = res.headers.get('content-type') || '';
    let data;
    if (type.includes('application/json')) {
      const text = await res.text();
      seenBodies.push(text);
      data = JSON.parse(text);
    } else {
      data = Buffer.from(await res.arrayBuffer());
    }
    return { status: res.status, body: data, headers: res.headers };
  }

  get(url, opts) {
    return this.req('GET', url, undefined, opts);
  }
  post(url, body = {}, opts) {
    return this.req('POST', url, body, opts);
  }
  put(url, body = {}, opts) {
    return this.req('PUT', url, body, opts);
  }
  del(url, opts) {
    return this.req('DELETE', url, undefined, opts);
  }

  async login(email, password = PASSWORD) {
    const r = await this.post('/api/auth/login', { email, password });
    if (r.status !== 200) throw new Error(`login ${email} failed: ${r.status} ${JSON.stringify(r.body)}`);
    return r;
  }
}

/** Starts a server on port 0 with a temp dataDir. Call `t.close()` in an after() hook. */
export async function setup({ seeded = true } = {}) {
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'coa-test-'));
  if (seeded) await seed(dataDir);
  const srv = await startServer({ port: 0, dataDir });
  const base = `http://127.0.0.1:${srv.port}`;
  return {
    ...srv,
    base,
    dataDir,
    db: srv.app.db,
    client: () => new Client(base),
    async as(email) {
      const c = new Client(base);
      await c.login(email);
      return c;
    },
    async close() {
      await srv.close();
      fs.rmSync(dataDir, { recursive: true, force: true });
    },
  };
}

/** Lesson id by title in the seeded practice. */
export const lessonId = (db, title) => db.prepare('SELECT id FROM lessons WHERE title = ?').get(title).id;
