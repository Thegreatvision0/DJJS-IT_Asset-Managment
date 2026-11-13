import React, { useEffect, useState } from 'react';
import { DB, ASSET_STATUSES, SWITCH_CATS, CAMERA_CATS, GROUP_COLOR, dispStatus, catGroupOf, live, rackUsed, portsInUse, portList, camerasOn, coresUsed, today, fmtDT, label } from '@shared/core.js';
import { alertItems, opsAlerts } from '@shared/insights.js';
import { api, useApp, Expiry } from '../lib.jsx';
import { navigate } from '../router.js';
import RecordForm from '../components/RecordForm.jsx';
import { SERIES, monthKeys, monthLabel, fmtNum, fmtFull, ChartCard, Legend, ColumnChart, LineChart, HBarChart, Meter, Spark } from '../components/Charts.jsx';

export function Bars({ obj }) {
  const e = Object.entries(obj).sort((a, b) => b[1] - a[1]); const m = Math.max(1, ...e.map(x => x[1]));
  return <div className="bars">{e.length ? e.map(([k, v]) => <div className="row" key={k}><span className="lab" title={k}>{k}</span><span className="trk"><span className="fil" style={{ width: (v / m * 100).toFixed(1) + '%', background: GROUP_COLOR[k] || '#1f4468' }} /></span><span className="num">{v}</span></div>) : <div className="muted">No data</div>}</div>;
}
export const AlertRow = ({ c, t, v }) => <div className="alert"><span className={'b ' + c}>{c === 'bad' ? 'Urgent' : c === 'warn' ? 'Action' : 'Info'}</span><span style={{ flex: 1 }}>{t}</span><span className="link" onClick={() => navigate(v)}>Open</span></div>;

