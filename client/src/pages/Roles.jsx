import React, { useState } from 'react';
import { DB } from '@shared/core.js';
import { PERMS, ACT_LABEL } from '@shared/modules.js';
import { api, useApp, Badge, SimpleTable } from '../lib.jsx';

export default function Roles() {
  const { can, mutate, toast, load, me, apply } = useApp(); const w = can('roles', 'e');
  const [sel, setSel] = useState(DB.roles[0] && DB.roles[0].id); const r = DB.roles.find(x => x.id === sel) || DB.roles[0]; const lock = r.all || !w;
  const save = async (id, body, after) => { const before = DB.roles.find(x => x.id === id); if (body.perms && before) apply({ changed: { roles: [{ ...before, perms: body.perms }] } }); try { const res = await mutate(() => api('/roles/' + id, { method: 'PUT', body }), { quiet: true }); if (id === me.roleId) await load(); if (after) after(res); } catch (e) { if (before) apply({ changed: { roles: [before] } }); toast(e.message, 1); } };
  const setPerm = (mod, a, on) => { const p = JSON.parse(JSON.stringify(r.perms || {})); p[mod] = p[mod] || {}; p[mod][a] = on; if (on && a !== 'v') p[mod].v = true; if (!on && a === 'v') p[mod] = {}; save(r.id, { perms: p }); };
  const setAll = all => { const p = {}; PERMS.forEach(([k, , acts]) => { p[k] = {}; [...acts].forEach(a => { if (all || a === 'v') p[k][a] = true; }); }); save(r.id, { perms: p }); };
  const add = async (name, perms) => { try { const res = await mutate(() => api('/roles', { method: 'POST', body: { name, perms } }), { quiet: true }); setSel(res.record.id); } catch (e) { toast(e.message, 1); } };
  const rename = () => { const n = (window.prompt('Rename role', r.name) || '').trim(); if (n && n !== r.name) save(r.id, { name: n }); };
  const del = async () => { if (!window.confirm('Delete role ' + r.name + '?')) return; try { await mutate(() => api('/roles/' + r.id, { method: 'DELETE' }), { quiet: true }); setSel(DB.roles[0].id); } catch (e) { toast(e.message, 1); } };
  return <>
    <div className="toolbar">{DB.roles.map(x => <span key={x.id} className={'chip' + (x.id === r.id ? ' on' : '')} onClick={() => setSel(x.id)}>{x.name} <span className="n">{DB.users.filter(u => u.roleId === x.id).length}</span></span>)}<span className="sp" />
      {w && <button className="btn" onClick={() => { const n = (window.prompt('New role name') || '').trim(); if (n) add(n, { dashboard: { v: true } }); }}>+ New Role</button>}</div>
    <div className="card"><h3>{r.name} {r.all && <span className="b info">Full access — fixed</span>}</h3>
      {w && !r.all && <div className="toolbar"><button className="btn sm" onClick={rename}>Rename</button><button className="btn sm" onClick={() => add(r.name + ' (copy)', r.perms)}>Duplicate</button><button className="btn sm red" onClick={del}>Delete Role</button><span className="sp" /><button className="btn sm" onClick={() => setAll(true)}>Allow all</button><button className="btn sm" onClick={() => setAll(false)}>View only</button></div>}
      <div className="tw"><table className="pm"><thead><tr><th>Module</th>{Object.values(ACT_LABEL).map(a => <th key={a}>{a}</th>)}</tr></thead><tbody>
        {PERMS.map(([k, l, acts]) => <tr key={k}><td>{l}</td>{Object.keys(ACT_LABEL).map(a => acts.includes(a) ? <td key={a}><input type="checkbox" data-perm={k + '.' + a} checked={!!(r.all || ((r.perms || {})[k] || {})[a])} disabled={lock} onChange={e => setPerm(k, a, e.target.checked)} /></td> : <td key={a} className="muted">—</td>)}</tr>)}</tbody></table></div>
      <p className="muted" style={{ fontSize: 12, marginBottom: 0 }}>Approve = approve temporary-issue requests, vendor repair quotes and purchase orders. The server checks these permissions on every request.</p></div>
    <div className="card"><h3>Users with this role</h3><SimpleTable head={['Username', 'Name', 'Department', 'Active']} rows={DB.users.filter(u => u.roleId === r.id).map(u => [u.username, u.name, u.department, <Badge s={u.active} />])} /></div>
  </>;
}
