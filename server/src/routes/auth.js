import express from 'express';
import { getStore } from '../store/index.js';
import { verifyPassword, hashPassword, signToken, loginBlocked, loginFailed, loginOk, loginDelay, DUMMY_HASH } from '../security.js';
import { requireAuth } from '../auth.js';
import { HttpError, publicUser, serial } from '../service.js';
import { uid } from '../../../shared/core.js';

const r = express.Router();
const audit = (user, action, detail = '') => getStore().addAudit([{ id: uid(), at: new Date().toISOString(), user, action, module: 'User', ref: '', detail }]);

r.post('/login', async (req, res, next) => {
  try {
    const b = req.body || {}; const str = v => typeof v === 'string' ? v : '';
    const username = str(b.username).trim().toLowerCase().slice(0, 100); const password = str(b.password).slice(0, 200); const ip = req.ip || '';
    const wait = loginBlocked(username, ip); if (wait) throw new HttpError(429, `Too many failed attempts — try again in ${wait} minute(s)`);
    const delay = loginDelay(username); if (delay) await new Promise(r => setTimeout(r, delay));
    const users = await getStore().getAll('users'); const u = users.find(x => String(x.username || '').toLowerCase() === username);
    const ok = verifyPassword(password, u ? u.pwHash : DUMMY_HASH) && !!u;
    if (!ok) { loginFailed(username, ip); throw new HttpError(401, 'Invalid username or password'); }
    if (u.active === 'No') throw new HttpError(403, 'This account is inactive');
    loginOk(username, ip); u.lastLoginAt = new Date().toISOString(); await getStore().saveDocs('users', [u]); await audit(u.name, 'Login', u.username);
    res.json({ token: signToken(u), user: publicUser(u) });
  } catch (e) { next(e); }
});
r.get('/me', requireAuth, (req, res) => res.json({ user: publicUser(req.user) }));
// logging out retires every token issued to this user so far (a copied token stops working too)
r.post('/logout', requireAuth, (req, res, next) => serial(async () => {
  const u = await getStore().getDoc('users', req.user.id); if (u) { u.tokVer = (u.tokVer || 0) + 1; await getStore().saveDocs('users', [u]); }
  await audit(req.user.name, 'Logout', req.user.username); return { ok: true };
}).then(x => res.json(x), next));
r.post('/change-password', requireAuth, (req, res, next) => serial(async () => {
  const b = req.body || {}; const old = typeof b.old === 'string' ? b.old : '', pw = typeof b.pw === 'string' ? b.pw : ''; const u = await getStore().getDoc('users', req.user.id);
  if (!verifyPassword(String(old || ''), u.pwHash)) throw new HttpError(400, 'Current password is wrong');
  if (String(pw || '').length < 6) throw new HttpError(400, 'Password must be at least 6 characters');
  u.pwHash = hashPassword(pw); delete u.demo; await getStore().saveDocs('users', [u]); await audit(u.name, 'Password changed', u.username);
  return { token: signToken(u), user: publicUser(u) };
}).then(x => res.json(x), next));
export default r;
