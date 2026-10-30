/* Runs every change through the shared engine: load → validate → apply → business rules → persist → audit.
   Writes are serialised (one at a time) so numbering and cross-record checks stay consistent. */
import { setDB, uid, clone, today, DEFAULT_MASTERS, COMBO_KEYS, specsFor, DEFAULT_CAT_GROUPS } from '../../shared/core.js';
import { MODS, PERMS, canRole } from '../../shared/modules.js';
import { normalize, validateFields, HOOKS, findAction, ConfirmNeeded, refOf, nextNo, refCount, isLastAdmin } from '../../shared/engine.js';
import { upgrade, defaultRoles } from '../../shared/seed.js';
import { getStore } from './store/index.js';
import { hashPassword, isScryptHash } from './security.js';

export class HttpError extends Error { constructor(status, msg, extra) { super(msg); this.status = status; this.extra = extra; } }

let queue = Promise.resolve();
export function serial(fn) { const p = queue.then(fn, fn); queue = p.catch(() => { }); return p; }

export async function loadDataset() {
  const d = await getStore().loadAll();
  d.masters = Object.assign(clone(DEFAULT_MASTERS), { catGroups: clone(DEFAULT_CAT_GROUPS), customSpecs: {}, catFields: {}, hiddenSpecs: {} }, d.masters || {});
  setDB(d); return d;
}
export const can = (db, user, mod, act) => canRole(db.roles, user, mod, act);
export const publicUser = u => { if (!u) return u; const { pwHash, ...rest } = u; return rest; };

function makeCtx(db, user, confirmed) {
  const touched = {}, notices = [], audits = [];
  const ctx = {
    user: { id: user.id, name: user.name },
    can: (m, a) => can(db, user, m, a),
    touch(col, doc) { (touched[col] = touched[col] || new Map()).set(doc.id, doc); },
    notice(msg) { notices.push(msg); },
    confirm(msg) { if (!confirmed) throw new ConfirmNeeded(msg); },
    audit(action, mod, rec, detail) { audits.push({ id: uid(), at: new Date().toISOString(), user: user.name, action, module: MODS[mod] ? MODS[mod].one : (mod === 'settings' ? 'Settings' : mod), ref: refOf(mod, rec), detail: detail || '' }); },
    setPassword(u, pw) { u.pwHash = hashPassword(pw); },
  };
  return { ctx, touched, notices, audits };
}
async function persist(touched, audits) {
  const st = getStore(); const changed = {};
  for (const [col, map] of Object.entries(touched)) { const docs = [...map.values()]; await st.saveDocs(col, docs); changed[col] = docs.map(d => col === 'users' ? publicUser(d) : d); }
  await st.addAudit(audits); return changed;
}
function wrapConfirm(fn) { try { return fn(); } catch (e) { if (e instanceof ConfirmNeeded) throw new HttpError(409, e.confirm, { confirm: e.confirm }); throw e; } }

