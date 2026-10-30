/* Generic list page for any module (with category navigation for assets) */
import React, { useState } from 'react';
import { DB, M, uniq, dispStatus, label, profile, specsFor, catGroupOf, STD_LABEL, GROUP_COLOR } from '@shared/core.js';
import { MODS } from '@shared/modules.js';
import { ACTIONS, refOf } from '@shared/engine.js';
import { api, useApp, Badge, downloadCSV } from '../lib.jsx';
import { navigate } from '../router.js';
import RecordForm from '../components/RecordForm.jsx';
import { Cell, dispText, useRowAction } from '../components/Details.jsx';

function listCols(mod, cat) {
  const m = MODS[mod]; const fmap = Object.fromEntries(m.fields.filter(f => f.k).map(f => [f.k, f]));
  if (mod !== 'assets' || !cat) return { cols: m.cols.map(k => fmap[k]), fmap };
  const p = profile(cat);
  const base = ['assetTag', 'name', ...['manufacturer', 'model', 'serialNumber', 'ipAddress'].filter(k => p.show.includes(k)), 'locationId', 'status'];
  const sp = specsFor(cat).slice(0, 6).map(f => ({ ...f, k: 'sp_' + f.k, _sk: f.k, listOnly: 1, calc: r => f.t === 'calc' ? f.calc(r.specs || {}, r) : (r.specs || {})[f.k] }));
  return { cols: [...base.map(k => fmap[k]), ...sp], fmap };
}
const sortVal = (mod, f, r) => { const v = f.listOnly ? f.calc(r) : r[f.k]; if (f.k === 'status') return dispStatus(mod, r) || ''; if ((f.t === 'number' || f.t === 'calc') && v !== '' && v != null && !isNaN(v)) return Number(v); return dispText(f, v); };

function CatHeader({ grp, cat }) {
  const cnt = {}; DB.assets.forEach(a => cnt[a.categoryId] = (cnt[a.categoryId] || 0) + 1); const G = DB.masters.catGroups;
  if (!grp) return <div className="catgrid">{Object.entries(G).map(([g, cats]) => { const n = cats.reduce((t, c) => t + (cnt[c] || 0), 0); const top = cats.filter(c => cnt[c]).sort((a, b) => cnt[b] - cnt[a]).slice(0, 3).map(c => `${c} ${cnt[c]}`).join(' · ');
    return <div key={g} className="catcard" style={{ borderLeftColor: GROUP_COLOR[g] || '#1f4468' }} onClick={() => navigate('assets', { grp: g })}><b>{g}</b><div className="v">{n}</div><small>{top || cats.length + ' categories'}</small></div>; })}</div>;
  const cats = G[grp] || []; const inG = DB.assets.filter(a => cat ? a.categoryId === cat : cats.includes(a.categoryId)); const st = {}; inG.forEach(a => st[a.status] = (st[a.status] || 0) + 1);
  return <>
    <div className="crumb"><span onClick={() => navigate('assets')}>Asset Inventory</span> › {cat ? <><span onClick={() => navigate('assets', { grp })}>{grp}</span> › <b>{cat}</b></> : <b>{grp}</b>}</div>
    <div className="chips" style={{ marginBottom: 10 }}><span className={'chip' + (!cat ? ' on' : '')} onClick={() => navigate('assets', { grp })}>All {grp}<span className="n">{cats.reduce((t, c) => t + (cnt[c] || 0), 0)}</span></span>
      {cats.map(c => <span key={c} className={'chip' + (cat === c ? ' on' : '') + (cnt[c] ? '' : ' zero')} onClick={() => navigate('assets', { grp, cat: c })}>{c}<span className="n">{cnt[c] || 0}</span></span>)}</div>
    {inG.length > 0 && <div className="flow"><em>Status:</em> {Object.entries(st).map(([k, v]) => <React.Fragment key={k}><Badge s={k} /> <b>{v}</b>&nbsp;&nbsp;</React.Fragment>)}</div>}
  </>;
}

