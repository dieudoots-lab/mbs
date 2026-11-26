// Petits outils partages : HTTP, mots de passe, identifiants, dates (Kinshasa = UTC+1).
import crypto from 'node:crypto';

export const now = () => new Date().toISOString();

export function id(prefix = '') {
  return prefix + crypto.randomBytes(9).toString('base64url');
}

export function code(n = 8) {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let s = '';
  for (const b of crypto.randomBytes(n)) s += alphabet[b % alphabet.length];
  return s;
}

// ------------------------------------------------ mots de passe (scrypt)
export function hashPassword(pw) {
  const salt = crypto.randomBytes(16);
  const key = crypto.scryptSync(String(pw), salt, 64);
  return `scrypt$${salt.toString('base64')}$${key.toString('base64')}`;
}
export function verifyPassword(pw, stored) {
  if (!stored || !stored.startsWith('scrypt$')) return false;
  const [, s, k] = stored.split('$');
  const key = crypto.scryptSync(String(pw), Buffer.from(s, 'base64'), 64);
  const ref = Buffer.from(k, 'base64');
  return ref.length === key.length && crypto.timingSafeEqual(ref, key);
}

// ------------------------------------------------ telephone RDC
// Accepte 0997..., 997..., +243997..., 243 997 ... -> +243997xxxxxx
export function normalizePhone(raw) {
  let d = String(raw || '').replace(/[^\d+]/g, '');
  if (d.startsWith('+')) d = d.slice(1);
  if (d.startsWith('00')) d = d.slice(2);
  if (d.startsWith('0')) d = '243' + d.slice(1);
  if (d.length === 9) d = '243' + d;
  if (!/^\d{10,15}$/.test(d)) return null;
  return '+' + d;
}
export const isEmail = (e) => /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(String(e || '').trim());

// ------------------------------------------------ dates
const TZ = 'Africa/Kinshasa';
export function kinshasaHour(d = new Date()) {
  return Number(new Intl.DateTimeFormat('en-GB', { hour: 'numeric', hourCycle: 'h23', timeZone: TZ }).format(d));
}
export function fmtDate(iso, opts = { day: 'numeric', month: 'long', year: 'numeric' }) {
  if (!iso) return '';
  const d = new Date(iso.length === 10 ? iso + 'T12:00:00+01:00' : iso);
  return new Intl.DateTimeFormat('fr-FR', { ...opts, timeZone: TZ }).format(d);
}
export function fmtRange(debut, fin) {
  if (!debut) return '';
  if (!fin || fin === debut) return fmtDate(debut);
  const a = new Date(debut + 'T12:00:00+01:00'), b = new Date(fin + 'T12:00:00+01:00');
  if (a.getMonth() === b.getMonth() && a.getFullYear() === b.getFullYear()) {
    return `${a.getDate()} au ${fmtDate(fin)}`;
  }
  return `${fmtDate(debut, { day: 'numeric', month: 'long' })} au ${fmtDate(fin)}`;
}
export const daysBetween = (a, b) => Math.round((new Date(b) - new Date(a)) / 86400000);
export function sessionDays(debut, fin) {
  const out = [];
  if (!debut) return out;
  const d = new Date(debut + 'T12:00:00Z'), end = new Date((fin || debut) + 'T12:00:00Z');
  while (d <= end && out.length < 60) { out.push(d.toISOString().slice(0, 10)); d.setUTCDate(d.getUTCDate() + 1); }
  return out;
}
export const money = (n, devise = '$') => `${Number(n || 0).toLocaleString('fr-FR', { maximumFractionDigits: 2 })} ${devise}`;

// ------------------------------------------------ HTML
export function esc(s) {
  return String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

// ------------------------------------------------ gabarits de messages {{variable}}
export function fill(tpl, vars) {
  return String(tpl || '')
    .replace(/\{\{\s*(\w+)\s*\}\}/g, (_, k) => (vars[k] ?? ''))
    .replace(/[ \t]{2,}/g, ' ')
    .replace(/ ,/g, ',');
}

// ------------------------------------------------ HTTP
export function parseCookies(req) {
  const out = {};
  for (const part of (req.headers.cookie || '').split(';')) {
    const i = part.indexOf('=');
    if (i > 0) out[part.slice(0, i).trim()] = decodeURIComponent(part.slice(i + 1).trim());
  }
  return out;
}
export function setCookie(res, name, value, { maxAge = 60 * 60 * 24 * 30, secure = false } = {}) {
  const parts = [`${name}=${encodeURIComponent(value)}`, 'Path=/', 'HttpOnly', 'SameSite=Lax', `Max-Age=${maxAge}`];
  if (secure) parts.push('Secure');
  const prev = res.getHeader('Set-Cookie');
  res.setHeader('Set-Cookie', [...(Array.isArray(prev) ? prev : prev ? [prev] : []), parts.join('; ')]);
}

export async function readBody(req, { limit = 1_000_000, raw = false } = {}) {
  const chunks = [];
  let size = 0;
  for await (const c of req) {
    size += c.length;
    if (size > limit) throw Object.assign(new Error('Requête trop volumineuse'), { status: 413 });
    chunks.push(c);
  }
  const buf = Buffer.concat(chunks);
  if (raw) return buf;
  if (!buf.length) return {};
  try { return JSON.parse(buf.toString('utf8')); } catch { throw Object.assign(new Error('JSON invalide'), { status: 400 }); }
}

export function send(res, status, body, headers = {}) {
  if (res.headersSent) return;
  const isStr = typeof body === 'string' || Buffer.isBuffer(body);
  res.writeHead(status, {
    'Content-Type': isStr ? 'text/html; charset=utf-8' : 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
    ...headers,
  });
  res.end(isStr ? body : JSON.stringify(body));
}
export const ok = (res, body = { ok: true }) => send(res, 200, body);
export const fail = (res, status, error, extra = {}) => send(res, status, { error, ...extra });

export class HttpError extends Error {
  constructor(status, message, extra) { super(message); this.status = status; this.extra = extra; }
}

// ------------------------------------------------ limitation de debit (memoire)
const buckets = new Map();
export function rateLimit(key, max, windowMs) {
  const t = Date.now();
  const b = buckets.get(key) || { n: 0, reset: t + windowMs };
  if (t > b.reset) { b.n = 0; b.reset = t + windowMs; }
  b.n += 1;
  buckets.set(key, b);
  if (buckets.size > 20000) for (const [k, v] of buckets) if (t > v.reset) buckets.delete(k);
  return b.n <= max;
}
export const clientIp = (req) => (req.headers['x-forwarded-for'] || '').split(',')[0].trim() || req.socket.remoteAddress || '';

export function csv(rows, columns) {
  const q = (v) => {
    const s = String(v ?? '');
    return /[",;\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  return '﻿' + [columns.map((c) => q(c.label)).join(';'), ...rows.map((r) => columns.map((c) => q(typeof c.get === 'function' ? c.get(r) : r[c.key])).join(';'))].join('\n');
}
