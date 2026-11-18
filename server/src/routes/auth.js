import express from 'express';
import { getStore } from '../store/index.js';
import { verifyPassword, hashPassword, signToken, loginBlocked, loginFailed, loginOk, loginDelay, DUMMY_HASH } from '../security.js';
import { requireAuth } from '../auth.js';
import { HttpError, publicUser, serial } from '../service.js';
import { uid } from '../../../shared/core.js';
import { config } from '../config.js';
import { adEnabled, adLogin, adName, AD_SOURCE, AdUnavailable } from '../ad.js';

const r = express.Router();
const audit = (user, action, detail = '') => getStore().addAudit([{ id: uid(), at: new Date().toISOString(), user, action, module: 'User', ref: '', detail }]);

r.post('/login', async (req, res, next) => {
  try {
    const b = req.body || {}; const str = v => typeof v === 'string' ? v : '';
    const username = str(b.username).trim().toLowerCase().slice(0, 100); const password = str(b.password).slice(0, 200); const ip = req.ip || '';
    const tkey = adEnabled() ? adName(username) : username; // NRM\x, x@nrm.org and x share one failure count
    const wait = loginBlocked(tkey, ip); if (wait) throw new HttpError(429, `Too many failed attempts — try again in ${wait} minute(s)`);
    const delay = loginDelay(tkey); if (delay) await new Promise(r => setTimeout(r, delay));
    const users = await getStore().getAll('users'); const local = users.find(x => String(x.username || '').toLowerCase() === username && x.authSource !== AD_SOURCE);
    let u;
    if (local || !adEnabled()) { // app password (always available, e.g. the built-in admin)
      const ok = verifyPassword(password, local ? local.pwHash : DUMMY_HASH) && !!local;
      if (!ok) { loginFailed(tkey, ip); throw new HttpError(401, 'Invalid username or password'); }
      u = local;
    } else { // domain account
      const sam = adName(username);
      if (users.some(x => String(x.username || '').toLowerCase() === sam && x.authSource !== AD_SOURCE)) { loginFailed(tkey, ip); throw new HttpError(401, 'Invalid username or password'); } // never sign in to an app account with a domain password
      let p; try { p = await adLogin(sam, password); } catch (e) { if (e instanceof AdUnavailable) throw new HttpError(503, e.message); throw e; }
      if (!p) { loginFailed(tkey, ip); throw new HttpError(401, 'Invalid username or password'); }
      u = await serial(() => registerAdUser(p));
    }
    if (u.active === 'No') throw new HttpError(403, 'This account is inactive');
    loginOk(tkey, ip);
    if (!u.roleId || !(await getStore().getAll('roles')).some(r => r.id === u.roleId)) { await audit(u.name, 'Sign-in awaiting approval', u.username); throw new HttpError(403, `Welcome ${u.name}. Your ${config.ad.label || 'domain'} account is registered and is waiting for the IT administrator to give you access.`); } u.lastLoginAt = new Date().toISOString(); await getStore().saveDocs('users', [u]); await audit(u.name, 'Login', u.username);
    res.json({ token: signToken(u), user: publicUser(u) });
  } catch (e) { next(e); }
});
/* first domain sign-in creates the user with no role (an administrator approves it); later sign-ins refresh name / email from AD */
async function registerAdUser(p) {
  const st = getStore(); const users = await st.getAll('users'); const now = new Date().toISOString();
  let u = users.find(x => String(x.username || '').toLowerCase() === p.username && x.authSource === AD_SOURCE);
  if (!u) {
    u = { id: uid(), username: p.username, name: p.name, email: p.email, phone: p.phone, department: p.department, authSource: AD_SOURCE, roleId: '', active: 'Yes', createdAt: now, createdBy: 'Active Directory', updatedAt: now, updatedBy: 'Active Directory' };
    await st.saveDocs('users', [u]); await audit(p.name, 'Domain user registered', p.username + ' — awaiting approval'); return u;
  }
  const upd = {}; ['name', 'email'].forEach(k => { if (p[k] && p[k] !== u[k]) upd[k] = p[k]; });
  if (Object.keys(upd).length) { Object.assign(u, upd, { updatedAt: now, updatedBy: 'Active Directory' }); await st.saveDocs('users', [u]); }
  return u;
}
/* tells the login page whether domain sign-in is available */
r.get('/options', (req, res) => res.json({ ad: adEnabled(), domain: adEnabled() ? config.ad.label : '' }));
r.get('/me', requireAuth, (req, res) => res.json({ user: publicUser(req.user) }));
// logging out retires every token issued to this user so far (a copied token stops working too)
r.post('/logout', requireAuth, (req, res, next) => serial(async () => {
  const u = await getStore().getDoc('users', req.user.id); if (u) { u.tokVer = (u.tokVer || 0) + 1; await getStore().saveDocs('users', [u]); }
  await audit(req.user.name, 'Logout', req.user.username); return { ok: true };
}).then(x => res.json(x), next));
r.post('/change-password', requireAuth, (req, res, next) => serial(async () => {
  const b = req.body || {}; const old = typeof b.old === 'string' ? b.old : '', pw = typeof b.pw === 'string' ? b.pw : ''; const u = await getStore().getDoc('users', req.user.id);
  if (u.authSource === AD_SOURCE) throw new HttpError(400, 'Domain accounts change their password in Windows (Ctrl+Alt+Del → Change a password)');
  if (!verifyPassword(String(old || ''), u.pwHash)) throw new HttpError(400, 'Current password is wrong');
  if (String(pw || '').length < 6) throw new HttpError(400, 'Password must be at least 6 characters');
  u.pwHash = hashPassword(pw); delete u.demo; await getStore().saveDocs('users', [u]); await audit(u.name, 'Password changed', u.username);
  return { token: signToken(u), user: publicUser(u) };
}).then(x => res.json(x), next));
export default r;
