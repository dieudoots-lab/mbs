// Application Modern Business School : un gestionnaire HTTP unique, utilise
// par le serveur classique (server.js) et par la fonction serverless (api/index.js).
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { createRouter } from './lib/router.js';
import { registerPublic } from './lib/api-public.js';
import { registerAdmin } from './lib/api-admin.js';
import { send, HttpError, parseCookies, setCookie, id } from './lib/util.js';
import { homePage, formationPage, entreprisesPage, appShell, verifierPage, certificatPage, notFoundPage } from './lib/pages.js';
import { q, ensureReady, refreshSettings } from './lib/db.js';
import { runAutomation } from './lib/automation.js';

const PUBLIC = path.join(path.dirname(fileURLToPath(import.meta.url)), 'public');
const TYPES = { '.css': 'text/css; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.svg': 'image/svg+xml', '.webp': 'image/webp', '.ico': 'image/x-icon', '.json': 'application/json', '.txt': 'text/plain; charset=utf-8', '.woff2': 'font/woff2' };

const { route, match } = createRouter();
registerPublic(route);
registerAdmin(route);

// ------------------------------------------------ pages
const html = (res, body, status = 200) => send(res, status, body, { 'Cache-Control': 'no-cache' });
route('GET', '/', async (req, res) => html(res, await homePage()));
route('GET', '/formations/:slug', async (req, res, { params }) => {
  const page = await formationPage(params.slug);
  page ? html(res, page) : html(res, await notFoundPage(), 404);
});
route('GET', '/entreprises', async (req, res) => html(res, await entreprisesPage()));
route('GET', '/inscription', async (req, res) => html(res, await appShell({ title: 'Inscription', script: '/assets/js/inscription.js?v=2', description: 'Inscription en deux minutes à une formation Modern Business School.', bare: true })));
route('GET', '/espace', async (req, res) => html(res, await appShell({ title: 'Mon espace', script: '/assets/js/espace.js?v=1' })));
route('GET', '/verifier', async (req, res) => html(res, await verifierPage()));
route('GET', '/verifier/:code', async (req, res, { params }) => html(res, await verifierPage(params.code)));
route('GET', '/certificat/:code', async (req, res, { params }) => {
  const c = await q.get('SELECT * FROM certificats WHERE code = ?', String(params.code).toUpperCase());
  c ? html(res, certificatPage(c)) : html(res, await notFoundPage(), 404);
});
route('GET', '/admin', async (req, res) => send(res, 200, fs.readFileSync(path.join(PUBLIC, 'admin.html')), { 'Cache-Control': 'no-cache' }));
route('GET', '/admin/devis/:id', async (req, res) => send(res, 200, fs.readFileSync(path.join(PUBLIC, 'devis.html')), { 'Cache-Control': 'no-cache' }));
route('GET', '/robots.txt', async (req, res) => send(res, 200, 'User-agent: *\nDisallow: /admin\nDisallow: /api/\nDisallow: /espace\n', { 'Content-Type': 'text/plain' }));
route('GET', '/sitemap.xml', async (req, res) => {
  const host = `${req.headers['x-forwarded-proto'] || 'http'}://${req.headers.host}`;
  const urls = ['/', '/entreprises', '/verifier', ...(await q.all('SELECT slug FROM formations WHERE actif = 1')).map((f) => `/formations/${f.slug}`)];
  send(res, 200, `<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${urls.map((u) => `<url><loc>${host}${u}</loc></url>`).join('')}</urlset>`, { 'Content-Type': 'application/xml' });
});
route('GET', '/health', async (req, res) => send(res, 200, { ok: true }));

// Declencheur des relances pour les hebergements sans processus permanent
// (Vercel Cron, pg_cron de Supabase, cron-job.org...). Protege par CRON_SECRET.
route('GET', '/api/cron/relances', async (req, res) => {
  const secret = process.env.CRON_SECRET;
  const given = (req.headers.authorization || '').replace(/^Bearer /, '') || new URL(req.url, 'http://x').searchParams.get('secret') || '';
  if (!secret || given !== secret) throw new HttpError(401, 'Non autorisé');
  send(res, 200, await runAutomation());
});

// ------------------------------------------------ fichiers statiques
function serveStatic(req, res, pathname) {
  const file = path.normalize(path.join(PUBLIC, pathname));
  if (!file.startsWith(PUBLIC + path.sep)) return false;
  let st;
  try { st = fs.statSync(file); } catch { return false; }
  if (!st.isFile()) return false;
  const ext = path.extname(file).toLowerCase();
  if (ext === '.html') return false;
  res.writeHead(200, {
    'Content-Type': TYPES[ext] || 'application/octet-stream',
    'Content-Length': st.size,
    'Cache-Control': /\.(png|jpe?g|webp|svg|woff2)$/.test(ext) ? 'public, max-age=604800' : 'public, max-age=300',
  });
  if (req.method === 'HEAD') return res.end(), true;
  fs.createReadStream(file).pipe(res);
  return true;
}

export async function handler(req, res) {
  try {
    await ensureReady();
  } catch (e) {
    console.error('[demarrage] base injoignable', e.message);
    return send(res, 503, req.url.startsWith('/api/') ? { error: 'Service momentanément indisponible. Réessayez dans un instant.' } : 'Le site redémarre, réessayez dans quelques secondes.', { 'Retry-After': '5' });
  }
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  res.setHeader('X-Frame-Options', 'SAMEORIGIN');
  res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
  const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
  const pathname = url.pathname;
  try {
    await refreshSettings();
    // Protection CSRF : toute ecriture sur l'API doit etre du JSON (formulaire HTML impossible),
    // sauf le webhook qui est authentifie par son secret.
    if (pathname.startsWith('/api/') && !['GET', 'HEAD'].includes(req.method) && !pathname.startsWith('/api/webhooks/')) {
      const ct = req.headers['content-type'] || '';
      if (!ct.includes('application/json')) throw new HttpError(415, 'Format attendu : JSON');
    }
    // identifiant anonyme de visiteur (mesure des visites, sans donnees personnelles)
    if (!pathname.startsWith('/api/') && req.method === 'GET' && !parseCookies(req).mbs_v && !/\.\w+$/.test(pathname)) {
      setCookie(res, 'mbs_v', id(), { maxAge: 60 * 60 * 24 * 365 });
    }
    const m = match(req.method === 'HEAD' ? 'GET' : req.method, pathname);
    if (m) return await m.handler(req, res, { params: m.params, url });
    if ((req.method === 'GET' || req.method === 'HEAD') && serveStatic(req, res, pathname)) return;
    if (pathname.startsWith('/api/')) throw new HttpError(404, 'Route inconnue');
    html(res, await notFoundPage(), 404);
  } catch (e) {
    const status = e.status || 500;
    if (status >= 500) console.error(`[${req.method} ${pathname}]`, e);
    if (pathname.startsWith('/api/')) send(res, status, { error: status >= 500 ? 'Une erreur est survenue. Réessayez.' : e.message, ...(e.extra || {}) });
    else send(res, status === 404 ? 404 : 500, status === 404 ? await notFoundPage().catch(() => 'Page introuvable') : 'Une erreur est survenue. Réessayez dans un instant.');
  }
}
