// Sign in with Google / Microsoft (OpenID Connect, authorization-code flow + PKCE). No dependencies:
// the ID token's RS256 signature is checked against the provider's published keys with node:crypto.
import { createHash, createPublicKey, randomBytes, verify } from 'node:crypto';

const MS = 'https://login.microsoftonline.com';

/** Real endpoints. Tests pass their own (a local fake provider) through startServer({ oidc }). */
const ENDPOINTS = {
  google: {
    label: 'Google',
    authorize: 'https://accounts.google.com/o/oauth2/v2/auth',
    token: 'https://oauth2.googleapis.com/token',
    jwks: 'https://www.googleapis.com/oauth2/v3/certs',
    issuerOk: (iss) => iss === 'https://accounts.google.com' || iss === 'accounts.google.com',
  },
  microsoft: {
    label: 'Microsoft',
    // "common" = work/school accounts from any organisation, plus personal Microsoft accounts.
    authorize: `${MS}/common/oauth2/v2.0/authorize`,
    token: `${MS}/common/oauth2/v2.0/token`,
    jwks: `${MS}/common/discovery/v2.0/keys`,
    issuerOk: (iss, claims) => typeof claims.tid === 'string' && iss === `${MS}/${claims.tid}/v2.0`,
  },
};

export const PROVIDERS = Object.keys(ENDPOINTS);

/** Providers with credentials, from env (or overrides in tests). */
export function loadProviders(env = process.env, overrides = null) {
  if (overrides) return overrides;
  const out = {};
  const creds = {
    google: [env.GOOGLE_CLIENT_ID, env.GOOGLE_CLIENT_SECRET],
    microsoft: [env.MICROSOFT_CLIENT_ID, env.MICROSOFT_CLIENT_SECRET],
  };
  for (const [name, [clientId, clientSecret]] of Object.entries(creds)) {
    if (clientId && clientSecret) out[name] = { ...ENDPOINTS[name], clientId, clientSecret };
  }
  return out;
}

export const b64url = (buf) => Buffer.from(buf).toString('base64url');
export const newVerifier = () => b64url(randomBytes(32));
export const challengeFor = (verifier) => b64url(createHash('sha256').update(verifier).digest());

export function authorizeUrl(p, { redirectUri, state, nonce, verifier }) {
  const u = new URL(p.authorize);
  u.search = new URLSearchParams({
    client_id: p.clientId,
    response_type: 'code',
    scope: 'openid email profile',
    redirect_uri: redirectUri,
    state,
    nonce,
    code_challenge: challengeFor(verifier),
    code_challenge_method: 'S256',
    prompt: 'select_account',
  }).toString();
  return u.toString();
}

/** Trades the one-time code for an ID token. */
export async function exchangeCode(p, { code, redirectUri, verifier }) {
  const res = await fetch(p.token, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded', Accept: 'application/json' },
    body: new URLSearchParams({
      grant_type: 'authorization_code',
      code,
      redirect_uri: redirectUri,
      client_id: p.clientId,
      client_secret: p.clientSecret,
      code_verifier: verifier,
    }),
    signal: AbortSignal.timeout(10_000),
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok || typeof body.id_token !== 'string') throw new OidcError('token');
  return body.id_token;
}

export class OidcError extends Error {
  constructor(code) {
    super(code);
    this.code = code;
  }
}

// Provider signing keys, cached for an hour; a key id we haven't seen triggers one refetch (key rotation).
const keyCache = new Map(); // jwksUrl -> { at, keys }
async function signingKey(jwksUrl, kid, { refresh = false } = {}) {
  let entry = keyCache.get(jwksUrl);
  if (refresh || !entry || Date.now() - entry.at > 3600_000) {
    const res = await fetch(jwksUrl, { signal: AbortSignal.timeout(10_000) });
    if (!res.ok) throw new OidcError('keys');
    entry = { at: Date.now(), keys: (await res.json()).keys || [] };
    keyCache.set(jwksUrl, entry);
  }
  const jwk = entry.keys.find((k) => k.kid === kid && k.kty === 'RSA');
  if (jwk) return jwk;
  if (!refresh) return signingKey(jwksUrl, kid, { refresh: true });
  throw new OidcError('keys');
}

const part = (s) => JSON.parse(Buffer.from(s, 'base64url').toString('utf8'));

/** Verifies signature, issuer, audience, expiry and nonce. Returns the claims. */
export async function verifyIdToken(p, idToken, { nonce, nowMs = Date.now() }) {
  const pieces = String(idToken).split('.');
  if (pieces.length !== 3) throw new OidcError('token');
  let header, claims;
  try {
    header = part(pieces[0]);
    claims = part(pieces[1]);
  } catch {
    throw new OidcError('token');
  }
  if (header.alg !== 'RS256' || !header.kid) throw new OidcError('token');
  const jwk = await signingKey(p.jwks, header.kid);
  const ok = verify(
    'RSA-SHA256',
    Buffer.from(`${pieces[0]}.${pieces[1]}`),
    createPublicKey({ key: jwk, format: 'jwk' }),
    Buffer.from(pieces[2], 'base64url'),
  );
  if (!ok) throw new OidcError('signature');
  const aud = Array.isArray(claims.aud) ? claims.aud : [claims.aud];
  const nowSec = Math.floor(nowMs / 1000);
  if (!aud.includes(p.clientId)) throw new OidcError('audience');
  if (!p.issuerOk(claims.iss, claims)) throw new OidcError('issuer');
  if (typeof claims.exp !== 'number' || claims.exp < nowSec - 60) throw new OidcError('expired');
  if (typeof claims.iat === 'number' && claims.iat > nowSec + 300) throw new OidcError('token');
  if (!nonce || claims.nonce !== nonce) throw new OidcError('nonce');
  if (typeof claims.sub !== 'string' || !claims.sub) throw new OidcError('token');
  return claims;
}

/**
 * The account's email and whether we may trust it to find an existing user.
 * Google: only verified emails. Microsoft: the email claim can be set by any tenant admin
 * (the "nOAuth" problem), so a Microsoft email is never trusted on its own — it only works
 * together with an invite link, or through an identity already linked to the user.
 */
export function emailOf(provider, claims) {
  if (provider === 'google') {
    const email = typeof claims.email === 'string' ? claims.email.toLowerCase() : '';
    return { email, trusted: Boolean(email) && claims.email_verified === true };
  }
  const raw = claims.email || claims.preferred_username || '';
  return { email: String(raw).toLowerCase(), trusted: false };
}
