// API de l'espace equipe : tableau de bord, CRM, paiements, entreprises, catalogue,
// presences et certificats, relances, assistante, codes promo, reglages, equipe.
import { q, insert, update, getSetting, setSetting, logEvent, audit, parse, tx, jsonField } from './db.js';
import {
  id, code, now, normalizePhone, isEmail, hashPassword, verifyPassword, readBody, ok, send,
  HttpError, rateLimit, clientIp, fill, sessionDays, csv, fmtRange,
} from './util.js';
import {
  listFormations, listSessions, getSession, balance, refreshScore, computeScore, messageVars,
  quote, paymentStatus, formationRow, currentPrice,
} from './domain.js';
import { openSession, closeSession, currentUser, requireUser, canAccess } from './auth.js';
import { analyseLead, proposalForCompany, aiEnabled } from './ai.js';
import { deliver, deliverToLead } from './notify.js';
import { runAutomation } from './automation.js';

const SECRET_FIELDS = ['anthropic_key', 'whatsapp_token', 'email_key', 'webhook_secret'];
const LEAD_STATUTS = ['nouveau', 'en_cours', 'inscrit', 'acompte', 'paye', 'present', 'certifie', 'abandon', 'annule'];
const B2B_STATUTS = ['nouveau', 'qualifie', 'rdv', 'devis_envoye', 'negociation', 'gagne', 'perdu'];

// Ligne de liste calculee sans requete supplementaire : paiements et prix sont joints.
const LEAD_SELECT = `SELECT l.*, f.titre formation_titre, s.debut, s.prix s_prix, s.prix_early s_prix_early, s.early_jusqu s_early_jusqu, f.prix formation_prix,
    (SELECT COALESCE(SUM(p.montant), 0) FROM payments p WHERE p.lead_id = l.id AND p.statut = 'recu') paye_total
  FROM leads l LEFT JOIN sessions_formation s ON s.id = l.session_id LEFT JOIN formations f ON f.id = s.formation_id`;

function leadRow(l) {
  let du = l.prix_du;
  if (du == null) {
    du = l.session_id && (l.s_prix != null || l.formation_prix != null)
      ? Math.round(currentPrice({ prix: l.s_prix, prix_early: l.s_prix_early, early_jusqu: l.s_early_jusqu, formation_prix: l.formation_prix }) * (1 - (l.remise_pct || 0) / 100) * 100) / 100
      : 0;
  }
  const paye = Number(l.paye_total) || 0;
  const b = { du, paye, reste: Math.max(0, Math.round((du - paye) * 100) / 100), solde: du > 0 && paye >= du };
  const paiement = du === 0 ? 'aucun' : paye <= 0 ? 'rien' : b.solde ? 'solde' : 'partiel';
  return {
    id: l.id, prenom: l.prenom, nom: l.nom, whatsapp: l.whatsapp, email: l.email, profil: l.profil,
    statut: l.statut, step: l.step, completed: Boolean(l.completed_at), completed_at: l.completed_at,
    score: l.score, temperature: l.temperature, source: l.source || l.utm_source, session_id: l.session_id,
    formation: l.formation_titre, debut: l.debut, paiement_quand: l.paiement_quand, disponible: l.disponible,
    du: b.du, paye: b.paye, reste: b.reste, paiement,
    created_at: l.created_at, last_activity: l.last_activity, assigne_a: l.assigne_a, opt_out: l.opt_out,
  };
}

async function leadsQuery(p) {
  const where = [];
  const params = [];
  if (p.get('q')) {
    where.push('(l.prenom LIKE ? OR l.nom LIKE ? OR l.whatsapp LIKE ? OR l.email LIKE ?)');
    const s = `%${p.get('q')}%`;
    params.push(s, s, s, s);
  }
  if (p.get('session')) { where.push('l.session_id = ?'); params.push(p.get('session')); }
  if (p.get('statut')) { where.push('l.statut = ?'); params.push(p.get('statut')); }
  if (p.get('temperature')) { where.push('l.temperature = ?'); params.push(p.get('temperature')); }
  if (p.get('etat') === 'complets') where.push('l.completed_at IS NOT NULL');
  if (p.get('etat') === 'incomplets') where.push('l.completed_at IS NULL');
  if (p.get('source')) { where.push('(l.source = ? OR l.utm_source = ?)'); params.push(p.get('source'), p.get('source')); }
  const order = { score: 'l.score DESC', recent: 'l.last_activity DESC', nom: 'l.nom, l.prenom', arrivee: 'l.created_at DESC' }[p.get('tri')] || 'l.last_activity DESC';
  let rows = (await q.all(`${LEAD_SELECT}
    ${where.length ? 'WHERE ' + where.join(' AND ') : ''} ORDER BY ${order} LIMIT 2000`, ...params)).map(leadRow);
  const pay = p.get('paiement');
  if (pay) rows = rows.filter((r) => (pay === 'reste' ? r.completed && r.reste > 0 : r.paiement === pay));
  return rows;
}

function maskSettings(key, val) {
  if (key !== 'integrations') return val;
  const out = { ...val };
  for (const f of SECRET_FIELDS) out[f] = val[f] ? '••••••••' + String(val[f]).slice(-4) : '';
  return out;
}

