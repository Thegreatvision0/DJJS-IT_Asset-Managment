import React, { useEffect, useState } from 'react';
import { DB, dispStatus } from '@shared/core.js';
import { MODS, PERMS } from '@shared/modules.js';
import { alertItems } from '@shared/insights.js';
import { api, useApp, Modal, hasToken } from './lib.jsx';
import { useRoute, navigate } from './router.js';
import ListPage from './pages/ListPage.jsx';
import Dashboard from './pages/Dashboard.jsx';
import Alerts from './pages/Alerts.jsx';
import Reports from './pages/Reports.jsx';
import AuditLog from './pages/AuditLog.jsx';
import Settings from './pages/Settings.jsx';
import Roles from './pages/Roles.jsx';
import Racks from './pages/Racks.jsx';
import Login from './pages/Login.jsx';
import Field from './components/Field.jsx';

const NAV = [
  ['Overview', [['dashboard', 'Dashboard'], ['alerts', 'Expiry & Alerts']]],
  ['Assets', [['assets', 'Asset Inventory'], ['assignments', 'Assignments'], ['tempAssignments', 'Temporary Issue']]],
  ['Repairs & Service', [['repairJobs', 'Repair Inward'], ['repairDispatches', 'Repair Outward'], ['maintenance', 'Maintenance'], ['amcVisits', 'AMC Visits']]],
  ['Data Centre & Network', [['racks', 'Rack Layout'], ['networkLinks', 'Network & Fibre Links'], ['installations', 'Installations']]],
  ['Compliance & Renewals', [['contracts', 'AMC / Contracts'], ['licences', 'Software Licences'], ['certificates', 'Certificates']]],
  ['Procurement', [['vendors', 'Vendors'], ['purchases', 'Purchases']]],
  ['Masters', [['employees', 'Employees & Sewadars'], ['locations', 'Locations']]],
  ['Reports', [['reports', 'Reports']]],
  ['Administration', [['users', 'Users'], ['roles', 'Roles & Permissions'], ['settings', 'Settings & Masters'], ['audit', 'Audit Log']]],
];
export const VIEW_TITLE = { dashboard: 'Dashboard', alerts: 'Expiry & Alerts', reports: 'Reports', audit: 'Audit Log', settings: 'Settings & Masters', roles: 'Roles & Permissions', racks: 'Rack Layout' };
const PAGES = { dashboard: Dashboard, alerts: Alerts, reports: Reports, audit: AuditLog, settings: Settings, roles: Roles, racks: Racks };

function Sidebar({ view, params, open, onNav }) {
  const { can } = useApp(); const [navOpen, setNavOpen] = useState(params.grp || '');
  useEffect(() => { if (params.grp) setNavOpen(params.grp); }, [params.grp]);
  const c = {
    tempAssignments: DB.tempAssignments.filter(r => dispStatus('tempAssignments', r) === 'Overdue' || r.status === 'Requested').length,
    repairJobs: DB.repairJobs.filter(r => !['Handed Over', 'Beyond Economic Repair', 'Cancelled'].includes(r.status)).length,
    repairDispatches: DB.repairDispatches.filter(r => r.status !== 'Received Back').length,
    maintenance: DB.maintenance.filter(r => !['Resolved', 'Closed', 'Cancelled'].includes(r.status)).length,
    alerts: alertItems().filter(a => a.days <= 30).length,
  };
  const cnt = {}; DB.assets.forEach(a => cnt[a.categoryId] = (cnt[a.categoryId] || 0) + 1);
  const go = (v, p) => { onNav(); navigate(v, p); };
  return <aside className={'side' + (open ? ' open' : '')}>
    <div className="brand"><b><span className="logo">DJJS</span>IT Asset Management</b><span>Data Centre · Network · Assets</span></div>
    {NAV.map(([g, items]) => { const vis = items.filter(([k]) => can(k, 'v')); if (!vis.length) return null; return <React.Fragment key={g}>
      <div className="grp">{g}</div>
      {vis.map(([k, l]) => <React.Fragment key={k}>
        <a className={'nav' + (view === k && !(k === 'assets' && params.grp) ? ' on' : '')} onClick={() => go(k)}>{l}{c[k] ? <span className="cnt">{c[k]}</span> : k === 'assets' ? <span className="cnt2">{DB.assets.length}</span> : null}</a>
        {k === 'assets' && Object.entries(DB.masters.catGroups).map(([grp, cats]) => { const n = cats.reduce((s, x) => s + (cnt[x] || 0), 0); const op = navOpen === grp; return <React.Fragment key={grp}>
          <a className={'nav sub' + (op ? ' open' : '') + (view === 'assets' && params.grp === grp && !params.cat ? ' on' : '')} onClick={() => { if (op && view === 'assets' && params.grp === grp && !params.cat) setNavOpen(''); else { setNavOpen(grp); go('assets', { grp }); } }}>{grp}<span className="cnt2">{n}</span></a>
          {op && cats.map(cat => <a key={cat} className={'nav sub2' + (cnt[cat] ? '' : ' zero') + (view === 'assets' && params.cat === cat ? ' on' : '')} onClick={() => go('assets', { grp, cat })}>{cat}{cnt[cat] ? <span className="cnt2">{cnt[cat]}</span> : null}</a>)}
        </React.Fragment>; })}
      </React.Fragment>)}
    </React.Fragment>; })}
  </aside>;
}

