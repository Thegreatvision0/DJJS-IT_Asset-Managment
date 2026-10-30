/* Tiny hash router: #/view?key=value */
import { useEffect, useState } from 'react';
export function parseHash() {
  const h = (window.location.hash || '').replace(/^#\/?/, ''); const [v, q] = h.split('?');
  const params = {}; new URLSearchParams(q || '').forEach((val, k) => { params[k] = val; });
  return { view: v || 'dashboard', params };
}
export function navigate(view, params = {}) {
  const q = new URLSearchParams(Object.entries(params).filter(([, v]) => v !== '' && v != null)).toString();
  window.location.hash = '#/' + view + (q ? '?' + q : '');
}
export function useRoute() {
  const [r, setR] = useState(parseHash());
  useEffect(() => { const f = () => setR(parseHash()); window.addEventListener('hashchange', f); return () => window.removeEventListener('hashchange', f); }, []);
  return r;
}
