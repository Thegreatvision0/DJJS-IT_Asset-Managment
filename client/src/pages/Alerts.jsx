import React, { useState } from 'react';
import { M } from '@shared/core.js';
import { alertItems, opsAlerts } from '@shared/insights.js';
import { useApp, Badge, Expiry } from '../lib.jsx';
import { navigate } from '../router.js';
import { AlertRow } from './Dashboard.jsx';

export default function Alerts({ params }) {
  const { can } = useApp(); const [b, setB] = useState(params.b || 'all');
  const all = alertItems().filter(x => can(x.view, 'v')); const ops = opsAlerts().filter(x => can(x[2], 'v'));
  const buckets = [['all', 'All'], ['exp', 'Expired / Overdue'], ['7', '≤ 7 days'], ['15', '≤ 15 days'], ['30', '≤ 30 days'], ['60', '≤ 60 days'], ['90', '≤ 90 days']];
  const fil = k => all.filter(x => k === 'all' ? true : k === 'exp' ? x.days < 0 : x.days >= 0 && x.days <= +k);
  const rows = fil(b);
  return <>
    <div className="card"><h3>Operational Alerts ({ops.length})</h3>{ops.length ? ops.map(([c, t, v], i) => <AlertRow key={i} c={c} t={t} v={v} />) : <div className="muted">No operational alerts.</div>}</div>
    <div className="card"><h3>Expiry & Due-Date Register</h3>
      <div className="chips" style={{ marginBottom: 12 }}>{buckets.map(([k, l]) => <span key={k} className={'chip' + (b === k ? ' on' : '')} onClick={() => setB(k)}>{l} ({fil(k).length})</span>)}</div>
      <div className="tw"><table><thead><tr><th>Type</th><th>Ref</th><th>Item</th><th>Due / Expiry</th><th>Owner</th><th>Status</th><th /></tr></thead><tbody>
        {rows.length ? rows.map((x, i) => <tr key={i}><td>{x.type}</td><td><b>{x.ref}</b></td><td>{x.name}</td><td><Expiry d={x.date} /></td><td>{x.owner}</td><td><Badge s={x.status} /></td><td><button className="btn sm" onClick={() => navigate(x.view, { q: x.ref })}>Open</button></td></tr>) : <tr><td colSpan={7} className="empty">Nothing in this window.</td></tr>}
      </tbody></table></div>
      <p className="muted" style={{ fontSize: 12 }}>Reminder windows: {M('reminderDays').join(', ')} days (Settings).</p></div>
  </>;
}
