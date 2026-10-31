import React, { useEffect, useState } from 'react';
import { DB, dispStatus } from '@shared/core.js';
import { MODS, PERMS } from '@shared/modules.js';
import { alertItems } from '@shared/insights.js';
import { useApp, hasToken } from './lib.jsx';
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
import { Emblem } from './components/Brand.jsx';

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

/* main modules only — asset categories are browsed from the Asset Inventory page */
function Sidebar({ view, open, onNav, foot }) {
  const { can } = useApp();
  const c = {
    tempAssignments: DB.tempAssignments.filter(r => dispStatus('tempAssignments', r) === 'Overdue' || r.status === 'Requested').length,
    repairJobs: DB.repairJobs.filter(r => !['Handed Over', 'Beyond Economic Repair', 'Cancelled'].includes(r.status)).length,
    repairDispatches: DB.repairDispatches.filter(r => r.status !== 'Received Back').length,
    maintenance: DB.maintenance.filter(r => !['Resolved', 'Closed', 'Cancelled'].includes(r.status)).length,
    alerts: alertItems().filter(a => a.days <= 30).length,
  };
  const go = v => { onNav(); navigate(v); };
  return <aside className={'side' + (open ? ' open' : '')} id="sidenav">
    <div className="brand"><Emblem size={44} /><div><b className="gold-text">DJJS</b><em>IT Asset Management</em><span>IT Department · Nurmahal</span></div><button className="close" onClick={onNav} aria-label="Close menu">✕</button></div>
    {NAV.map(([g, items]) => { const vis = items.filter(([k]) => can(k, 'v')); if (!vis.length) return null; return <React.Fragment key={g}>
      <div className="grp">{g}</div>
      {vis.map(([k, l]) => <a key={k} className={'nav' + (view === k ? ' on' : '')} aria-current={view === k ? 'page' : undefined} onClick={() => go(k)}>{l}{c[k] ? <span className="cnt">{c[k]}</span> : k === 'assets' ? <span className="cnt2">{DB.assets.length}</span> : null}</a>)}
    </React.Fragment>; })}
    {foot}
  </aside>;
}

export default function App() {
  const { me, ready, load, logout, can, db } = useApp();
  const { view, params } = useRoute(); const [menu, setMenu] = useState(false); const [booting, setBooting] = useState(true);
  useEffect(() => { if (!hasToken()) { setBooting(false); return; } load().catch(() => { }).finally(() => setBooting(false)); }, []);
  useEffect(() => { // mobile drawer: Esc closes it, page behind it doesn't scroll
    if (!menu) return; const k = e => { if (e.key === 'Escape') setMenu(false); };
    document.addEventListener('keydown', k); document.body.classList.add('noscroll');
    return () => { document.removeEventListener('keydown', k); document.body.classList.remove('noscroll'); };
  }, [menu]);
  if (booting) return <div className="spinner">Loading…</div>;
  if (!me || !ready) return <Login />;
  let v = view;
  if (!(PAGES[v] || MODS[v]) || !can(v, 'v')) { const f = PERMS.find(p => can(p[0], 'v')); v = f ? f[0] : 'dashboard'; }
  const Page = PAGES[v];
  const role = (db.roles || []).find(r => r.id === me.roleId);
  const title = v === 'assets' && params.grp ? (params.cat || params.grp) : (VIEW_TITLE[v] || MODS[v].title);
  const foot = <div className="side-foot"><b>{me.name}</b><span>{role ? role.name : ''}</span>
    <div><button className="btn sm" onClick={() => logout()}>Logout</button></div></div>;
  return <div className="app">
    <Sidebar view={v} open={menu} onNav={() => setMenu(false)} foot={foot} />
    <div className={'scrim' + (menu ? ' show' : '')} onClick={() => setMenu(false)} />
    <div className="main">
      <div className="top">
        <button className="menu" onClick={() => setMenu(!menu)} aria-label="Menu" aria-controls="sidenav" aria-expanded={menu}>&#9776;</button>
        <h1 id="ptitle" title={title}>{title}</h1>
        <div className="who" id="who"><b>{me.name}</b>{role ? role.name : ''}</div>
        <button className="btn sm top-act" onClick={() => logout()}>Logout</button>
      </div>
      <div className="page" id="page">{Page ? <Page key={v} params={params} /> : <ListPage key={v + JSON.stringify(params)} mod={v} params={params} />}</div>
    </div>
  </div>;
}
