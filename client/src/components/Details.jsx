/* Asset history, person / vendor history, port configuration, row actions */
import React, { useEffect, useState } from 'react';
import { DB, dispStatus, fmtD, fmtDT, num, money, daysTo, label, tagOf, getA, profile, specsFor, catGroupOf, camerasOn, rackDevices, coresUsed, portList, portUsers, basePorts, PORT_CATS } from '@shared/core.js';
import { MODS } from '@shared/modules.js';
import { allParts, findAction } from '@shared/engine.js';
import { api, useApp, Modal, Badge, Expiry, SimpleTable, printSlip } from '../lib.jsx';
import RecordForm, { ActionForm, registerAssetDetail } from './RecordForm.jsx';
import { calcText, Select } from './Field.jsx';
import { navigate } from '../router.js';

const Link = ({ id, children }) => { const { openModal } = useApp(); return <span className="link" onClick={() => openModal(<AssetDetail id={id} />)}>{children}</span>; };
export const assetLink = (id, text) => id ? <Link id={id}>{text || (tagOf(id) + ' — ' + ((getA(id) || {}).name || ''))}</Link> : null;

function SubTable({ title, mod, rows, cols }) {
  const { openModal } = useApp();
  const fm = Object.fromEntries(MODS[mod].fields.filter(f => f.k).map(f => [f.k, f]));
  return <><h4>{title} ({rows.length})</h4>{rows.length ? <div className="tw"><table><thead><tr>{cols.map(k => <th key={k}>{fm[k].l}</th>)}</tr></thead><tbody>
    {rows.map(r => <tr key={r.id} style={{ cursor: 'pointer' }} onClick={() => openModal(<RecordForm mod={mod} id={r.id} view />)}>{cols.map(k => <td key={k}><Cell mod={mod} f={fm[k]} r={r} /></td>)}</tr>)}</tbody></table></div> : <div className="muted">None</div>}</>;
}

/* table cell renderer shared with list pages */
const DATE_EXPIRY = { warrantyEnd: 1, endDate: 1, expiryDate: 1, nextVisitAt: 1, nextServiceAt: 1 };
export function dispText(f, v) {
  if (v == null || v === '' || (Array.isArray(v) && !v.length)) return '';
  switch (f.t) {
    case 'ref': return label(f.c, v);
    case 'aref': return tagOf(v) ? tagOf(v) + ' — ' + (getA(v) || {}).name : '(deleted)';
    case 'multiref': return v.map(id => tagOf(id) || '?').join(', ');
    case 'table': return v.length + ' item(s): ' + v.map(p => p.part || p.partType).filter(Boolean).join(', ');
    case 'date': return fmtD(v);
    case 'datetime': return fmtDT(v);
    case 'number': case 'calc': return calcText(f, v);
    default: return String(v);
  }
}
export function Cell({ mod, f, r }) {
  const v = f.listOnly ? f.calc(r) : r[f.k];
  if (f.k === 'status') return <Badge s={dispStatus(mod, r)} />;
  if (/[sS]tatus$/.test(f.k) || ['active', 'priority', 'serialVerified', 'lossResult', 'outcome'].includes(f.k)) return <Badge s={v} />;
  if (f.t === 'ref' && f.c === 'locations') { const t = label(f.c, v); return <span style={{ display: 'inline-block', minWidth: 140 }} title={t}>{t.split(' › ').slice(-2).join(' › ')}</span>; }
  if ((f.t === 'ref' && f.c === 'assets') || f.t === 'aref') return v ? <span onClick={e => e.stopPropagation()}>{assetLink(v, f.t === 'aref' ? null : label('assets', v))}</span> : null;
  if (f.t === 'date' && (DATE_EXPIRY[f.k] || (mod === 'tempAssignments' && f.k === 'dueAt'))) return ['Renewed', 'Not Required', 'Returned'].includes(r.renewalStatus || r.status) ? fmtD(v) : <Expiry d={v} />;
  return dispText(f, v);
}