/* ---------- create / update ---------- */
export function saveRecord(mod, id, raw, user, confirmed) {
  return serial(async () => {
    if (!MODS[mod] || mod === 'roles') throw new HttpError(404, 'Unknown module');
    const db = await loadDataset();
    const old = id ? db[mod].find(r => r.id === id) : null;
    if (id && !old) throw new HttpError(404, MODS[mod].one + ' not found');
    if (!can(db, user, mod, old ? 'e' : 'a')) throw new HttpError(403, 'You do not have permission to ' + (old ? 'edit' : 'add') + ' ' + MODS[mod].one.toLowerCase() + 's');
    const prev = old ? clone(old) : null;
    const data = normalize(mod, raw, old);
    const { errors, bad } = validateFields(mod, data, old);
    if (errors.length) throw new HttpError(400, errors.slice(0, 6).join(' · ') + (errors.length > 6 ? ` (+${errors.length - 6} more)` : ''), { fields: bad });
    const { ctx, touched, notices, audits } = makeCtx(db, user, confirmed);
    const err = wrapConfirm(() => HOOKS[mod] && HOOKS[mod].validate && HOOKS[mod].validate(data, old, ctx));
    if (err) throw new HttpError(400, err);
    const stamp = { updatedAt: new Date().toISOString(), updatedBy: user.name };
    let rec;
    if (mod === 'users') { if (data.password) data.pwHash = hashPassword(data.password); delete data.password; }
    if (old) { rec = Object.assign(old, data, stamp); const ch = changedFields(mod, prev, rec); ctx.audit('Updated', mod, rec, ch); }
    else {
      rec = Object.assign({ id: uid(), createdAt: stamp.updatedAt, createdBy: user.name }, stamp, data);
      if (MODS[mod].prefix && !rec[MODS[mod].numKey]) rec[MODS[mod].numKey] = nextNo(mod);
      db[mod].push(rec); ctx.audit('Created', mod, rec);
    }
    wrapConfirm(() => HOOKS[mod] && HOOKS[mod].after && HOOKS[mod].after(rec, !old, prev, ctx));
    ctx.touch(mod, rec);
    const changed = await persist(touched, audits);
    return { record: mod === 'users' ? publicUser(rec) : rec, changed, notices };
  });
}
function changedFields(mod, a, b) {
  const ch = MODS[mod].fields.filter(f => f.k && !f.listOnly && f.t !== 'password' && JSON.stringify(a[f.k] ?? '') !== JSON.stringify(b[f.k] ?? '')).map(f => f.l);
  if (a.specs && JSON.stringify(a.specs) !== JSON.stringify(b.specs)) ch.push('Specifications');
  return ch.length ? 'Changed: ' + ch.slice(0, 8).join(', ') + (ch.length > 8 ? '…' : '') : '';
}

/* ---------- delete ---------- */
export function deleteRecord(mod, id, user) {
  return serial(async () => {
    if (!MODS[mod] || mod === 'roles') throw new HttpError(404, 'Unknown module');
    const db = await loadDataset(); const r = db[mod].find(x => x.id === id);
    if (!r) throw new HttpError(404, 'Not found');
    if (!can(db, user, mod, 'd')) throw new HttpError(403, 'You do not have permission to delete');
    const n = refCount(mod, id); if (n) throw new HttpError(400, `Cannot delete — used in ${n} other record(s)`);
    if (mod === 'users' && r.id === user.id) throw new HttpError(400, 'You cannot delete your own account');
    if (mod === 'users' && isLastAdmin(r)) throw new HttpError(400, 'At least one active System Administrator is required');
    await getStore().deleteDoc(mod, id);
    const { ctx, audits } = makeCtx(db, user, true); ctx.audit('Deleted', mod, r); await getStore().addAudit(audits);
    return { deleted: { [mod]: [id] } };
  });
}

/* ---------- workflow actions ---------- */
export function runAction(mod, id, actionId, input, user, confirmed) {
  return serial(async () => {
    const a = findAction(mod, actionId); if (!a || !a.run) throw new HttpError(404, 'Unknown action');
    const db = await loadDataset(); const r = db[mod] && db[mod].find(x => x.id === id);
    if (!r) throw new HttpError(404, 'Record not found');
    const perm = a.perm || 'e';
    if (!can(db, user, mod, perm) || (['mount', 'unmount'].includes(actionId) && !can(db, user, 'racks', 'e'))) throw new HttpError(403, 'You do not have permission for this action');
    if (a.show && !a.show(r)) throw new HttpError(400, `“${a.l}” is not available at this stage`);
    const { ctx, touched, notices, audits } = makeCtx(db, user, confirmed);
    const o = {}; const errs = [];
    if (a.fields) a.fields(r, ctx).forEach(f => { let v = (input || {})[f.k]; if (f.t === 'number') v = v === '' || v == null ? '' : Number(v); else if (f.t === 'table') v = Array.isArray(v) ? v : []; else v = v == null ? '' : String(v).trim(); o[f.k] = v; if (f.r && (v === '' || (Array.isArray(v) && !v.length))) errs.push(f.l + ' is required'); });
    else Object.assign(o, input || {});
    if (errs.length) throw new HttpError(400, errs.join(' · '));
    const err = wrapConfirm(() => a.run(ctx, r, o)); if (err) throw new HttpError(400, err);
    r.updatedAt = new Date().toISOString(); r.updatedBy = user.name;
    ctx.touch(mod, r);
    const changed = await persist(touched, audits);
    return { record: mod === 'users' ? publicUser(r) : r, changed, notices };
  });
}

