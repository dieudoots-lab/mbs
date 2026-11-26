// Regles metier : catalogue, places, prix, soldes, score d'interet, variables des messages.
import { q, parse, getSetting } from './db.js';
import { fmtRange, fmtDate, money, daysBetween } from './util.js';

const today = () => new Date().toISOString().slice(0, 10);

// ------------------------------------------------ catalogue
export function formationRow(f) {
  if (!f) return null;
  return { ...f, objectifs: parse(f.objectifs, []), contenu: parse(f.contenu, []), formateurs: parse(f.formateurs, []) };
}

export async function listFormations({ actives = true } = {}) {
  return (await q.all(`SELECT * FROM formations ${actives ? 'WHERE actif = 1' : ''} ORDER BY ordre, titre`)).map(formationRow);
}

// Places prises = inscriptions terminees (et non annulees) sur la session.
export async function sessionStats(sessionId) {
  const r = await q.get(`SELECT
      SUM(CASE WHEN completed_at IS NOT NULL AND statut NOT IN ('annule','abandon') THEN 1 ELSE 0 END) prises,
      COUNT(*) commencees
    FROM leads WHERE session_id = ?`, sessionId);
  return { prises: r.prises || 0, commencees: r.commencees || 0 };
}

export async function enrichSession(s) {
  if (!s) return null;
  const st = await sessionStats(s.id);
  const restantes = Math.max(0, (s.capacite || 0) - st.prises);
  const prix = currentPrice(s);
  return {
    ...s, ...st, restantes,
    complet: restantes <= 0 || s.statut === 'complete',
    tension: restantes > 0 && restantes <= Math.max(3, Math.ceil((s.capacite || 0) * 0.2)),
    passee: (s.fin || s.debut) < today(),
    dates: fmtRange(s.debut, s.fin),
    prix_actuel: prix,
    early_actif: Boolean(s.prix_early && s.early_jusqu && today() <= s.early_jusqu),
  };
}

export async function listSessions({ formationId, avenir = true, toutes = false } = {}) {
  const where = [];
  const params = [];
  if (formationId) { where.push('s.formation_id = ?'); params.push(formationId); }
  if (avenir) { where.push('COALESCE(s.fin, s.debut) >= ?'); params.push(today()); }
  if (!toutes) where.push("s.statut != 'brouillon' AND s.statut != 'annulee'");
  const rows = await q.all(`SELECT s.*, f.titre formation_titre, f.slug formation_slug, f.image formation_image, f.icone formation_icone, f.prix formation_prix
    FROM sessions_formation s JOIN formations f ON f.id = s.formation_id
    ${where.length ? 'WHERE ' + where.join(' AND ') : ''} ORDER BY s.debut`, ...params);
  return Promise.all(rows.map(enrichSession));
}

export async function getSession(id) {
  return await enrichSession(await q.get(`SELECT s.*, f.titre formation_titre, f.slug formation_slug, f.image formation_image, f.prix formation_prix
    FROM sessions_formation s JOIN formations f ON f.id = s.formation_id WHERE s.id = ?`, id));
}

export function currentPrice(s) {
  const base = s.prix ?? s.formation_prix ?? 0;
  if (s.prix_early && s.early_jusqu && today() <= s.early_jusqu) return s.prix_early;
  return base;
}

// ------------------------------------------------ argent
export async function paidTotal(leadId) {
  return (await q.get("SELECT COALESCE(SUM(montant),0) t FROM payments WHERE lead_id = ? AND statut = 'recu'", leadId)).t;
}

// Montant du : fige a la fin de l'inscription (prix du moment, remise appliquee).
export async function amountDue(lead, session) {
  if (session === undefined) session = lead.session_id ? await getSession(lead.session_id) : null;
  if (lead.prix_du != null) return lead.prix_du;
  if (!session) return 0;
  const p = currentPrice(session);
  return Math.round(p * (1 - (lead.remise_pct || 0) / 100) * 100) / 100;
}

export async function balance(lead) {
  const du = await amountDue(lead);
  const paye = await paidTotal(lead.id);
  return { du, paye, reste: Math.max(0, Math.round((du - paye) * 100) / 100), solde: du > 0 && paye >= du };
}

export async function paymentStatus(lead) {
  const b = await balance(lead);
  if (b.du === 0) return 'aucun';
  if (b.paye <= 0) return 'rien';
  return b.solde ? 'solde' : 'partiel';
}

