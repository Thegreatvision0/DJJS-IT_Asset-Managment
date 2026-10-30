import { getStore } from './store/index.js';
import { verifyToken, pwVersion } from './security.js';
import { HttpError } from './service.js';

/** Requires a valid login token; loads the current user fresh from the database on every request */
export async function requireAuth(req, res, next) {
  try {
    const h = req.headers.authorization || ''; const tok = h.startsWith('Bearer ') ? h.slice(7) : '';
    const p = verifyToken(tok); if (!p) throw new HttpError(401, 'Please sign in');
    const user = await getStore().getDoc('users', p.sub);
    if (!user || user.active === 'No' || pwVersion(user.pwHash) !== p.pv) throw new HttpError(401, 'Session expired — please sign in again');
    req.user = user; next();
  } catch (e) { next(e); }
}