export default function ListPage({ mod, params }) {
  const { can, openModal, mutate, toast } = useApp(); const rowAction = useRowAction();
  const m = MODS[mod]; const isA = mod === 'assets'; const grp = isA ? params.grp : ''; const cat = isA ? params.cat : '';
  const [q, setQ] = useState(params.q || ''); const [filters, setFilters] = useState(() => Object.fromEntries(Object.entries(params).filter(([k]) => k.startsWith('f_')).map(([k, v]) => [k.slice(2), v])));
  const [sort, setSort] = useState({ k: '', dir: 1 });
  const { cols, fmap } = listCols(mod, cat);
  let rows = DB[mod].slice();
  if (grp) rows = rows.filter(r => catGroupOf(r.categoryId) === grp);
  if (cat) rows = rows.filter(r => r.categoryId === cat);
  const ql = q.toLowerCase();
  if (ql) rows = rows.filter(r => m.fields.some(f => f.k && String(f.listOnly ? f.calc(r) : dispText(f, r[f.k]) || '').toLowerCase().includes(ql)) || (r.specs && Object.values(r.specs).join(' ').toLowerCase().includes(ql)));
  (m.filters || []).forEach(k => { if (filters[k]) rows = rows.filter(r => String(k === 'status' ? dispStatus(mod, r) : r[k]) === filters[k]); });
  if (sort.k) { const f = cols.find(c => c.k === sort.k) || fmap[sort.k]; rows.sort((a, b) => { const x = sortVal(mod, f, a), y = sortVal(mod, f, b); return (typeof x === 'number' && typeof y === 'number' ? x - y : String(x).localeCompare(String(y), undefined, { numeric: true })) * sort.dir; }); }
  else rows.sort((a, b) => String(b.createdAt || '').localeCompare(String(a.createdAt || '')));

  const del = async r => {
    if (!window.confirm(`Delete this ${m.one} (${refOf(mod, r)})? This cannot be undone.`)) return;
    try { await mutate(() => api(`/${mod}/${r.id}`, { method: 'DELETE' }), { quiet: true }); toast('Deleted'); } catch (e) { toast(e.message, 1); }
  };
  const exportCSV = () => {
    const fs = m.fields.filter(f => f.k && f.t !== 'password'); let sp = [];
    if (isA) { const seen = {}; rows.forEach(r => specsFor(r.categoryId).forEach(f => { if (!seen[f.k]) { seen[f.k] = 1; sp.push(f); } })); }
    downloadCSV([[...fs.map(f => f.l), ...sp.map(f => f.l)], ...rows.map(r => [...fs.map(f => f.k === 'status' ? dispStatus(mod, r) : dispText(f, f.listOnly ? f.calc(r) : r[f.k])), ...sp.map(f => dispText(f, f.t === 'calc' ? f.calc(r.specs || {}, r) : (r.specs || {})[f.k]))])], isA && grp ? (cat || grp).replace(/[^\w]+/g, '_') : mod);
  };
  const filterOpts = k => { const f = fmap[k];
    if (k === 'status') return uniq([...(Array.isArray(f.o) ? f.o : M(f.o)), ...DB[mod].map(r => dispStatus(mod, r))]).map(x => [x, x]);
    if (f.t === 'ref') return DB[f.c].map(r => [r.id, label(f.c, r.id)]);
    if (f.t === 'combo') return uniq(DB[mod].map(r => r[k])).sort().map(x => [x, x]);
    if (isA && k === 'categoryId' && grp) return (DB.masters.catGroups[grp] || []).map(x => [x, x]);
    return (Array.isArray(f.o) ? f.o : M(f.o)).map(x => [x, x]); };

  return <>
    {m.flow && <div className="flow"><em>Flow:</em> {m.flow.map((x, i) => <React.Fragment key={i}>{i > 0 && <em>→</em>}<span>{x}</span></React.Fragment>)}</div>}
    {isA && <CatHeader grp={grp} cat={cat} />}
    <div className="toolbar">
      <input type="search" placeholder={`Search ${(isA && (cat || grp) ? (cat || grp) : m.title).toLowerCase()}…`} value={q} onChange={e => setQ(e.target.value)} />
      {(m.filters || []).filter(k => !(isA && k === 'categoryId' && cat)).map(k => <select key={k} value={filters[k] || ''} onChange={e => setFilters({ ...filters, [k]: e.target.value })}><option value="">All {fmap[k].l}</option>{filterOpts(k).map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select>)}
      <span className="sp" /><span className="muted">{rows.length} record(s)</span>
      <button className="btn" onClick={exportCSV}>Export CSV</button>
      {can(mod, 'a') && <button className="btn pri" onClick={() => openModal(<RecordForm mod={mod} preset={cat ? { categoryId: cat } : undefined} />)}>+ New {cat || m.one}</button>}
    </div>
    <div className="tw"><table className="lst cards"><thead><tr>{cols.map(f => <th key={f.k} className="srt" onClick={() => setSort({ k: f.k, dir: sort.k === f.k ? -sort.dir : 1 })}>{f.l}{sort.k === f.k ? (sort.dir === -1 ? ' ▼' : ' ▲') : ''}</th>)}<th>Actions</th></tr></thead>
      <tbody>{!rows.length && <tr><td colSpan={cols.length + 1} className="empty">No {cat ? cat + ' ' : ''}records yet.</td></tr>}
        {rows.map(r => <tr key={r.id}>{cols.map(f => <td key={f.k} data-label={f.l}>{f._sk ? dispText(f, f.calc(r)) : <Cell mod={mod} f={f} r={r} />}</td>)}
          <td className="act">
            {(ACTIONS[mod] || []).filter(a => !a.hidden && (!a.show || a.show(r)) && can(mod, a.perm || 'e')).map(a => <button key={a.id} className="btn sm" onClick={() => rowAction(mod, a, r)}>{a.l}</button>)}
            <button className="btn sm" onClick={() => openModal(<RecordForm mod={mod} id={r.id} view />)}>View</button>
            {can(mod, 'e') && <button className="btn sm" onClick={() => openModal(<RecordForm mod={mod} id={r.id} />)}>Edit</button>}
            {can(mod, 'd') && <button className="btn sm red" onClick={() => del(r)}>Delete</button>}
          </td></tr>)}</tbody></table></div>
  </>;
}
export { STD_LABEL };
