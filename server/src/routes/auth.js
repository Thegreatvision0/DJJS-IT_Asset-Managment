import express from 'express';
import { getStore } from '../store/index.js';
import { verifyPassword, hashPassword, signToken, loginBlocked, loginFailed, loginOk } from '../security.js';
import { requireAuth } from '../auth.js';
import { HttpError, publicUser, serial } from '../service.js';
import { uid } from '../../../shared/core.js';

const r = express.Router();
const audit = (user, action, detail = '') => getStore().addAudit([{ id: uid(), at: new Date().toISOString(), user, action, module: 'User', ref: '', detail }]);

r.post('/login', async (req, res, next) => {
  try {
    const username = String((req.body || {}).username || '').trim().toLowerCase(); const password = String((req.body || {}).password || '');
    const key = username + '|' + (req.ip || '');
    const wait = loginBlocked(key); if (wait) throw new HttpError(429, `Too many failed attempts — try again in ${wait} minute(s)`);
    const users = await getStore().getAll('users'); const u = users.find(x => x.username.toLowerCase() === username);
    if (!u || !verifyPassword(password, u.pwHash)) { loginFailed(key); throw new HttpError(401, 'Invalid username or password'); }
    if (u.active === 'No') throw new HttpError(403, 'This account is inactive');
    loginOk(key); u.lastLoginAt = new Date().toISOString(); await getStore().saveDocs('users', [u]); await audit(u.name, 'Login', u.username);
    res.json({ token: signToken(u), user: publicUser(u) });
  } catch (e) { next(e); }
});
r.get('/me', requireAuth, (req, res) => res.json({ user: publicUser(req.user) }));
r.post('/logout', requireAuth, async (req, res, next) => { try { await audit(req.user.name, 'Logout', req.user.username); res.json({ ok: true }); } catch (e) { next(e); } });
r.post('/change-password', requireAuth, (req, res, next) => serial(async () => {
  const { old, pw } = req.body || {}; const u = await getStore().getDoc('users', req.user.id);
  if (!verifyPassword(String(old || ''), u.pwHash)) throw new HttpError(400, 'Current password is wrong');
  if (String(pw || '').length < 6) throw new HttpError(400, 'Password must be at least 6 characters');
  u.pwHash = hashPassword(pw); delete u.demo; await getStore().saveDocs('users', [u]); await audit(u.name, 'Password changed', u.username);
  return { token: signToken(u), user: publicUser(u) };
}).then(x => res.json(x), next));
export default r;
