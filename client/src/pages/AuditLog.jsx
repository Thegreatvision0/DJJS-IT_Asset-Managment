import React, { useEffect, useState } from 'react';
import { fmtDT } from '@shared/core.js';
import { api, downloadCSV } from '../lib.jsx';

export default function AuditLog() {
  const [q, setQ] = useState(''); const [u, setU] = useState(''); const [d, setD] = useState({ entries: null, users: [] });
  useEffect(() => { const t = setTimeout(() => api(`/audit?limit=800&q=${encodeURIComponent(q)}&user=${encodeURIComponent(u)}`).then(setD, () => setD({ entries: [], users: [] })), 250); return () => clearTimeout(t); }, [q, u]);
  const rows = d.entries || [];
  return <>
    <div className="toolbar"><input type="search" placeholder="Search audit log…" value={q} onChange={e => setQ(e.target.value)} />
      <select value={u} onChange={e => setU(e.target.value)}><option value="">All users</option>{d.users.map(n => <option key={n}>{n}</option>)}</select>
      <span className="sp" /><span className="muted">{rows.length} entr(ies)</span><button className="btn" onClick={() => downloadCSV([['When', 'User', 'Action', 'Module', 'Ref', 'Detail'], ...rows.map(x => [x.at, x.user, x.action, x.module, x.ref, x.detail])], 'audit_log')}>Export CSV</button></div>
    <div className="tw"><table><thead><tr><th>When</th><th>User</th><th>Action</th><th>Module</th><th>Ref</th><th>Detail</th></tr></thead><tbody>
      {d.entries === null ? <tr><td colSpan={6} className="empty">Loading…</td></tr> : rows.length ? rows.map(x => <tr key={x.id}><td style={{ whiteSpace: 'nowrap' }}>{fmtDT(x.at)}</td><td>{x.user}</td><td><b>{x.action}</b></td><td>{x.module}</td><td>{x.ref}</td><td className="muted">{x.detail}</td></tr>) : <tr><td colSpan={6} className="empty">No entries.</td></tr>}
    </tbody></table></div>
  </>;
}