function ChangePassword() {
  const { closeModal, toast, putToken, setMe, me } = useApp(); const [v, setV] = useState({ old: '', pw: '', pw2: '' }); const [err, setErr] = useState('');
  const save = async () => { if (v.pw.length < 6) return setErr('Password must be at least 6 characters'); if (v.pw !== v.pw2) return setErr('Passwords do not match'); try { const r = await api('/auth/change-password', { method: 'POST', body: { old: v.old, pw: v.pw } }); putToken(r.token); setMe(r.user); closeModal(); toast('Password changed'); } catch (e) { setErr(e.message); } };
  const F = (k, l) => <Field f={{ k, l, t: 'password', r: 1 }} value={v[k]} onChange={x => setV(p => ({ ...p, [k]: x }))} required />;
  return <Modal title={'Change Password — ' + me.username} footer={<><button className="btn" onClick={closeModal}>Cancel</button><button className="btn pri" id="miniSave" onClick={save}>Save</button></>}>
    {err && <div className="err" style={{ display: 'block' }}>{err}</div>}<div className="fg">{F('old', 'Current Password')}{F('pw', 'New Password')}{F('pw2', 'Confirm New Password')}</div></Modal>;
}

export default function App() {
  const { me, ready, load, logout, can, openModal, db } = useApp();
  const { view, params } = useRoute(); const [menu, setMenu] = useState(false); const [booting, setBooting] = useState(true);
  useEffect(() => { if (!hasToken()) { setBooting(false); return; } load().catch(() => { }).finally(() => setBooting(false)); }, []);
  if (booting) return <div className="spinner">Loading…</div>;
  if (!me || !ready) return <Login />;
  let v = view;
  if (!(PAGES[v] || MODS[v]) || !can(v, 'v')) { const f = PERMS.find(p => can(p[0], 'v')); v = f ? f[0] : 'dashboard'; }
  const Page = PAGES[v];
  const role = (db.roles || []).find(r => r.id === me.roleId);
  const title = v === 'assets' && params.grp ? (params.cat || params.grp) : (VIEW_TITLE[v] || MODS[v].title);
  return <div className="app">
    <Sidebar view={v} params={params} open={menu} onNav={() => setMenu(false)} />
    <div className="main">
      <div className="top">
        <button className="menu" onClick={() => setMenu(!menu)} aria-label="Menu">&#9776;</button>
        <h1 id="ptitle">{title}</h1>
        <div className="who" id="who"><b>{me.name}</b>{role ? role.name : ''}</div>
        <button className="btn sm" onClick={() => openModal(<ChangePassword />)}>Change Password</button>
        <button className="btn sm" onClick={() => logout()}>Logout</button>
      </div>
      <div className="page" id="page">{Page ? <Page key={v} params={params} /> : <ListPage key={v + JSON.stringify(params)} mod={v} params={params} />}</div>
    </div>
  </div>;
}