/* ---------- settings ---------- */
const LIST_KEYS = Object.keys(DEFAULT_MASTERS).filter(k => Array.isArray(DEFAULT_MASTERS[k]));
export function patchSettings(patch, user) {
  return serial(async () => {
    const db = await loadDataset();
    if (!can(db, user, 'settings', 'e')) throw new HttpError(403, 'You do not have permission to change settings');
    const m = db.masters; const notes = [];
    for (const [k, v] of Object.entries(patch || {})) {
      if (LIST_KEYS.includes(k)) { if (!Array.isArray(v) || v.some(x => typeof x !== 'string')) throw new HttpError(400, k + ' must be a list of text'); if (k === 'reminderDays' && v.some(x => !/^\d+$/.test(x))) throw new HttpError(400, 'Reminder windows must be numbers'); m[k] = [...new Set(v.map(x => x.trim()).filter(Boolean))]; notes.push(k); }
      else if (k === 'catGroups') {
        if (typeof v !== 'object' || Array.isArray(v) || Object.values(v).some(l => !Array.isArray(l))) throw new HttpError(400, 'Invalid category groups');
        const nextCats = new Set(Object.values(v).flat()); const inUse = [...new Set(db.assets.map(a => a.categoryId))].filter(c => !nextCats.has(c));
        if (inUse.length) throw new HttpError(400, `Category in use by assets: ${inUse.join(', ')}`);
        const all = Object.values(v).flat(); if (new Set(all.map(c => c.toLowerCase())).size !== all.length) throw new HttpError(400, 'Each category can appear only once');
        m.catGroups = v; notes.push('categories');
      } else if (['catFields', 'hiddenSpecs', 'customSpecs'].includes(k)) {
        if (typeof v !== 'object' || Array.isArray(v)) throw new HttpError(400, 'Invalid ' + k);
        m[k] = v; notes.push(k);
      } else throw new HttpError(400, 'Unknown setting: ' + k);
    }
    await getStore().saveSettings(m, db.ver);
    const { ctx, audits } = makeCtx(db, user, true); ctx.audit('Settings updated', 'settings', null, notes.join(', ')); await getStore().addAudit(audits);
    return { masters: m };
  });
}
export function addComboValue(key, value, user) {
  return serial(async () => {
    const db = await loadDataset(); const v = String(value || '').trim();
    if (!COMBO_KEYS.includes(key) && !LIST_KEYS.includes(key)) throw new HttpError(400, 'Unknown list');
    if (!v || v.length > 120) throw new HttpError(400, 'Enter a value (max 120 characters)');
    const anyWrite = PERMS.some(([m]) => can(db, user, m, 'a') || can(db, user, m, 'e'));
    if (!anyWrite) throw new HttpError(403, 'You do not have permission');
    if (!COMBO_KEYS.includes(key) && !can(db, user, 'settings', 'e')) throw new HttpError(403, 'Only settings editors can change this list');
    const L = db.masters[key] = db.masters[key] || [];
    if (!L.some(x => x.toLowerCase() === v.toLowerCase())) { L.push(v); await getStore().saveSettings(db.masters, db.ver); const { ctx, audits } = makeCtx(db, user, true); ctx.audit('List value added', 'settings', null, key + ': ' + v); await getStore().addAudit(audits); }
    return { masters: db.masters, value: v };
  });
}

