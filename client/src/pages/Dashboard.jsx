import React, { useEffect, useState } from 'react';
import { DB, ASSET_STATUSES, SWITCH_CATS, CAMERA_CATS, GROUP_COLOR, dispStatus, catGroupOf, live, rackUsed, portsInUse, portList, camerasOn, coresUsed, today, fmtDT } from '@shared/core.js';
import { alertItems, opsAlerts } from '@shared/insights.js';
import { api, useApp, Expiry } from '../lib.jsx';
import { navigate } from '../router.js';
import RecordForm from '../components/RecordForm.jsx';

export function Bars({ obj }) {
  const e = Object.entries(obj).sort((a, b) => b[1] - a[1]); const m = Math.max(1, ...e.map(x => x[1]));
  return <div className="bars">{e.length ? e.map(([k, v]) => <div className="row" key={k}><span className="lab" title={k}>{k}</span><span className="trk"><span className="fil" style={{ width: (v / m * 100).toFixed(1) + '%', background: GROUP_COLOR[k] || '#1f4468' }} /></span><span className="num">{v}</span></div>) : <div className="muted">No data</div>}</div>;
}
const Util = ({ l, u, t }) => { const p = t ? Math.round(u / t * 100) : 0; return <div className="row"><span className="lab">{l}</span><span className="trk"><span className="fil" style={{ width: p + '%', background: p >= 90 ? '#b42318' : p >= 75 ? '#d98c00' : '#0f7a4f' }} /></span><span className="num">{p}%</span></div>; };
export const AlertRow = ({ c, t, v }) => <div className="alert"><span className={'b ' + c}>{c === 'bad' ? 'Urgent' : c === 'warn' ? 'Action' : 'Info'}</span><span style={{ flex: 1 }}>{t}</span><span className="link" onClick={() => navigate(v)}>Open</span></div>;

