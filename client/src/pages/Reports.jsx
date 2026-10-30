import React, { useState } from 'react';
import { DB, fmtD, money, specsFor } from '@shared/core.js';
import { REPORTS } from '@shared/insights.js';
import { Badge, downloadCSV } from '../lib.jsx';

const fmtC = (h, c) => /date|issued|due|returned|received|sent|expected|handed|warranty end|tested|resolved|reported|next visit|^date$/i.test(h) && /^\d{4}-\d{2}-\d{2}/.test(c) ? fmtD(c)
  : /cost|value|total|quote|amount|labour|parts$/i.test(h) && c !== '' && c != null && !isNaN(c) ? money(c) : /status|result|renewal/i.test(h) ? <Badge s={c} /> : (c ?? '');
export default function Reports() {
  const [r, setR] = useState('inv_cat');
  const [rc, setRc] = useState(() => (DB.assets.find(a => specsFor(a.categoryId).length) || {}).categoryId || 'Switch');
  const data = REPORTS[r].run({ rc });
  return <>
    <div className="toolbar"><select value={r} onChange={e => setR(e.target.value)}>{Object.entries(REPORTS).map(([k, v]) => <option key={k} value={k}>{v.l}</option>)}</select>
      {REPORTS[r].pick && <select value={rc} onChange={e => setRc(e.target.value)}>{Object.entries(DB.masters.catGroups).map(([g, l]) => <optgroup key={g} label={g}>{l.map(c => <option key={c}>{c}</option>)}</optgroup>)}</select>}
      <span className="sp" /><span className="muted">{data.length - 1} row(s)</span><button className="btn" onClick={() => downloadCSV(data, r)}>Export CSV</button><button className="btn" onClick={() => window.print()}>Print</button></div>
    <div className="card" style={{ padding: 0 }}><div className="tw" style={{ border: 0 }}><table><thead><tr>{data[0].map((c, i) => <th key={i}>{c}</th>)}</tr></thead><tbody>
      {data.length > 1 ? data.slice(1).map((row, i) => <tr key={i}>{row.map((c, j) => <td key={j}>{fmtC(data[0][j], c)}</td>)}</tr>) : <tr><td colSpan={data[0].length} className="empty">No data.</td></tr>}</tbody></table></div></div>
  </>;
}
