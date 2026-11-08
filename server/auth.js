// Password hashing (scrypt) and signed session tokens (HMAC-SHA256), all from node:crypto.

import { scryptSync, randomBytes, timingSafeEqual, createHmac } from 'node:crypto';
import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname } from 'node:path';

/* ---------- passwords ---------- */

export function hashPassword(password) {
  const salt = randomBytes(16);
  const hash = scryptSync(password, salt, 64);
  return `${salt.toString('hex')}:${hash.toString('hex')}`;
}

export function verifyPassword(password, stored) {
  const [saltHex, hashHex] = stored.split(':');
  const expected = Buffer.from(hashHex, 'hex');
  const actual = scryptSync(password, Buffer.from(saltHex, 'hex'), expected.length);
  return timingSafeEqual(actual, expected);
}

/* ---------- tokens ---------- */

const TOKEN_TTL_MS = 30 * 24 * 3600e3;
const b64 = (buf) => Buffer.from(buf).toString('base64url');

// The secret comes from the environment, or is generated once and kept next to the database.
export function loadSecret({ envSecret, file }) {
  if (envSecret) return envSecret;
  if (existsSync(file)) return readFileSync(file, 'utf8').trim();
  const secret = randomBytes(32).toString('hex');
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file, secret, { mode: 0o600 });
  return secret;
}

export function signToken(userId, secret, now = Date.now()) {
  const payload = b64(JSON.stringify({ sub: userId, exp: now + TOKEN_TTL_MS }));
  const sig = createHmac('sha256', secret).update(payload).digest('base64url');
  return `${payload}.${sig}`;
}

// Returns the user id, or null when the token is missing, forged or expired.
export function verifyToken(token, secret, now = Date.now()) {
  if (typeof token !== 'string') return null;
  const [payload, sig] = token.split('.');
  if (!payload || !sig) return null;
  const expected = createHmac('sha256', secret).update(payload).digest('base64url');
  const a = Buffer.from(sig);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;
  try {
    const { sub, exp } = JSON.parse(Buffer.from(payload, 'base64url').toString());
    return exp > now ? sub : null;
  } catch {
    return null;
  }
}
