/* =====================================================================
   Record engine — visibility, normalisation, validation, business rules
   and workflow actions. The SERVER runs this authoritatively; the client
   uses the same functions for instant form feedback.

   ctx (server-provided):
     user {id,name}, can(mod,act), audit(action,mod,rec,detail),
     touch(col,doc)   – mark another document as changed (persisted by the server)
     notice(msg)      – informational message returned to the user
     confirm(msg)     – asks the user to confirm; throws ConfirmNeeded unless already confirmed
   ===================================================================== */
import {
  DB, today, daysTo, fmtD, num, clone, uniq, live, GONE, SYS_STATUSES, CAN_ASSIGN, CAN_TEMP, CAMERA_CATS,
  getA, tagOf, label, profile, specsFor, camerasOn, rackDevices, rackCheck, portUsers, parseCores, coresUsed,
  partsTotal, checkV, findPerson, money, PORT_CATS,
} from './core.js';
import { MODS, PARTS_COLS } from './modules.js';

export class ConfirmNeeded extends Error { constructor(msg) { super(msg); this.confirm = msg; } }

export function refOf(mod, r) { if (!r) return ''; const m = MODS[mod]; return (m && m.numKey && r[m.numKey]) || r.name || r.productName || r.serviceName || r.username || ''; }
export function nextNo(mod) { const m = MODS[mod]; let mx = 0; (DB[mod] || []).forEach(r => { const x = String(r[m.numKey] || '').match(/(\d+)$/); if (x) mx = Math.max(mx, +x[1]); }); return m.prefix + String(mx + 1).padStart(4, '0'); }

/* ---------- visibility ---------- */
export function fieldVisible(mod, f, vals, opt = {}) {
  if (!f.k || f.listOnly) return false;
  const isNew = !opt.rec;
  if (f.viewOnly && !opt.view) return false;
  if (f.ro && isNew) return false;
  if (f.std) { if (!vals.categoryId || !profile(vals.categoryId).show.includes(f.k)) return false; }
  if (f.when && !f.when(vals, { isNew })) return false;
  return true;
}
export function fieldRequired(mod, f, vals) {
  if (f.ro || f.t === 'calc' || f.viewOnly) return false;
  if (f.r) return true;
  if (f.std && vals.categoryId) {
    if (profile(vals.categoryId).req.includes(f.k)) return true;
    if (f.k === 'connSwitch' && CAMERA_CATS.includes(vals.categoryId) && (vals.specs || {}).power === 'PoE (Switch)') return true;
  }
  return false;
}
export const visibleSpecs = (cat, specs) => specsFor(cat).filter(f => !f.when || f.when(specs || {}));

/* ---------- normalise raw input into a clean record (server authoritative) ---------- */
export function normalize(mod, raw, old) {
  const m = MODS[mod]; const out = {}; raw = raw || {};
  const vals = Object.assign({}, raw);
  m.fields.forEach(f => {
    if (!f.k || f.listOnly || f.viewOnly) return;
    if (f.ro) return;
    if (f.t === 'calc') return;
    let v = vals[f.k];
    if (f.t === 'number') v = v === '' || v == null ? '' : Number(v);
    else if (f.t === 'table') v = Array.isArray(v) ? v.map(row => { const o = {}; f.cols.forEach(c => { const x = row[c.k]; o[c.k] = c.t === 'number' ? (x === '' || x == null ? '' : Number(x)) : String(x ?? '').trim(); }); return o; }).filter(o => f.cols.some(c => c.k !== 'qty' && o[c.k] !== '' && o[c.k] != null)) : [];
    else if (f.t === 'multiref') v = Array.isArray(v) ? v.map(String) : [];
    else if (f.t === 'password') v = String(v ?? '');
    else v = v == null ? '' : String(v).trim();
    if (f.v === 'mac' && v) v = v.toUpperCase().replace(/-/g, ':');
    if (f.v === 'gstin' && v) v = v.toUpperCase();
    vals[f.k] = v;
  });
  if (mod === 'assets') {
    const sp = {}; const rs = raw.specs || {};
    visibleSpecs(vals.categoryId, rs).forEach(f => { if (f.t === 'calc') return; let v = rs[f.k]; if (v === '' || v == null) return; sp[f.k] = f.t === 'number' ? Number(v) : String(v).trim(); });
    vals.specs = sp;
  }
  m.fields.forEach(f => {
    if (!f.k || f.listOnly || f.viewOnly || f.ro) return;
    const vis = fieldVisible(mod, f, vals, { rec: old });
    if (f.t === 'calc') { out[f.k] = vis || !f.when ? f.calc(vals, old) : ''; return; }
    out[f.k] = vis ? vals[f.k] : (f.t === 'table' || f.t === 'multiref' ? [] : '');
  });
  if (mod === 'assets') { const sp = vals.specs; specsFor(vals.categoryId).forEach(f => { if (f.t === 'calc') { const v = f.calc(sp, old); if (v !== '' && v != null) sp[f.k] = v; } }); out.specs = sp; }
  return out;
}

/* ---------- field-level validation (required + format) ---------- */
export function validateFields(mod, data, old) {
  const m = MODS[mod]; const errors = [], bad = [];
  m.fields.forEach(f => {
    if (!f.k || f.ro || f.viewOnly || f.listOnly || f.t === 'calc') return;
    if (!fieldVisible(mod, f, data, { rec: old })) return;
    const v = data[f.k]; const empty = v == null || v === '' || (Array.isArray(v) && !v.length);
    if (fieldRequired(mod, f, data) && empty) { errors.push(f.l + ' is required'); bad.push(f.k); }
    else if (!empty) { const e = checkV(f, v); if (e) { errors.push(e); bad.push(f.k); } }
  });
  if (mod === 'assets' && data.categoryId) visibleSpecs(data.categoryId, data.specs).forEach(f => {
    if (f.t === 'calc') return; const v = (data.specs || {})[f.k];
    if (f.r && (v == null || v === '')) { errors.push(f.l + ' is required'); bad.push('sp_' + f.k); }
    else if (v !== '' && v != null) { const e = checkV(f, v); if (e) { errors.push(e); bad.push('sp_' + f.k); } }
  });
  return { errors, bad };
}