export default function Dashboard() {
  const { can, openModal } = useApp(); const [recent, setRecent] = useState(null);
  useEffect(() => { if (can('audit', 'v')) api('/audit?limit=10').then(r => setRecent(r.entries), () => setRecent([])); }, []);
  const A = DB.assets; const cnt = s => A.filter(a => a.status === s).length;
  const tOver = DB.tempAssignments.filter(r => dispStatus('tempAssignments', r) === 'Overdue').length;
  const openJobs = DB.repairJobs.filter(r => !['Handed Over', 'Beyond Economic Repair', 'Cancelled'].includes(r.status)).length;
  const atVendor = DB.repairDispatches.filter(r => r.status !== 'Received Back').length;
  const vOver = DB.repairDispatches.filter(r => dispStatus('repairDispatches', r) === 'Overdue at Vendor').length;
  const al = alertItems().filter(x => can(x.view, 'v')); const exp30 = al.filter(x => x.days >= 0 && x.days <= 30).length; const expired = al.filter(x => x.days < 0 && !['Temporary Issue Due', 'Item at Vendor'].includes(x.type)).length;
  const K = ({ v, l, cls, g, p }) => <div className={'kpi ' + (cls || '')} onClick={() => navigate(g, p)}><div className="v">{v}</div><div className="l">{l}</div></div>;
  const byStatus = {}; ASSET_STATUSES.forEach(s => { const n = cnt(s); if (n) byStatus[s] = n; });
  const byGrp = {}; A.forEach(a => { const g = catGroupOf(a.categoryId); byGrp[g] = (byGrp[g] || 0) + 1; });
  const racks = A.filter(a => a.categoryId === 'Rack' && live(a)); const rU = racks.reduce((s, r) => s + rackUsed(r.id), 0), rT = racks.reduce((s, r) => s + (parseInt(r.specs.rackSize) || 0), 0);
  const sw = A.filter(a => SWITCH_CATS.includes(a.categoryId) && live(a)); const pU = sw.reduce((s, x) => s + portsInUse(x), 0), pT = sw.reduce((s, x) => s + portList(x).length, 0);
  const nv = A.filter(a => a.categoryId === 'NVR' && live(a)); const cU = nv.reduce((s, n) => s + camerasOn(n.id).length, 0), cT = nv.reduce((s, n) => s + (parseInt(n.specs.channels) || 0), 0);
  const ofc = A.filter(a => a.categoryId === 'OFC Cable' && live(a)); const oU = ofc.reduce((s, o) => s + coresUsed(o.id).length, 0), oT = ofc.reduce((s, o) => s + (parseInt(o.specs.cores) || 0), 0);
  const fl = DB.networkLinks.filter(l => l.linkType === 'Optical Fibre');
  const ops = opsAlerts().filter(x => can(x[2], 'v'));
  const quick = [['tempAssignments', '+ Temporary Issue', 1], ['repairJobs', '+ Receive Item for Repair', 1], ['repairDispatches', '+ Send to Vendor (Gate Pass)'], ['maintenance', '+ Maintenance'], ['amcVisits', '+ AMC Visit'], ['assets', '+ Register Asset'], ['networkLinks', '+ Link'], ['assignments', '+ Assign Asset']].filter(x => can(x[0], 'a'));
  return <>
    <div className="kpis">
      <K v={A.length} l="Total Assets" g="assets" /><K v={cnt('Installed / In Use')} l="Installed / In Use" cls="green" g="assets" p={{ f_status: 'Installed / In Use' }} />
      <K v={cnt('Assigned')} l="Assigned to Users" cls="green" g="assets" p={{ f_status: 'Assigned' }} /><K v={cnt('In Stock') + cnt('Standby / Spare')} l="In Stock + Spare" g="assets" p={{ f_status: 'In Stock' }} />
      <K v={cnt('Temporarily Assigned')} l="Temporarily Issued" cls="amber" g="tempAssignments" p={{ f_status: 'Issued' }} /><K v={tOver} l="Temporary Overdue" cls={tOver ? 'red' : ''} g="tempAssignments" p={{ f_status: 'Overdue' }} />
      <K v={openJobs} l="Open Repair Jobs" cls="amber" g="repairJobs" /><K v={atVendor} l="Items at Vendors" cls="amber" g="repairDispatches" /><K v={vOver} l="Overdue at Vendors" cls={vOver ? 'red' : ''} g="repairDispatches" p={{ f_status: 'Overdue at Vendor' }} />
      <K v={DB.maintenance.filter(m => !['Resolved', 'Closed', 'Cancelled'].includes(m.status)).length} l="Open Maintenance" g="maintenance" />
      <K v={exp30} l="Expiring in 30 Days" cls={exp30 ? 'amber' : ''} g="alerts" p={{ b: '30' }} /><K v={expired} l="Expired (pending)" cls={expired ? 'red' : ''} g="alerts" p={{ b: 'exp' }} />
    </div>
    <div className="grid2"><div className="card"><h3>Assets by Status</h3><Bars obj={byStatus} /></div><div className="card"><h3>Assets by Category Group</h3><Bars obj={byGrp} /></div></div>
    <div className="card"><h3>Data Centre & Network Capacity</h3><div className="grid2"><div className="bars"><Util l={`Rack space (${rU}/${rT}U)`} u={rU} t={rT} /><Util l={`Switch ports (${pU}/${pT})`} u={pU} t={pT} /><Util l={`NVR channels (${cU}/${cT})`} u={cU} t={cT} /><Util l={`Fibre cores (${oU}/${oT})`} u={oU} t={oT} /></div>
      <div className="kv" style={{ margin: 0 }}><div><span>Racks</span>{racks.length}</div><div><span>Switches / Routers / Firewalls</span>{sw.length}</div><div><span>IP Cameras</span>{A.filter(a => CAMERA_CATS.includes(a.categoryId) && live(a)).length}</div><div><span>Fibre Links</span>{fl.length} · {fl.filter(l => l.lossResult === 'Pass').length} pass · {fl.filter(l => l.lossResult === 'Fail').length} fail</div><div><span>End-user Devices</span>{A.filter(a => catGroupOf(a.categoryId) === 'Computing (End User)' && live(a)).length}</div><div><span>AMC Visits (this year)</span>{DB.amcVisits.filter(v => String(v.visitDate).slice(0, 4) === today().slice(0, 4)).length}</div></div></div>
      {can('racks', 'v') && <p style={{ margin: '10px 0 0' }}><span className="link" onClick={() => navigate('racks')}>Open Rack Layout</span></p>}</div>
    <div className="grid2"><div className="card"><h3>Needs Attention</h3>{ops.slice(0, 8).map(([c, t, v], i) => <AlertRow key={i} c={c} t={t} v={v} />)}{!ops.length && <div className="muted">All clear.</div>}
      {al.filter(x => x.days <= 30 && !['Temporary Issue Due', 'Item at Vendor'].includes(x.type)).slice(0, 5).map((x, i) => <div className="alert" key={'e' + i}><span className={'b ' + (x.days < 0 ? 'bad' : 'warn')}>{x.type}</span><span style={{ flex: 1 }}>{x.name} — <Expiry d={x.date} /></span><span className="link" onClick={() => navigate(x.view)}>Open</span></div>)}</div>
      <div className="card"><h3>Recent Activity</h3>{!can('audit', 'v') ? <div className="muted">Activity log is visible to administrators and auditors.</div> : recent === null ? <div className="muted">Loading…</div> : recent.length ? recent.map(x => <div className="alert" key={x.id}><span className="muted" style={{ width: 120, flexShrink: 0, fontSize: 12 }}>{fmtDT(x.at)}</span><span><b>{x.action}</b> · {x.module} {x.ref} · {x.user} <span className="muted">{x.detail}</span></span></div>) : <div className="muted">No activity yet.</div>}</div></div>
    {quick.length > 0 && <div className="card"><h3>Quick Actions</h3><div className="toolbar" style={{ margin: 0 }}>{quick.map(([m, l, p]) => <button key={m} className={'btn' + (p ? ' pri' : '')} onClick={() => { navigate(m); openModal(<RecordForm mod={m} />); }}>{l}</button>)}</div></div>}
  </>;
}
