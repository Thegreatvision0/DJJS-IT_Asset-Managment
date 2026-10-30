/* Password hashing (scrypt), signed login tokens (HS256 JWT) and small security helpers — Node built-ins only */
import crypto from 'node:crypto';
import { config } from './config.js';

const N = 16384, KEYLEN = 64;
export function hashPassword(pw) {
  const salt = crypto.randomBytes(16).toString('hex');
  const h = crypto.scryptSync(String(pw), salt, KEYLEN, { N }).toString('hex');
  return `scrypt$${N}$${salt}$${h}`;
}
export function verifyPassword(pw, stored) {
  const p = String(stored || '').split('$'); if (p[0] !== 'scrypt' || p.length !== 4) return false;
  const h = crypto.scryptSync(String(pw), p[2], KEYLEN, { N: Number(p[1]) });
  const s = Buffer.from(p[3], 'hex');
  return s.length === h.length && crypto.timingSafeEqual(s, h);
}
export const isScryptHash = h => /^scrypt\$\d+\$[0-9a-f]+\$[0-9a-f]+$/.test(String(h || ''));
/** Token version: changes whenever the password changes, so old tokens stop working */
export const pwVersion = hash => crypto.createHash('sha256').update(String(hash || '')).digest('hex').slice(0, 12);

const b64 = o => Buffer.from(JSON.stringify(o)).toString('base64url');
export function signToken(user) {
  const now = Math.floor(Date.now() / 1000);
  const head = b64({ alg: 'HS256', typ: 'JWT' });
  const body = b64({ sub: user.id, pv: pwVersion(user.pwHash), iat: now, exp: now + config.tokenHours * 3600 });
  const sig = crypto.createHmac('sha256', config.jwtSecret).update(head + '.' + body).digest('base64url');
  return `${head}.${body}.${sig}`;
}
export function verifyToken(token) {
  const p = String(token || '').split('.'); if (p.length !== 3) return null;
  const sig = crypto.createHmac('sha256', config.jwtSecret).update(p[0] + '.' + p[1]).digest();
  const got = Buffer.from(p[2], 'base64url');
  if (got.length !== sig.length || !crypto.timingSafeEqual(got, sig)) return null;
  try { const head = JSON.parse(Buffer.from(p[0], 'base64url')); if (head.alg !== 'HS256') return null; const b = JSON.parse(Buffer.from(p[1], 'base64url')); if (!b.exp || b.exp < Date.now() / 1000) return null; return b; } catch { return null; }
}

/* Simple login throttle: 5 failures per username+IP locks for 15 minutes */
const fails = new Map();
export function loginBlocked(key) { const f = fails.get(key); if (!f) return 0; if (Date.now() > f.until && f.n >= 5) { fails.delete(key); return 0; } return f.n >= 5 ? Math.ceil((f.until - Date.now()) / 60000) : 0; }
export function loginFailed(key) { const f = fails.get(key) || { n: 0, until: 0 }; f.n++; if (f.n >= 5) f.until = Date.now() + 15 * 60000; fails.set(key, f); }
export function loginOk(key) { fails.delete(key); }

export function securityHeaders(req, res, next) {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Referrer-Policy', 'same-origin');
  res.setHeader('Content-Security-Policy', "default-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; script-src 'self'; connect-src 'self'; frame-ancestors 'none'");
  next();
}