// ------------------------------------------------ score d'interet (0 a 100)
// Lisible et explicable : chaque point a une raison affichee dans l'admin.
export async function computeScore(lead) {
  const signals = [];
  let s = 0;
  const add = (pts, label) => { s += pts; signals.push({ pts, label }); };
  if (lead.completed_at) add(30, 'Inscription terminée');
  else add(Math.min(20, (lead.step || 0) * 2), `Arrêté à l'étape ${lead.step || 0}`);
  const b = await balance(lead);
  if (b.solde) add(30, 'Formation soldée');
  else if (b.paye > 0) add(20, 'Acompte versé');
  const quand = { aujourdhui: [15, 'Veut payer aujourd\'hui'], acompte: [12, 'Acompte prévu'], avant: [8, 'Paiera avant la formation'], indecis: [0, 'Paiement indécis'] }[lead.paiement_quand];
  if (quand && !b.solde) add(quand[0], quand[1]);
  if (lead.disponible === 'oui') add(8, 'Disponible aux dates');
  if (lead.disponible === 'non_sur') add(-5, 'Pas sûr des dates');
  if (lead.financement === 'employeur') add(6, 'Financé par l\'employeur');
  if (lead.email) add(3, 'Email fourni');
  if (lead.code_promo || lead.parrain_id) add(4, 'Venu par parrainage ou code');
  const chats = (await q.get("SELECT COUNT(*) n FROM chat_messages m JOIN conversations c ON c.id = m.conversation_id WHERE c.lead_id = ? AND m.role = 'user'", lead.id)).n;
  if (chats > 0) add(Math.min(6, chats * 2), 'A échangé avec l\'assistante');
  const idle = daysBetween(lead.last_activity, new Date().toISOString());
  if (!lead.completed_at && idle > 7) add(-10, `Inactif depuis ${idle} jours`);
  s = Math.max(0, Math.min(100, s));
  const temperature = s >= 65 ? 'chaud' : s >= 35 ? 'tiede' : 'froid';
  return { score: s, temperature, signals };
}

export async function refreshScore(leadId) {
  const lead = await q.get('SELECT * FROM leads WHERE id = ?', leadId);
  if (!lead) return null;
  const { score, temperature } = await computeScore(lead);
  let statut = lead.statut;
  const b = await balance(lead);
  if (lead.completed_at && ['nouveau', 'en_cours'].includes(statut)) statut = 'inscrit';
  if (b.solde && ['nouveau', 'en_cours', 'inscrit', 'acompte'].includes(statut)) statut = 'paye';
  else if (b.paye > 0 && ['nouveau', 'en_cours', 'inscrit'].includes(statut)) statut = 'acompte';
  await q.run('UPDATE leads SET score = ?, temperature = ?, statut = ? WHERE id = ?', score, temperature, statut, leadId);
  return { score, temperature, statut };
}

// ------------------------------------------------ liens et variables de messages
export function baseUrl() {
  return (getSetting('integrations').url_publique || 'http://localhost:3000').replace(/\/$/, '');
}
export function paymentLink(lead) {
  const url = getSetting('integrations').paiement_url;
  if (!url) return `${baseUrl()}/espace`;
  const sep = url.includes('?') ? '&' : '?';
  return `${url}${sep}reference=MBS-${lead.id}`;
}

export async function messageVars(lead, extra = {}) {
  const session = lead?.session_id ? await getSession(lead.session_id) : null;
  const tarifs = getSetting('tarifs');
  const b = lead?.id ? await balance(lead) : { du: 0, paye: 0, reste: 0 };
  const base = baseUrl();
  return {
    prenom: lead?.prenom || '',
    nom: lead?.nom || '',
    formation: session?.formation_titre || 'votre formation',
    dates: session?.dates || '',
    date_debut: session ? fmtDate(session.debut) : '',
    horaire: session?.horaire || '',
    lieu: session?.lieu || '',
    places: session?.restantes ?? '',
    montant: money(b.du, tarifs.devise),
    reste: money(b.reste, tarifs.devise),
    montant_paye: money(b.paye, tarifs.devise),
    lien_reprise: `${base}/inscription?reprendre=1`,
    lien_espace: `${base}/espace`,
    lien_paiement: lead ? paymentLink(lead) : '',
    code_parrain: lead?.code_parrain || '',
    lien_parrainage: lead?.code_parrain ? `${base}/?ref=${lead.code_parrain}` : '',
    ...extra,
  };
}

// ------------------------------------------------ devis entreprise
// Base de la presentation : frais de consultation (2 500 a 5 000 $ HT) + frais par participant.
export async function quote({ modules = [], participants = 1, jours = 1 }) {
  const tarifs = getSetting('tarifs');
  const forms = (await Promise.all(modules.map((m) => q.get('SELECT * FROM formations WHERE id = ? OR slug = ?', String(m), String(m))))).filter(Boolean);
  const n = Math.max(1, Math.min(500, Number(participants) || 1));
  const j = Math.max(1, Math.min(3, Number(jours) || 1));
  const lignes = forms.map((f) => {
    // consultation : fourchette de la presentation, placee selon la duree (1 j = bas, 3 j = haut)
    const consult = Math.round(f.consult_min + ((f.consult_max - f.consult_min) * (j - 1)) / 2);
    const participantsTotal = f.prix * n;
    return { formation_id: f.id, titre: f.titre, consultation: consult, prix_participant: f.prix, participants: n, total_participants: participantsTotal, total: consult + participantsTotal };
  });
  const ht = lignes.reduce((a, l) => a + l.total, 0);
  const tva = Math.round(ht * (tarifs.tva / 100) * 100) / 100;
  return { lignes, participants: n, jours: j, ht, tva_pct: tarifs.tva, tva, ttc: ht + tva, devise: tarifs.devise, horeca: 'À la charge du client' };
}