const num = v => { const n = parseFloat(v); return isNaN(n) ? 0 : n; };
/** count (or sum of `val`) of records per month key */
function byMonth(keys, rows, dateOf, val) {
  const idx = Object.fromEntries(keys.map((k, i) => [k, i])); const out = keys.map(() => 0);
  rows.forEach(r => { const d = String(dateOf(r) || '').slice(0, 7); if (d in idx) out[idx[d]] += val ? val(r) : 1; });
  return out;
}
const RENEWAL_TYPES = [['AMC / Contract', 'AMC / Contracts'], ['Software Licence', 'Software licences'], ['Certificate', 'Certificates'], ['Warranty', 'Warranties']];
/* where each renewal type lives: [module, date field, extra list filters] — open items only, as on the chart */
const OPEN_RENEWAL = { x_renewalStatus: 'Renewed|Not Required' };
const RENEW_GO = { 'AMC / Contract': ['contracts', 'endDate', OPEN_RENEWAL], 'Software Licence': ['licences', 'expiryDate', { ...OPEN_RENEWAL, x_licenceType: 'Perpetual' }], 'Certificate': ['certificates', 'expiryDate', OPEN_RENEWAL], 'Warranty': ['assets', 'warrantyEnd', {}] };
/** first and last day of a YYYY-MM month */
const monthRange = k => { const [y, m] = k.split('-').map(Number); return { from: k + '-01', to: k + '-' + String(new Date(y, m, 0).getDate()).padStart(2, '0') }; };
const dayBefore = d => { const x = new Date(d + 'T00:00:00'); x.setDate(x.getDate() - 1); return x.getFullYear() + '-' + String(x.getMonth() + 1).padStart(2, '0') + '-' + String(x.getDate()).padStart(2, '0'); };

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
  const racks = A.filter(a => a.categoryId === 'Rack' && live(a)); const rU = racks.reduce((s, r) => s + rackUsed(r.id), 0), rT = racks.reduce((s, r) => s + (parseInt(r.specs.rackSize) || 0), 0);
  const sw = A.filter(a => SWITCH_CATS.includes(a.categoryId) && live(a)); const pU = sw.reduce((s, x) => s + portsInUse(x), 0), pT = sw.reduce((s, x) => s + portList(x).length, 0);
  const nv = A.filter(a => a.categoryId === 'NVR' && live(a)); const cU = nv.reduce((s, n) => s + camerasOn(n.id).length, 0), cT = nv.reduce((s, n) => s + (parseInt(n.specs.channels) || 0), 0);
  const ofc = A.filter(a => a.categoryId === 'OFC Cable' && live(a)); const oU = ofc.reduce((s, o) => s + coresUsed(o.id).length, 0), oT = ofc.reduce((s, o) => s + (parseInt(o.specs.cores) || 0), 0);
  const fl = DB.networkLinks.filter(l => l.linkType === 'Optical Fibre');
  const ops = opsAlerts().filter(x => can(x[2], 'v'));
  const quick = [['tempAssignments', '+ Temporary Issue', 1], ['repairJobs', '+ Receive Item for Repair', 1], ['repairDispatches', '+ Send to Vendor (Gate Pass)'], ['maintenance', '+ Maintenance'], ['amcVisits', '+ AMC Visit'], ['assets', '+ Register Asset'], ['networkLinks', '+ Link'], ['assignments', '+ Assign Asset']].filter(x => can(x[0], 'a'));

  /* ---- analytics ---- */
  const M12 = monthKeys(12), L12 = M12.map(monthLabel), F12 = monthKeys(12, true);
  const inUse = cnt('Installed / In Use') + cnt('Assigned') + cnt('Temporarily Assigned'), liveN = A.filter(live).length;
  const utilisation = liveN ? Math.round(inUse / liveN * 100) : 0;
  const assetValue = A.reduce((s, a) => s + num(a.purchaseCost), 0);
  const added = byMonth(M12, A, a => a.purchaseDate || a.createdAt);
  const received = byMonth(M12, DB.repairJobs, r => r.receivedAt), closed = byMonth(M12, DB.repairJobs, r => r.handedOverAt);
  const spendSeries = [
    can('purchases', 'v') && { key: 'po', label: 'Purchases', values: byMonth(M12, DB.purchases, r => r.orderDate, r => num(r.totalAmount)) },
    can('maintenance', 'v') && { key: 'mnt', label: 'Maintenance', values: byMonth(M12, DB.maintenance, r => r.resolvedAt || r.reportedAt, r => num(r.cost)) },
    can('repairJobs', 'v') && { key: 'rep', label: 'Repairs', values: byMonth(M12, DB.repairJobs, r => r.handedOverAt || r.receivedAt, r => num(r.finalCost)) },
  ].filter(Boolean).map((s, i) => ({ ...s, color: SERIES[i] }));
  const spend12 = spendSeries.reduce((t, s) => t + s.values.reduce((a, b) => a + b, 0), 0);
  const renew = RENEWAL_TYPES.map(([type, l], i) => { const items = al.filter(x => x.type === type);
    const fut = byMonth(F12, items.filter(x => x.days >= 0), x => x.date); return { key: type, label: l, color: SERIES[i], values: [items.filter(x => x.days < 0).length, ...fut] }; })
    .filter(s => s.values.some(Boolean) || ['AMC / Contract', 'Software Licence'].includes(s.key));
  const renewLabels = ['Overdue', ...F12.map(monthLabel)];
  const due90 = al.filter(x => x.days >= 0 && x.days <= 90 && RENEWAL_TYPES.some(t => t[0] === x.type)).length;
  const byStatus = ASSET_STATUSES.map(s => [s, cnt(s), s]);
  const byGrp = {}; A.forEach(a => { const g = catGroupOf(a.categoryId) || 'Uncategorised'; byGrp[g] = (byGrp[g] || 0) + 1; });
  const byLoc = {}; A.filter(live).forEach(a => { const k = a.locationId || ''; byLoc[k] = (byLoc[k] || 0) + 1; });
  const locRows = Object.entries(byLoc).map(([id, n]) => [id ? label('locations', id).split(' › ').slice(-2).join(' › ') : 'Not set', n, id || null]);
  const T = (head, labels, series, money) => ({ head: [head, ...series.map(s => s.label)], rows: labels.map((l, i) => [l, ...series.map(s => fmtFull(s.values[i] || 0, money))]) });
  const rowsTable = (head, rows) => { const r = rows.filter(x => x[1] > 0).sort((a, b) => b[1] - a[1]); return { head: [head, 'Count'], rows: r.map(x => [x[0], x[1]]), keys: r.map(x => x[2] === undefined ? x[0] : x[2]) }; };
  /** table cell → same destination as clicking the chart (col 0 = whole row) */
  const cellPick = (series, pick) => (i, j) => pick(i, j ? series[j - 1].key : null);
  const keyPick = (table, pick) => i => { const k = table.keys[i]; if (k !== null && k !== '') pick(k); };

  /* ---- drill-down destinations ---- */
  const go = (mod, p) => can(mod, 'v') && navigate(mod, p);
  const openAdded = i => go('assets', { dk: 'purchaseDate,createdAt', ...monthRange(M12[i]), dl: `Assets added in ${L12[i]}` });
  const openRepairs = (i, k) => go('repairJobs', k === 'c' ? { dk: 'handedOverAt', ...monthRange(M12[i]), dl: `Repairs handed over in ${L12[i]}` } : { dk: 'receivedAt', ...monthRange(M12[i]), dl: `Repairs received in ${L12[i]}` });
  const openRenewal = (i, key) => {
    if (!key) return navigate('alerts', i === 0 ? { b: 'exp' } : {});
    const [mod, dk, extra] = RENEW_GO[key]; const name = RENEWAL_TYPES.find(t => t[0] === key)[1];
    go(mod, i === 0 ? { dk, to: dayBefore(today()), dl: `${name} overdue`, ...extra } : { dk, ...monthRange(F12[i - 1]), dl: `${name} due in ${renewLabels[i]}`, ...extra });
  };
  const SPEND_GO = { po: ['purchases', 'orderDate', 'Purchases ordered'], mnt: ['maintenance', 'resolvedAt,reportedAt', 'Maintenance cost'], rep: ['repairJobs', 'handedOverAt,receivedAt', 'Repair cost'] };
  const openSpend = (i, k) => { const s = k ? spendSeries.find(x => x.key === k) : spendSeries.find(x => x.values[i] > 0) || spendSeries[0]; if (!s) return; const [mod, dk, l] = SPEND_GO[s.key]; go(mod, { dk, ...monthRange(M12[i]), dl: `${l} in ${L12[i]}` }); };
  const IN_USE = ['Installed / In Use', 'Assigned', 'Temporarily Assigned'];
  const openInUse = () => go('assets', { x_status: ASSET_STATUSES.filter(s => !IN_USE.includes(s)).join('|'), dl: 'In use or assigned' });
  const grpOf = c => ({ grp: catGroupOf(c) });
  const repSeries = [{ key: 'r', label: 'Received', short: 'in', color: SERIES[0], values: received }, { key: 'c', label: 'Handed over', short: 'out', color: SERIES[1], values: closed }];
  const statusTable = rowsTable('Status', byStatus), grpTable = rowsTable('Category group', Object.entries(byGrp)), locTable = rowsTable('Location', locRows);

  return <>
    {/* headline strip: one hero figure, supporting stat tiles */}
    <div className="hero">
      <div className="hero-main click" onClick={() => navigate('assets')}><span>Total assets</span><b>{A.length.toLocaleString('en-IN')}</b><small>{liveN.toLocaleString('en-IN')} active · {added.reduce((a, b) => a + b, 0)} added in 12 months</small></div>
      <div className="stat click" onClick={openInUse}><span>Utilisation</span><b>{utilisation}%</b><small>{inUse} in use or assigned</small><div className="stat-trk"><i style={{ width: utilisation + '%' }} /></div></div>
      {can('assets', 'v') && <div className="stat click" onClick={() => navigate('assets')}><span>Asset value</span><b>{fmtNum(assetValue, 1)}</b><small>Recorded purchase cost</small></div>}
      <div className="stat click" onClick={() => navigate('repairJobs', { x_status: 'Handed Over|Beyond Economic Repair|Cancelled', dl: 'Open repair jobs' })}><span>Open repair jobs</span><b>{openJobs}</b><small>{atVendor} at vendors{vOver ? ` · ${vOver} overdue` : ''}</small><Spark values={received} /></div>
      <div className="stat click" onClick={() => navigate('alerts')}><span>Renewals due · 90 days</span><b>{due90}</b><small>{expired ? `${expired} already expired` : 'None expired'}</small></div>
      {spendSeries.length > 0 && <div className="stat click" onClick={() => go(SPEND_GO[spendSeries[0].key][0], {})}><span>Spend · 12 months</span><b>{fmtNum(spend12, 1)}</b><small>{spendSeries.map(s => s.label).join(' + ')}</small><Spark values={M12.map((_, i) => spendSeries.reduce((t, s) => t + s.values[i], 0))} /></div>}
    </div>

    <div className="ch-grid">
      <ChartCard title="Asset additions" sub="Assets registered per month · click a column to see them" table={T('Month', L12, [{ label: 'Assets added', values: added }])} onCell={i => openAdded(i)}>
        <ColumnChart labels={L12} series={[{ key: 'a', label: 'Assets added', color: SERIES[0], values: added }]} onPick={openAdded} />
      </ChartCard>
      {can('repairJobs', 'v') && <ChartCard title="Repair workload" sub="Job cards received vs handed over · click a month to see them"
        legend={<Legend series={repSeries} />} table={T('Month', L12, repSeries)} onCell={cellPick(repSeries, openRepairs)}>
        <LineChart labels={L12} series={repSeries} onPick={openRepairs} />
      </ChartCard>}
      <ChartCard title="Assets by status" sub="Click a bar to open the list" table={statusTable} onCell={keyPick(statusTable, s => navigate('assets', { f_status: s }))}>
        <HBarChart rows={byStatus} onPick={s => navigate('assets', { f_status: s })} />
      </ChartCard>
      <ChartCard title="Assets by category group" sub="Click a bar to open the group" table={grpTable} onCell={keyPick(grpTable, g => navigate('assets', { grp: g }))}>
        <HBarChart rows={Object.entries(byGrp).map(([g, n]) => [g, n, g])} onPick={g => navigate('assets', { grp: g })} />
      </ChartCard>
      {renew.length > 0 && <ChartCard title="Renewals calendar" sub="Contracts, licences, certificates and warranties falling due · click a coloured block to see them" wide
        legend={<Legend series={renew} />} table={T('Month', renewLabels, renew)} onCell={cellPick(renew, openRenewal)}>
        <ColumnChart labels={renewLabels} series={renew} onPick={openRenewal} />
      </ChartCard>}
      {spendSeries.length > 0 && <ChartCard title="IT spend" sub="Purchases, maintenance and repair cost per month · click a block to see the records" wide
        legend={<Legend series={spendSeries} />} table={T('Month', L12, spendSeries, 1)} onCell={cellPick(spendSeries, openSpend)}>
        <ColumnChart labels={L12} series={spendSeries} money onPick={openSpend} />
      </ChartCard>}
      <ChartCard title="Assets by location" sub="Active assets · click a bar to see them" table={locTable} onCell={keyPick(locTable, id => navigate('assets', { f_locationId: id }))}>
        <HBarChart rows={locRows} onPick={id => navigate('assets', { f_locationId: id })} />
      </ChartCard>
      <ChartCard title="Data centre & network capacity" sub="Share of capacity in use · click a meter for details" action={can('racks', 'v') && <button className="btn sm" onClick={() => navigate('racks')}>Rack layout</button>}>
        <div className="meters">
          <Meter label="Rack space" used={rU} total={rT} onClick={() => go('racks')} />
          <Meter label="Switch ports" used={pU} total={pT} onClick={() => go('assets', grpOf(SWITCH_CATS[0]))} />
          <Meter label="NVR channels" used={cU} total={cT} onClick={() => go('assets', { ...grpOf('NVR'), cat: 'NVR' })} />
          <Meter label="Fibre cores" used={oU} total={oT} onClick={() => go('assets', { ...grpOf('OFC Cable'), cat: 'OFC Cable' })} />
        </div>
        <div className="kv" style={{ margin: '14px 0 0' }}>
          <div className="go" onClick={() => go('racks')}><span>Racks</span>{racks.length}</div>
          <div className="go" onClick={() => go('assets', grpOf(SWITCH_CATS[0]))}><span>Switches / Routers / Firewalls</span>{sw.length}</div>
          <div className="go" onClick={() => go('assets', grpOf(CAMERA_CATS[0]))}><span>IP Cameras</span>{A.filter(a => CAMERA_CATS.includes(a.categoryId) && live(a)).length}</div>
          <div className="go" onClick={() => go('networkLinks', { f_linkType: 'Optical Fibre' })}><span>Fibre Links</span>{fl.length} · {fl.filter(l => l.lossResult === 'Pass').length} pass · {fl.filter(l => l.lossResult === 'Fail').length} fail</div>
          <div className="go" onClick={() => go('assets', { grp: 'Computing (End User)' })}><span>End-user Devices</span>{A.filter(a => catGroupOf(a.categoryId) === 'Computing (End User)' && live(a)).length}</div>
          <div className="go" onClick={() => go('amcVisits', { dk: 'visitDate', from: today().slice(0, 4) + '-01-01', to: today().slice(0, 4) + '-12-31', dl: 'AMC visits this year' })}><span>AMC Visits (this year)</span>{DB.amcVisits.filter(v => String(v.visitDate).slice(0, 4) === today().slice(0, 4)).length}</div>
        </div>
      </ChartCard>
    </div>

    <h3 className="dash-sec">Operations</h3>
    <div className="kpis">
      <K v={cnt('Installed / In Use')} l="Installed / In Use" cls="green" g="assets" p={{ f_status: 'Installed / In Use' }} />
      <K v={cnt('Assigned')} l="Assigned to Users" cls="green" g="assets" p={{ f_status: 'Assigned' }} /><K v={cnt('In Stock') + cnt('Standby / Spare')} l="In Stock + Spare" g="assets" p={{ f_status: 'In Stock' }} />
      <K v={cnt('Temporarily Assigned')} l="Temporarily Issued" cls="amber" g="tempAssignments" p={{ f_status: 'Issued' }} /><K v={tOver} l="Temporary Overdue" cls={tOver ? 'red' : ''} g="tempAssignments" p={{ f_status: 'Overdue' }} />
      <K v={atVendor} l="Items at Vendors" cls="amber" g="repairDispatches" /><K v={vOver} l="Overdue at Vendors" cls={vOver ? 'red' : ''} g="repairDispatches" p={{ f_status: 'Overdue at Vendor' }} />
      <K v={DB.maintenance.filter(m => !['Resolved', 'Closed', 'Cancelled'].includes(m.status)).length} l="Open Maintenance" g="maintenance" />
      <K v={exp30} l="Expiring in 30 Days" cls={exp30 ? 'amber' : ''} g="alerts" p={{ b: '30' }} /><K v={expired} l="Expired (pending)" cls={expired ? 'red' : ''} g="alerts" p={{ b: 'exp' }} />
    </div>
    <div className="grid2"><div className="card"><h3>Needs Attention</h3>{ops.slice(0, 8).map(([c, t, v], i) => <AlertRow key={i} c={c} t={t} v={v} />)}{!ops.length && <div className="muted">All clear.</div>}
      {al.filter(x => x.days <= 30 && !['Temporary Issue Due', 'Item at Vendor'].includes(x.type)).slice(0, 5).map((x, i) => <div className="alert" key={'e' + i}><span className={'b ' + (x.days < 0 ? 'bad' : 'warn')}>{x.type}</span><span style={{ flex: 1 }}>{x.name} — <Expiry d={x.date} /></span><span className="link" onClick={() => navigate(x.view)}>Open</span></div>)}</div>
      <div className="card"><h3>Recent Activity</h3>{!can('audit', 'v') ? <div className="muted">Activity log is visible to administrators and auditors.</div> : recent === null ? <div className="muted">Loading…</div> : recent.length ? recent.map(x => <div className="alert" key={x.id}><span className="muted" style={{ width: 120, flexShrink: 0, fontSize: 12 }}>{fmtDT(x.at)}</span><span><b>{x.action}</b> · {x.module} {x.ref} · {x.user} <span className="muted">{x.detail}</span></span></div>) : <div className="muted">No activity yet.</div>}</div></div>
    {quick.length > 0 && <div className="card"><h3>Quick Actions</h3><div className="toolbar" style={{ margin: 0 }}>{quick.map(([m, l, p]) => <button key={m} className={'btn' + (p ? ' pri' : '')} onClick={() => { navigate(m); openModal(<RecordForm mod={m} />); }}>{l}</button>)}</div></div>}
  </>;
}