export function AssetDetail({ id }) {
  const { openModal, replaceModal, closeModal, can } = useApp();
  const a = getA(id); const [audit, setAudit] = useState(null);
  useEffect(() => { if (a) api('/audit?ref=' + encodeURIComponent(a.assetTag) + '&limit=60').then(r => setAudit(r.entries), () => setAudit([])); }, [id]);
  if (!a) return <Modal title="Asset not found"><p>This asset no longer exists.</p></Modal>;
  const jobs = DB.repairJobs.filter(j => j.assetId === id); const disp2 = DB.repairDispatches.filter(d => jobs.some(j => j.id === d.repairJobId));
  const fs = specsFor(a.categoryId).filter(f => f.t === 'calc' || ((a.specs || {})[f.k] !== undefined && a.specs[f.k] !== ''));
  const p = profile(a.categoryId); const sh = k => p.show.includes(k);
  const links = DB.networkLinks.filter(l => [l.sourceDeviceId, l.destinationDeviceId, l.sourceLiuId, l.destLiuId, l.ofcCableId, l.patchPanelId].includes(id));
  const connected = DB.assets.filter(x => x.connSwitch === id);
  const parts = allParts().filter(x => x.assetId === id || (x.item || '').includes(a.assetTag));
  const visits = DB.amcVisits.filter(v => (v.assetsServiced || []).includes(id));
  const media = MODS.networkLinks.fields.find(f => f.k === '_media');
  const uRange = d => 'U' + d.specs.uStart + ((parseInt(d.specs.uHeight) || 1) > 1 ? '–' + (num(d.specs.uStart) + (parseInt(d.specs.uHeight) || 1) - 1) : '');
  return <Modal title={`${a.assetTag} — ${a.name}`} wide footer={<>
    {PORT_CATS.includes(a.categoryId) && <button className="btn" onClick={() => replaceModal(<PortsEditor id={id} />)}>Ports</button>}
    {can('assets', 'e') && <button className="btn" onClick={() => replaceModal(<RecordForm mod="assets" id={id} />)}>Edit Asset</button>}
    <button className="btn pri" onClick={closeModal}>Close</button></>}>
    <div className="tl">
      <div className="kv">
        <div><span>Status</span><Badge s={a.status} /></div><div><span>Category</span>{a.categoryId} <span className="muted">· {catGroupOf(a.categoryId)}</span></div>
        {(sh('manufacturer') || sh('model')) && <div><span>Make / Model</span>{[a.manufacturer, a.model].filter(Boolean).join(' ') || '—'}</div>}
        {sh('serialNumber') && <div><span>Serial No.</span>{a.serialNumber || '—'}</div>}
        {sh('ipAddress') && <div><span>IP / MAC</span>{[a.ipAddress, a.macAddress].filter(Boolean).join(' · ') || '—'}</div>}
        {sh('connSwitch') && a.connSwitch && <div><span>Connected To</span>{assetLink(a.connSwitch, tagOf(a.connSwitch))} port {a.connPort}{a.jackId ? ' · jack ' + a.jackId : ''}</div>}
        <div><span>Location</span>{label('locations', a.locationId)}</div><div><span>Custodian</span>{label('employees', a.assignedTo) || '—'}</div>
        <div><span>Condition</span>{a.condition}</div>
        {(sh('purchaseDate') || sh('purchaseCost')) && <div><span>Purchase</span>{fmtD(a.purchaseDate)} {money(a.purchaseCost)}</div>}
        {sh('warrantyEnd') && <div><span>Warranty</span>{a.warrantyEnd ? <Expiry d={a.warrantyEnd} /> : '—'}</div>}
        {a.amcId && <div><span>AMC</span>{label('contracts', a.amcId)}</div>}
        <div><span>Repairs</span>{jobs.length}{jobs.length >= 2 && <> <span className="b bad">Repeated failures</span></>} · {money(jobs.reduce((s, j) => s + num(j.cost), 0)) || '₹ 0'}</div>
      </div>
      <h4>{a.categoryId} Specifications</h4>
      {fs.length ? <div className="kv">{fs.map(f => { const v = f.t === 'calc' ? f.calc(a.specs || {}, a) : a.specs[f.k]; return <div key={f.k}><span>{f.l}</span>{f.t === 'aref' ? assetLink(v, tagOf(v)) : f.exp ? <Expiry d={v} /> : dispText(f, v)}</div>; })}</div> : <div className="muted">Not recorded</div>}
      {a.categoryId === 'NVR' && <><h4>Camera Channel Map ({camerasOn(id).length} / {(a.specs || {}).channels || 0})</h4><SimpleTable head={['Channel', 'Camera', 'IP', 'Location', 'Status']} rows={camerasOn(id).sort((x, y) => +x.specs.channel - +y.specs.channel).map(c => [c.specs.channel, assetLink(c.id), c.ipAddress, label('locations', c.locationId), <Badge s={c.status} />])} /></>}
      {a.categoryId === 'Rack' && <><h4>Mounted Devices ({rackDevices(id).length})</h4><SimpleTable head={['U', 'Device', 'Category', 'Status']} rows={rackDevices(id).sort((x, y) => num(y.specs.uStart) - num(x.specs.uStart)).map(d => [uRange(d), assetLink(d.id), d.categoryId, <Badge s={d.status} />])} /></>}
      {connected.length > 0 && <><h4>Devices Connected ({connected.length})</h4><SimpleTable head={['Port', 'Device', 'IP', 'Jack']} rows={connected.sort((x, y) => num(x.connPort) - num(y.connPort)).map(d => [d.connPort, assetLink(d.id), d.ipAddress, d.jackId])} /></>}
      {a.categoryId === 'OFC Cable' && <><h4>Core Usage ({coresUsed(id).length} / {(a.specs || {}).cores || 0})</h4><SimpleTable head={['Link', 'Cores', 'From', 'To', 'Result']} rows={DB.networkLinks.filter(l => l.ofcCableId === id).map(l => [l.refNo, l.cores, tagOf(l.sourceDeviceId), tagOf(l.destinationDeviceId), <Badge s={l.lossResult} />])} /></>}
      {links.length > 0 && <><h4>Network / Fibre Links ({links.length})</h4><SimpleTable head={['Ref', 'Type', 'From', 'To', 'Media', 'Status']} rows={links.map(l => [l.refNo, l.linkType, tagOf(l.sourceDeviceId) + ' p' + (l.sourcePort || '-'), tagOf(l.destinationDeviceId) + ' p' + (l.destinationPort || '-'), media.calc(l), <Badge s={l.status} />])} /></>}
      <SubTable title="Permanent Assignments" mod="assignments" rows={DB.assignments.filter(x => x.assetId === id)} cols={['refNo', 'employeeId', 'assignedAt', 'returnedAt', 'status']} />
      <SubTable title="Temporary Issues" mod="tempAssignments" rows={DB.tempAssignments.filter(x => x.assetId === id)} cols={['issueNumber', 'borrowerName', 'purpose', 'issuedAt', 'dueAt', 'status']} />
      <SubTable title="Repair Jobs (Inward)" mod="repairJobs" rows={jobs} cols={['jobNumber', 'receivedAt', 'reportedFault', 'cost', 'status']} />
      <SubTable title="Outward Dispatches" mod="repairDispatches" rows={disp2} cols={['gatePassNumber', 'vendorId', 'sentAt', 'expectedReturnAt', 'status']} />
      <SubTable title="Maintenance" mod="maintenance" rows={DB.maintenance.filter(x => x.assetId === id)} cols={['refNo', 'issueType', 'reportedAt', 'technician', 'cost', 'status']} />
      <SubTable title="AMC Visits" mod="amcVisits" rows={visits} cols={['visitNo', 'visitDate', 'visitType', 'engineer', 'status']} />
      <h4>Parts Replaced ({parts.length})</h4><SimpleTable head={['Date', 'Source', 'Part', 'Type', 'Old S/N', 'New S/N', 'Qty', 'Cost']} rows={parts.map(x => [fmtD(x.date), x.src, x.part, x.partType, x.oldSerial, x.newSerial, x.qty, money(num(x.qty || 1) * num(x.unitCost))])} />
      <h4>Audit Trail</h4>{audit === null ? <div className="muted">Loading…</div> : audit.length ? audit.map(x => <div className="alert" key={x.id}><span className="muted" style={{ width: 150, flexShrink: 0 }}>{fmtDT(x.at)}</span><span><b>{x.action}</b> {x.module} {x.ref} · {x.user} <span className="muted">{x.detail}</span></span></div>) : <div className="muted">No entries</div>}
    </div>
  </Modal>;
}
registerAssetDetail(AssetDetail);