/* ---------- asset status helpers ---------- */
export function baseStatus(a) {
  if ((DB.installations || []).some(i => i.assetId === a.id && ['Installed', 'Commissioned', 'Handed Over'].includes(i.commissioningStatus))) return 'Installed / In Use';
  return a.assignedTo ? 'Assigned' : 'In Stock';
}
export function setAssetStatus(ctx, id, st, why) {
  const a = getA(id); if (!a || a.status === st) return;
  const old = a.status; a.status = st; ctx.touch('assets', a); ctx.audit('Status change', 'assets', a, `${old} → ${st} (${why})`);
}
export function isLastAdmin(u) { const admins = (DB.users || []).filter(x => x.active !== 'No' && ((DB.roles || []).find(r => r.id === x.roleId) || {}).all); return admins.length === 1 && admins[0].id === u.id; }

/* ---------- business rules: validate(data, old, ctx) → error string; after(rec, isNew, prev, ctx) ---------- */
export const HOOKS = {
  assets: {
    validate(d, old) {
      const oid = old && old.id;
      if (DB.assets.some(a => a.id !== oid && String(a.assetTag).toLowerCase() === d.assetTag.toLowerCase())) return 'Asset tag ' + d.assetTag + ' already exists';
      if (d.serialNumber) { const o = DB.assets.find(a => a.id !== oid && a.serialNumber && a.serialNumber.toLowerCase() === d.serialNumber.toLowerCase()); if (o) return `Serial number already registered on ${o.assetTag}`; }
      if (d.ipAddress) { const o = DB.assets.find(a => a.id !== oid && live(a) && (a.ipAddress === d.ipAddress || (a.specs || {}).iloIp === d.ipAddress)); if (o) return `IP ${d.ipAddress} is already used by ${o.assetTag} (${o.name})`; }
      if (d.macAddress) { const o = DB.assets.find(a => a.id !== oid && a.macAddress === d.macAddress); if (o) return `MAC ${d.macAddress} is already registered on ${o.assetTag}`; }
      if (d.purchaseDate && d.warrantyEnd && d.warrantyEnd < d.purchaseDate) return 'Warranty end cannot be before the purchase date';
      if (d.purchaseDate && d.purchaseDate > today()) return 'Purchase date cannot be in the future';
      const prevSt = old ? old.status : null;
      if (SYS_STATUSES.includes(d.status) && d.status !== prevSt) return `“${d.status}” is set automatically by its workflow — choose another status`;
      if (old && SYS_STATUSES.includes(prevSt) && d.status !== prevSt) return `This asset is “${prevSt}”. Close the related assignment / temporary issue / repair / maintenance record first.`;
      if (d.connSwitch) { if (d.connSwitch === oid) return 'An asset cannot be connected to itself'; if (d.connPort) { const u = portUsers(d.connSwitch, oid)[d.connPort]; if (u) return `Port ${d.connPort} on ${tagOf(d.connSwitch)} is already used by ${u}`; } }
      const s = d.specs || {};
      if (s.rackId && specsFor(d.categoryId).some(f => f.k === 'uStart')) { const e = rackCheck(s.rackId, s.uStart, s.uHeight, oid); if (e) return e; }
      else if (s.uStart) return 'Select the rack before entering Start U';
      if (s.recorder) {
        const n = getA(s.recorder); if (!n) return 'Recording NVR not found'; const tot = parseInt((n.specs || {}).channels) || 0;
        if (!tot) return `${n.assetTag} has no channel count — update the NVR first`;
        if (+s.channel > tot) return `${n.assetTag} has only ${tot} channels`;
        const c = camerasOn(s.recorder).find(x => x.id !== oid && x.specs.channel === s.channel); if (c) return `Channel ${s.channel} on ${n.assetTag} is already used by ${c.assetTag}`;
      }
      if (s.installedIn && s.bay) { const c = DB.assets.find(a => a.id !== oid && live(a) && (a.specs || {}).installedIn === s.installedIn && a.specs.bay === s.bay); if (c) return `Bay ${s.bay} of ${tagOf(s.installedIn)} already holds ${c.assetTag}`; }
      if (old && d.categoryId === 'Rack') { const top = Math.max(0, ...rackDevices(oid).map(a => num(a.specs.uStart) + (parseInt(a.specs.uHeight) || 1) - 1)); if ((parseInt(s.rackSize) || 0) < top) return `Devices are mounted up to U${top} — rack size cannot be smaller`; }
      if (old && d.categoryId === 'NVR') { const mx = Math.max(0, ...camerasOn(oid).map(c => +c.specs.channel || 0)); if ((parseInt(s.channels) || 0) < mx) return `Cameras use channels up to ${mx} — channel count cannot be smaller`; }
      if (old && d.categoryId === 'OFC Cable') { const mx = Math.max(0, ...coresUsed(oid)); if ((parseInt(s.cores) || 0) < mx) return `Links use cores up to ${mx} — core count cannot be smaller`; }
      if (s.drives && s.bays && num(s.drives) > num(s.bays)) return 'Drives installed cannot exceed drive bays';
      return '';
    },
    after(rec, isNew, prev, ctx) { if (prev && prev.status !== rec.status) ctx.audit('Status change', 'assets', rec, `${prev.status} → ${rec.status} (manual)`); },
  },
  assignments: {
    validate(d, old) { const a = getA(d.assetId); if (!a) return 'Asset not found'; if (!old && !CAN_ASSIGN.includes(a.status)) return `Asset is “${a.status}”. Only In Stock or Standby / Spare assets can be permanently assigned.`; if (d.assignedAt > today()) return 'Issue date cannot be in the future'; },
    after(r, isNew, prev, ctx) { if (isNew) { r.status = 'Active'; const a = getA(r.assetId); a.assignedTo = r.employeeId; const e = DB.employees.find(x => x.id === r.employeeId); if (e && e.locationId) a.locationId = e.locationId; ctx.touch('assets', a); setAssetStatus(ctx, a.id, 'Assigned', r.refNo); } },
  },
  tempAssignments: {
    validate(d, old, ctx) {
      const a = getA(d.assetId); if (!a) return 'Asset not found';
      if (!old && !CAN_TEMP.includes(a.status)) return `Asset is “${a.status}” and cannot be issued.`;
      if (d.dueAt < d.issuedAt) return 'Expected return date cannot be before the issue date';
      const open = DB.tempAssignments.find(t => (!old || t.id !== old.id) && t.assetId === d.assetId && ['Requested', 'Approved', 'Issued'].includes(t.status)); if (open) return 'Asset already has an open temporary issue: ' + open.issueNumber;
      if (!old && ['Returned', 'Returned with Damage', 'Lost'].includes(d.status)) return 'A new issue cannot start as returned — use Requested, Approved or Issued';
      if (old && old.status !== d.status && ['Returned', 'Returned with Damage', 'Lost'].includes(d.status)) return 'Use the “Return” button so the return details are recorded';
      if (!ctx.can('tempAssignments', 'x') && ['Approved', 'Issued'].includes(d.status) && (!old || old.status === 'Requested')) { d.status = 'Requested'; ctx.notice('Saved as “Requested” — an approver must approve it'); }
    },
    after(r, isNew, prev, ctx) {
      if (r.status === 'Issued' && (!prev || prev.status !== 'Issued')) setAssetStatus(ctx, r.assetId, 'Temporarily Assigned', r.issueNumber);
      if (prev && prev.status === 'Issued' && r.status === 'Cancelled') { const a = getA(r.assetId); setAssetStatus(ctx, a.id, baseStatus(a), r.issueNumber + ' cancelled'); }
      if (isNew && r.status !== 'Requested') r.approvedBy = ctx.user.name;
    },
  },
  repairJobs: {
    validate(d, old) {
      if (d.assetId && !old) { const open = DB.repairJobs.find(j => j.assetId === d.assetId && !['Handed Over', 'Beyond Economic Repair', 'Cancelled'].includes(j.status)); if (open) return 'Asset already has an open repair job: ' + open.jobNumber; }
      if (d.receivedAt > today()) return 'Received date cannot be in the future';
      const sysSt = { 'Sent to Vendor': 'Send to Vendor', 'Received Back': 'Receive Back (Repair Outward)', 'Handed Over': 'Handover', 'Beyond Economic Repair': 'Beyond Repair' };
      if (sysSt[d.status] && (!old || old.status !== d.status)) return `Use the “${sysSt[d.status]}” button for this status`;
      if (old && old.status === 'Sent to Vendor' && d.status !== 'Sent to Vendor') return 'Item is with the vendor — record “Receive Back” in Repair Outward first';
    },
    after(r, isNew, prev, ctx) {
      if (!r.assetId) return;
      if (isNew) {
        const t = DB.tempAssignments.find(x => x.assetId === r.assetId && x.status === 'Issued');
        if (t) { Object.assign(t, { status: 'Returned', returnedAt: r.receivedAt, receivedBy: r.receivedBy, notes: (t.notes ? t.notes + '\n' : '') + 'Returned for repair — ' + r.jobNumber }); ctx.touch('tempAssignments', t); ctx.audit('Returned (for repair)', 'tempAssignments', t); }
        setAssetStatus(ctx, r.assetId, 'In Repair (In-House)', r.jobNumber);
      }
      if (r.status === 'Ready for Handover' && !r.readyAt) r.readyAt = today();
      if (r.status === 'Cancelled' && prev && prev.status !== 'Cancelled') { const a = getA(r.assetId); setAssetStatus(ctx, a.id, baseStatus(a), r.jobNumber + ' cancelled'); }
    },
  },
  repairDispatches: {
    validate(d, old, ctx) {
      if (!old) { const open = DB.repairDispatches.find(x => x.repairJobId === d.repairJobId && x.status !== 'Received Back'); if (open) return 'This job already has an open gate pass: ' + open.gatePassNumber; }
      if (d.expectedReturnAt < d.sentAt) return 'Expected return cannot be before the sent date';
      if (d.dataWiped === 'No') ctx.confirm('Storage NOT removed / data NOT wiped. Send anyway?');
      if (['Approved', 'Rejected'].includes(d.approvalStatus) && (!old || old.approvalStatus !== d.approvalStatus) && !ctx.can('repairDispatches', 'x')) return 'Only a user with Approve permission can approve or reject a quote';
    },
    after(r, isNew, prev, ctx) {
      const j = DB.repairJobs.find(x => x.id === r.repairJobId); if (!j) return;
      if (isNew) { r.status = 'Sent to Vendor'; j.status = 'Sent to Vendor'; j.repairMode = r.claimType === 'Warranty Claim' ? 'Warranty Claim' : r.claimType === 'AMC Claim' ? 'AMC Claim' : 'Send to Vendor'; ctx.touch('repairJobs', j); ctx.audit('Sent to vendor', 'repairJobs', j, r.gatePassNumber); if (j.assetId) setAssetStatus(ctx, j.assetId, 'Sent for Repair', r.gatePassNumber); }
      if (r.status !== 'Received Back') { if (r.approvalStatus === 'Awaiting Approval') r.status = 'Quote Awaiting Approval'; else if (['Approved', 'Not Required'].includes(r.approvalStatus) && !isNew) r.status = 'Under Vendor Repair'; }
      if (prev && prev.approvalStatus !== r.approvalStatus && ['Approved', 'Rejected'].includes(r.approvalStatus)) r.approvedBy = ctx.user.name;
    },
  },
  maintenance: {
    validate(d) { if (d.resolvedAt && d.resolvedAt < d.reportedAt) return 'Resolved date cannot be before the reported date'; if (d.startedAt && d.startedAt < d.reportedAt) return 'Start date cannot be before the reported date'; const a = getA(d.assetId); if (!a) return 'Asset not found'; if (['In Repair (In-House)', 'Sent for Repair'].includes(a.status)) return `Asset is “${a.status}” — use the repair job instead`; },
    after(r, isNew, prev, ctx) {
      const a = getA(r.assetId); if (!a) return;
      const openSt = ['Open', 'Scheduled', 'In Progress', 'On Hold', 'Awaiting Parts'];
      const open = openSt.includes(r.status) && !['Preventive', 'Inspection', 'Cleaning'].includes(r.issueType);
      if (open && ['In Stock', 'Assigned', 'Installed / In Use', 'Standby / Spare', 'Faulty'].includes(a.status)) setAssetStatus(ctx, a.id, 'Under Maintenance', r.refNo);
      if (!open && a.status === 'Under Maintenance' && !DB.maintenance.some(m => m.id !== r.id && m.assetId === a.id && openSt.includes(m.status))) setAssetStatus(ctx, a.id, baseStatus(a), r.refNo);
    },
  },
  amcVisits: {
    validate(d) {
      const c = DB.contracts.find(x => x.id === d.contractId);
      if (c && (d.visitDate < c.startDate || d.visitDate > c.endDate)) return `Visit date is outside the contract period (${fmtD(c.startDate)} – ${fmtD(c.endDate)})`;
      if (d.inTime && d.outTime && d.outTime <= d.inTime) return 'Out time must be after in time';
      if (d.nextVisitAt && d.nextVisitAt <= d.visitDate) return 'Next visit must be after this visit';
      if (d.visitDate > today()) return 'Visit date cannot be in the future';
    },
  },
  installations: {
    validate(d) { if (d.installedAt > today() && d.commissioningStatus !== 'Planned') return 'Install date is in the future — set Commissioning to “Planned”'; },
    after(r, isNew, prev, ctx) { const a = getA(r.assetId); if (!a) return; if (['Installed', 'Commissioned', 'Handed Over'].includes(r.commissioningStatus)) { a.locationId = r.locationId; ctx.touch('assets', a); if (['In Stock', 'Standby / Spare', 'Reserved', 'In Transit'].includes(a.status)) setAssetStatus(ctx, a.id, 'Installed / In Use', r.refNo); } if (r.commissioningStatus === 'Removed' && a.status === 'Installed / In Use') setAssetStatus(ctx, a.id, 'In Stock', r.refNo + ' removed'); },
  },
  networkLinks: {
    validate(d, old) {
      const oid = old && old.id;
      if (d.sourceDeviceId === d.destinationDeviceId) return 'From and To devices cannot be the same';
      for (const [dev, port, lab] of [[d.sourceDeviceId, d.sourcePort, 'From'], [d.destinationDeviceId, d.destinationPort, 'To'], [d.sourceLiuId, d.sourceLiuPort, 'From LIU'], [d.destLiuId, d.destLiuPort, 'To LIU'], [d.patchPanelId, d.patchPanelPort, 'Patch panel']]) {
        if (dev && port && d.status !== 'Disconnected') { const u = portUsers(dev, oid)[port]; if (u) return `${lab} port ${port} on ${tagOf(dev)} is already used by ${u}`; }
      }
      if (d.linkType === 'Optical Fibre') {
        const cab = getA(d.ofcCableId); if (!cab) return 'OFC cable not found'; const cc = parseInt((cab.specs || {}).cores) || 0; const cores = parseCores(d.cores);
        if (!cores.length) return 'Enter fibre cores like 1-2 or 3,4';
        if (cores.some(c => c < 1 || c > cc)) return `${cab.assetTag} has ${cc} cores — check the core numbers`;
        const cl = cores.filter(c => coresUsed(d.ofcCableId, oid).includes(c)); if (cl.length) return `Core(s) ${cl.join(', ')} of ${cab.assetTag} are already used by another link`;
        if (cab.specs.fibreType && d.fibreType !== cab.specs.fibreType) return `${cab.assetTag} is ${cab.specs.fibreType} — fibre type must match`;
        if (cab.specs.lengthM && num(d.distanceM) > num(cab.specs.lengthM)) return `Distance is longer than the cable (${cab.specs.lengthM} m)`;
        if (/^Multi/.test(d.fibreType) && ['1310 nm', '1550 nm'].includes(d.wavelength)) return 'Multi-mode fibre uses 850 / 1300 nm';
        if (/^Single/.test(d.fibreType) && ['850 nm', '1300 nm'].includes(d.wavelength)) return 'Single-mode fibre uses 1310 / 1550 nm';
        if (d.otdrDate && d.otdrDate > today()) return 'Test date cannot be in the future';
      }
    },
  },
  contracts: { validate(d, old) { if (d.endDate < d.startDate) return 'End date cannot be before the start date'; if (DB.contracts.some(c => (!old || c.id !== old.id) && c.contractNumber.toLowerCase() === d.contractNumber.toLowerCase())) return 'Contract number already exists'; } },
  licences: { validate(d) { if (d.startDate && d.expiryDate && d.expiryDate < d.startDate) return 'Expiry cannot be before the start date'; } },
  certificates: { validate(d) { if (d.validFrom && d.expiryDate < d.validFrom) return 'Expiry cannot be before Valid From'; } },
  vendors: { validate(d, old) { if (DB.vendors.some(v => (!old || v.id !== old.id) && v.name.toLowerCase() === d.name.toLowerCase())) return 'A vendor with this name already exists'; if (d.gstin && DB.vendors.some(v => (!old || v.id !== old.id) && (v.gstin || '').toUpperCase() === d.gstin)) return 'GSTIN already registered for another vendor'; } },
  purchases: { validate(d, old, ctx) { if (d.approvalStatus === 'Approved' && (!old || old.approvalStatus !== 'Approved') && !ctx.can('purchases', 'x')) return 'Only a user with Approve permission can approve a purchase'; if (d.deliveryDate && d.deliveryDate < d.orderDate) return 'Delivery date cannot be before the order date'; if (/Delivered/.test(d.deliveryStatus) && d.approvalStatus !== 'Approved') return 'Only approved purchases can be delivered'; } },
  employees: {
    validate(d, old) { if (DB.employees.some(e => (!old || e.id !== old.id) && e.phone && e.phone === d.phone)) return 'Another person already has this mobile number'; if (old && d.active === 'No' && DB.assets.some(a => a.assignedTo === old.id)) return 'This person still holds assets — take them back before marking inactive'; },
    after(r, isNew, prev, ctx) {
      r.history = (prev && prev.history) || r.history || [];
      if (isNew) r.history.push({ at: today(), field: 'Joined record', from: '', to: [r.designation, r.department].filter(Boolean).join(', '), by: ctx.user.name });
      else ['designation', 'department', 'locationId', 'personType', 'active', 'phone', 'address'].forEach(k => { if ((prev[k] || '') !== (r[k] || '')) r.history.push({ at: today(), field: (MODS.employees.fields.find(f => f.k === k) || {}).l || k, from: k === 'locationId' ? label('locations', prev[k]) : prev[k] || '', to: k === 'locationId' ? label('locations', r[k]) : r[k] || '', by: ctx.user.name }); });
    },
  },
  locations: { validate(d, old) { if (old && d.parentId === old.id) return 'A location cannot be its own parent'; let p = d.parentId, n = 0; while (p && n++ < 10) { if (old && p === old.id) return 'This would create a loop in the location tree'; p = (DB.locations.find(l => l.id === p) || {}).parentId; } } },
  users: {
    validate(d, old) {
      if (DB.users.some(u => (!old || u.id !== old.id) && u.username.toLowerCase() === d.username.toLowerCase())) return 'Username already taken';
      if (!old && (d.password || '').length < 6) return 'Password must be at least 6 characters';
      if (old && isLastAdmin(old) && (d.active === 'No' || !((DB.roles.find(r => r.id === d.roleId) || {}).all))) return 'At least one active System Administrator is required';
    },
  },
};

