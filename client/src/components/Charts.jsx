/* Dashboard charts — plain SVG, no chart library.
   Palette: validated categorical order (blue, orange, aqua, yellow) on the white card surface.
   Every chart has hover tooltips and a Table view (aqua/yellow are below 3:1 on white). */
import React, { useEffect, useRef, useState } from 'react';

export const SERIES = ['#2a78d6', '#eb6834', '#1baf7a', '#eda100'];
const INK = { muted: '#7a8496', grid: '#e9edf3', axis: '#c9d1dc' };
const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/* ---------- helpers ---------- */
/** n month keys (YYYY-MM) ending at this month (offset 0) or starting next month (future) */
export function monthKeys(n, future) {
  const d = new Date(); d.setDate(1); const out = [];
  for (let i = 0; i < n; i++) { const x = new Date(d.getFullYear(), d.getMonth() + (future ? i : i - n + 1), 1); out.push(x.getFullYear() + '-' + String(x.getMonth() + 1).padStart(2, '0')); }
  return out;
}
export const monthLabel = (k, i) => { const [y, m] = k.split('-'); return MON[+m - 1] + (i === 0 || m === '01' ? ' ’' + y.slice(2) : ''); };
export function fmtNum(n, money) {
  const a = Math.abs(n), p = money ? '₹' : '';
  if (money && a >= 1e7) return p + +(n / 1e7).toFixed(a >= 1e8 ? 0 : 1) + 'Cr';
  if (money && a >= 1e5) return p + +(n / 1e5).toFixed(a >= 1e6 ? 0 : 1) + 'L';
  if (a >= 1e3) return p + +(n / 1e3).toFixed(a >= 1e4 ? 0 : 1) + 'K';
  return p + Math.round(n).toLocaleString('en-IN');
}
export const fmtFull = (n, money) => (money ? '₹' : '') + Math.round(n).toLocaleString('en-IN');
function ticks(max) {
  if (!(max > 0)) return [0, 1];
  const raw = max / 4, pow = 10 ** Math.floor(Math.log10(raw)), m = raw / pow;
  const step = Math.max(1, (m <= 1 ? 1 : m <= 2 ? 2 : m <= 2.5 ? 2.5 : m <= 5 ? 5 : 10) * pow);
  const out = []; for (let v = 0; v <= max + step * .999; v += step) out.push(v); return out.length > 1 ? out : [0, step];
}
function useWidth() {
  const ref = useRef(); const [w, setW] = useState(0);
  useEffect(() => { const el = ref.current; if (!el) return; const ro = new ResizeObserver(([e]) => setW(Math.round(e.contentRect.width))); ro.observe(el); return () => ro.disconnect(); }, []);
  return [ref, w];
}
/** bar path: 4px rounded data-end, square at the baseline */
const barPath = (x, y, w, h, r = 4) => { if (h <= 0) return ''; r = Math.min(r, h, w / 2); return `M${x},${y + h}V${y + r}Q${x},${y} ${x + r},${y}H${x + w - r}Q${x + w},${y} ${x + w},${y + r}V${y + h}Z`; };
const hbarPath = (x, y, w, h, r = 4) => { if (w <= 0) return ''; r = Math.min(r, w, h / 2); return `M${x},${y}H${x + w - r}Q${x + w},${y} ${x + w},${y + r}V${y + h - r}Q${x + w},${y + h} ${x + w - r},${y + h}H${x}Z`; };

/* ---------- tooltip ---------- */
function Tip({ tip }) {
  if (!tip) return null;
  const left = Math.min(tip.x + 14, window.innerWidth - 230), top = tip.y + 14;
  return <div className="ch-tip" style={{ left, top }} role="status">
    <b>{tip.title}</b>
    {tip.rows.map(([c, l, v], i) => <div key={i}>{c && <i style={{ background: c }} />}<span>{l}</span><em>{v}</em></div>)}
  </div>;
}
const useTip = () => { const [tip, setTip] = useState(null); const show = (e, title, rows) => setTip({ x: e.clientX, y: e.clientY, title, rows }); return [tip, show, () => setTip(null)]; };

export function Legend({ series }) {
  if (series.length < 2) return null;
  return <div className="ch-legend">{series.map(s => <span key={s.key}><i style={{ background: s.color }} />{s.label}</span>)}</div>;
}

/* ---------- card with Chart / Table toggle ---------- */
export function ChartCard({ title, sub, table, legend, children, wide, action }) {
  const [tab, setTab] = useState(false);
  return <div className={'card ch-card' + (wide ? ' wide' : '')}>
    <div className="ch-head"><div><h3>{title}</h3>{sub && <div className="ch-sub">{sub}</div>}</div>
      <div className="ch-tools">{action}{table && <button className="btn sm" onClick={() => setTab(!tab)} aria-pressed={tab}>{tab ? 'Chart' : 'Table'}</button>}</div></div>
    {!tab && legend}
    {tab ? <div className="tw ch-table"><table><thead><tr>{table.head.map((h, i) => <th key={i}>{h}</th>)}</tr></thead>
      <tbody>{table.rows.map((r, i) => <tr key={i}>{r.map((c, j) => <td key={j} className={j ? 'num' : ''}>{c}</td>)}</tr>)}</tbody></table></div> : children}
  </div>;
}

