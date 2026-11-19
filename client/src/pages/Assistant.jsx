/* AI Assistant: ask questions about the asset data in plain language (read-only) */
import React, { useEffect, useRef, useState } from 'react';
import { api, useApp } from '../lib.jsx';

// kept outside the component so the chat survives moving to another page and back (cleared on reload / logout)
const memory = { user: '', history: [], sig: '', chat: [] };

const SUGGEST = [
  'Which warranties and AMC contracts expire in the next 60 days?',
  'Give me a summary of assets by status and category group',
  'Which repair jobs are still open, and which items are at vendors?',
  'Show all faulty assets and where they are',
  'Which assets has nobody physically verified in the last year?',
  'आज कौन से अलर्ट सबसे ज़रूरी हैं?',
];

/* ---------- tiny, safe Markdown renderer (no HTML injection: everything is React text) ---------- */
function inline(s, key) {
  const out = []; const re = /(\*\*[^*]+\*\*|`[^`]+`)/g; let last = 0, m, i = 0;
  while ((m = re.exec(s))) {
    if (m.index > last) out.push(s.slice(last, m.index));
    const t = m[0]; out.push(t.startsWith('**') ? <b key={key + '-' + i++}>{t.slice(2, -2)}</b> : <code key={key + '-' + i++}>{t.slice(1, -1)}</code>);
    last = m.index + t.length;
  }
  if (last < s.length) out.push(s.slice(last));
  return out;
}
const cells = l => l.trim().replace(/^\||\|$/g, '').split('|').map(c => c.trim());
function Markdown({ text }) {
  const lines = String(text || '').split('\n'); const blocks = []; let i = 0;
  while (i < lines.length) {
    const l = lines[i];
    if (/^\s*\|.*\|\s*$/.test(l) && i + 1 < lines.length && /^\s*\|?\s*:?-{2,}/.test(lines[i + 1])) { // table
      const head = cells(l); const rows = []; i += 2;
      while (i < lines.length && /^\s*\|.*\|\s*$/.test(lines[i])) rows.push(cells(lines[i++]));
      blocks.push(<div className="tw" key={blocks.length}><table className="lst ai-tbl"><thead><tr>{head.map((h, j) => <th key={j}>{inline(h, 'h' + j)}</th>)}</tr></thead>
        <tbody>{rows.map((r, ri) => <tr key={ri}>{r.map((c, j) => <td key={j}>{inline(c, ri + '-' + j)}</td>)}</tr>)}</tbody></table></div>);
      continue;
    }
    if (/^\s*([-*•]|\d+[.)])\s+/.test(l)) { // list
      const ordered = /^\s*\d/.test(l); const items = [];
      while (i < lines.length && /^\s*([-*•]|\d+[.)])\s+/.test(lines[i])) items.push(lines[i++].replace(/^\s*([-*•]|\d+[.)])\s+/, ''));
      const L = ordered ? 'ol' : 'ul';
      blocks.push(<L key={blocks.length}>{items.map((t, j) => <li key={j}>{inline(t, 'li' + j)}</li>)}</L>);
      continue;
    }
    const h = /^(#{1,4})\s+(.*)/.exec(l);
    if (h) { blocks.push(<h4 key={blocks.length}>{inline(h[2], 'h')}</h4>); i++; continue; }
    if (!l.trim()) { i++; continue; }
    const para = []; while (i < lines.length && lines[i].trim() && !/^\s*([-*•]|\d+[.)])\s+|^#{1,4}\s|^\s*\|/.test(lines[i])) para.push(lines[i++]);
    if (!para.length) { para.push(lines[i++]); }
    blocks.push(<p key={blocks.length}>{para.map((t, j) => <React.Fragment key={j}>{j > 0 && <br />}{inline(t, 'p' + j)}</React.Fragment>)}</p>);
  }
  return <>{blocks}</>;
}

export default function Assistant() {
  const { me } = useApp();
  if (memory.user !== me.id) Object.assign(memory, { user: me.id, history: [], sig: '', chat: [] });
  const [chat, setChat] = useState(memory.chat); const [text, setText] = useState(''); const [busy, setBusy] = useState(false);
  const end = useRef(); const box = useRef();
  useEffect(() => { end.current && end.current.scrollIntoView({ block: 'end', behavior: 'smooth' }); }, [chat, busy]);
  const ask = async q => {
    q = String(q || '').trim(); if (!q || busy) return;
    const next = [...memory.chat, { who: 'me', text: q }]; memory.chat = next; setChat(next); setText(''); setBusy(true);
    try {
      const r = await api('/assistant', { method: 'POST', body: { history: memory.history, sig: memory.sig, text: q } });
      memory.history = r.history; memory.sig = r.sig; memory.chat = [...memory.chat, { who: 'ai', text: r.answer }];
    } catch (e) { memory.chat = [...memory.chat, { who: 'err', text: e.message }]; }
    setChat(memory.chat); setBusy(false); setTimeout(() => box.current && box.current.focus(), 50);
  };
  const reset = () => { memory.history = []; memory.sig = ''; memory.chat = []; setChat([]); };
  return <div className="ai">
    <div className="ai-head"><div><b>AI Assistant</b><span>Ask about assets, repairs, renewals, vendors, people and history. It only reads data; it never changes anything.</span></div>
      {chat.length > 0 && <button className="btn sm" onClick={reset} disabled={busy}>New chat</button>}</div>
    <div className="ai-log">
      {!chat.length && <div className="ai-empty"><p>Try one of these:</p><div className="ai-sug">{SUGGEST.map(s => <button key={s} className="chip" onClick={() => ask(s)}>{s}</button>)}</div></div>}
      {chat.map((m, i) => <div key={i} className={'ai-msg ' + m.who}>{m.who === 'ai' ? <Markdown text={m.text} /> : m.text}</div>)}
      {busy && <div className="ai-msg ai wait"><span className="dots"><i /><i /><i /></span> Looking it up…</div>}
      <div ref={end} />
    </div>
    <form className="ai-in" onSubmit={e => { e.preventDefault(); ask(text); }}>
      <textarea ref={box} rows={2} value={text} maxLength={4000} placeholder="Ask a question… (Enter to send, Shift+Enter for a new line)" onChange={e => setText(e.target.value)}
        onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); ask(text); } }} autoFocus />
      <button className="btn pri" type="submit" disabled={busy || !text.trim()}>Send</button>
    </form>
    <div className="ai-note muted">Answers are written by AI (Claude) from this app’s data and can be wrong. Check important figures in the app before acting.</div>
  </div>;
}