/* ---------- form auto-fill helpers (client): return a patch for vals ---------- */
export const FORM_CHANGE = {
  tempAssignments(key, v) { if (key !== 'borrowerName') return null; const p = findPerson(v.borrowerName); if (!p) return null; return { department: p.department || v.department, borrowerContact: v.borrowerContact || p.phone || '', borrowerType: ['Sewadar', 'Volunteer'].includes(p.personType) ? 'Sewadar' : 'Employee' }; },
  repairJobs(key, v) {
    if (key === 'assetId') { const a = getA(v.assetId); if (!a) return null; const p = DB.employees.find(x => x.id === a.assignedTo); const patch = { serialNumber: a.serialNumber || '', itemDescription: a.assetTag + ' — ' + a.name, siteId: a.locationId || v.siteId }; if (p) Object.assign(patch, { receivedFrom: p.name, department: p.department || '', receivedFromPhone: p.phone || v.receivedFromPhone }); return patch; }
    if (key === 'receivedFrom') { const p = findPerson(v.receivedFrom); if (p) return { department: p.department || v.department, receivedFromPhone: v.receivedFromPhone || p.phone || '' }; }
    return null;
  },
  repairDispatches(key, v) {
    if (key !== 'repairJobId') return null; const j = DB.repairJobs.find(x => x.id === v.repairJobId); if (!j) return null; const a = getA(j.assetId);
    const patch = { itemsSent: a ? a.assetTag + ' — ' + a.name : j.itemDescription || '', serialSent: j.serialNumber || (a && a.serialNumber) || '', accessoriesSent: j.accessoriesReceived || '' };
    if (a && a.warrantyEnd && daysTo(a.warrantyEnd) >= 0) patch.claimType = 'Warranty Claim';
    else if (a && a.amcId) { patch.claimType = 'AMC Claim'; const c = DB.contracts.find(x => x.id === a.amcId); if (c) patch.vendorId = c.vendorId; }
    return patch;
  },
};