export function registerAdmin(route) {
  // ------------------------------------------------ connexion
  route('GET', '/api/admin/setup', async (req, res) => ok(res, { needed: (await q.get('SELECT COUNT(*) n FROM users')).n === 0 }));

  route('POST', '/api/admin/setup', async (req, res) => {
    if ((await q.get('SELECT COUNT(*) n FROM users')).n > 0) throw new HttpError(403, 'Le compte administrateur existe déjà.');
    const b = await readBody(req);
    if (!isEmail(b.email)) throw new HttpError(400, 'Email invalide');
    if (String(b.password || '').length < 8) throw new HttpError(400, 'Mot de passe : 8 caractères minimum');
    const uid = id('us_');
    await insert('users', { id: uid, email: b.email.trim().toLowerCase(), nom: String(b.nom || 'Administrateur').slice(0, 80), role: 'admin', pass_hash: hashPassword(b.password), actif: 1, created_at: now() });
    await openSession(res, 'admin', uid, 7);
    await audit(uid, 'creation_compte_admin');
    ok(res);
  });

  route('POST', '/api/admin/login', async (req, res) => {
    if (!rateLimit('alogin:' + clientIp(req), 10, 900000)) throw new HttpError(429, 'Trop de tentatives. Réessayez dans 15 minutes.');
    const b = await readBody(req);
    const u = await q.get('SELECT * FROM users WHERE email = ? AND actif = 1', String(b.email || '').trim().toLowerCase());
    if (!u || !verifyPassword(b.password || '', u.pass_hash)) throw new HttpError(401, 'Identifiants incorrects');
    await q.run('UPDATE users SET last_login = ? WHERE id = ?', now(), u.id);
    await openSession(res, 'admin', u.id, 7);
    await audit(u.id, 'connexion');
    ok(res);
  });

  route('POST', '/api/admin/logout', async (req, res) => { await closeSession(req, res, 'admin'); ok(res); });

  route('GET', '/api/admin/me', async (req, res) => {
    const u = await requireUser(req);
    const areas = ['dashboard', 'leads', 'entreprises', 'catalogue', 'presences', 'messages', 'assistant', 'promo', 'reglages', 'equipe'];
    ok(res, { user: u, acces: areas.filter((a) => canAccess(u, a)), ia: aiEnabled(), ecole: getSetting('ecole') });
  });

  // ------------------------------------------------ tableau de bord
  route('GET', '/api/admin/dashboard', async (req, res, { url }) => {
    await requireUser(req, 'dashboard');
    const jours = Math.min(365, Math.max(1, Number(url.searchParams.get('jours')) || 30));
    const since = new Date(Date.now() - jours * 86400000).toISOString();
    const visites = (await q.get(`SELECT COUNT(DISTINCT COALESCE(${jsonField('data', 'v')}, CAST(id AS TEXT))) n FROM events WHERE type = 'visite' AND created_at > ?`, since)).n;
    const leads = (await q.get('SELECT COUNT(*) n FROM leads WHERE created_at > ?', since)).n;
    const completes = (await q.get('SELECT COUNT(*) n FROM leads WHERE completed_at > ?', since)).n;
    const encaisse = (await q.get("SELECT COALESCE(SUM(montant),0) t FROM payments WHERE statut = 'recu' AND created_at > ?", since)).t;
    const actifs = (await q.all(`${LEAD_SELECT} WHERE l.session_id IS NOT NULL AND l.completed_at IS NOT NULL AND l.statut NOT IN ('annule','abandon') AND COALESCE(s.fin, s.debut) >= ?`, now().slice(0, 10))).map(leadRow);
    const attendu = actifs.reduce((a, l) => a + l.reste, 0);
    const b2b = await q.get("SELECT COUNT(*) n, COALESCE(SUM(CASE WHEN statut NOT IN ('perdu','gagne') THEN devis_ht ELSE 0 END),0) pipeline, COALESCE(SUM(CASE WHEN statut = 'gagne' THEN COALESCE(valeur_finale, devis_ht) ELSE 0 END),0) gagne FROM entreprises WHERE created_at > ?", since);

    // entonnoir : parmi les dossiers crees sur la periode, combien ont atteint chaque etape
    const steps = await q.all('SELECT step, completed_at FROM leads WHERE created_at > ?', since);
    const labels = { 2: 'WhatsApp', 3: 'Email', 4: 'Mot de passe', 5: 'Identité', 6: 'Profil', 7: 'Niveau', 8: 'Objectif', 9: 'Financement', 10: 'Disponibilité', 11: 'Paiement : quand', 12: 'Paiement : comment', 13: 'Source' };
    const entonnoir = Object.entries(labels).map(([n, label]) => ({ step: Number(n), label, n: steps.filter((s) => s.step >= Number(n)).length }));
    entonnoir.push({ step: 14, label: 'Inscription terminée', n: steps.filter((s) => s.completed_at).length });

    const sources = await q.all("SELECT COALESCE(source, utm_source, 'non précisé') source, COUNT(*) n, SUM(CASE WHEN completed_at IS NOT NULL THEN 1 ELSE 0 END) completes FROM leads WHERE created_at > ? GROUP BY 1 ORDER BY n DESC", since);
    const serie = [];
    for (let i = Math.min(jours, 60) - 1; i >= 0; i--) {
      const d = new Date(Date.now() - i * 86400000).toISOString().slice(0, 10);
      serie.push({ jour: d, leads: 0, completes: 0, encaisse: 0 });
    }
    const idx = Object.fromEntries(serie.map((s, i) => [s.jour, i]));
    for (const r of await q.all('SELECT substr(created_at,1,10) d, COUNT(*) n FROM leads WHERE created_at > ? GROUP BY d', since)) if (r.d in idx) serie[idx[r.d]].leads = r.n;
    for (const r of await q.all('SELECT substr(completed_at,1,10) d, COUNT(*) n FROM leads WHERE completed_at > ? GROUP BY d', since)) if (r.d in idx) serie[idx[r.d]].completes = r.n;
    for (const r of await q.all("SELECT substr(created_at,1,10) d, SUM(montant) t FROM payments WHERE statut='recu' AND created_at > ? GROUP BY d", since)) if (r.d in idx) serie[idx[r.d]].encaisse = r.t;

    const temperatures = await q.all("SELECT temperature, COUNT(*) n FROM leads WHERE statut NOT IN ('annule','abandon') AND (completed_at IS NULL OR statut IN ('inscrit','acompte')) GROUP BY temperature");
    const sessions = await Promise.all((await listSessions()).map(async (s) => ({ id: s.id, formation: s.formation_titre, dates: s.dates, capacite: s.capacite, prises: s.prises, commencees: s.commencees, restantes: s.restantes, encaisse: (await q.get("SELECT COALESCE(SUM(p.montant),0) t FROM payments p JOIN leads l ON l.id = p.lead_id WHERE l.session_id = ? AND p.statut='recu'", s.id)).t })));
    const activite = (await q.all(`SELECT e.type, e.data, e.created_at, l.prenom, l.nom, l.id lead_id FROM events e LEFT JOIN leads l ON l.id = e.lead_id
      WHERE e.type IN ('inscription_terminee','paiement','demande_entreprise','reprise','changement_session') ORDER BY e.id DESC LIMIT 15`)).map((e) => ({ ...e, data: parse(e.data, {}) }));
    const aRelancer = (await q.all(`${LEAD_SELECT} WHERE l.statut NOT IN ('annule','abandon','paye','certifie') AND l.opt_out = 0 ORDER BY l.score DESC, l.last_activity DESC LIMIT 8`)).map(leadRow);
    const messages = await q.get("SELECT COUNT(*) n, SUM(CASE WHEN statut='simule' THEN 1 ELSE 0 END) simules FROM messages WHERE created_at > ?", since);

    ok(res, {
      jours, kpi: { visites, leads, completes, conversion: leads ? Math.round((completes / leads) * 100) : 0, encaisse, attendu, b2b_n: b2b.n, b2b_pipeline: b2b.pipeline, b2b_gagne: b2b.gagne, messages: messages.n, simules: messages.simules || 0 },
      entonnoir, sources, serie, temperatures, sessions, activite, aRelancer,
      automation: getSetting('automation').actif, devise: getSetting('tarifs').devise,
    });
  });

  // ------------------------------------------------ inscrits (CRM)
  route('GET', '/api/admin/leads', async (req, res, { url }) => {
    await requireUser(req, 'leads');
    const rows = await leadsQuery(url.searchParams);
    ok(res, { total: rows.length, leads: rows.slice(0, 500) });
  });

  route('GET', '/api/admin/leads.csv', async (req, res, { url }) => {
    const u = await requireUser(req, 'leads');
    const rows = await leadsQuery(url.searchParams);
    await audit(u.id, 'export_csv', { n: rows.length });
    const body = csv(rows, [
      { label: 'Prénom', key: 'prenom' }, { label: 'Nom', key: 'nom' }, { label: 'WhatsApp', key: 'whatsapp' }, { label: 'Email', key: 'email' },
      { label: 'Formation', key: 'formation' }, { label: 'Début', key: 'debut' }, { label: 'Statut', key: 'statut' }, { label: 'Étape', key: 'step' },
      { label: 'Score', key: 'score' }, { label: 'Dû', key: 'du' }, { label: 'Payé', key: 'paye' }, { label: 'Reste', key: 'reste' },
      { label: 'Source', key: 'source' }, { label: 'Arrivé le', key: 'created_at' },
    ]);
    send(res, 200, body, { 'Content-Type': 'text/csv; charset=utf-8', 'Content-Disposition': `attachment; filename="mbs-inscrits-${now().slice(0, 10)}.csv"` });
  });

  // inscription manuelle (personne venue au bureau, appel...)
  route('POST', '/api/admin/leads', async (req, res) => {
    const u = await requireUser(req, 'leads');
    const b = await readBody(req);
    const whatsapp = normalizePhone(b.whatsapp);
    if (!whatsapp) throw new HttpError(400, 'Numéro invalide');
    if (await q.get('SELECT 1 FROM leads WHERE whatsapp = ?', whatsapp)) throw new HttpError(409, 'Ce numéro a déjà un dossier.');
    const s = b.session_id ? await getSession(b.session_id) : null;
    const lid = id('ld_');
    const t = now();
    await insert('leads', {
      id: lid, whatsapp, email: isEmail(b.email) ? b.email.trim().toLowerCase() : null,
      prenom: String(b.prenom || '').trim(), nom: String(b.nom || '').trim().toUpperCase(),
      session_id: s?.id || null, source: 'bureau', step: 13, statut: s ? 'inscrit' : 'en_cours',
      completed_at: s ? t : null, prix_du: s ? currentPrice(s) : null, code_parrain: 'MBS' + code(5),
      notes: String(b.notes || ''), assigne_a: u.id, created_at: t, updated_at: t, last_activity: t,
    });
    await logEvent(lid, 'creation_manuelle', { par: u.nom });
    if (s) await logEvent(lid, 'inscription_terminee', { session: s.id, manuel: true });
    await refreshScore(lid);
    await audit(u.id, 'creation_dossier', { lead: lid });
    ok(res, { id: lid });
  });

  route('GET', '/api/admin/leads/:id', async (req, res, { params }) => {
    await requireUser(req, 'leads');
    const l = await q.get('SELECT * FROM leads WHERE id = ?', params.id);
    if (!l) throw new HttpError(404, 'Dossier introuvable');
    const s = l.session_id ? await getSession(l.session_id) : null;
    const { pass_hash, ...safe } = l;
    const events = (await q.all('SELECT type, data, created_at FROM events WHERE lead_id = ? ORDER BY id DESC LIMIT 80', l.id)).map((e) => ({ ...e, data: parse(e.data, {}) }));
    const messages = await q.all('SELECT * FROM messages WHERE lead_id = ? ORDER BY created_at DESC LIMIT 60', l.id);
    const payments = await q.all('SELECT * FROM payments WHERE lead_id = ? ORDER BY created_at DESC', l.id);
    const chat = await q.all('SELECT m.role, m.content, m.created_at FROM chat_messages m JOIN conversations c ON c.id = m.conversation_id WHERE c.lead_id = ? ORDER BY m.id', l.id);
    const parrain = l.parrain_id ? await q.get('SELECT id, prenom, nom FROM leads WHERE id = ?', l.parrain_id) : null;
    const filleuls = await q.all('SELECT id, prenom, nom, completed_at FROM leads WHERE parrain_id = ?', l.id);
    const certificats = await q.all('SELECT * FROM certificats WHERE lead_id = ?', l.id);
    ok(res, {
      lead: { ...safe, has_password: Boolean(pass_hash), ia_analyse: parse(l.ia_analyse, null) },
      session: s, balance: await balance(l), score: await computeScore(l), events, messages, payments, chat, parrain, filleuls, certificats,
      vars: await messageVars(l), templates: getSetting('templates'),
    });
  });

  route('PATCH', '/api/admin/leads/:id', async (req, res, { params }) => {
    const u = await requireUser(req, 'leads');
    const l = await q.get('SELECT * FROM leads WHERE id = ?', params.id);
    if (!l) throw new HttpError(404, 'Dossier introuvable');
    const b = await readBody(req);
    const f = {};
    for (const k of ['prenom', 'nom', 'notes', 'assigne_a', 'motivation', 'profil', 'niveau', 'objectif', 'financement', 'disponible', 'paiement_quand', 'paiement_mode']) if (k in b) f[k] = b[k] === '' ? null : String(b[k]).slice(0, 4000);
    if ('email' in b) { if (b.email && !isEmail(b.email)) throw new HttpError(400, 'Email invalide'); f.email = b.email || null; }
    if ('statut' in b) { if (!LEAD_STATUTS.includes(b.statut)) throw new HttpError(400, 'Statut inconnu'); f.statut = b.statut; }
    if ('opt_out' in b) f.opt_out = b.opt_out ? 1 : 0;
    if ('prix_du' in b) f.prix_du = b.prix_du === '' || b.prix_du == null ? null : Number(b.prix_du);
    if ('session_id' in b) {
      const s = b.session_id ? await getSession(b.session_id) : null;
      if (b.session_id && !s) throw new HttpError(400, 'Session introuvable');
      f.session_id = s?.id || null;
    }
    if (b.marquer_complet && !l.completed_at) {
      const s = await getSession(f.session_id || l.session_id);
      if (!s) throw new HttpError(400, 'Choisissez une session');
      f.completed_at = now(); f.statut = 'inscrit'; f.prix_du = f.prix_du ?? currentPrice(s);
      f.code_parrain = l.code_parrain || 'MBS' + code(5);
      await logEvent(l.id, 'inscription_terminee', { session: s.id, manuel: true });
    }
    f.updated_at = now();
    await update('leads', l.id, f);
    await refreshScore(l.id);
    if (b.statut === 'abandon' || b.statut === 'annule') await q.run('UPDATE leads SET statut = ? WHERE id = ?', b.statut, l.id);
    await audit(u.id, 'modif_dossier', { lead: l.id, champs: Object.keys(f) });
    ok(res);
  });

  route('DELETE', '/api/admin/leads/:id', async (req, res, { params }) => {
    const u = await requireUser(req, 'reglages');
    await q.run('DELETE FROM leads WHERE id = ?', params.id);
    await q.run('DELETE FROM events WHERE lead_id = ?', params.id);
    await audit(u.id, 'suppression_dossier', { lead: params.id });
    ok(res);
  });

  route('POST', '/api/admin/leads/:id/payments', async (req, res, { params }) => {
    const u = await requireUser(req, 'leads');
    const l = await q.get('SELECT * FROM leads WHERE id = ?', params.id);
    if (!l) throw new HttpError(404, 'Dossier introuvable');
    const b = await readBody(req);
    const montant = Number(b.montant);
    if (!(montant > 0)) throw new HttpError(400, 'Montant invalide');
    const ref = String(b.reference || '').trim() || null;
    if (ref && await q.get('SELECT 1 FROM payments WHERE reference = ?', ref)) throw new HttpError(409, 'Cette référence est déjà enregistrée.');
    await insert('payments', { id: id('py_'), lead_id: l.id, montant, methode: String(b.methode || 'especes').slice(0, 40), reference: ref, statut: 'recu', note: String(b.note || '').slice(0, 300), par: u.nom, created_at: now() });
    await logEvent(l.id, 'paiement', { montant, par: u.nom, methode: b.methode });
    await refreshScore(l.id);
    await audit(u.id, 'paiement', { lead: l.id, montant });
    if (b.notifier) {
      const fresh = await q.get('SELECT * FROM leads WHERE id = ?', l.id);
      await deliverToLead(fresh, `paiement_recu_${Date.now()}`, fill(getSetting('templates').paiement_recu, await messageVars(fresh)), { sujet: 'Paiement reçu', par: u.nom });
    }
    ok(res);
  });

  route('DELETE', '/api/admin/payments/:id', async (req, res, { params }) => {
    const u = await requireUser(req, 'reglages');
    const p = await q.get('SELECT * FROM payments WHERE id = ?', params.id);
    if (!p) throw new HttpError(404, 'Paiement introuvable');
    await q.run("UPDATE payments SET statut = 'annule' WHERE id = ?", p.id);
    await refreshScore(p.lead_id);
    await audit(u.id, 'annulation_paiement', { paiement: p.id, montant: p.montant });
    ok(res);
  });

  route('POST', '/api/admin/leads/:id/message', async (req, res, { params }) => {
    const u = await requireUser(req, 'leads');
    const l = await q.get('SELECT * FROM leads WHERE id = ?', params.id);
    if (!l) throw new HttpError(404, 'Dossier introuvable');
    const b = await readBody(req);
    const contenu = fill(String(b.contenu || '').trim(), await messageVars(l));
    if (!contenu) throw new HttpError(400, 'Message vide');
    const canal = b.canal === 'email' ? 'email' : 'whatsapp';
    const m = await deliver({ canal, to: canal === 'email' ? l.email : l.whatsapp, contenu, sujet: b.sujet || 'Modern Business School', type: 'manuel', leadId: l.id, par: u.nom });
    await logEvent(l.id, 'message_manuel', { canal, par: u.nom });
    ok(res, { message: m });
  });

  route('POST', '/api/admin/leads/:id/analyse', async (req, res, { params }) => {
    await requireUser(req, 'leads');
    const l = await q.get('SELECT * FROM leads WHERE id = ?', params.id);
    if (!l) throw new HttpError(404, 'Dossier introuvable');
    const a = await analyseLead(l);
    await update('leads', l.id, { ia_analyse: a });
    ok(res, { analyse: a });
  });

  // ------------------------------------------------ entreprises
  route('GET', '/api/admin/entreprises', async (req, res) => {
    await requireUser(req, 'entreprises');
    const rows = (await q.all('SELECT * FROM entreprises ORDER BY created_at DESC LIMIT 1000')).map((e) => ({ ...e, modules: parse(e.modules, []), devis_detail: parse(e.devis_detail, null) }));
    ok(res, { entreprises: rows, statuts: B2B_STATUTS, formations: (await listFormations()).map((f) => ({ id: f.id, titre: f.titre })) });
  });

  route('POST', '/api/admin/entreprises', async (req, res) => {
    const u = await requireUser(req, 'entreprises');
    const b = await readBody(req);
    if (!b.societe) throw new HttpError(400, 'Nom de la société requis');
    const devis = await quote({ modules: b.modules || [], participants: b.participants, jours: b.jours });
    const eid = id('en_');
    await insert('entreprises', { id: eid, societe: b.societe, contact: b.contact || '', telephone: normalizePhone(b.telephone) || b.telephone || '', email: b.email || null, participants: devis.participants, modules: devis.lignes.map((l) => l.formation_id), jours: devis.jours, devis_ht: devis.ht, devis_detail: devis, statut: 'nouveau', source: 'manuel', assigne_a: u.id, created_at: now(), updated_at: now() });
    await audit(u.id, 'creation_entreprise', { id: eid });
    ok(res, { id: eid });
  });

  route('PATCH', '/api/admin/entreprises/:id', async (req, res, { params }) => {
    const u = await requireUser(req, 'entreprises');
    const e = await q.get('SELECT * FROM entreprises WHERE id = ?', params.id);
    if (!e) throw new HttpError(404, 'Demande introuvable');
    const b = await readBody(req);
    const f = {};
    for (const k of ['societe', 'secteur', 'contact', 'fonction', 'email', 'telephone', 'taille', 'format', 'periode', 'objectifs', 'notes', 'assigne_a', 'ia_proposition']) if (k in b) f[k] = b[k];
    if ('statut' in b) { if (!B2B_STATUTS.includes(b.statut)) throw new HttpError(400, 'Statut inconnu'); f.statut = b.statut; }
    if ('valeur_finale' in b) f.valeur_finale = b.valeur_finale === '' ? null : Number(b.valeur_finale);
    if ('modules' in b || 'participants' in b || 'jours' in b) {
      const devis = await quote({ modules: b.modules ?? parse(e.modules, []), participants: b.participants ?? e.participants, jours: b.jours ?? e.jours });
      Object.assign(f, { modules: devis.lignes.map((l) => l.formation_id), participants: devis.participants, jours: devis.jours, devis_ht: devis.ht, devis_detail: devis });
    }
    f.updated_at = now();
    await update('entreprises', e.id, f);
    await audit(u.id, 'modif_entreprise', { id: e.id, champs: Object.keys(f) });
    ok(res);
  });

  route('DELETE', '/api/admin/entreprises/:id', async (req, res, { params }) => {
    const u = await requireUser(req, 'entreprises');
    await q.run('DELETE FROM entreprises WHERE id = ?', params.id);
    await audit(u.id, 'suppression_entreprise', { id: params.id });
    ok(res);
  });

  route('POST', '/api/admin/entreprises/:id/proposition', async (req, res, { params }) => {
    await requireUser(req, 'entreprises');
    const e = await q.get('SELECT * FROM entreprises WHERE id = ?', params.id);
    if (!e) throw new HttpError(404, 'Demande introuvable');
    const devis = parse(e.devis_detail, null) || await quote({ modules: parse(e.modules, []), participants: e.participants, jours: e.jours });
    const texte = await proposalForCompany(e, devis);
    await update('entreprises', e.id, { ia_proposition: texte, updated_at: now() });
    ok(res, { proposition: texte });
  });

  // ------------------------------------------------ catalogue
  route('GET', '/api/admin/catalogue', async (req, res) => {
    await requireUser(req, 'catalogue');
    ok(res, {
      formations: await listFormations({ actives: false }),
      sessions: (await listSessions({ avenir: false, toutes: true })).reverse(),
      formateurs: await q.all('SELECT * FROM formateurs ORDER BY ordre, nom'),
    });
  });

  const formationFields = (b) => {
    const f = {};
    for (const k of ['titre', 'accroche', 'programme', 'domaine', 'icone', 'image', 'public', 'prerequis', 'duree']) if (k in b) f[k] = String(b[k] ?? '').slice(0, 2000);
    for (const k of ['prix', 'consult_min', 'consult_max', 'ordre']) if (k in b) f[k] = Number(b[k]) || 0;
    for (const k of ['objectifs', 'contenu', 'formateurs']) if (k in b) f[k] = Array.isArray(b[k]) ? b[k] : String(b[k] || '').split('\n').map((x) => x.trim()).filter(Boolean);
    if ('actif' in b) f.actif = b.actif ? 1 : 0;
    if ('slug' in b) f.slug = String(b.slug).toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
    return f;
  };

  route('POST', '/api/admin/formations', async (req, res) => {
    const u = await requireUser(req, 'catalogue');
    const b = await readBody(req);
    if (!b.titre) throw new HttpError(400, 'Titre requis');
    const f = formationFields({ slug: b.slug || b.titre, ...b });
    if (await q.get('SELECT 1 FROM formations WHERE slug = ?', f.slug)) throw new HttpError(409, 'Une formation porte déjà ce lien.');
    await insert('formations', { id: id('fo_'), ...f, actif: f.actif ?? 1, created_at: now(), updated_at: now() });
    await audit(u.id, 'creation_formation', { titre: f.titre });
    ok(res);
  });

  route('PATCH', '/api/admin/formations/:id', async (req, res, { params }) => {
    const u = await requireUser(req, 'catalogue');
    const b = await readBody(req);
    await update('formations', params.id, { ...formationFields(b), updated_at: now() });
    await audit(u.id, 'modif_formation', { id: params.id });
    ok(res);
  });

  route('DELETE', '/api/admin/formations/:id', async (req, res, { params }) => {
    const u = await requireUser(req, 'reglages');
    if (await q.get('SELECT 1 FROM leads l JOIN sessions_formation s ON s.id = l.session_id WHERE s.formation_id = ?', params.id)) throw new HttpError(409, 'Des inscrits sont liés à cette formation : désactivez-la plutôt.');
    await q.run('DELETE FROM formations WHERE id = ?', params.id);
    await audit(u.id, 'suppression_formation', { id: params.id });
    ok(res);
  });

  const sessionFields = (b) => {
    const f = {};
    for (const k of ['formation_id', 'titre', 'debut', 'fin', 'horaire', 'lieu', 'format', 'statut', 'early_jusqu']) if (k in b) f[k] = b[k] === '' ? null : String(b[k]).slice(0, 300);
    for (const k of ['capacite']) if (k in b) f[k] = Math.max(1, Number(b[k]) || 1);
    for (const k of ['prix', 'prix_early']) if (k in b) f[k] = b[k] === '' || b[k] == null ? null : Number(b[k]);
    return f;
  };

  route('POST', '/api/admin/sessions', async (req, res) => {
    const u = await requireUser(req, 'catalogue');
    const b = await readBody(req);
    const f = sessionFields(b);
    if (!f.formation_id || !f.debut) throw new HttpError(400, 'Formation et date de début requises');
    await insert('sessions_formation', { id: id('se_'), statut: 'ouverte', capacite: 25, ...f, created_at: now() });
    await audit(u.id, 'creation_session', f);
    ok(res);
  });

  route('PATCH', '/api/admin/sessions/:id', async (req, res, { params }) => {
    const u = await requireUser(req, 'catalogue');
    const before = await getSession(params.id);
    if (!before) throw new HttpError(404, 'Session introuvable');
    const b = await readBody(req);
    await update('sessions_formation', params.id, sessionFields(b));
    await audit(u.id, 'modif_session', { id: params.id });
    // report : on previent les inscrits une seule fois par nouvelle date
    if (b.prevenir_report && (b.debut !== before.debut || b.fin !== before.fin)) {
      const s = await getSession(params.id);
      const leads = await q.all("SELECT * FROM leads WHERE session_id = ? AND statut NOT IN ('annule','abandon') AND opt_out = 0", s.id);
      for (const l of leads) {
        await deliverToLead(l, `report_${s.debut}`, fill(getSetting('templates').report, await messageVars(l, { dates: fmtRange(s.debut, s.fin) })), { sujet: 'Changement de date de votre formation', par: u.nom });
      }
      return ok(res, { prevenus: leads.length });
    }
    ok(res);
  });

  route('DELETE', '/api/admin/sessions/:id', async (req, res, { params }) => {
    const u = await requireUser(req, 'catalogue');
    if (await q.get('SELECT 1 FROM leads WHERE session_id = ?', params.id)) throw new HttpError(409, 'Des personnes sont inscrites : passez la session en « annulée » plutôt.');
    await q.run('DELETE FROM sessions_formation WHERE id = ?', params.id);
    await audit(u.id, 'suppression_session', { id: params.id });
    ok(res);
  });

  route('POST', '/api/admin/formateurs', async (req, res) => {
    const u = await requireUser(req, 'catalogue');
    const b = await readBody(req);
    if (!b.nom) throw new HttpError(400, 'Nom requis');
    await insert('formateurs', { id: id('fm_'), slug: b.nom.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, '-') + '-' + code(3).toLowerCase(), nom: b.nom, titre: b.titre || '', bio: b.bio || '', photo: b.photo || '', ordre: Number(b.ordre) || 0, actif: 1 });
    await audit(u.id, 'creation_formateur', { nom: b.nom });
    ok(res);
  });
  route('PATCH', '/api/admin/formateurs/:id', async (req, res, { params }) => {
    await requireUser(req, 'catalogue');
    const b = await readBody(req);
    const f = {};
    for (const k of ['nom', 'titre', 'bio', 'photo']) if (k in b) f[k] = String(b[k] || '');
    if ('ordre' in b) f.ordre = Number(b.ordre) || 0;
    if ('actif' in b) f.actif = b.actif ? 1 : 0;
    await update('formateurs', params.id, f);
    ok(res);
  });
  route('DELETE', '/api/admin/formateurs/:id', async (req, res, { params }) => {
    await requireUser(req, 'catalogue');
    await q.run('DELETE FROM formateurs WHERE id = ?', params.id);
    ok(res);
  });

  // ------------------------------------------------ presences et certificats
  route('GET', '/api/admin/sessions/:id/presences', async (req, res, { params }) => {
    await requireUser(req, 'presences');
    const s = await getSession(params.id);
    if (!s) throw new HttpError(404, 'Session introuvable');
    const jours = sessionDays(s.debut, s.fin);
    const leads = (await q.all(`${LEAD_SELECT} WHERE l.session_id = ? AND l.completed_at IS NOT NULL AND l.statut NOT IN ('annule','abandon') ORDER BY l.nom, l.prenom`, s.id)).map(leadRow);
    const pres = await q.all('SELECT * FROM presences WHERE session_id = ?', s.id);
    const certs = await q.all('SELECT lead_id, code, revoque FROM certificats WHERE session_id = ?', s.id);
    const seuil = getSetting('certificats').seuil_presence_pct;
    ok(res, {
      session: s, jours, seuil,
      participants: leads.map((l) => {
        const p = Object.fromEntries(pres.filter((x) => x.lead_id === l.id).map((x) => [x.jour, x.present]));
        const nb = jours.filter((j) => p[j]).length;
        return { id: l.id, prenom: l.prenom, nom: l.nom, whatsapp: l.whatsapp, statut: l.statut, presences: p, taux: jours.length ? Math.round((nb / jours.length) * 100) : 0, paiement: l.paiement, reste: l.reste, certificat: certs.find((c) => c.lead_id === l.id && !c.revoque)?.code || null };
      }),
    });
  });

  route('POST', '/api/admin/sessions/:id/presences', async (req, res, { params }) => {
    await requireUser(req, 'presences');
    const b = await readBody(req);
    const s = await getSession(params.id);
    if (!s || !sessionDays(s.debut, s.fin).includes(b.jour)) throw new HttpError(400, 'Jour invalide');
    await q.run('INSERT INTO presences (lead_id, session_id, jour, present) VALUES (?, ?, ?, ?) ON CONFLICT(lead_id, session_id, jour) DO UPDATE SET present = excluded.present', b.lead_id, s.id, b.jour, b.present ? 1 : 0);
    if (b.present) {
      const l = await q.get('SELECT statut FROM leads WHERE id = ?', b.lead_id);
      if (l && ['inscrit', 'acompte', 'paye'].includes(l.statut)) await q.run("UPDATE leads SET statut = 'present' WHERE id = ?", b.lead_id);
    }
    ok(res);
  });

  // delivre les certificats aux participants au-dessus du seuil de presence (ou a la liste fournie)
  route('POST', '/api/admin/sessions/:id/certificats', async (req, res, { params }) => {
    const u = await requireUser(req, 'presences');
    const s = await getSession(params.id);
    if (!s) throw new HttpError(404, 'Session introuvable');
    const b = await readBody(req);
    const jours = sessionDays(s.debut, s.fin);
    const seuil = getSetting('certificats').seuil_presence_pct;
    const leads = await q.all("SELECT * FROM leads WHERE session_id = ? AND completed_at IS NOT NULL AND statut NOT IN ('annule','abandon')", s.id);
    let n = 0;
    for (const l of leads) {
      if (Array.isArray(b.lead_ids) && !b.lead_ids.includes(l.id)) continue;
      if (await q.get('SELECT 1 FROM certificats WHERE lead_id = ? AND session_id = ? AND revoque = 0', l.id, s.id)) continue;
      const nb = (await q.get('SELECT COUNT(*) n FROM presences WHERE lead_id = ? AND session_id = ? AND present = 1', l.id, s.id)).n;
      const taux = jours.length ? (nb / jours.length) * 100 : 0;
      if (!Array.isArray(b.lead_ids) && taux < seuil) continue;
      await insert('certificats', { id: id('ce_'), code: 'MBS-' + code(4) + '-' + code(4), lead_id: l.id, session_id: s.id, nom_complet: `${l.prenom || ''} ${l.nom || ''}`.trim(), formation: s.formation_titre, dates: s.dates, delivre_le: now(), revoque: 0 });
      await q.run("UPDATE leads SET statut = 'certifie' WHERE id = ?", l.id);
      await logEvent(l.id, 'certificat', { session: s.id });
      n++;
    }
    await audit(u.id, 'certificats', { session: s.id, n });
    ok(res, { delivres: n });
  });

  route('GET', '/api/admin/certificats', async (req, res) => {
    await requireUser(req, 'presences');
    ok(res, { certificats: await q.all('SELECT * FROM certificats ORDER BY delivre_le DESC LIMIT 1000') });
  });
  route('PATCH', '/api/admin/certificats/:id', async (req, res, { params }) => {
    const u = await requireUser(req, 'reglages');
    const b = await readBody(req);
    await q.run('UPDATE certificats SET revoque = ? WHERE id = ?', b.revoque ? 1 : 0, params.id);
    await audit(u.id, b.revoque ? 'revocation_certificat' : 'retablissement_certificat', { id: params.id });
    ok(res);
  });

  // ------------------------------------------------ messages et relances
  route('GET', '/api/admin/messages', async (req, res, { url }) => {
    await requireUser(req, 'messages');
    const p = url.searchParams;
    const where = [];
    const params = [];
    if (p.get('statut')) { where.push('m.statut = ?'); params.push(p.get('statut')); }
    if (p.get('canal')) { where.push('m.canal = ?'); params.push(p.get('canal')); }
    if (p.get('type')) { where.push('m.type LIKE ?'); params.push(p.get('type') + '%'); }
    const rows = await q.all(`SELECT m.*, l.prenom, l.nom, e.societe FROM messages m LEFT JOIN leads l ON l.id = m.lead_id LEFT JOIN entreprises e ON e.id = m.entreprise_id
      ${where.length ? 'WHERE ' + where.join(' AND ') : ''} ORDER BY m.created_at DESC LIMIT 300`, ...params);
    const stats = await q.all("SELECT statut, COUNT(*) n FROM messages WHERE created_at > ? GROUP BY statut", new Date(Date.now() - 30 * 86400000).toISOString());
    ok(res, { messages: rows, stats, automation: getSetting('automation'), templates: getSetting('templates') });
  });

  route('POST', '/api/admin/automation/run', async (req, res) => {
    const u = await requireUser(req, 'messages');
    const r = await runAutomation({ force: true });
    await audit(u.id, 'automatisation_manuelle', r);
    ok(res, r);
  });

  // envoi groupe a un segment (filtres identiques a la liste des inscrits)
  route('POST', '/api/admin/broadcast', async (req, res) => {
    const u = await requireUser(req, 'messages');
    const b = await readBody(req);
    const contenu = String(b.contenu || '').trim();
    if (!contenu) throw new HttpError(400, 'Message vide');
    const params = new URLSearchParams(b.filtres || {});
    const cibles = (await leadsQuery(params)).filter((r) => !r.opt_out);
    if (b.apercu) return ok(res, { n: cibles.length, exemple: cibles[0] ? fill(contenu, await messageVars(await q.get('SELECT * FROM leads WHERE id = ?', cibles[0].id))) : contenu });
    if (cibles.length > 1000) throw new HttpError(400, 'Segment trop large (1 000 maximum par envoi).');
    const type = 'diffusion_' + code(6).toLowerCase();
    let n = 0;
    for (const c of cibles) {
      const l = await q.get('SELECT * FROM leads WHERE id = ?', c.id);
      const texte = fill(contenu, await messageVars(l));
      if (b.canal === 'email') { if (l.email) { await deliver({ canal: 'email', to: l.email, sujet: b.sujet || 'Modern Business School', contenu: texte, type, leadId: l.id, par: u.nom }); n++; } }
      else { await deliver({ canal: 'whatsapp', to: l.whatsapp, contenu: texte, type, leadId: l.id, par: u.nom }); n++; }
    }
    await audit(u.id, 'diffusion', { n, canal: b.canal });
    ok(res, { envoyes: n });
  });

  // ------------------------------------------------ assistante (conversations)
  route('GET', '/api/admin/conversations', async (req, res) => {
    await requireUser(req, 'assistant');
    const rows = await q.all(`SELECT c.*, l.prenom, l.nom, (SELECT content FROM chat_messages WHERE conversation_id = c.id AND role = 'user' ORDER BY id LIMIT 1) premier
      FROM conversations c LEFT JOIN leads l ON l.id = c.lead_id ORDER BY c.updated_at DESC LIMIT 300`);
    ok(res, { conversations: rows, assistant: getSetting('assistant'), ia: aiEnabled() });
  });
  route('GET', '/api/admin/conversations/:id', async (req, res, { params }) => {
    await requireUser(req, 'assistant');
    ok(res, { messages: await q.all('SELECT role, content, created_at FROM chat_messages WHERE conversation_id = ? ORDER BY id', params.id) });
  });

  // ------------------------------------------------ codes promo
  route('GET', '/api/admin/promo', async (req, res) => {
    await requireUser(req, 'promo');
    const parrains = await q.all(`SELECT p.id, p.prenom, p.nom, p.code_parrain, COUNT(f.id) filleuls, SUM(CASE WHEN f.completed_at IS NOT NULL THEN 1 ELSE 0 END) inscrits
      FROM leads p JOIN leads f ON f.parrain_id = p.id GROUP BY p.id ORDER BY inscrits DESC LIMIT 50`);
    ok(res, { codes: await q.all('SELECT * FROM promo_codes ORDER BY created_at DESC'), parrains, parrainage: getSetting('parrainage') });
  });
  route('POST', '/api/admin/promo', async (req, res) => {
    const u = await requireUser(req, 'promo');
    const b = await readBody(req);
    const c = String(b.code || '').trim().toUpperCase().replace(/[^A-Z0-9_-]/g, '');
    if (c.length < 3) throw new HttpError(400, 'Code trop court');
    const pct = Number(b.remise_pct);
    if (!(pct > 0 && pct <= 100)) throw new HttpError(400, 'Remise entre 1 et 100 %');
    if (await q.get('SELECT 1 FROM promo_codes WHERE code = ?', c)) throw new HttpError(409, 'Ce code existe déjà');
    await insert('promo_codes', { code: c, remise_pct: pct, max_utilisations: Number(b.max_utilisations) || null, utilisations: 0, expire_le: b.expire_le || null, actif: 1, note: String(b.note || ''), created_at: now() });
    await audit(u.id, 'creation_code_promo', { code: c, pct });
    ok(res);
  });
  route('PATCH', '/api/admin/promo/:code', async (req, res, { params }) => {
    await requireUser(req, 'promo');
    const b = await readBody(req);
    if ('actif' in b) await q.run('UPDATE promo_codes SET actif = ? WHERE code = ?', b.actif ? 1 : 0, params.code);
    ok(res);
  });
  route('DELETE', '/api/admin/promo/:code', async (req, res, { params }) => {
    await requireUser(req, 'promo');
    await q.run('DELETE FROM promo_codes WHERE code = ?', params.code);
    ok(res);
  });

  // ------------------------------------------------ reglages
  const KEYS = ['ecole', 'tarifs', 'parrainage', 'certificats', 'automation', 'integrations', 'assistant', 'templates'];
  route('GET', '/api/admin/settings', async (req, res) => {
    const u = await requireUser(req);
    const out = {};
    for (const k of KEYS) {
      if (k === 'integrations' && !canAccess(u, 'reglages')) continue;
      out[k] = maskSettings(k, getSetting(k));
    }
    ok(res, out);
  });

  route('PUT', '/api/admin/settings/:key', async (req, res, { params }) => {
    const key = params.key;
    if (!KEYS.includes(key)) throw new HttpError(404, 'Réglage inconnu');
    const area = { templates: 'messages', automation: 'messages', assistant: 'assistant', parrainage: 'promo' }[key] || 'reglages';
    const u = await requireUser(req, area);
    const b = await readBody(req);
    const current = getSetting(key);
    const next = { ...current, ...b };
    if (key === 'integrations') for (const f of SECRET_FIELDS) if (typeof b[f] === 'string' && b[f].startsWith('••••')) next[f] = current[f];
    if (key === 'automation') {
      for (const k of ['relances_incompletes_heures', 'relances_paiement_heures', 'rappels_session_jours']) {
        if (typeof next[k] === 'string') next[k] = next[k].split(/[,;\s]+/).map(Number).filter((x) => x > 0);
      }
      for (const k of ['heure_debut', 'heure_fin', 'max_par_jour', 'b2b_relance_heures']) next[k] = Number(next[k]);
    }
    await setSetting(key, next);
    await audit(u.id, 'reglages', { key, champs: Object.keys(b).filter((k) => !SECRET_FIELDS.includes(k)) });
    ok(res, { [key]: maskSettings(key, getSetting(key)) });
  });

  // ------------------------------------------------ equipe
  route('GET', '/api/admin/users', async (req, res) => {
    await requireUser(req, 'equipe');
    ok(res, { users: await q.all('SELECT id, email, nom, role, actif, created_at, last_login FROM users ORDER BY created_at') });
  });
  route('POST', '/api/admin/users', async (req, res) => {
    const u = await requireUser(req, 'equipe');
    const b = await readBody(req);
    if (!isEmail(b.email)) throw new HttpError(400, 'Email invalide');
    if (!['admin', 'commercial', 'formateur'].includes(b.role)) throw new HttpError(400, 'Rôle inconnu');
    if (String(b.password || '').length < 8) throw new HttpError(400, 'Mot de passe : 8 caractères minimum');
    if (await q.get('SELECT 1 FROM users WHERE email = ?', b.email.toLowerCase())) throw new HttpError(409, 'Cet email a déjà un compte');
    await insert('users', { id: id('us_'), email: b.email.trim().toLowerCase(), nom: String(b.nom || '').slice(0, 80) || b.email, role: b.role, pass_hash: hashPassword(b.password), actif: 1, created_at: now() });
    await audit(u.id, 'creation_utilisateur', { email: b.email, role: b.role });
    ok(res);
  });
  route('PATCH', '/api/admin/users/:id', async (req, res, { params }) => {
    const u = await requireUser(req);
    const b = await readBody(req);
    const self = params.id === u.id;
    if (!self && !canAccess(u, 'equipe')) throw new HttpError(403, 'Accès réservé');
    const f = {};
    if (b.nom) f.nom = String(b.nom).slice(0, 80);
    if (b.password) {
      if (String(b.password).length < 8) throw new HttpError(400, 'Mot de passe : 8 caractères minimum');
      if (self) { const me = await q.get('SELECT pass_hash FROM users WHERE id = ?', u.id); if (!verifyPassword(b.ancien || '', me.pass_hash)) throw new HttpError(400, 'Mot de passe actuel incorrect'); }
      f.pass_hash = hashPassword(b.password);
    }
    if (!self && 'role' in b && ['admin', 'commercial', 'formateur'].includes(b.role)) f.role = b.role;
    if (!self && 'actif' in b) f.actif = b.actif ? 1 : 0;
    await update('users', params.id, f);
    if (f.actif === 0 || f.pass_hash) await q.run("DELETE FROM auth_sessions WHERE kind = 'admin' AND ref_id = ?", params.id);
    await audit(u.id, 'modif_utilisateur', { id: params.id, champs: Object.keys(f).filter((k) => k !== 'pass_hash') });
    ok(res);
  });

  route('GET', '/api/admin/audit', async (req, res) => {
    await requireUser(req, 'reglages');
    ok(res, { audit: (await q.all('SELECT a.*, u.nom FROM audit a LEFT JOIN users u ON u.id = a.user_id ORDER BY a.id DESC LIMIT 300')).map((a) => ({ ...a, detail: parse(a.detail, null) })) });
  });

  // test des integrations
  route('POST', '/api/admin/test-message', async (req, res) => {
    const u = await requireUser(req, 'reglages');
    const b = await readBody(req);
    const to = b.canal === 'email' ? b.to : normalizePhone(b.to);
    const m = await deliver({ canal: b.canal === 'email' ? 'email' : 'whatsapp', to, contenu: 'Message de test de la plateforme Modern Business School ✅', sujet: 'Test MBS', type: 'test', par: u.nom });
    ok(res, { message: m });
  });
}
