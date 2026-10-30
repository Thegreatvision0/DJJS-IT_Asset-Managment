import React, { useState } from 'react';
import { DB, ASSET_STATUSES, SYS_STATUSES, STD, STD_LABEL, CAT_SPECS, profile, specsFor, catGroupOf, COMBO_LABEL, M } from '@shared/core.js';
import { api, useApp, Badge, Modal } from '../lib.jsx';
import { navigate } from '../router.js';

const MASTER_LABELS = { departments: 'Departments', locationTypes: 'Location Types', conditions: 'Conditions', priorities: 'Priorities', purposes: 'Temporary Issue Purposes', borrowerTypes: 'Borrower Types', linkTypes: 'Link Types', partTypes: 'Part Types', visitTypes: 'AMC Visit Types', serviceCategories: 'Vendor Service Categories', licenceTypes: 'Licence Types', contractTypes: 'Contract Types', renewalStatuses: 'Renewal Statuses', carriers: 'Carriers', reminderDays: 'Reminder Windows (days)' };

function useSettings() {
  const { mutate, toast } = useApp();
  return async (patch, msg) => { try { await mutate(() => api('/settings', { method: 'PATCH', body: patch }), { quiet: true }); if (msg) toast(msg); return true; } catch (e) { toast(e.message, 1); return false; } };
}
function MasterCard({ k, l, w }) {
  const patch = useSettings(); const [v, setV] = useState(''); const list = DB.masters[k] || [];
  const add = async () => { const x = v.trim(); if (!x) return; if (list.some(y => y.toLowerCase() === x.toLowerCase())) return; if (await patch({ [k]: [...list, x] })) setV(''); };
  return <div className="card"><h3>{l}</h3><div className="ml">{list.length ? list.map((x, i) => <span className="t" key={x}>{x} {w && <button title="Remove" onClick={() => window.confirm(`Remove “${x}”? Existing records keep their value.`) && patch({ [k]: list.filter((_, j) => j !== i) })}>×</button>}</span>) : <span className="muted">Empty</span>}</div>
    {w && <div className="toolbar" style={{ margin: 0 }}><input id={'m_' + k} placeholder="Add…" value={v} onChange={e => setV(e.target.value)} onKeyDown={e => e.key === 'Enter' && add()} /><button className="btn sm" onClick={add}>Add</button></div>}</div>;
}