/* ---------- workflow actions ----------
   Each action: id, l (label), perm, show(r), and either
   client: true  (handled entirely in the browser: history, print, navigation)
   or run(ctx, r, input) on the server → error string. fields(r, ctx) describe the input form. */
const staffF = (k, l) => ({ k, l, t: 'combo', o: 'staff', r: 1, def: x => x.userName });
const notBefore = (a, b, msg) => (a && b && a < b) ? msg : '';
export const ACTIONS = {
  assets: [
    { id: 'history', l: 'History', perm: 'v', client: true },
    { id: 'ports', l: 'Ports', perm: 'v', client: true, show: r => PORT_CATS.includes(r.categoryId) || (r.ports || []).length },
    { id: 'rack', l: 'Rack View', perm: 'v', client: true, show: r => r.categoryId === 'Rack' || !!(r.specs || {}).rackId },
    { id: 'savePorts', hidden: true, run(ctx, a, o) {
      const ports = (o.ports || []).map(p => ({ no: +p.no, type: String(p.type || ''), status: String(p.status || 'Free'), speed: String(p.speed || ''), vlan: String(p.vlan || ''), poe: String(p.poe || ''), connectedTo: String(p.connectedTo || ''), patch: String(p.patch || ''), remarks: String(p.remarks || ''), ...(p.manual ? { manual: true } : {}) })).filter(p => p.no > 0);
      if (new Set(ports.map(p => p.no)).size !== ports.length) return 'Duplicate port numbers';
      const users = portUsers(a.id); const bad = ports.find(p => users[p.no] && ['Disabled', 'Faulty'].includes(p.status));
      if (bad) ctx.confirm(`Port ${bad.no} is in use by ${users[bad.no]} but marked ${bad.status}. Save anyway?`);
      a.ports = ports; ctx.audit('Ports configured', 'assets', a, ports.length + ' ports');
    } },
    { id: 'mount', hidden: true, run(ctx, a, o) { if (!specsFor(a.categoryId).some(f => f.k === 'uStart')) return a.categoryId + ' is not rack-mountable'; const e = rackCheck(o.rackId, o.uStart, o.uHeight, a.id); if (e) return e; const r = getA(o.rackId); a.specs = Object.assign(a.specs || {}, { rackId: o.rackId, uStart: Number(o.uStart), uHeight: String(o.uHeight || '1') }); if (r.locationId) a.locationId = r.locationId; ctx.audit('Mounted in rack', 'assets', a, `${r.assetTag} U${o.uStart}`); } },
    { id: 'unmount', hidden: true, run(ctx, a) { const r = tagOf((a.specs || {}).rackId); delete a.specs.rackId; delete a.specs.uStart; delete a.specs.uHeight; ctx.audit('Unmounted', 'assets', a, r); } },
  ],
  assignments: [{ id: 'return', l: 'Return', show: r => r.status === 'Active',
    fields: () => [{ k: 'returnedAt', l: 'Return Date', t: 'date', r: 1, def: today }, staffF('returnReceivedBy', 'Received By'), { k: 'returnCondition', l: 'Condition at Return', t: 'select', o: 'conditions', r: 1 }, { k: 'remarks', l: 'Remarks', t: 'textarea', full: 1 }],
    run(ctx, r, o) { const a = getA(r.assetId); if (a.status !== 'Assigned') return `Asset is currently “${a.status}”. Close the open temporary issue / repair / maintenance first.`; const e = notBefore(o.returnedAt, r.assignedAt, 'Return date cannot be before the issue date'); if (e) return e;
      Object.assign(r, { returnedAt: o.returnedAt, returnReceivedBy: o.returnReceivedBy, returnCondition: o.returnCondition, status: 'Returned', notes: [r.notes, o.remarks].filter(Boolean).join('\n') });
      a.assignedTo = ''; a.condition = o.returnCondition; ctx.touch('assets', a); setAssetStatus(ctx, a.id, baseStatus(a), r.refNo + ' returned'); ctx.audit('Returned', 'assignments', r); ctx.notice('Asset returned'); } }],
  tempAssignments: [
    { id: 'approve', l: 'Approve', perm: 'x', show: r => r.status === 'Requested', run(ctx, r) { r.status = 'Approved'; r.approvedBy = ctx.user.name; ctx.audit('Approved', 'tempAssignments', r); ctx.notice(r.issueNumber + ' approved'); } },
    { id: 'issue', l: 'Mark Issued', show: r => r.status === 'Approved', run(ctx, r) { const a = getA(r.assetId); if (!CAN_TEMP.includes(a.status)) return `Asset is “${a.status}”`; r.status = 'Issued'; r.issuedAt = today(); setAssetStatus(ctx, a.id, 'Temporarily Assigned', r.issueNumber); ctx.audit('Issued', 'tempAssignments', r); ctx.notice('Issued'); } },
    { id: 'return', l: 'Return', show: r => r.status === 'Issued',
      fields: r => [{ k: 'returnedAt', l: 'Return Date', t: 'date', r: 1, def: today }, staffF('receivedBy', 'Received By'), { k: 'conditionIn', l: 'Condition at Return', t: 'select', o: 'conditions', r: 1, def: r.conditionOut }, { k: 'accessoriesMissing', l: 'Accessories Missing (blank if none)' }, { k: 'result', l: 'Result', t: 'select', o: ['Returned', 'Returned with Damage', 'Lost'], r: 1, def: 'Returned' }, { k: 'remarks', l: 'Damage / Remarks', t: 'textarea', full: 1 }],
      run(ctx, r, o) { if (o.returnedAt < r.issuedAt) return 'Return date cannot be before the issue date'; if (o.result !== 'Returned' && !o.remarks) return 'Enter remarks for damage / loss';
        Object.assign(r, { returnedAt: o.returnedAt, receivedBy: o.receivedBy, conditionIn: o.conditionIn, accessoriesMissing: o.accessoriesMissing, status: o.result, notes: [r.notes, o.remarks].filter(Boolean).join('\n') });
        const a = getA(r.assetId); a.condition = o.conditionIn; ctx.touch('assets', a); setAssetStatus(ctx, a.id, o.result === 'Lost' ? 'Lost' : o.result === 'Returned with Damage' ? 'Faulty' : baseStatus(a), r.issueNumber + ' ' + o.result.toLowerCase());
        ctx.audit(o.result, 'tempAssignments', r, o.accessoriesMissing ? 'Missing: ' + o.accessoriesMissing : ''); ctx.notice(o.result === 'Returned with Damage' ? 'Returned with damage — asset marked Faulty; open a repair job' : 'Return recorded'); } },
    { id: 'extend', l: 'Extend', show: r => r.status === 'Issued', fields: () => [{ k: 'dueAt', l: 'New Expected Return Date', t: 'date', r: 1 }, { k: 'reason', l: 'Reason', r: 1 }],
      run(ctx, r, o) { if (o.dueAt <= r.dueAt) return 'New date must be after the current due date (' + fmtD(r.dueAt) + ')'; ctx.audit('Extended', 'tempAssignments', r, fmtD(r.dueAt) + ' → ' + fmtD(o.dueAt) + ': ' + o.reason); r.dueAt = o.dueAt; ctx.notice('Due date extended'); } },
    { id: 'slip', l: 'Slip', perm: 'v', client: true, show: r => !['Requested', 'Cancelled'].includes(r.status) },
  ],
  repairJobs: [
    { id: 'toVendor', l: 'Send to Vendor', client: true, show: r => !['Sent to Vendor', 'Handed Over', 'Beyond Economic Repair', 'Ready for Handover', 'Cancelled'].includes(r.status) && !DB.repairDispatches.some(d => d.repairJobId === r.id && d.status !== 'Received Back') },
    { id: 'ready', l: 'Ready', show: r => ['Received', 'Under Diagnosis', 'In-House Repair', 'Awaiting Parts', 'On Hold', 'Received Back', 'Awaiting Approval'].includes(r.status), run(ctx, r) { r.status = 'Ready for Handover'; r.readyAt = today(); ctx.audit('Ready for handover', 'repairJobs', r); ctx.notice(r.jobNumber + ' ready for handover'); } },
    { id: 'handover', l: 'Handover', show: r => r.status === 'Ready for Handover',
      fields: r => [{ k: 'handedOverTo', l: 'Handed Over To', t: 'combo', o: 'persons', r: 1, def: r.receivedFrom }, { k: 'handedOverAt', l: 'Handover Date', t: 'date', r: 1, def: today }, staffF('handoverBy', 'Handed Over By (IT)'), { k: 'condition', l: 'Condition at Handover', t: 'select', o: 'conditions', r: 1, def: 'Good' }, { k: 'ack', l: 'Acknowledgement', t: 'select', o: ['Signed', 'Verbal'], def: 'Signed', r: 1 }],
      run(ctx, r, o) { if (o.handedOverAt < r.receivedAt) return 'Handover cannot be before the received date';
        Object.assign(r, { handedOverTo: o.handedOverTo, handedOverAt: o.handedOverAt, handoverBy: o.handoverBy, status: 'Handed Over' });
        if (r.assetId) { const a = getA(r.assetId); a.condition = o.condition; ctx.touch('assets', a); setAssetStatus(ctx, a.id, baseStatus(a), r.jobNumber + ' handed over'); }
        const sb = DB.tempAssignments.find(t => t.linkedRepairJobId === r.id && t.status === 'Issued');
        ctx.audit('Handed over', 'repairJobs', r, 'To ' + o.handedOverTo); ctx.notice(sb ? `Handed over. Recall standby ${sb.issueNumber} from ${sb.borrowerName}.` : 'Handed over — job closed'); } },
    { id: 'ber', l: 'Beyond Repair', confirmText: 'Mark this job as Beyond Economic Repair? A tagged asset will be marked Retired.', show: r => !['Handed Over', 'Beyond Economic Repair', 'Sent to Vendor', 'Cancelled'].includes(r.status),
      run(ctx, r) { r.status = 'Beyond Economic Repair'; r.repairMode = 'Beyond Economic Repair'; if (r.assetId) setAssetStatus(ctx, r.assetId, 'Retired', r.jobNumber + ' BER'); ctx.audit('Beyond economic repair', 'repairJobs', r); } },
    { id: 'jobcard', l: 'Job Card', perm: 'v', client: true },
  ],
  repairDispatches: [
    { id: 'quote', l: 'Quote', show: r => r.status !== 'Received Back',
      fields: (r, ctx) => [{ k: 'quoteAmount', l: 'Quotation Amount (₹)', t: 'number', r: 1, def: r.quoteAmount }, { k: 'approvalStatus', l: 'Approval', t: 'select', o: ctx.can('repairDispatches', 'x') ? ['Awaiting Approval', 'Approved', 'Rejected'] : ['Awaiting Approval'], r: 1, def: 'Awaiting Approval' }, { k: 'note', l: 'Follow-up Note', full: 1 }],
      run(ctx, r, o) { if (o.approvalStatus !== 'Awaiting Approval' && !ctx.can('repairDispatches', 'x')) return 'Only a user with Approve permission can approve or reject a quote';
        Object.assign(r, { quoteAmount: Number(o.quoteAmount), approvalStatus: o.approvalStatus, status: o.approvalStatus === 'Awaiting Approval' ? 'Quote Awaiting Approval' : 'Under Vendor Repair' }); if (o.approvalStatus !== 'Awaiting Approval') r.approvedBy = ctx.user.name;
        if (o.note) r.followUpNotes = [r.followUpNotes, fmtD(today()) + ': ' + o.note].filter(Boolean).join('\n');
        ctx.audit('Quote ' + o.approvalStatus.toLowerCase(), 'repairDispatches', r, money(o.quoteAmount)); ctx.notice('Quote recorded'); } },
    { id: 'followup', l: 'Follow-up', show: r => r.status !== 'Received Back', fields: r => [{ k: 'note', l: 'Note', r: 1, full: 1 }, { k: 'expectedReturnAt', l: 'Revised Expected Return', t: 'date', def: r.expectedReturnAt }],
      run(ctx, r, o) { if (o.expectedReturnAt && o.expectedReturnAt < r.sentAt) return 'Date cannot be before the sent date'; r.followUpNotes = [r.followUpNotes, fmtD(today()) + ': ' + o.note].filter(Boolean).join('\n'); if (o.expectedReturnAt) r.expectedReturnAt = o.expectedReturnAt; ctx.audit('Follow-up', 'repairDispatches', r, o.note); ctx.notice('Follow-up saved'); } },
    { id: 'receive', l: 'Receive Back', wide: true, show: r => r.status !== 'Received Back',
      fields: r => [{ k: 'receivedBackAt', l: 'Received Date', t: 'date', r: 1, def: today }, staffF('receivedBy', 'Received By'), { k: 'serialReturned', l: 'Serial No. on Returned Item', r: 1, hint: 'Sent: ' + r.serialSent }, { k: 'outcome', l: 'Outcome', t: 'select', o: ['Repaired', 'Replaced by Vendor', 'Returned Unrepaired', 'Beyond Economic Repair'], r: 1 }, { k: 'invoiceNumber', l: 'Invoice No.' }, { k: 'finalCost', l: 'Final Cost (₹)', t: 'number', def: r.claimType === 'Paid Repair' ? r.quoteAmount : 0 }, { k: 'parts', l: 'Parts Replaced by Vendor', t: 'table', cols: PARTS_COLS }, { k: 'report', l: 'Vendor Work Report', t: 'textarea', full: 1 }],
      run(ctx, r, o) {
        if (o.receivedBackAt < r.sentAt) return 'Received date cannot be before the sent date';
        if (r.claimType === 'Paid Repair' && o.outcome === 'Repaired' && !['Approved', 'Not Required'].includes(r.approvalStatus) && num(o.finalCost) > 0) return 'Quote is not approved — record the quote approval first';
        const match = String(o.serialReturned).replace(/\s/g, '').toLowerCase() === String(r.serialSent).replace(/\s/g, '').toLowerCase();
        if (!match && o.outcome !== 'Replaced by Vendor') ctx.confirm('Serial number does NOT match the one sent (' + r.serialSent + '). Record anyway?');
        Object.assign(r, { receivedBackAt: o.receivedBackAt, receivedBy: o.receivedBy, serialReturned: o.serialReturned, serialVerified: match ? 'Yes' : (o.outcome === 'Replaced by Vendor' ? 'Replaced' : 'Mismatch'), outcome: o.outcome, invoiceNumber: o.invoiceNumber, finalCost: num(o.finalCost), status: 'Received Back' });
        if (o.report) r.followUpNotes = [r.followUpNotes, 'Vendor report: ' + o.report].filter(Boolean).join('\n');
        const j = DB.repairJobs.find(x => x.id === r.repairJobId);
        if (j) {
          j.partsReplaced = [...(j.partsReplaced || []), ...(o.parts || []).map(p => Object.assign({}, p, { source: p.source || 'Vendor Supplied', unitCost: p.unitCost || 0 }))];
          j.vendorCost = num(j.vendorCost) + num(o.finalCost); j.partsCost = partsTotal(j.partsReplaced); j.cost = num(j.labourCost) + j.partsCost + j.vendorCost;
          j.diagnosis = [j.diagnosis, `Vendor (${label('vendors', r.vendorId)}): ${o.outcome}${o.report ? ' — ' + o.report : ''}`].filter(Boolean).join('\n');
          if (o.outcome === 'Beyond Economic Repair') { j.status = 'Beyond Economic Repair'; if (j.assetId) setAssetStatus(ctx, j.assetId, 'Retired', r.gatePassNumber + ' BER'); }
          else { j.status = 'Received Back'; if (j.assetId) { const a = getA(j.assetId); if (o.outcome === 'Replaced by Vendor' && o.serialReturned) { ctx.audit('Serial changed', 'assets', a, a.serialNumber + ' → ' + o.serialReturned + ' (vendor replacement)'); a.serialNumber = o.serialReturned; ctx.touch('assets', a); } setAssetStatus(ctx, j.assetId, 'In Repair (In-House)', r.gatePassNumber + ' received back'); } }
          ctx.touch('repairJobs', j); ctx.audit('Received back', 'repairJobs', j, o.outcome);
        }
        ctx.audit('Gate pass closed', 'repairDispatches', r, o.outcome + (match ? '' : ' (serial ' + r.serialVerified + ')'));
        ctx.notice('Received back — gate pass closed. Hand over from Repair Inward.');
      } },
    { id: 'gatepass', l: 'Gate Pass', perm: 'v', client: true },
  ],
  contracts: [{ id: 'visits', l: 'Visits', perm: 'v', client: true }, { id: 'addVisit', l: '+ Visit', perm: 'v', client: true }],
  employees: [{ id: 'history', l: 'History', perm: 'v', client: true },
    { id: 'addHistory', hidden: true, fields: () => [{ k: 'at', l: 'Date', t: 'date', r: 1, def: today }, { k: 'field', l: 'Type', t: 'select', o: ['Promotion', 'Transfer', 'Role Change', 'Training', 'Award / Recognition', 'Leave', 'Note'], r: 1 }, { k: 'to', l: 'Details', t: 'textarea', r: 1, full: 1 }],
      run(ctx, p, o) { p.history = p.history || []; p.history.push({ at: o.at, field: o.field, from: '', to: o.to, by: ctx.user.name }); ctx.audit('History entry', 'employees', p, o.field); } }],
  vendors: [{ id: 'history', l: 'History', perm: 'v', client: true }],
  users: [{ id: 'resetPassword', l: 'Reset Password', fields: () => [{ k: 'pw', l: 'New Password', t: 'password', r: 1 }, { k: 'pw2', l: 'Confirm Password', t: 'password', r: 1 }],
    run(ctx, u, o) { if (String(o.pw).length < 6) return 'Password must be at least 6 characters'; if (o.pw !== o.pw2) return 'Passwords do not match'; ctx.setPassword(u, o.pw); ctx.audit('Password reset', 'users', u); ctx.notice('Password changed for ' + u.username); } }],
};
export const findAction = (mod, id) => (ACTIONS[mod] || []).find(a => a.id === id);

