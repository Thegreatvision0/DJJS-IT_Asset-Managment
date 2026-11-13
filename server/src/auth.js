import { verifyToken, pwVersion } from './security.js';
import { HttpError, loadDataset } from './service.js';

/** Requires a valid login token; checks the current user against the latest data on every request.
    The loaded dataset is kept on req.db so read routes don't load it a second time. */
export async function requireAuth(req, res, next) {
  try {
    const h = req.headers.authorization || ''; const tok = h.startsWith('Bearer ') ? h.slice(7) : '';
    const p = verifyToken(tok); if (!p) throw new HttpError(401, 'Please sign in');
    const db = await loadDataset(); const user = db.users.find(u => u.id === p.sub);
    if (!user || user.active === 'No' || pwVersion(user.pwHash) !== p.pv) throw new HttpError(401, 'Session expired — please sign in again');
    req.user = user; req.db = db; next();
  } catch (e) { next(e); }
}