export function CategoryEditor({ cat }) {
  const { can, closeModal, toast } = useApp(); const patch = useSettings(); const w = can('settings', 'e');
  const p = profile(cat); const built = CAT_SPECS[cat] || [];
  const [show, setShow] = useState(p.show); const [req, setReq] = useState(p.req);
  const [hidden, setHidden] = useState(((DB.masters.hiddenSpecs || {})[cat]) || []);
  const custom = ((DB.masters.customSpecs || {})[cat]) || [];
  const [nf, setNf] = useState({ l: '', t: 'text', o: '', r: false });
  const toggle = (arr, set, k, on) => set(on ? [...new Set([...arr, k])] : arr.filter(x => x !== k));
  const save = async () => {
    const s = show.includes('connPort') && !show.includes('connSwitch') ? [...show, 'connSwitch'] : show;
    if (await patch({ catFields: { ...(DB.masters.catFields || {}), [cat]: { show: s, req: req.filter(k => s.includes(k)) } }, hiddenSpecs: { ...(DB.masters.hiddenSpecs || {}), [cat]: hidden } }, cat + ' fields saved')) closeModal();
  };
  const reset = async () => { if (!window.confirm('Reset ' + cat + ' to the default fields?')) return; const cf = { ...(DB.masters.catFields || {}) }; delete cf[cat]; const hs = { ...(DB.masters.hiddenSpecs || {}) }; delete hs[cat]; if (await patch({ catFields: cf, hiddenSpecs: hs }, 'Reset')) closeModal(); };
  const addSpec = async () => {
    const l = nf.l.trim(); if (!l) return toast('Enter a field name', 1); const o = nf.t === 'select' ? nf.o.split(',').map(x => x.trim()).filter(Boolean) : null;
    if (nf.t === 'select' && o.length < 2) return toast('Enter at least two dropdown options', 1);
    if (specsFor(cat).some(f => f.l.toLowerCase() === l.toLowerCase())) return toast('A field with this name already exists', 1);
    if (await patch({ customSpecs: { ...(DB.masters.customSpecs || {}), [cat]: [...custom, { l, t: nf.t, o, r: nf.r }] } }, 'Field added')) setNf({ l: '', t: 'text', o: '', r: false });
  };
  const delSpec = i => { const c = custom[i]; if (!window.confirm(`Remove field “${typeof c === 'string' ? c : c.l}”? Values already saved stay in the record.`)) return; patch({ customSpecs: { ...(DB.masters.customSpecs || {}), [cat]: custom.filter((_, j) => j !== i) } }); };
  return <Modal title={cat + ' — Fields'} wide footer={<>{can('assets', 'v') && <button className="btn" onClick={() => { closeModal(); navigate('assets', { grp: catGroupOf(cat), cat }); }}>View {cat} assets</button>}
    {w ? <><button className="btn" onClick={reset}>Reset to Default</button><button className="btn pri" onClick={save}>Save</button></> : <button className="btn pri" onClick={closeModal}>Close</button>}</>}>
    <p className="muted" style={{ marginTop: 0 }}>Group: <b>{catGroupOf(cat)}</b>. These settings control the New / Edit form for <b>{cat}</b>.</p>
    <h4 style={{ margin: '6px 0' }}>Standard fields</h4>
    <div className="tw"><table className="pm"><thead><tr><th>Field</th><th>Use</th><th>Required</th></tr></thead><tbody>
      {STD.map(k => <tr key={k}><td>{STD_LABEL[k]}</td><td><input type="checkbox" id={'cs_' + k} disabled={!w} checked={show.includes(k)} onChange={e => { toggle(show, setShow, k, e.target.checked); if (!e.target.checked) toggle(req, setReq, k, false); }} /></td>
        <td><input type="checkbox" id={'cr_' + k} disabled={!w} checked={req.includes(k)} onChange={e => { toggle(req, setReq, k, e.target.checked); if (e.target.checked) toggle(show, setShow, k, true); }} /></td></tr>)}</tbody></table></div>
    <h4 style={{ margin: '14px 0 6px' }}>Built-in specification fields</h4>
    {built.length ? <div className="ml">{built.map(f => <label className="t" key={f.k} style={{ paddingRight: 11, cursor: 'pointer' }}><input type="checkbox" disabled={!w} checked={!hidden.includes(f.k)} onChange={e => toggle(hidden, setHidden, f.k, !e.target.checked)} /> {f.l}{f.r ? <span className="muted"> *</span> : null}{f.t === 'calc' ? <span className="muted"> (auto)</span> : null}</label>)}</div> : <p className="muted">None for this category.</p>}
    <h4 style={{ margin: '14px 0 6px' }}>Your own specification fields</h4>
    <div className="ml">{custom.length ? custom.map((c, i) => { const o = typeof c === 'string' ? { l: c, t: 'text' } : c; return <span className="t" key={i}>{o.l} <span className="muted">{o.t === 'select' ? 'dropdown: ' + (o.o || []).join(' / ') : o.t}{o.r ? ', required' : ''}</span> {w && <button onClick={() => delSpec(i)}>×</button>}</span>; }) : <span className="muted">None yet</span>}</div>
    {w && <div className="fg" style={{ marginTop: 8 }}><div className="f"><label>Field name</label><input id="nsp" value={nf.l} placeholder="e.g. Warranty Sticker No." onChange={e => setNf({ ...nf, l: e.target.value })} /></div>
      <div className="f"><label>Type</label><select value={nf.t} onChange={e => setNf({ ...nf, t: e.target.value })}><option value="text">Text</option><option value="number">Number</option><option value="date">Date</option><option value="select">Dropdown</option></select></div>
      {nf.t === 'select' && <div className="f full"><label>Dropdown options (comma separated)</label><input value={nf.o} placeholder="e.g. Yes, No, Not Applicable" onChange={e => setNf({ ...nf, o: e.target.value })} /></div>}
      <div className="f"><label><input type="checkbox" style={{ width: 'auto' }} checked={nf.r} onChange={e => setNf({ ...nf, r: e.target.checked })} /> Required</label></div>
      <div className="f"><button className="btn" onClick={addSpec}>+ Add Field</button></div></div>}
  </Modal>;
}

