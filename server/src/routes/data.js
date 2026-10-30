import express from 'express';
import { getStore } from '../store/index.js';
import { requireAuth } from '../auth.js';
import { MODS } from '../../../shared/modules.js';
import { loadDataset, can, publicUser, saveRecord, deleteRecord, runAction, patchSettings, addComboValue, saveRole, deleteRole, restoreBackup, HttpError } from '../service.js';

const r = express.Router();
r.use(requireAuth);
const send = (res, next) => p => p.then(x => res.json(x), next);

/* Minimal fields sent for modules the user cannot view (so names/labels still show) */
const MIN = ['id', 'name', 'siteName', 'parentId', 'type', 'status', 'categoryId', 'assetTag', 'serialNumber', 'assignedTo', 'locationId', 'department', 'personType', 'active', 'contractNumber', 'vendorId', 'startDate', 'endDate', 'poNumber', 'jobNumber', 'itemDescription', 'assetId', 'employeeCode', 'specs', 'connSwitch', 'connPort', 'amcId', 'ipAddress', 'gatePassNumber', 'repairJobId', 'refNo', 'issueNumber', 'borrowerName', 'linkedRepairJobId', 'commissioningStatus', 'ofcCableId', 'cores', 'sourceDeviceId', 'sourcePort', 'destinationDeviceId', 'destinationPort', 'sourceLiuId', 'sourceLiuPort', 'destLiuId', 'destLiuPort', 'patchPanelId', 'patchPanelPort', 'ports', 'warrantyEnd'];
const pick = (o, keys) => { const x = {}; keys.forEach(k => { if (o[k] !== undefined) x[k] = o[k]; }); return x; };

r.get('/bootstrap', (req, res, next) => send(res, next)((async () => {
  const db = await loadDataset(); const u = req.user; const data = {};
  Object.keys(MODS).forEach(m => {
    if (m === 'users') data.users = can(db, u, 'users', 'v') ? db.users.map(publicUser) : db.users.map(x => pick(x, ['id', 'name', 'active', 'department', 'roleId']));
    else if (m === 'roles') data.roles = db.roles;
    else data[m] = can(db, u, m, 'v') ? db[m] : db[m].map(x => pick(x, MIN));
  });
  return { me: publicUser(u), masters: db.masters, data, store: getStore().name };
})()));

r.post('/settings/combo', (req, res, next) => send(res, next)(addComboValue(req.body.key, req.body.value, req.user)));
r.patch('/settings', (req, res, next) => send(res, next)(patchSettings(req.body, req.user)));
r.post('/roles', (req, res, next) => send(res, next)(saveRole(null, req.body, req.user)));
r.put('/roles/:id', (req, res, next) => send(res, next)(saveRole(req.params.id, req.body, req.user)));
r.delete('/roles/:id', (req, res, next) => send(res, next)(deleteRole(req.params.id, req.user)));

r.get('/audit', (req, res, next) => send(res, next)((async () => {
  const db = await loadDataset(); const { q, user, ref, limit } = req.query;
  if (!can(db, req.user, 'audit', 'v')) {
    if (!ref || !can(db, req.user, 'assets', 'v')) throw new HttpError(403, 'You do not have access to the audit log');
  }
  return { entries: await getStore().listAudit({ q, user, ref, limit }), users: await getStore().auditUsers() };
})()));

r.get('/backup', (req, res, next) => send(res, next)((async () => {
  const db = await loadDataset(); if (!(db.roles.find(x => x.id === req.user.roleId) || {}).all) throw new HttpError(403, 'Only a System Administrator can export a full backup');
  const out = { ver: 3, exportedAt: new Date().toISOString(), masters: db.masters }; Object.keys(MODS).forEach(m => out[m] = db[m]);
  out.audit = await getStore().listAudit({ limit: 3000 }); return out;
})()));
r.post('/restore', express.json({ limit: '50mb' }), (req, res, next) => send(res, next)(restoreBackup(req.body, req.user)));

r.post('/:mod', (req, res, next) => send(res, next)(saveRecord(req.params.mod, null, req.body.data, req.user, !!req.body.confirmed)));
r.put('/:mod/:id', (req, res, next) => send(res, next)(saveRecord(req.params.mod, req.params.id, req.body.data, req.user, !!req.body.confirmed)));
r.delete('/:mod/:id', (req, res, next) => send(res, next)(deleteRecord(req.params.mod, req.params.id, req.user)));
r.post('/:mod/:id/action/:action', (req, res, next) => send(res, next)(runAction(req.params.mod, req.params.id, req.params.action, req.body.input, req.user, !!req.body.confirmed)));
export default r;