/* ---------- column chart (single or stacked series) ---------- */
export function ColumnChart({ labels, series, height = 230, money, onPick }) {
  const [ref, W] = useWidth(); const [tip, show, hide] = useTip(); const [hi, setHi] = useState(-1);
  const totals = labels.map((_, i) => series.reduce((s, x) => s + (x.values[i] || 0), 0));
  const tk = ticks(Math.max(...totals)), top = tk[tk.length - 1];
  const pad = { l: 44, r: 8, t: 10, b: 26 }, iw = Math.max(0, W - pad.l - pad.r), ih = height - pad.t - pad.b;
  const band = labels.length ? iw / labels.length : 0, bw = Math.min(24, band * .62), y = v => pad.t + ih - (v / top) * ih;
  const every = band < 34 ? Math.ceil(34 / Math.max(band, 1)) : 1;
  return <div ref={ref} className="ch-plot" onMouseLeave={() => { hide(); setHi(-1); }}>
    {W > 0 && <svg width={W} height={height} role="img" aria-label={series.map(s => s.label).join(', ')}>
      {tk.map(v => <g key={v}><line x1={pad.l} x2={W - pad.r} y1={y(v)} y2={y(v)} stroke={v ? INK.grid : INK.axis} /><text x={pad.l - 8} y={y(v) + 4} textAnchor="end" className="ch-ax">{fmtNum(v, money)}</text></g>)}
      {labels.map((l, i) => { const x = pad.l + band * i + (band - bw) / 2; let acc = 0; const segs = series.map((s, si) => ({ s, si, v: s.values[i] || 0 })).filter(z => z.v > 0);
        return <g key={i} opacity={hi < 0 || hi === i ? 1 : .45}>
          {segs.map((z, k) => { const y0 = y(acc), y1 = y(acc + z.v); acc += z.v; const last = k === segs.length - 1; const h = y0 - y1 - (last ? 0 : 2);
            return <path key={z.si} d={last ? barPath(x, y1, bw, h) : `M${x},${y1 + 2}h${bw}v${Math.max(0, h)}h${-bw}Z`} fill={z.s.color} />; })}
          {i % every === 0 && <text x={pad.l + band * i + band / 2} y={height - 8} textAnchor="middle" className="ch-ax">{l}</text>}
          <rect x={pad.l + band * i} y={pad.t} width={band} height={ih} fill="transparent" style={{ cursor: onPick ? 'pointer' : 'default' }}
            onMouseMove={e => { setHi(i); show(e, l, [...series.map(s => [s.color, s.label, fmtFull(s.values[i] || 0, money)]), ...(series.length > 1 ? [['', 'Total', fmtFull(totals[i], money)]] : [])]); }}
            onClick={() => onPick && onPick(i)} />
        </g>; })}
    </svg>}<Tip tip={tip} /></div>;
}

/* ---------- line chart with crosshair ---------- */
export function LineChart({ labels, series, height = 230, money }) {
  const [ref, W] = useWidth(); const [tip, show, hide] = useTip(); const [hi, setHi] = useState(-1);
  const tk = ticks(Math.max(0, ...series.flatMap(s => s.values))), top = tk[tk.length - 1];
  const pad = { l: 44, r: 62, t: 12, b: 26 }, iw = Math.max(0, W - pad.l - pad.r), ih = height - pad.t - pad.b;
  const x = i => pad.l + (labels.length > 1 ? iw * i / (labels.length - 1) : iw / 2), y = v => pad.t + ih - (v / top) * ih;
  const every = iw / labels.length < 34 ? Math.ceil(34 / Math.max(iw / labels.length, 1)) : 1;
  const ends = series.map(s => ({ s, v: s.values[s.values.length - 1] || 0 })); const endsClash = ends.length > 1 && Math.abs(y(ends[0].v) - y(ends[1].v)) < 14;
  const move = e => { const r = e.currentTarget.getBoundingClientRect(); const i = Math.max(0, Math.min(labels.length - 1, Math.round((e.clientX - r.left - pad.l) / (iw / Math.max(1, labels.length - 1))))); setHi(i); show(e, labels[i], series.map(s => [s.color, s.label, fmtFull(s.values[i] || 0, money)])); };
  return <div ref={ref} className="ch-plot" onMouseLeave={() => { hide(); setHi(-1); }}>
    {W > 0 && <svg width={W} height={height} role="img" aria-label={series.map(s => s.label).join(', ')}>
      {tk.map(v => <g key={v}><line x1={pad.l} x2={W - pad.r} y1={y(v)} y2={y(v)} stroke={v ? INK.grid : INK.axis} /><text x={pad.l - 8} y={y(v) + 4} textAnchor="end" className="ch-ax">{fmtNum(v, money)}</text></g>)}
      {labels.map((l, i) => i % every === 0 && <text key={i} x={x(i)} y={height - 8} textAnchor="middle" className="ch-ax">{l}</text>)}
      {series.map(s => <g key={s.key}>
        <path d={s.values.map((v, i) => (i ? 'L' : 'M') + x(i) + ',' + y(v || 0)).join('')} fill="none" stroke={s.color} strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" />
        <circle cx={x(labels.length - 1)} cy={y(s.values[s.values.length - 1] || 0)} r="4" fill={s.color} stroke="#fff" strokeWidth="2" />
      </g>)}
      {!endsClash && ends.map(({ s, v }) => <text key={s.key} x={x(labels.length - 1) + 9} y={y(v) + 4} className="ch-end">{fmtNum(v, money)} <tspan className="ch-ax">{s.short || ''}</tspan></text>)}
      {hi >= 0 && <g pointerEvents="none"><line x1={x(hi)} x2={x(hi)} y1={pad.t} y2={pad.t + ih} stroke={INK.axis} />
        {series.map(s => <circle key={s.key} cx={x(hi)} cy={y(s.values[hi] || 0)} r="4.5" fill={s.color} stroke="#fff" strokeWidth="2" />)}</g>}
      <rect x={pad.l} y={pad.t} width={iw} height={ih} fill="transparent" onMouseMove={move} />
    </svg>}<Tip tip={tip} /></div>;
}

