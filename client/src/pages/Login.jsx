import React, { useState } from 'react';
import { useApp } from '../lib.jsx';
import { Emblem } from '../components/Brand.jsx';

export default function Login() {
  const { login } = useApp(); const [u, setU] = useState(''); const [p, setP] = useState(''); const [err, setErr] = useState(''); const [busy, setBusy] = useState(false);
  const submit = async e => { e.preventDefault(); setBusy(true); setErr(''); try { await login(u.trim(), p); } catch (x) { setErr(x.message); setBusy(false); setP(''); } };
  return <div className="login" id="login">
    <div className="intro-rays" /><div className="intro-glow" />
    <form className="lbox" onSubmit={submit} autoComplete="off">
      <div className="lhead"><Emblem size={84} />
        <div className="gold-text lorg">Divya Jyoti Jagrati Sansthan</div>
        <div className="gold-text ldept">IT Department · Nurmahal</div>
      </div>
      <h2>IT Asset Management</h2>
      <div className="muted" style={{ fontSize: 12.5 }}>Infrastructure, Data Centre, Asset &amp; Compliance</div>
      {err && <div className="err" id="lerr" style={{ display: 'block', marginTop: 12 }}>{err}</div>}
      <div className="f"><label htmlFor="lu">Username</label><input id="lu" autoComplete="username" value={u} onChange={e => setU(e.target.value)} required autoFocus /></div>
      <div className="f"><label htmlFor="lp">Password</label><input id="lp" type="password" autoComplete="current-password" value={p} onChange={e => setP(e.target.value)} required /></div>
      <button className="btn pri" type="submit" disabled={busy}>{busy ? 'Signing in…' : 'Sign in'}</button>    </form>
  </div>;
}
