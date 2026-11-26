// Sessions de connexion : equipe (cookie mbs_admin) et apprenants (cookie mbs_lead).
import crypto from 'node:crypto';
import { q } from './db.js';
import { parseCookies, setCookie, HttpError } from './util.js';

const COOKIES = { admin: 'mbs_admin', lead: 'mbs_lead' };
const secure = () => process.env.NODE_ENV === 'production';

export async function openSession(res, kind, refId, days = 30) {
  const token = crypto.randomBytes(32).toString('base64url');
  const t = Date.now();
  await q.run('INSERT INTO auth_sessions (token, kind, ref_id, created_at, expires_at) VALUES (?, ?, ?, ?, ?)', token, kind, refId, new Date(t).toISOString(), new Date(t + days * 86400000).toISOString());
  setCookie(res, COOKIES[kind], token, { maxAge: days * 86400, secure: secure() });
  return token;
}

export async function closeSession(req, res, kind) {
  const token = parseCookies(req)[COOKIES[kind]];
  if (token) await q.run('DELETE FROM auth_sessions WHERE token = ?', token);
  setCookie(res, COOKIES[kind], '', { maxAge: 0, secure: secure() });
}

async function refFor(req, kind) {
  const token = parseCookies(req)[COOKIES[kind]];
  if (!token) return null;
  const s = await q.get('SELECT * FROM auth_sessions WHERE token = ? AND kind = ?', token, kind);
  if (!s) return null;
  if (s.expires_at < new Date().toISOString()) { await q.run('DELETE FROM auth_sessions WHERE token = ?', token); return null; }
  return s.ref_id;
}

export async function currentLead(req) {
  const id = await refFor(req, 'lead');
  return id ? await q.get('SELECT * FROM leads WHERE id = ?', id) : null;
}

export async function currentUser(req) {
  const id = await refFor(req, 'admin');
  if (!id) return null;
  const u = await q.get('SELECT id, email, nom, role, actif FROM users WHERE id = ?', id);
  return u && u.actif ? u : null;
}

// Droits : admin = tout ; commercial = tout sauf reglages et equipe ; formateur = presences.
const RIGHTS = {
  admin: ['*'],
  commercial: ['dashboard', 'leads', 'entreprises', 'catalogue', 'presences', 'messages', 'assistant', 'promo'],
  formateur: ['dashboard', 'presences'],
};
export async function requireUser(req, area) {
  const u = await currentUser(req);
  if (!u) throw new HttpError(401, 'Connexion requise');
  const r = RIGHTS[u.role] || [];
  if (area && !r.includes('*') && !r.includes(area)) throw new HttpError(403, 'Accès réservé');
  return u;
}
export const canAccess = (u, area) => { const r = RIGHTS[u.role] || []; return r.includes('*') || r.includes(area); };