/* ---------- horizontal bars (ranked magnitudes, one hue) ---------- */
export function HBarChart({ rows, color = SERIES[0], money, onPick, max = 8 }) {
  const [ref, W] = useWidth(); const [tip, show, hide] = useTip();
  let data = rows.filter(r => r[1] > 0).sort((a, b) => b[1] - a[1]);
  if (data.length > max) { const rest = data.slice(max - 1).reduce((s, r) => s + r[1], 0); data = [...data.slice(0, max - 1), ['Other', rest, null]]; }
  const total = data.reduce((s, r) => s + r[1], 0) || 1, top = Math.max(1, ...data.map(r => r[1]));
  const labW = Math.min(170, W * .38), valW = 54, rowH = 30, bh = 16, iw = Math.max(10, W - labW - valW - 8);
  return <div ref={ref} className="ch-plot" onMouseLeave={hide}>
    {!data.length && <div className="muted ch-empty">No data yet</div>}
    {W > 0 && data.length > 0 && <svg width={W} height={data.length * rowH} role="img">
      {data.map(([l, v, key], i) => { const yy = i * rowH, w = Math.max(2, iw * v / top), short = l.length > 26 ? l.slice(0, 25) + '…' : l;
        return <g key={l} className={onPick && key !== null ? 'ch-pick' : ''} onClick={() => onPick && key !== null && onPick(key ?? l)}
          onMouseMove={e => show(e, l, [[color, 'Count', fmtFull(v, money)], ['', 'Share', Math.round(v / total * 100) + '%']])}>
          <rect x="0" y={yy} width={W} height={rowH} fill="transparent" />
          <text x={labW - 10} y={yy + rowH / 2 + 4} textAnchor="end" className="ch-lab">{short}</text>
          <rect x={labW} y={yy + (rowH - bh) / 2} width={iw} height={bh} rx="4" fill="#f1f4f8" />
          <path d={hbarPath(labW, yy + (rowH - bh) / 2, w, bh)} fill={color} />
          <text x={labW + iw + 8} y={yy + rowH / 2 + 4} className="ch-val">{fmtNum(v, money)}</text>
        </g>; })}
    </svg>}<Tip tip={tip} /></div>;
}

/* ---------- capacity meter: fill carries severity, track is a lighter step ---------- */
export function Meter({ label, used, total, onClick }) {
  const p = total ? Math.round(used / total * 100) : 0;
  const tone = p >= 90 ? 'bad' : p >= 75 ? 'warn' : 'ok';
  return <div className={'meter ' + tone + (onClick ? ' click' : '')} onClick={onClick} title={`${used} of ${total} used`}>
    <div className="meter-top"><span>{label}</span><b>{total ? p + '%' : '—'}</b></div>
    <div className="meter-trk"><span style={{ width: Math.min(100, p) + '%' }} /></div>
    <div className="meter-sub">{used.toLocaleString('en-IN')} of {total.toLocaleString('en-IN')} used{tone !== 'ok' && total ? <em>{tone === 'bad' ? ' · ⚠ Critical' : ' · ▲ High'}</em> : ''}</div>
  </div>;
}

/* ---------- stat tile with optional sparkline ---------- */
export function Spark({ values, color = SERIES[0] }) {
  const w = 96, h = 28, m = Math.max(1, ...values); if (values.length < 2) return null;
  const pts = values.map((v, i) => [i * w / (values.length - 1), h - 3 - (v / m) * (h - 6)]);
  return <svg width={w} height={h} viewBox={`-4 0 ${w + 8} ${h}`} className="spark" aria-hidden="true"><path d={pts.map((p, i) => (i ? 'L' : 'M') + p.join(',')).join('')} fill="none" stroke="#b8c2d1" strokeWidth="1.5" strokeLinejoin="round" />
    <circle cx={pts[pts.length - 1][0]} cy={pts[pts.length - 1][1]} r="3" fill={color} /></svg>;
}