/* ---------- roles ---------- */
function cleanPerms(p) { const out = {}; PERMS.forEach(([k, , acts]) => { const x = (p || {})[k]; if (!x) return; const o = {}; [...acts].forEach(a => { if (x[a]) o[a] = true; }); if (Object.keys(o).length) { o.v = true; out[k] = o; } }); return out; }
export function saveRole(id, body, user) {
  return serial(async () => {
    const db = await loadDataset();
    if (!can(db, user, 'roles', 'e')) throw new HttpError(403, 'You do not have permission to manage roles');
    const name = String((body || {}).name || '').trim();
    let r = id ? db.roles.find(x => x.id === id) : null;
    if (id && !r) throw new HttpError(404, 'Role not found');
    if (r && r.all) throw new HttpError(400, 'The System Administrator role is fixed');
    if (!r && !name) throw new HttpError(400, 'Role name is required');
    if (name && db.roles.some(x => x !== r && x.name.toLowerCase() === name.toLowerCase())) throw new HttpError(400, 'A role with this name exists');
    const { ctx, audits } = makeCtx(db, user, true);
    if (!r) { r = { id: uid(), name, perms: cleanPerms(body.perms || { dashboard: { v: true } }), createdAt: new Date().toISOString(), createdBy: user.name }; ctx.audit('Created', 'roles', r); }
    else { if (name && name !== r.name) { ctx.audit('Renamed', 'roles', r, r.name + ' → ' + name); r.name = name; } if (body.perms) { r.perms = cleanPerms(body.perms); ctx.audit('Permissions changed', 'roles', r); } }
    r.updatedAt = new Date().toISOString(); r.updatedBy = user.name;
    await getStore().saveDocs('roles', [r]); await getStore().addAudit(audits);
    return { record: r, changed: { roles: [r] } };
  });
}
export function deleteRole(id, user) {
  return serial(async () => {
    const db = await loadDataset(); if (!can(db, user, 'roles', 'e')) throw new HttpError(403, 'You do not have permission to manage roles');
    const r = db.roles.find(x => x.id === id); if (!r) throw new HttpError(404, 'Role not found'); if (r.all) throw new HttpError(400, 'The System Administrator role is fixed');
    const n = db.users.filter(u => u.roleId === id).length; if (n) throw new HttpError(400, `${n} user(s) have this role — change their role first`);
    await getStore().deleteDoc('roles', id); const { ctx, audits } = makeCtx(db, user, true); ctx.audit('Deleted', 'roles', r); await getStore().addAudit(audits);
    return { deleted: { roles: [id] } };
  });
}

/* ---------- first run, restore ---------- */
export async function ensureInitialised(adminPassword) {
  const st = getStore();
  if (!(await st.isEmpty())) {
    const d = await st.loadAll();
    if (!d.masters) await st.saveSettings(Object.assign(clone(DEFAULT_MASTERS), { catGroups: clone(DEFAULT_CAT_GROUPS), customSpecs: {}, catFields: {}, hiddenSpecs: {} }), 3);
    return false;
  }
  const roles = defaultRoles(); const pw = adminPassword || 'admin123';
  const admin = { id: 'u_admin', username: 'admin', name: 'IT Administrator', roleId: 'r_admin', department: 'IT', active: 'Yes', pwHash: hashPassword(pw), createdAt: new Date().toISOString(), createdBy: 'System' };
  await st.saveDocs('roles', roles); await st.saveDocs('users', [admin]);
  await st.saveSettings(Object.assign(clone(DEFAULT_MASTERS), { catGroups: clone(DEFAULT_CAT_GROUPS), customSpecs: {}, catFields: {}, hiddenSpecs: {} }), 3);
  await st.addAudit([{ id: uid(), at: new Date().toISOString(), user: 'System', action: 'Initialised', module: 'System', ref: '', detail: 'Default roles and admin user created' }]);
  console.log(`[init] Empty database — created user "admin" with ${adminPassword ? 'the ADMIN_PASSWORD from .env' : 'password admin123 (change it after logging in)'}`);
  return true;
}
export function restoreBackup(data, user) {
  return serial(async () => {
    const cur = await loadDataset();
    if (!(cur.roles.find(r => r.id === user.roleId) || {}).all) throw new HttpError(403, 'Only a System Administrator can restore a backup');
    if (!data || !Array.isArray(data.assets)) throw new HttpError(400, 'Not a valid backup file');
    const keepAccounts = !(data.users || []).length || (data.users || []).some(u => !isScryptHash(u.pwHash));
    upgrade(data, (u, p) => hashPassword(p));
    if (keepAccounts) { data.users = cur.users; data.roles = cur.roles; }
    if (!data.users.some(u => u.id === user.id)) data.users.push(cur.users.find(u => u.id === user.id));
    data.ver = 3;
    await getStore().replaceAll(data);
    const { ctx, audits } = makeCtx(cur, user, true); ctx.audit('Backup restored', 'settings', null, keepAccounts ? 'Data restored; existing user accounts kept' : 'Data and accounts restored'); await getStore().addAudit(audits);
    return { ok: true, keptAccounts: keepAccounts };
  });
}
export { today, specsFor };
