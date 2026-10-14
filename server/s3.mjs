// Minimal S3 client (PUT / GET / DELETE / LIST) with AWS Signature V4, no dependencies.
// Works with Railway buckets and any S3-compatible store. Virtual-host style URLs.
import { createHash, createHmac } from 'node:crypto';

const sha256 = (data) => createHash('sha256').update(data).digest('hex');
const hmac = (key, data) => createHmac('sha256', key).update(data).digest();

export class S3 {
  constructor({ endpoint, bucket, region = 'auto', key, secret, pathStyle = false, fetchImpl = fetch }) {
    if (!endpoint || !bucket || !key || !secret) throw new Error('S3: endpoint, bucket, key and secret are required.');
    const u = new URL(endpoint);
    // Virtual-host style (bucket.host/key) is what Railway uses; path style (host/bucket/key) is for local tests.
    this.pathStyle = pathStyle;
    this.bucket = bucket;
    this.host = pathStyle ? u.host : `${bucket}.${u.host}`;
    this.base = `${u.protocol}//${this.host}`;
    this.region = region;
    this.key = key;
    this.secret = secret;
    this.fetch = fetchImpl;
  }

  /** Signs and sends one request. `objectKey` may be '' for bucket-level calls (LIST). */
  async request(method, objectKey, { body = null, query = {}, headers = {}, unsigned = false } = {}) {
    const now = new Date();
    const amzDate = now.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
    const date = amzDate.slice(0, 8);
    // Streamed bodies can't be hashed up front: S3 accepts UNSIGNED-PAYLOAD over HTTPS.
    const payloadHash = unsigned ? 'UNSIGNED-PAYLOAD' : sha256(body ?? '');
    const keyPath = objectKey.split('/').map(encodeURIComponent).join('/');
    const path = this.pathStyle ? `/${encodeURIComponent(this.bucket)}/${keyPath}` : `/${keyPath}`;
    const qs = Object.keys(query)
      .sort()
      .map((k) => `${encodeURIComponent(k)}=${encodeURIComponent(query[k])}`)
      .join('&');
    const all = {};
    for (const [k, val] of Object.entries({ ...headers, host: this.host, 'x-amz-content-sha256': payloadHash, 'x-amz-date': amzDate })) all[k.toLowerCase()] = String(val).trim();
    const signedNames = Object.keys(all).sort();
    const canonicalHeaders = signedNames.map((h) => `${h}:${all[h]}\n`).join('');
    const canonical = [method, path, qs, canonicalHeaders, signedNames.join(';'), payloadHash].join('\n');
    const scope = `${date}/${this.region}/s3/aws4_request`;
    const toSign = ['AWS4-HMAC-SHA256', amzDate, scope, sha256(canonical)].join('\n');
    const kDate = hmac(`AWS4${this.secret}`, date);
    const kRegion = hmac(kDate, this.region);
    const kService = hmac(kRegion, 's3');
    const kSigning = hmac(kService, 'aws4_request');
    const signature = createHmac('sha256', kSigning).update(toSign).digest('hex');
    const authorization = `AWS4-HMAC-SHA256 Credential=${this.key}/${scope}, SignedHeaders=${signedNames.join(';')}, Signature=${signature}`;
    const res = await this.fetch(`${this.base}${path}${qs ? `?${qs}` : ''}`, {
      method,
      headers: { ...all, Authorization: authorization },
      body,
      ...(unsigned ? { duplex: 'half' } : {}),
      signal: AbortSignal.timeout(unsigned ? 30 * 60_000 : 120_000),
    });
    if (!res.ok && !(method === 'GET' && res.status === 404)) {
      throw new Error(`S3 ${method} ${objectKey || '/'} -> ${res.status} ${(await res.text().catch(() => '')).slice(0, 200)}`);
    }
    return res;
  }

  put(key, body, contentType = 'application/octet-stream') {
    return this.request('PUT', key, { body, headers: { 'content-type': contentType, 'content-length': String(body.length) } });
  }

  /** Buffer, or null when the key doesn't exist. */
  async get(key) {
    const res = await this.request('GET', key);
    return res.status === 404 ? null : Buffer.from(await res.arrayBuffer());
  }

  /** Stream a body of known size (e.g. an upload) straight to the bucket. */
  putStream(key, stream, size, contentType = 'application/octet-stream') {
    return this.request('PUT', key, { body: stream, unsigned: true, headers: { 'content-type': contentType, 'content-length': String(size) } });
  }

  /** A time-limited GET link the browser can use directly (video playback with seeking). */
  presignGet(key, { expires = 3600, now = new Date() } = {}) {
    const amzDate = now.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
    const date = amzDate.slice(0, 8);
    const keyPath = key.split('/').map(encodeURIComponent).join('/');
    const path = this.pathStyle ? `/${encodeURIComponent(this.bucket)}/${keyPath}` : `/${keyPath}`;
    const scope = `${date}/${this.region}/s3/aws4_request`;
    const query = {
      'X-Amz-Algorithm': 'AWS4-HMAC-SHA256',
      'X-Amz-Credential': `${this.key}/${scope}`,
      'X-Amz-Date': amzDate,
      'X-Amz-Expires': String(expires),
      'X-Amz-SignedHeaders': 'host',
    };
    const qs = Object.keys(query).sort().map((k) => `${encodeURIComponent(k)}=${encodeURIComponent(query[k])}`).join('&');
    const canonical = ['GET', path, qs, `host:${this.host}\n`, 'host', 'UNSIGNED-PAYLOAD'].join('\n');
    const toSign = ['AWS4-HMAC-SHA256', amzDate, scope, sha256(canonical)].join('\n');
    const kSigning = hmac(hmac(hmac(hmac(`AWS4${this.secret}`, date), this.region), 's3'), 'aws4_request');
    const signature = createHmac('sha256', kSigning).update(toSign).digest('hex');
    return `${this.base}${path}?${qs}&X-Amz-Signature=${signature}`;
  }

  del(key) {
    return this.request('DELETE', key);
  }

  /** All keys under a prefix (follows continuation tokens). */
  async list(prefix) {
    const keys = [];
    let token = null;
    do {
      const query = { 'list-type': '2', prefix, ...(token ? { 'continuation-token': token } : {}) };
      const xml = await (await this.request('GET', '', { query })).text();
      for (const m of xml.matchAll(/<Key>([^<]+)<\/Key>/g)) keys.push(decodeXml(m[1]));
      token = /<NextContinuationToken>([^<]+)<\/NextContinuationToken>/.exec(xml)?.[1] ?? null;
    } while (token);
    return keys;
  }
}

const decodeXml = (s) => s.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&amp;/g, '&');

/** Build an S3 client from the BACKUP_S3_* variables, or null when they're not set. */
export function s3FromEnv(env = process.env) {
  const { BACKUP_S3_ENDPOINT: endpoint, BACKUP_S3_BUCKET: bucket, BACKUP_S3_KEY: key, BACKUP_S3_SECRET: secret } = env;
  if (!endpoint || !bucket || !key || !secret) return null;
  return new S3({ endpoint, bucket, region: env.BACKUP_S3_REGION || 'auto', key, secret, pathStyle: env.BACKUP_S3_PATH_STYLE === '1' });
}