export default function Settings() {
  const { can, openModal, toast, load, me, db } = useApp(); const patch = useSettings(); const w = can('settings', 'e');
  const isAdmin = !!((db.roles || []).find(r => r.id === me.roleId) || {}).all;
  const [newCat, setNewCat] = useState({}); const [newGrp, setNewGrp] = useState('');
  const G = DB.masters.catGroups; const cnt = {}; DB.assets.forEach(a => cnt[a.categoryId] = (cnt[a.categoryId] || 0) + 1);
  const setGroups = (g, msg) => patch({ catGroups: g }, msg);
  const addCat = async g => { const v = (newCat[g] || '').trim(); if (!v) return; if (M('categories').some(x => x.toLowerCase() === v.toLowerCase())) return toast('Category already exists', 1); if (await setGroups({ ...G, [g]: [...G[g], v] }, 'Category added')) { setNewCat({ ...newCat, [g]: '' }); openModal(<CategoryEditor cat={v} />); } };
  const delCat = (g, c) => { if (cnt[c]) return toast(`${cnt[c]} asset(s) use “${c}” — move them first`, 1); if (window.confirm(`Remove category “${c}”?`)) setGroups({ ...G, [g]: G[g].filter(x => x !== c) }); };
  const delGrp = g => { if (!window.confirm(`Remove group “${g}” and its empty categories?`)) return; const n = { ...G }; delete n[g]; if (!n.Other) n.Other = ['Other']; setGroups(n); };
  const addGrp = async () => { const v = newGrp.trim(); if (!v) return; if (G[v]) return toast('Group already exists', 1); if (await setGroups({ ...G, [v]: [] })) setNewGrp(''); };
  const backup = async () => { try { const d = await api('/backup'); const b = new Blob([JSON.stringify(d, null, 1)], { type: 'application/json' }); const a = document.createElement('a'); a.href = URL.createObjectURL(b); a.download = 'djjs_itam_backup_' + new Date().toISOString().slice(0, 10) + '.json'; a.click(); } catch (e) { toast(e.message, 1); } };
  const restore = e => { const f = e.target.files[0]; if (!f) return; const rd = new FileReader(); rd.onload = async () => { try { const d = JSON.parse(rd.result); if (!window.confirm('Replace ALL current data with this backup?')) return; const r = await api('/restore', { method: 'POST', body: d }); await load(); toast(r.keptAccounts ? 'Backup restored (existing user accounts kept)' : 'Backup restored'); } catch (err) { toast(err.message || 'Not a valid backup file', 1); } }; rd.readAsText(f); e.target.value = ''; };
  return <>
    {isAdmin && <div className="card"><h3>Data</h3><p className="muted" style={{ marginTop: 0 }}>Data is stored in MongoDB on the server. Export a JSON backup regularly (in addition to database backups). A backup from the old single-file version can also be imported here.</p>
      <div className="toolbar" style={{ margin: 0 }}><button className="btn" onClick={backup}>Export Backup (JSON)</button><label className="btn">Import Backup<input type="file" accept=".json" hidden onChange={restore} /></label></div></div>}
    <div className="card"><h3>Asset Statuses</h3><div className="ml">{ASSET_STATUSES.map(s => <span key={s}><Badge s={s} />{SYS_STATUSES.includes(s) && <span className="muted" style={{ fontSize: 11 }}> auto</span>} </span>)}</div><p className="muted" style={{ fontSize: 12, margin: 0 }}>“auto” statuses are set by Assignments, Temporary Issue, Repair and Maintenance workflows and cannot be chosen manually.</p></div>
    <div className="card"><h3>Asset Categories (hardware)</h3><p className="muted" style={{ marginTop: 0, fontSize: 12.5 }}>Click any category to choose which standard fields it uses (e.g. a Rack has no serial / MAC / IP), which are required, and to add or hide specification fields.</p>
      {Object.entries(G).map(([g, l]) => <div key={g} style={{ borderTop: '1px solid var(--line)', padding: '10px 0' }}><b style={{ color: 'var(--navy)' }}>{g}</b> <span className="muted">({l.length})</span>
        {w && !l.some(c => cnt[c]) && <button className="btn sm red" style={{ float: 'right' }} onClick={() => delGrp(g)}>Remove group</button>}
        <div className="ml">{l.map(c => <span key={c} className="t cl" onClick={() => openModal(<CategoryEditor cat={c} />)} title={'Fields for ' + c}>{c}{cnt[c] ? <span className="muted"> {cnt[c]}</span> : null}{(DB.masters.catFields || {})[c] ? <> <span className="b info">custom</span></> : null} {w && <button title="Remove" onClick={e => { e.stopPropagation(); delCat(g, c); }}>×</button>}</span>)}</div>
        {w && <div className="toolbar" style={{ margin: 0 }}><input placeholder={'Add category to ' + g + '…'} value={newCat[g] || ''} onChange={e => setNewCat({ ...newCat, [g]: e.target.value })} onKeyDown={e => e.key === 'Enter' && addCat(g)} /><button className="btn sm" onClick={() => addCat(g)}>Add</button></div>}</div>)}
      {w && <div className="toolbar" style={{ margin: '6px 0 0', borderTop: '1px solid var(--line)', paddingTop: 10 }}><input placeholder="New category group (e.g. Fire & Safety)…" value={newGrp} onChange={e => setNewGrp(e.target.value)} onKeyDown={e => e.key === 'Enter' && addGrp()} /><button className="btn sm" onClick={addGrp}>Add Group</button></div>}</div>
    <div className="card"><h3>Pick-lists that grow as you type (“+ Add new…”)</h3><p className="muted" style={{ marginTop: 0, fontSize: 12.5 }}>Technician / vendor, staff, person and brand fields are dropdowns. Add a name once with “+ Add new…” and it is available everywhere after that. Employees, vendors and users are included automatically.</p>
      <div className="grid2">{Object.entries(COMBO_LABEL).map(([k, l]) => <MasterCard key={k} k={k} l={l} w={w} />)}</div></div>
    <div className="grid2">{Object.entries(MASTER_LABELS).map(([k, l]) => <MasterCard key={k} k={k} l={l} w={w} />)}</div>
  </>;
}
