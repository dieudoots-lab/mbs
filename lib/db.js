// Acces a la base de donnees, avec deux moteurs interchangeables :
//  - Supabase / PostgreSQL en production (variable DATABASE_URL)
//  - SQLite embarque (node:sqlite) en local, sans rien installer
// Le reste du code ecrit ses requetes une seule fois, avec des « ? ».
import fs from 'node:fs';
import path from 'node:path';
import { DEFAULT_SETTINGS, FORMATIONS, FORMATEURS, SESSIONS } from './content.js';
import { id, now } from './util.js';
import { SCHEMA, TABLES, pgSchema } from './schema.js';

const DATABASE_URL = process.env.DATABASE_URL || '';
export const dialect = DATABASE_URL ? 'pg' : 'sqlite';

// ------------------------------------------------ moteurs
let engine;

if (dialect === 'pg') {
  const { default: pg } = await import('pg');
  pg.types.setTypeParser(20, Number);              // bigint (COUNT, SUM d'entiers)
  pg.types.setTypeParser(1700, parseFloat);        // numeric
  // Le mot de passe est extrait a la main : il peut contenir & ] @ # sans etre encode.
  const m = DATABASE_URL.match(/^postgres(?:ql)?:\/\/([^:]+):(.*)@([^@/:]+):(\d+)\/([^?]+)/);
  const conn = m
    ? { user: decodeURIComponent(m[1]), password: m[2], host: m[3], port: Number(m[4]), database: m[5] }
    : { connectionString: DATABASE_URL };
  const pool = new pg.Pool({
    ...conn,
    ssl: /localhost|127\.0\.0\.1/.test(DATABASE_URL) ? false : { rejectUnauthorized: false },
    max: Number(process.env.DB_POOL_MAX) || 5,
    idleTimeoutMillis: 20000,
    connectionTimeoutMillis: 15000,
  });
  pool.on('error', (e) => console.error('[db] connexion perdue', e.message));
  // « ? » -> $1, $2 ... ; LIKE insensible a la casse comme SQLite
  const toPg = (sql) => { let i = 0; return sql.replace(/\?/g, () => `$${++i}`).replace(/\bLIKE\b/g, 'ILIKE'); };
  const make = (runner) => ({
    get: async (sql, ...p) => (await runner.query(toPg(sql), p)).rows[0],
    all: async (sql, ...p) => (await runner.query(toPg(sql), p)).rows,
    run: async (sql, ...p) => { const r = await runner.query(toPg(sql), p); return { changes: r.rowCount }; },
  });
  engine = {
    q: make(pool),
    async exec(sql) { for (const s of sql.split(/;\s*\n/).map((x) => x.trim()).filter(Boolean)) await pool.query(s); },
    async tx(fn) {
      const c = await pool.connect();
      try { await c.query('BEGIN'); const r = await fn(make(c)); await c.query('COMMIT'); return r; }
      catch (e) { await c.query('ROLLBACK').catch(() => {}); throw e; }
      finally { c.release(); }
    },
    schema: pgSchema(),
    close: () => pool.end(),
  };
} else {
  const { DatabaseSync } = await import('node:sqlite');
  const DATA_DIR = process.env.DATA_DIR || path.resolve('data');
  fs.mkdirSync(DATA_DIR, { recursive: true });
  const db = new DatabaseSync(path.join(DATA_DIR, 'mbs.sqlite'));
  db.exec('PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON; PRAGMA busy_timeout = 5000;');
  const q = {
    get: async (sql, ...p) => db.prepare(sql).get(...p),
    all: async (sql, ...p) => db.prepare(sql).all(...p),
    run: async (sql, ...p) => db.prepare(sql).run(...p),
  };
  engine = {
    q,
    async exec(sql) { db.exec(sql); },
    async tx(fn) {
      db.exec('BEGIN');
      try { const r = await fn(q); db.exec('COMMIT'); return r; } catch (e) { db.exec('ROLLBACK'); throw e; }
    },
    schema: SCHEMA.replace(/@AUTO@/g, 'INTEGER PRIMARY KEY AUTOINCREMENT'),
    close: async () => db.close(),
  };
}

export const q = engine.q;
export const tx = (fn) => engine.tx(fn);
export const closeDb = () => engine.close();

function norm(v) {
  if (v === undefined) return null;
  if (typeof v === 'boolean') return v ? 1 : 0;
  if (v !== null && typeof v === 'object') return JSON.stringify(v);
  return v;
}
export async function insert(table, obj, runner = q) {
  const keys = Object.keys(obj);
  await runner.run(`INSERT INTO ${table} (${keys.join(',')}) VALUES (${keys.map(() => '?').join(',')})`, ...keys.map((k) => norm(obj[k])));
  return obj;
}
export async function update(table, idValue, obj, idCol = 'id', runner = q) {
  const keys = Object.keys(obj);
  if (!keys.length) return;
  await runner.run(`UPDATE ${table} SET ${keys.map((k) => `${k} = ?`).join(', ')} WHERE ${idCol} = ?`, ...keys.map((k) => norm(obj[k])), idValue);
}
export const parse = (s, fallback) => { try { return s ? JSON.parse(s) : fallback; } catch { return fallback; } };

