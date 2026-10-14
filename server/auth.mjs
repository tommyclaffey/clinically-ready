// Passwords (scrypt), sessions and invite tokens (hash-only storage), login rate limiting.
import { createHash, randomBytes, scrypt, timingSafeEqual } from 'node:crypto';
import { now } from './db.mjs';

const N = 16384;
const R = 8;
const P = 1;
const KEYLEN = 64;
export const MIN_PASSWORD = 10;
export const SESSION_COOKIE = 'coa_session';
export const SESSION_DAYS = 14;
export const INVITE_DAYS = 7;

function scryptAsync(password, salt, n, r, p) {
  return new Promise((resolve, reject) => {
    scrypt(password, salt, KEYLEN, { N: n, r, p, maxmem: 256 * n * r }, (err, key) =>
      err ? reject(err) : resolve(key),
    );
  });
}

/** Returns `scrypt$N$r$p$salt$hash` (base64 salt and hash). */
export async function hashPassword(password) {
  const salt = randomBytes(16);
  const key = await scryptAsync(String(password), salt, N, R, P);
  return ['scrypt', N, R, P, salt.toString('base64'), key.toString('base64')].join('$');
}

export async function verifyPassword(password, stored) {
  const parts = String(stored || '').split('$');
  if (parts.length !== 6 || parts[0] !== 'scrypt') return false;
  const [, n, r, p, salt, hash] = parts;
  const expected = Buffer.from(hash, 'base64');
  const key = await scryptAsync(String(password), Buffer.from(salt, 'base64'), +n, +r, +p);
  return key.length === expected.length && timingSafeEqual(key, expected);
}

// Unknown emails still pay the scrypt cost so response timing doesn't reveal which emails exist.
let dummyHash;
export async function burnPasswordCheck(password) {
  dummyHash ??= await hashPassword('not-a-real-password');
  await verifyPassword(password, dummyHash);
}

export const sha256 = (value) => createHash('sha256').update(String(value)).digest('hex');
export const newToken = () => randomBytes(32).toString('base64url');
export const daysFromNow = (days) => new Date(Date.now() + days * 864e5).toISOString();

/** Creates a session and returns the raw token (only its hash is stored). */
export function createSession(db, userId, { hours = SESSION_DAYS * 24 } = {}) {
  const token = newToken();
  db.prepare('INSERT INTO sessions(token_hash, user_id, created_at, expires_at) VALUES (?,?,?,?)').run(
    sha256(token),
    userId,
    now(),
    new Date(Date.now() + hours * 3600_000).toISOString(),
  );
  return token;
}

/** Google/Microsoft sessions are short: when the office turns off someone's work account, access ends within hours. */
export const SSO_SESSION_HOURS = 12;
/** Password sessions (no work account to check against) last a week. */
export const PASSWORD_SESSION_HOURS = 7 * 24;

/** Signed-in active user for a raw session token, or null. */
export function sessionUser(db, token) {
  if (!token) return null;
  const user = db
    .prepare(
      `SELECT u.* FROM sessions s JOIN users u ON u.id = s.user_id
       WHERE s.token_hash = ? AND s.expires_at > ? AND u.active = 1`,
    )
    .get(sha256(token), now());
  return user || null;
}

export function sessionCookie(token, { secure, hours = SESSION_DAYS * 24 }) {
  const parts = [`${SESSION_COOKIE}=${token}`, 'HttpOnly', 'SameSite=Lax', 'Path=/', `Max-Age=${Math.round(hours * 3600)}`];
  if (secure) parts.push('Secure');
  return parts.join('; ');
}

export function clearCookie({ secure }) {
  return `${SESSION_COOKIE}=; HttpOnly; SameSite=Lax; Path=/; Max-Age=0${secure ? '; Secure' : ''}`;
}

/** Counts login failures per key (email + IP) in a sliding window. In-memory, per server. */
export class LoginLimiter {
  constructor({ max = 8, windowMs = 15 * 60 * 1000 } = {}) {
    this.max = max;
    this.windowMs = windowMs;
    this.failures = new Map();
  }

  recent(key) {
    const cutoff = Date.now() - this.windowMs;
    const list = (this.failures.get(key) || []).filter((t) => t > cutoff);
    if (list.length) this.failures.set(key, list);
    else this.failures.delete(key);
    return list;
  }

  blocked(key) {
    return this.recent(key).length >= this.max;
  }

  fail(key) {
    this.failures.set(key, [...this.recent(key), Date.now()]);
  }

  reset(key) {
    this.failures.delete(key);
  }
}
