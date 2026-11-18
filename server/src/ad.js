/* Active Directory sign-in (on-site AD over secure LDAP).
   The user's own username and password are checked by binding to a domain controller, so no service
   account or stored domain password is needed. Passwords are only ever sent over an encrypted connection. */
import tls from 'node:tls';
import { Client, InvalidCredentialsError } from 'ldapts';
import { config } from './config.js';

export const AD_SOURCE = 'Active Directory';
export const adEnabled = () => config.ad.urls.length > 0;

/** "NRM\rahul", "rahul@nrm.org" and "Rahul" all mean the domain account "rahul" */
export function adName(input) {
  let u = String(input || '').trim();
  if (u.includes('\\')) u = u.split('\\').pop();
  if (u.includes('@')) u = u.split('@')[0];
  return u.toLowerCase();
}
const SAM_OK = /^[a-z0-9._-]{1,64}$/; // sAMAccountName characters we accept (no LDAP filter characters)

// trust the Windows certificate store too, so the domain's own CA (which signed the DC certificate) is trusted
let caCache = null;
function caList() {
  if (caCache) return caCache;
  try { caCache = [...new Set([...tls.getCACertificates('default'), ...tls.getCACertificates('system')])]; } catch { caCache = undefined; }
  return caCache;
}

export class AdUnavailable extends Error { }

/**
 * Checks the password against AD.
 * @returns profile {username, name, email, phone, department} — or null when the username/password is wrong,
 *          the account is disabled, or it is not a user account. Throws AdUnavailable when no DC can be reached.
 */
export async function adLogin(rawName, password) {
  const sam = adName(rawName);
  if (!SAM_OK.test(sam) || typeof password !== 'string' || !password) return null; // an empty password would be an anonymous bind
  let lastErr;
  for (const url of config.ad.urls) {
    const secure = url.startsWith('ldaps://');
    if (!secure && !config.ad.allowPlain) { lastErr = new Error('Refusing to send passwords over plain LDAP: ' + url); continue; }
    const client = new Client({ url, timeout: 8000, connectTimeout: 5000, tlsOptions: secure ? { ca: caList(), minVersion: 'TLSv1.2' } : undefined });
    try {
      try { await client.bind(`${sam}@${config.ad.domain}`, password); }
      catch (e) { if (e instanceof InvalidCredentialsError) return null; throw e; }
      const { searchEntries } = await client.search(config.ad.baseDN, {
        scope: 'sub', sizeLimit: 2,
        filter: `(&(objectCategory=person)(objectClass=user)(sAMAccountName=${sam}))`,
        attributes: ['sAMAccountName', 'displayName', 'givenName', 'sn', 'mail', 'department', 'mobile', 'telephoneNumber', 'userAccountControl'],
      });
      const e = searchEntries[0]; if (!e) return null;
      if (Number(e.userAccountControl) & 2) return null; // account disabled
      const one = v => String(Array.isArray(v) ? v[0] || '' : v || '').trim();
      const phone = one(e.mobile || e.telephoneNumber).replace(/\D/g, '').slice(-12);
      return {
        username: one(e.sAMAccountName).toLowerCase() || sam,
        name: one(e.displayName) || [one(e.givenName), one(e.sn)].filter(Boolean).join(' ') || sam,
        email: one(e.mail), department: one(e.department), phone: phone.length >= 10 ? phone : '',
      };
    } catch (e) { lastErr = e; } // try the next domain controller
    finally { await client.unbind().catch(() => { }); }
  }
  console.error('[ad] no domain controller reachable:', lastErr && lastErr.message);
  throw new AdUnavailable('Cannot reach the NRM domain controller right now — try again in a minute');
}