export function PersonHistory({ id }) {
  const { can, openModal, replaceModal, closeModal } = useApp();
  const p = DB.employees.find(x => x.id === id); if (!p) return null; const nm = (p.name || '').toLowerCase();
  const held = DB.assets.filter(a => a.assignedTo === id);
  const temps = DB.tempAssignments.filter(t => t.employeeId === id || (t.borrowerName || '').toLowerCase() === nm);
  const reps = DB.repairJobs.filter(j => (j.receivedFrom || '').toLowerCase() === nm || (j.handedOverTo || '').toLowerCase() === nm);
  const mnt = DB.maintenance.filter(m => (m.reportedBy || '').toLowerCase() === nm || (m.technician || '').toLowerCase() === nm);
  const addEntry = () => openModal(<ActionForm mod="employees" rec={p} action={findAction('employees', 'addHistory')} title={'Add History Entry — ' + p.name} />);
  return <Modal title={`${p.name} — ${p.employeeCode}`} wide footer={<>{can('employees', 'e') && <><button className="btn" onClick={addEntry}>+ Add History Entry</button><button className="btn" onClick={() => replaceModal(<RecordForm mod="employees" id={id} />)}>Edit</button></>}<button className="btn pri" onClick={closeModal}>Close</button></>}>
    <div className="tl"><div className="kv"><div><span>Type</span>{p.personType}</div><div><span>Designation</span>{p.designation || '—'}</div><div><span>Department</span>{p.department}</div>
      <div><span>Mobile</span>{p.phone || '—'}{p.altPhone ? ' / ' + p.altPhone : ''}</div><div><span>Email</span>{p.email || '—'}</div><div><span>Location</span>{label('locations', p.locationId) || '—'}</div>
      <div><span>Joined</span>{fmtD(p.joiningDate) || '—'}</div><div><span>Active</span><Badge s={p.active} /></div><div style={{ gridColumn: '1/-1' }}><span>Address</span>{p.address || '—'}{p.pincode ? ' — ' + p.pincode : ''}</div></div>
      <h4>Employment / Record History ({(p.history || []).length})</h4><SimpleTable head={['Date', 'Change', 'From', 'To', 'By']} rows={(p.history || []).slice().reverse().map(h => [fmtD(h.at), h.field, h.from, h.to, h.by])} />
      <h4>Assets Currently Held ({held.length})</h4><SimpleTable head={['Asset', 'Category', 'Serial', 'Status']} rows={held.map(a => [assetLink(a.id), a.categoryId, a.serialNumber, <Badge s={a.status} />])} />
      <SubTable title="Permanent Assignments" mod="assignments" rows={DB.assignments.filter(x => x.employeeId === id)} cols={['refNo', 'assetId', 'assignedAt', 'returnedAt', 'status']} />
      <SubTable title="Temporary Issues" mod="tempAssignments" rows={temps} cols={['issueNumber', 'assetId', 'purpose', 'issuedAt', 'dueAt', 'status']} />
      <SubTable title="Items Given for Repair" mod="repairJobs" rows={reps} cols={['jobNumber', 'itemDescription', 'receivedAt', 'reportedFault', 'status']} />
      <SubTable title="Maintenance (reported / attended)" mod="maintenance" rows={mnt} cols={['refNo', 'assetId', 'issueType', 'reportedAt', 'status']} />
    </div></Modal>;
}

