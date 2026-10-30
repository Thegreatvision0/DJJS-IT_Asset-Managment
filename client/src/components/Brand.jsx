/* DJJS brand: logo (uses /djjs-logo.png when present, otherwise a gold emblem) and the opening intro */
import React, { useEffect, useRef, useState } from 'react';

const LOGO_SRC = '/djjs-logo.png';
let logoMissing = false;

export function Emblem({ size = 40, className = '' }) {
  const [img, setImg] = useState(!logoMissing);
  if (img) return <img className={'emblem ' + className} src={LOGO_SRC} width={size} height={size} alt="DJJS" onError={() => { logoMissing = true; setImg(false); }} />;
  return <svg className={'emblem ' + className} width={size} height={size} viewBox="0 0 120 120" role="img" aria-label="DJJS">
    <defs>
      <linearGradient id="emG" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stopColor="#fbe9a8" /><stop offset=".45" stopColor="#d4a640" /><stop offset=".7" stopColor="#f6dc8c" /><stop offset="1" stopColor="#9c7224" /></linearGradient>
      <radialGradient id="emF" cx=".5" cy=".62" r=".5"><stop offset="0" stopColor="#fff6d6" /><stop offset=".5" stopColor="#f2c75c" /><stop offset="1" stopColor="#c48a1e" /></radialGradient>
    </defs>
    <circle className="em-ring" cx="60" cy="60" r="56" fill="none" stroke="url(#emG)" strokeWidth="3" />
    <circle cx="60" cy="60" r="47" fill="#0b1a2e" stroke="url(#emG)" strokeWidth="1.2" />
    <g className="em-rays" stroke="url(#emG)" strokeWidth="2" strokeLinecap="round">
      {Array.from({ length: 16 }, (_, i) => i).filter(i => i < 6 || i > 10).map(i => { const a = i * Math.PI / 8; const r1 = i % 2 ? 33 : 30, r2 = 43; return <line key={i} x1={60 + r1 * Math.sin(a)} y1={60 - r1 * Math.cos(a)} x2={60 + r2 * Math.sin(a)} y2={60 - r2 * Math.cos(a)} opacity={i % 2 ? .55 : 1} />; })}
    </g>
    <path className="em-flame" d="M60 30c9 12 15 20 15 30a15 15 0 0 1-30 0c0-6 3-11 7-15-.5 5 1.5 9 4.5 10.5C55 47 57 39 60 30z" fill="url(#emF)" />
    <text x="60" y="100" textAnchor="middle" fontFamily="Cinzel, Georgia, serif" fontWeight="700" fontSize="11" letterSpacing="2" fill="url(#emG)">DJJS</text>
  </svg>;
}

/* gold dust drifting upward, drawn on a canvas */
function Particles() {
  const ref = useRef();
  useEffect(() => {
    const c = ref.current, x = c.getContext('2d'); let raf, w, h; const dpr = Math.min(2, window.devicePixelRatio || 1);
    const size = () => { w = c.width = innerWidth * dpr; h = c.height = innerHeight * dpr; };
    size(); addEventListener('resize', size);
    const P = Array.from({ length: Math.min(110, Math.round(innerWidth / 12)) }, () => ({ x: Math.random(), y: Math.random(), r: .4 + Math.random() * 1.8, s: .0006 + Math.random() * .0018, t: Math.random() * 6.28 }));
    const draw = () => {
      x.clearRect(0, 0, w, h);
      P.forEach(p => { p.y -= p.s; p.t += .03; if (p.y < -.02) { p.y = 1.02; p.x = Math.random(); }
        const a = .35 + .45 * Math.sin(p.t); x.beginPath(); x.arc((p.x + Math.sin(p.t * .3) * .01) * w, p.y * h, p.r * dpr, 0, 6.28);
        x.fillStyle = `rgba(242,205,120,${a})`; x.shadowColor = 'rgba(255,215,120,.9)'; x.shadowBlur = 6 * dpr; x.fill(); });
      raf = requestAnimationFrame(draw);
    };
    draw(); return () => { cancelAnimationFrame(raf); removeEventListener('resize', size); };
  }, []);
  return <canvas ref={ref} className="intro-dust" aria-hidden="true" />;
}

/* cinematic opening — plays once per browser session.
   Scene 1: Guru Ji's portrait · Scene 2: DJJS logo and titles. Click moves on; Skip / Esc ends it. */
const SEEN = 'djjs_intro_seen';
const GURU_SRC = '/guruji.png';
export function Intro() {
  const reduced = typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
  const [state, setState] = useState(() => { try { return sessionStorage.getItem(SEEN) ? 'done' : 'play'; } catch { return 'play'; } });
  const [scene, setScene] = useState(1); const [guru, setGuru] = useState(true);
  const [video, setVideo] = useState(true); const [playing, setPlaying] = useState(false); // optional /intro.mp4 plays to its end
  const end = () => { try { sessionStorage.setItem(SEEN, '1'); } catch { /* ignore */ } setState(s => s === 'done' ? s : 'out'); };
  const shown = guru ? scene : 2;
  useEffect(() => {
    if (state !== 'play') return;
    const k = e => { if (['Escape', 'Enter', ' '].includes(e.key)) end(); }; addEventListener('keydown', k);
    const t = shown === 1 ? setTimeout(() => setScene(2), reduced ? 2200 : 4700) : playing ? 0 : setTimeout(end, reduced ? 1800 : 6200);
    return () => { clearTimeout(t); removeEventListener('keydown', k); };
  }, [state, shown, playing]);
  useEffect(() => { if (state === 'out') { const t = setTimeout(() => setState('done'), 900); return () => clearTimeout(t); } }, [state]);
  if (state === 'done') return null;
  return <div className={'intro' + (state === 'out' ? ' out' : '') + (reduced ? ' still' : '') + (playing ? ' has-video' : '')} onClick={() => shown === 1 ? setScene(2) : end()} role="presentation">
    {video && !reduced && <video className="intro-video" src="/intro.mp4" autoPlay muted playsInline onError={() => setVideo(false)} onPlaying={() => setPlaying(true)} onEnded={end} />}
    <div className="intro-rays" /><div className="intro-glow" />{!reduced && <Particles />}
    {shown === 1 ? <div className="intro-guru">
      <div className="guru-frame"><span className="guru-wave" /><span className="guru-wave w2" /><span className="guru-wave w3" />
        <div className="guru-photo"><img src={GURU_SRC} alt="Bhagwan Shri Ashutosh Maharaj Ji" onError={() => setGuru(false)} /></div></div>
      <div className="intro-rule"><i /><b>✦</b><i /></div>
      <h2 className="gold-text guru-name">Bhagwan Shri Ashutosh Maharaj Ji</h2>
    </div> :
    <div className="intro-stage">
      <div className="intro-logo"><span className="intro-halo" /><Emblem size={150} /></div>
      <h1 className="gold-text intro-title">Divya Jyoti Jagrati Sansthan</h1>
      <div className="intro-rule"><i /><b>✦</b><i /></div>
      <h2 className="gold-text intro-sub">IT Department · Nurmahal</h2>
      <p className="intro-app">IT Asset Management</p>
    </div>}
    {shown === 2 && <div className="intro-flare" />}
    <button className="intro-skip" onClick={e => { e.stopPropagation(); end(); }}>Skip ›</button>
  </div>;
}
