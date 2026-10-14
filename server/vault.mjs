// Encryption at rest for sensitive uploads (W-4, W-9 and other employment forms).
// AES-256-GCM, one random IV per file. Stored layout: [12-byte IV][16-byte auth tag][ciphertext].
// Key: PAPERWORK_KEY (32 random bytes, base64). Without it in production, tax/employment forms stay off.
import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'node:crypto';

export function paperworkKeyFromEnv(env = process.env, { production = false } = {}) {
  const raw = env.PAPERWORK_KEY;
  if (raw) {
    const key = Buffer.from(raw, 'base64');
    if (key.length !== 32) throw new Error('PAPERWORK_KEY must be 32 bytes, base64-encoded.');
    return key;
  }
  // Local dev and tests: a fixed throwaway key. Never used in production.
  return production ? null : createHash('sha256').update('coa-dev-paperwork-key').digest();
}

export function seal(key, bytes) {
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', key, iv);
  const body = Buffer.concat([cipher.update(bytes), cipher.final()]);
  return Buffer.concat([iv, cipher.getAuthTag(), body]);
}

export function open(key, sealed) {
  const iv = sealed.subarray(0, 12);
  const tag = sealed.subarray(12, 28);
  const decipher = createDecipheriv('aes-256-gcm', key, iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(sealed.subarray(28)), decipher.final()]);
}