export function VendorHistory({ id }) {
  const { can, replaceModal, closeModal } = useApp();
  const v = DB.vendors.find(x => x.id === id); if (!v) return null; const nm = v.name.toLowerCase();
  const pos = DB.purchases.filter(p => p.vendorId === id); const cons = DB.contracts.filter(c => c.vendorId === id);
  const visits = DB.amcVisits.filter(x => cons.some(c => c.id === x.contractId)); const disps = DB.repairDispatches.filter(d => d.vendorId === id);
  const done = disps.filter(d => d.status === 'Received Back'); const tat = done.length ? (done.reduce((s, d) => s + daysTo(d.receivedBackAt) - daysTo(d.sentAt), 0) / done.length).toFixed(1) : '—';
  const supplied = DB.assets.filter(a => a.vendorId === id);
  return <Modal title={`${v.name} — ${v.code}`} wide footer={<>{can('vendors', 'e') && <button className="btn" onClick={() => replaceModal(<RecordForm mod="vendors" id={id} />)}>Edit</button>}<button className="btn pri" onClick={closeModal}>Close</button></>}>
    <div className="tl"><div className="kv"><div><span>Category</span>{v.serviceCategory}</div><div><span>Status</span><Badge s={v.status} /></div><div><span>Contact</span>{v.contactPerson} · {v.phone}</div><div><span>Email</span>{v.email || '—'}</div><div><span>GSTIN</span>{v.gstin || '—'}</div>
      <div><span>Total Purchases</span>{money(pos.reduce((s, p) => s + num(p.totalAmount), 0)) || '₹ 0'}</div><div><span>Repairs Sent / Avg Turnaround</span>{disps.length} / {tat} days</div><div><span>Serial Mismatches</span>{done.filter(d => d.serialVerified === 'Mismatch').length}</div>
      <div style={{ gridColumn: '1/-1' }}><span>Address</span>{v.address || '—'}{v.city ? ', ' + v.city : ''}{v.pincode ? ' — ' + v.pincode : ''}</div></div>
      <SubTable title="Purchase Orders" mod="purchases" rows={pos} cols={['poNumber', 'items', 'orderDate', 'totalAmount', 'deliveryStatus']} />
      <SubTable title="AMC / Contracts" mod="contracts" rows={cons} cols={['contractNumber', 'contractType', 'endDate', 'cost', 'renewalStatus']} />
      <SubTable title="AMC Visits" mod="amcVisits" rows={visits} cols={['visitNo', 'visitDate', 'visitType', 'engineer', 'status']} />
      <SubTable title="Repairs Sent (Gate Passes)" mod="repairDispatches" rows={disps} cols={['gatePassNumber', 'itemsSent', 'sentAt', 'expectedReturnAt', 'status']} />
      <h4>Assets Supplied ({supplied.length})</h4><SimpleTable head={['Asset', 'Category', 'Purchase Date', 'Warranty']} rows={supplied.map(a => [assetLink(a.id), a.categoryId, fmtD(a.purchaseDate), <Expiry d={a.warrantyEnd} />])} />
      <SubTable title="Maintenance Attended" mod="maintenance" rows={DB.maintenance.filter(m => (m.technician || '').toLowerCase() === nm)} cols={['refNo', 'assetId', 'issueType', 'reportedAt', 'status']} />
    </div></Modal>;
}