// Extraction d'un champ JSON stocke en texte, selon le moteur.
export const jsonField = (col, key) => (dialect === 'pg' ? `(${col}::json->>'${key}')` : `json_extract(${col}, '$.${key}')`);

// ------------------------------------------------ reglages (lus en memoire, rafraichis regulierement)
// La lecture reste synchrone partout dans le code ; le cache est recharge
// toutes les 15 s pour que plusieurs instances (serverless) restent a jour.
const cache = new Map();
let loadedAt = 0;
async function loadSettings() {
  const rows = await q.all('SELECT key, value FROM settings');
  cache.clear();
  for (const r of rows) cache.set(r.key, parse(r.value, null));
  loadedAt = Date.now();
}
export async function refreshSettings(force = false) {
  if (force || Date.now() - loadedAt > 15000) await loadSettings();
}
export function getSetting(key) {
  const def = DEFAULT_SETTINGS[key];
  const val = cache.get(key);
  if (val == null) return def;
  return def && typeof def === 'object' && !Array.isArray(def) ? { ...def, ...val } : val;
}
export async function setSetting(key, value) {
  await q.run('INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value', key, JSON.stringify(value));
  cache.set(key, value);
}

export async function logEvent(leadId, type, data) {
  try {
    await q.run('INSERT INTO events (lead_id, type, data, created_at) VALUES (?, ?, ?, ?)', leadId || null, type, data ? JSON.stringify(data) : null, now());
  } catch (e) { console.error('[db] evenement', e.message); }
}
export async function audit(userId, action, detail) {
  try {
    await q.run('INSERT INTO audit (user_id, action, detail, created_at) VALUES (?, ?, ?, ?)', userId || null, action, detail ? JSON.stringify(detail) : null, now());
  } catch (e) { console.error('[db] audit', e.message); }
}

// ------------------------------------------------ creation des tables et donnees de depart
async function seed() {
  if ((await q.get('SELECT COUNT(*) n FROM formations')).n > 0) return;
  await tx(async (t) => {
    const fIds = {};
    for (const [i, f] of FORMATEURS.entries()) {
      const fid = id('fm_');
      fIds[f.slug] = fid;
      await insert('formateurs', { id: fid, slug: f.slug, nom: f.nom, titre: f.titre, bio: f.bio, photo: f.photo, ordre: i, actif: 1 }, t);
    }
    const formIds = {};
    for (const [i, f] of FORMATIONS.entries()) {
      const fid = id('fo_');
      formIds[f.slug] = fid;
      await insert('formations', {
        id: fid, slug: f.slug, titre: f.titre, accroche: f.accroche, programme: f.programme, domaine: f.domaine,
        icone: f.icone, image: f.image, objectifs: f.objectifs, contenu: f.contenu, public: f.public,
        prerequis: f.prerequis, duree: f.duree, prix: f.prix, consult_min: f.consult_min, consult_max: f.consult_max,
        formateurs: f.formateurs.map((s) => fIds[s]), ordre: i, actif: 1, created_at: now(), updated_at: now(),
      }, t);
    }
    for (const s of SESSIONS) {
      const f = FORMATIONS.find((x) => x.slug === s.formation);
      await insert('sessions_formation', {
        id: id('se_'), formation_id: formIds[s.formation], debut: s.debut, fin: s.fin, horaire: s.horaire,
        lieu: 'Kinshasa · adresse précisée à la confirmation', format: s.format, capacite: s.capacite,
        prix: f.prix, statut: 'ouverte', created_at: now(),
      }, t);
    }
  });
}

// Supabase expose automatiquement les tables du schema « public » via son API
// (cle « anon » publique). On active la securite par ligne (RLS) sans aucune
// politique : l'API publique ne voit rien, seul le serveur (role postgres) lit et ecrit.

async function init() {
  if (dialect === 'pg') {
    // demarrage a froid plus rapide : le schema n'est cree qu'une fois
    const done = await q.get("SELECT to_regclass('public.audit') AS t");
    if (!done?.t) {
      await engine.exec(engine.schema);
      for (const t of TABLES) await q.run(`ALTER TABLE ${t} ENABLE ROW LEVEL SECURITY`);
    }
  } else {
    await engine.exec(engine.schema);
  }
  await seed();
  await loadSettings();
}
export const ready = init();