/* ---------- parts register across repairs, maintenance and AMC visits ---------- */
export function allParts() {
  const out = [];
  (DB.repairJobs || []).forEach(j => (j.partsReplaced || []).forEach(p => out.push(Object.assign({ date: j.handedOverAt || j.receivedAt, src: 'Repair ' + j.jobNumber, assetId: j.assetId, item: j.assetId ? label('assets', j.assetId) : j.itemDescription }, p))));
  (DB.maintenance || []).forEach(m => (m.partsReplaced || []).forEach(p => out.push(Object.assign({ date: m.resolvedAt || m.reportedAt, src: 'Maintenance ' + m.refNo, assetId: m.assetId, item: label('assets', m.assetId) }, p))));
  (DB.amcVisits || []).forEach(v => (v.partsReplaced || []).forEach(p => out.push(Object.assign({ date: v.visitDate, src: 'AMC Visit ' + v.visitNo, assetId: (v.assetsServiced || [])[0], item: (v.assetsServiced || []).map(tagOf).join(', ') }, p))));
  return out.sort((a, b) => String(b.date).localeCompare(String(a.date)));
}

/* ---------- reference counting (prevent deleting referenced records) ---------- */
export function refCount(mod, id) {
  let n = 0;
  Object.entries(MODS).forEach(([k, m]) => m.fields.forEach(f => {
    if ((f.t === 'ref' && f.c === mod) || (mod === 'assets' && f.t === 'aref')) n += (DB[k] || []).filter(r => r[f.k] === id && !(k === mod && r.id === id)).length;
    if (mod === 'assets' && f.t === 'multiref') n += (DB[k] || []).filter(r => Array.isArray(r[f.k]) && r[f.k].includes(id)).length;
  }));
  if (mod === 'assets') n += DB.assets.filter(a => a.id !== id && Object.values(a.specs || {}).includes(id)).length;
  if (mod === 'roles') n += DB.users.filter(u => u.roleId === id).length;
  return n;
}
export { clone, uniq, GONE };