export function PortsEditor({ id }) {
  const { can, mutate, closeModal, toast } = useApp();
  const a = getA(id); const ed = can('assets', 'e'); const users = portUsers(a.id);
  const poe = a.categoryId === 'PoE Switch' || (/PoE/.test((a.specs || {}).poe || '') && !/^No/.test(a.specs.poe));
  const types = a.categoryId === 'LIU / ODF' ? ['Fibre LC', 'Fibre SC', 'Fibre FC', 'Fibre ST', 'MTP/MPO'] : a.categoryId === 'Patch Panel' ? ['RJ45'] : ['RJ45', 'SFP', 'SFP+', 'SFP28', 'QSFP', 'Fibre LC', 'Fibre SC', 'Console'];
  const [rows, setRows] = useState(() => portList(a).map(p => ({ ...p, speed: p.speed || 'Auto', poe: p.poe || (users[p.no] ? 'On' : 'Off'), status: users[p.no] && (!p.status || p.status === 'Free') ? 'Active' : p.status || 'Free' })));
  const [busy, setBusy] = useState(false);
  const set = (i, k, v) => setRows(r => r.map((x, j) => j === i ? { ...x, [k]: v } : x));
  const base = basePorts(a) + num((a.specs || {}).sfpPorts); const inUse = rows.filter(p => users[p.no] || p.status === 'Active').length;
  const save = async () => { setBusy(true); try { const r = await mutate(c => api(`/assets/${id}/action/savePorts`, { method: 'POST', body: { input: { ports: rows }, confirmed: c } }), { quiet: true }); if (r) { closeModal(); toast('Ports saved for ' + a.assetTag); } else setBusy(false); } catch (e) { toast(e.message, 1); setBusy(false); } };
  const inp = (i, k, w) => <input value={rows[i][k] ?? ''} disabled={!ed} style={w ? { width: w } : undefined} onChange={e => set(i, k, e.target.value)} data-c={k} />;
  return <Modal title={`Port Configuration — ${a.assetTag} ${a.name}`} wide footer={ed ? <><button className="btn" onClick={() => { const n = rows.reduce((m, r) => Math.max(m, r.no), 0) + 1; setRows([...rows, { no: n, type: types[0], status: 'Free', speed: 'Auto', poe: 'Off', manual: true }]); }}>+ Add Port</button><button className="btn" onClick={closeModal}>Cancel</button><button className="btn pri" disabled={busy} onClick={save}>Save Ports</button></> : <button className="btn pri" onClick={closeModal}>Close</button>}>
    <div className="flow"><span>{base} ports from specification</span><span>{rows.filter(p => p.manual).length} added manually</span><span>{inUse} in use</span><span>{rows.length - inUse} free</span><em>Ports used by assets or links show automatically. Configuring ports is optional.</em></div>
    {!rows.length && <p className="muted">No ports yet — set the port count in the asset’s specifications, or add ports below.</p>}
    <div className="tw"><table className="pt"><thead><tr><th>Port</th><th>Type</th><th>Status</th><th>Speed</th><th>VLAN</th>{poe && <th>PoE</th>}<th>Connected To</th><th>Patch / Jack / Cable</th><th>Remarks</th>{ed && <th />}</tr></thead>
      <tbody id="ptb">{rows.map((p, i) => <tr key={p.no}><td><b>{p.no}</b>{p.manual && <> <span className="b grey">manual</span></>}</td>
        <td><Select opts={types} value={p.type} disabled={!ed} onChange={v => set(i, 'type', v)} /></td>
        <td><Select opts={['Free', 'Active', 'Reserved', 'Disabled', 'Faulty']} value={p.status} disabled={!ed} onChange={v => set(i, 'status', v)} /></td>
        <td><Select opts={['Auto', '10/100M', '1G', '10G', '25G']} value={p.speed} disabled={!ed} onChange={v => set(i, 'speed', v)} /></td><td>{inp(i, 'vlan', 70)}</td>
        {poe && <td><Select opts={['On', 'Off']} value={p.poe} disabled={!ed} onChange={v => set(i, 'poe', v)} /></td>}
        <td>{users[p.no] ? <span className="b info" title="Automatic from asset / link">{users[p.no]}</span> : inp(i, 'connectedTo')}</td><td>{inp(i, 'patch')}</td><td>{inp(i, 'remarks')}</td>
        {ed && <td>{p.manual && !users[p.no] && <button className="btn sm red" onClick={() => setRows(rows.filter((_, j) => j !== i))}>✕</button>}</td>}</tr>)}</tbody></table></div>
  </Modal>;
}

