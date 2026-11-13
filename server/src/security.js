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
/** Token version: changes whenever the password changes or the user logs out, so old tokens stop working */
export const pwVersion = hash => crypto.createHash('sha256').update(String(hash || '')).digest('hex').slice(0, 12);
export const tokenVersion = user => pwVersion(String(user.pwHash || '') + '|' + (user.tokVer || 0));
/** compared against when the username does not exist, so a wrong username takes as long as a wrong password */
export const DUMMY_HASH = hashPassword(crypto.randomBytes(16).toString('hex'));

const b64 = o => Buffer.from(JSON.stringify(o)).toString('base64url');
export function signToken(user) {
  const now = Math.floor(Date.now() / 1000);
  const head = b64({ alg: 'HS256', typ: 'JWT' });
  const body = b64({ sub: user.id, pv: tokenVersion(user), iat: now, exp: now + config.tokenHours * 3600 });
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

/* Login throttle (all counters forget after 15 minutes):
   - 5 failures for one username from one address lock that pair;
   - 20 failures from one address (any usernames) lock that address;
   - failures for one username from many addresses only slow its logins down (up to 5 s), so nobody can lock the admin out. */
const WINDOW = 15 * 60000; const fails = new Map();
const entry = key => { const f = fails.get(key); if (f && Date.now() - f.first > WINDOW) { fails.delete(key); return null; } return f || null; };
const minutesLeft = f => Math.max(1, Math.ceil((f.first + WINDOW - Date.now()) / 60000));
export function loginBlocked(username, ip) {
  const pair = entry('p|' + username + '|' + ip), addr = entry('a|' + ip);
  if (pair && pair.n >= 5) return minutesLeft(pair);
  if (addr && addr.n >= 20) return minutesLeft(addr);
  return 0;
}
export const loginDelay = username => { const u = entry('u|' + username); return u && u.n > 5 ? Math.min(5000, (u.n - 5) * 500) : 0; };
export function loginFailed(username, ip) {
  ['p|' + username + '|' + ip, 'a|' + ip, 'u|' + username].forEach(k => { const f = entry(k) || { n: 0, first: Date.now() }; f.n++; fails.set(k, f); });
  if (fails.size > 50000) fails.clear(); // memory guard against floods of made-up usernames
}
export function loginOk(username, ip) { fails.delete('p|' + username + '|' + ip); fails.delete('u|' + username); }

export function securityHeaders(req, res, next) {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Referrer-Policy', 'same-origin');
  res.setHeader('Content-Security-Policy', "default-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; media-src 'self'; script-src 'self'; connect-src 'self'; object-src 'none'; base-uri 'self'; form-action 'self'; frame-ancestors 'none'");
  res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=(), payment=(), usb=()');
  res.setHeader('Cross-Origin-Opener-Policy', 'same-origin');
  if (req.secure) res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
  if (req.path.startsWith('/api/')) res.setHeader('Cache-Control', 'no-store');
  next();
}