/* Row actions: client-side ones open views / print; others open an action form or run directly on the server */
export function useRowAction() {
  const app = useApp(); const { openModal, mutate, toast, can, me } = app;
  return async (mod, a, r) => {
    if (!can(mod, a.perm || 'e')) return toast('You do not have permission', 1);
    if (a.client) {
      const k = mod + '.' + a.id;
      if (k === 'assets.history') return openModal(<AssetDetail id={r.id} />);
      if (k === 'assets.ports') return openModal(<PortsEditor id={r.id} />);
      if (k === 'assets.rack') return can('racks', 'v') ? navigate('racks', { rack: r.categoryId === 'Rack' ? r.id : r.specs.rackId }) : toast('No access to Rack Layout', 1);
      if (k === 'repairJobs.toVendor') return can('repairDispatches', 'a') ? openModal(<RecordForm mod="repairDispatches" preset={{ repairJobId: r.id }} />) : toast('No permission to create gate passes', 1);
      if (k === 'contracts.visits') return can('amcVisits', 'v') ? navigate('amcVisits', { f_contractId: r.id }) : toast('No access to AMC Visits', 1);
      if (k === 'contracts.addVisit') return can('amcVisits', 'a') ? openModal(<RecordForm mod="amcVisits" preset={{ contractId: r.id }} />) : toast('No permission', 1);
      if (k === 'employees.history') return openModal(<PersonHistory id={r.id} />);
      if (k === 'vendors.history') return openModal(<VendorHistory id={r.id} />);
      const ok = k === 'tempAssignments.slip' ? printSlip('Temporary Issue Slip', r.issueNumber, [['Asset', label('assets', r.assetId)], ['Borrower', r.borrowerName + ' (' + r.borrowerType + ')'], ['Mobile', r.borrowerContact], ['Department', r.department], ['Purpose', r.purpose], ['Site', label('locations', r.siteId)], ['Issue Date', fmtD(r.issuedAt)], ['Return By', fmtD(r.dueAt)], ['Condition', r.conditionOut], ['Accessories', r.accessoriesOut], ['Issued By', r.issuedBy]], ['Borrower Signature', 'Issued By', 'Received Back By'], me.name)
        : k === 'repairJobs.jobcard' ? printSlip('Repair Job Card', r.jobNumber, [['Item', r.assetId ? label('assets', r.assetId) : r.itemDescription], ['Serial No.', r.serialNumber], ['Received From', [r.receivedFrom, r.department, r.receivedFromPhone].filter(Boolean).join(' / ')], ['Received On', fmtD(r.receivedAt)], ['Received By', r.receivedBy], ['Accessories', r.accessoriesReceived], ['Condition', r.conditionOnReceipt], ['Fault', r.reportedFault], ['Priority', r.priority], ['Technician', r.technician], ['Parts Replaced', (r.partsReplaced || []).map(p => `${p.part || p.partType} ×${p.qty || 1}${p.newSerial ? ' (new S/N ' + p.newSerial + ')' : ''}`).join('; ')], ['Total Cost', money(r.cost)], ['Status', r.status]], ['Received By', 'Customer Signature'], me.name)
          : k === 'repairDispatches.gatepass' ? printSlip('Returnable Gate Pass', r.gatePassNumber, [['Repair Job', label('repairJobs', r.repairJobId)], ['Vendor', label('vendors', r.vendorId)], ['Item(s)', r.itemsSent], ['Serial No.', r.serialSent], ['Accessories', r.accessoriesSent], ['Claim', r.claimType + (r.claimReference ? ' — ' + r.claimReference : '')], ['Data Wiped / Storage Removed', r.dataWiped + (r.wipedBy ? ' (' + r.wipedBy + ')' : '')], ['Sent On', fmtD(r.sentAt)], ['Carrier', (r.carrier || '') + (r.docketNumber ? ' / ' + r.docketNumber : '')], ['Expected Return', fmtD(r.expectedReturnAt)], ['Sent By', r.sentBy]], ['Prepared By', 'Approved By', 'Security Gate', 'Vendor Receipt'], me.name) : true;
      if (!ok) toast('Allow pop-ups to print', 1); return;
    }
    if (a.fields) return openModal(<ActionForm mod={mod} rec={r} action={a} />);
    if (a.confirmText && !window.confirm(a.confirmText)) return;
    try { await mutate(c => api(`/${mod}/${r.id}/action/${a.id}`, { method: 'POST', body: { input: {}, confirmed: c } })); } catch (e) { toast(e.message, 1); }
  };
}
