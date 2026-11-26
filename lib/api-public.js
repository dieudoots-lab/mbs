// API publique : catalogue, inscription en etapes, espace apprenant, assistante,
// devis entreprise, verification de certificat, webhook de paiement.
import crypto from 'node:crypto';
import { q, insert, update, getSetting, logEvent, parse, tx } from './db.js';
import {
  id, code, now, normalizePhone, isEmail, hashPassword, verifyPassword, readBody, ok, send,
  HttpError, rateLimit, clientIp, parseCookies, setCookie, fill, sessionDays, fmtDate,
} from './util.js';
import {
  listFormations, listSessions, getSession, currentPrice, balance, refreshScore, messageVars,
  paymentLink, quote, paidTotal,
} from './domain.js';
import { openSession, closeSession, currentLead } from './auth.js';
import { assistantReply, aiEnabled } from './ai.js';
import { deliverToLead, deliver } from './notify.js';

export const TOTAL_STEPS = 13;

// Ce que l'apprenant peut voir de son propre dossier.
async function publicLead(lead) {
  if (!lead) return null;
  const s = lead.session_id ? await getSession(lead.session_id) : null;
  const b = await balance(lead);
  return {
    id: lead.id, whatsapp: lead.whatsapp, email: lead.email, prenom: lead.prenom, nom: lead.nom,
    profil: lead.profil, niveau: lead.niveau, objectif: lead.objectif, motivation: lead.motivation,
    financement: lead.financement, disponible: lead.disponible, paiement_quand: lead.paiement_quand,
    paiement_mode: lead.paiement_mode, source: lead.source, code_promo: lead.code_promo,
    step: lead.step, completed: Boolean(lead.completed_at), completed_at: lead.completed_at,
    hasPassword: Boolean(lead.pass_hash), statut: lead.statut, remise_pct: lead.remise_pct,
    code_parrain: lead.code_parrain,
    session: s && { id: s.id, formation: s.formation_titre, slug: s.formation_slug, image: s.formation_image, dates: s.dates, debut: s.debut, fin: s.fin, horaire: s.horaire, lieu: s.lieu, format: s.format, prix: currentPrice(s), restantes: s.restantes },
    du: b.du, paye: b.paye, reste: b.reste, solde: b.solde,
    lien_paiement: paymentLink(lead),
  };
}

async function touch(leadId, fields = {}) {
  await update('leads', leadId, { ...fields, updated_at: now(), last_activity: now() });
}

// Resout un code saisi : code promo de l'ecole ou code de parrainage d'un inscrit.
async function resolveCode(raw, leadId) {
  const c = String(raw || '').trim().toUpperCase();
  if (!c) return null;
  const promo = await q.get('SELECT * FROM promo_codes WHERE code = ? AND actif = 1', c);
  if (promo) {
    if (promo.expire_le && promo.expire_le < now().slice(0, 10)) return { error: 'Ce code a expiré.' };
    if (promo.max_utilisations && promo.utilisations >= promo.max_utilisations) return { error: 'Ce code a atteint sa limite.' };
    return { type: 'promo', code: c, remise_pct: promo.remise_pct, label: `Code ${c} : ${promo.remise_pct} % de remise` };
  }
  const parr = getSetting('parrainage');
  if (parr.actif) {
    const p = await q.get('SELECT id, prenom FROM leads WHERE code_parrain = ? AND id != ?', c, leadId || '');
    if (p) return { type: 'parrain', code: c, parrain_id: p.id, remise_pct: parr.remise_filleul_pct, label: `Parrainé(e) par ${p.prenom || 'un apprenant MBS'} : ${parr.remise_filleul_pct} % de remise` };
  }
  return { error: "Ce code n'existe pas." };
}

async function makeReferralCode(prenom) {
  const base = String(prenom || 'MBS').normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^A-Za-z]/g, '').toUpperCase().slice(0, 6) || 'MBS';
  for (let i = 0; i < 20; i++) {
    const c = base + code(3);
    if (!await q.get('SELECT 1 FROM leads WHERE code_parrain = ?', c)) return c;
  }
  return 'MBS' + code(6);
}

const CHOICES = {
  profil: ['etudiant', 'salarie', 'entrepreneur', 'freelance', 'recherche'],
  niveau: ['debutant', 'intermediaire', 'avance'],
  objectif: ['emploi', 'carriere', 'business', 'freelance', 'curiosite'],
  financement: ['moi', 'employeur', 'famille', 'cherche'],
  disponible: ['oui', 'non_sur'],
  paiement_quand: ['aujourdhui', 'acompte', 'avant', 'indecis'],
  paiement_mode: ['en_ligne', 'bureau'],
  source: ['facebook', 'tiktok', 'instagram', 'whatsapp', 'ami', 'google', 'evenement', 'autre'],
};
const pick = (field, v) => {
  if (!CHOICES[field].includes(v)) throw new HttpError(400, 'Choisissez une des options proposées.');
  return v;
};

export function registerPublic(route) {
  // ------------------------------------------------ catalogue
  route('GET', '/api/catalogue', async (req, res) => {
    const ecole = getSetting('ecole');
    const integ = getSetting('integrations');
    ok(res, {
      ecole, tarifs: getSetting('tarifs'), parrainage: getSetting('parrainage'),
      assistant: { nom: getSetting('assistant').nom, accueil: getSetting('assistant').accueil, ia: aiEnabled() },
      formations: await listFormations(), sessions: await listSessions(),
      mesure: { meta_pixel: integ.meta_pixel, ga_id: integ.ga_id },
      paiement_en_ligne: Boolean(integ.paiement_url),
    });
  });

  route('GET', '/api/places', async (req, res, { url }) => {
    const s = await getSession(url.searchParams.get('session'));
    if (!s) throw new HttpError(404, 'Session introuvable');
    ok(res, { capacite: s.capacite, prises: s.prises, restantes: s.restantes, tension: s.tension, complet: s.complet });
  });

  // mesures legeres (visites, quiz, clics) pour l'entonnoir de l'admin
  route('POST', '/api/track', async (req, res) => {
    if (!rateLimit('track:' + clientIp(req), 120, 600000)) return ok(res);
    const b = await readBody(req, { limit: 5000 });
    const allowed = ['visite', 'vue_formation', 'quiz_termine', 'clic_inscription', 'clic_whatsapp', 'devis_simule', 'clic_paiement'];
    if (!allowed.includes(b.type)) return ok(res);
    const lead = await currentLead(req);
    await logEvent(lead?.id, b.type, { page: String(b.page || '').slice(0, 200), info: String(b.info || '').slice(0, 200), v: parseCookies(req).mbs_v || null });
    ok(res);
  });

  // ------------------------------------------------ inscription
  route('GET', '/api/inscription/me', async (req, res) => {
    const lead = await currentLead(req);
    ok(res, { lead: await publicLead(lead), total: TOTAL_STEPS });
  });

  route('POST', '/api/inscription/start', async (req, res) => {
    if (!rateLimit('start:' + clientIp(req), 20, 600000)) throw new HttpError(429, 'Trop de tentatives. Réessayez dans quelques minutes.');
    const b = await readBody(req);
    const whatsapp = normalizePhone(b.whatsapp);
    if (!whatsapp) throw new HttpError(400, 'Ce numéro ne semble pas valide. Exemple : 0899 132 880 ou +243 899 132 880.');
    const session = b.session_id ? await getSession(b.session_id) : null;
    if (b.session_id && !session) throw new HttpError(400, 'Cette session n\'existe plus. Choisissez-en une autre.');

    const existing = await q.get('SELECT * FROM leads WHERE whatsapp = ?', whatsapp);
    if (existing) {
      if (existing.pass_hash) return ok(res, { needLogin: true, prenom: existing.prenom || '' });
      // dossier sans mot de passe : on reprend directement
      if (session && !existing.completed_at) await touch(existing.id, { session_id: session.id });
      await openSession(res, 'lead', existing.id);
      await logEvent(existing.id, 'reprise');
      return ok(res, { lead: await publicLead(await q.get('SELECT * FROM leads WHERE id = ?', existing.id)), resumed: true });
    }

    const lid = id('ld_');
    const t = now();
    const utm = b.utm || {};
    let parrain = null;
    if (b.ref) {
      const r = await resolveCode(b.ref, null);
      if (r && !r.error) parrain = r;
    }
    await insert('leads', {
      id: lid, whatsapp, session_id: session?.id || null, step: 2, statut: 'en_cours',
      utm_source: String(utm.source || '').slice(0, 80) || null, utm_medium: String(utm.medium || '').slice(0, 80) || null,
      utm_campaign: String(utm.campaign || '').slice(0, 120) || null, referrer: String(b.referrer || '').slice(0, 300) || null,
      code_promo: parrain?.code || null, parrain_id: parrain?.parrain_id || null, remise_pct: parrain?.remise_pct || 0,
      created_at: t, updated_at: t, last_activity: t,
    });
    await logEvent(lid, 'etape', { step: 2 });
    await refreshScore(lid);
    await openSession(res, 'lead', lid);
    ok(res, { lead: await publicLead(await q.get('SELECT * FROM leads WHERE id = ?', lid)) });
  });

  route('POST', '/api/inscription/login', async (req, res) => {
    const b = await readBody(req);
    const whatsapp = normalizePhone(b.whatsapp);
    if (!rateLimit('login:' + clientIp(req), 10, 600000) || !rateLimit('loginw:' + whatsapp, 8, 600000)) throw new HttpError(429, 'Trop de tentatives. Réessayez dans 10 minutes.');
    const lead = whatsapp && await q.get('SELECT * FROM leads WHERE whatsapp = ?', whatsapp);
    if (!lead || !verifyPassword(b.password || '', lead.pass_hash)) throw new HttpError(401, 'Numéro ou mot de passe incorrect.');
    await openSession(res, 'lead', lead.id);
    await touch(lead.id);
    await logEvent(lead.id, 'connexion');
    ok(res, { lead: await publicLead(lead) });
  });

  route('POST', '/api/inscription/logout', async (req, res) => { await closeSession(req, res, 'lead'); ok(res); });

  route('POST', '/api/inscription/code', async (req, res) => {
    const lead = await currentLead(req);
    const b = await readBody(req);
    const r = await resolveCode(b.code, lead?.id);
    if (!r) return ok(res, { valid: false });
    if (r.error) return ok(res, { valid: false, error: r.error });
    ok(res, { valid: true, label: r.label, remise_pct: r.remise_pct });
  });

  route('POST', '/api/inscription/session', async (req, res) => {
    const lead = await currentLead(req);
    if (!lead) throw new HttpError(401, 'Session expirée');
    const b = await readBody(req);
    const s = await getSession(b.session_id);
    if (!s || s.passee) throw new HttpError(400, 'Session indisponible');
    if (s.complet && s.id !== lead.session_id) throw new HttpError(400, 'Cette session est complète.');
    const fields = { session_id: s.id };
    if (lead.completed_at && lead.session_id !== s.id && await paidTotal(lead.id) === 0) {
      fields.prix_du = Math.round(currentPrice(s) * (1 - (lead.remise_pct || 0) / 100) * 100) / 100;
    }
    await touch(lead.id, fields);
    await logEvent(lead.id, 'changement_session', { session: s.id });
    ok(res, { lead: await publicLead(await q.get('SELECT * FROM leads WHERE id = ?', lead.id)) });
  });

  route('POST', '/api/inscription/step', async (req, res) => {
    const lead = await currentLead(req);
    if (!lead) throw new HttpError(401, 'Votre session a expiré. Saisissez à nouveau votre numéro WhatsApp : rien n\'est perdu.');
    const { step, data = {} } = await readBody(req);
    const n = Number(step);
    const f = {};
    switch (n) {
      case 3: {
        if (data.email) {
          const e = String(data.email).trim().toLowerCase();
          if (!isEmail(e)) throw new HttpError(400, 'Cette adresse email ne semble pas valide.');
          f.email = e;
        } else f.email = null;
        break;
      }
      case 4: {
        if (lead.pass_hash && !data.password) break;
        if (String(data.password || '').length < 6) throw new HttpError(400, 'Choisissez au moins 6 caractères.');
        f.pass_hash = hashPassword(data.password);
        break;
      }
      case 5: {
        const prenom = String(data.prenom || '').trim().slice(0, 60);
        const nom = String(data.nom || '').trim().slice(0, 80);
        if (prenom.length < 2) throw new HttpError(400, 'Indiquez votre prénom.');
        if (nom.length < 2) throw new HttpError(400, 'Indiquez votre nom.');
        f.prenom = prenom.charAt(0).toUpperCase() + prenom.slice(1);
        f.nom = nom.toUpperCase();
        break;
      }
      case 6: f.profil = pick('profil', data.profil); break;
      case 7: f.niveau = pick('niveau', data.niveau); break;
      case 8:
        f.objectif = pick('objectif', data.objectif);
        f.motivation = String(data.motivation || '').trim().slice(0, 1000) || null;
        break;
      case 9: f.financement = pick('financement', data.financement); break;
      case 10: f.disponible = pick('disponible', data.disponible); break;
      case 11: f.paiement_quand = pick('paiement_quand', data.paiement_quand); break;
      case 12: f.paiement_mode = pick('paiement_mode', data.paiement_mode); break;
      case 13: {
        f.source = pick('source', data.source);
        if (data.code) {
          const r = await resolveCode(data.code, lead.id);
          if (r?.error) throw new HttpError(400, r.error);
          if (r) { f.code_promo = r.code; f.remise_pct = r.remise_pct; f.parrain_id = r.parrain_id || null; }
        }
        break;
      }
      default: throw new HttpError(400, 'Étape inconnue');
    }
    f.step = Math.max(lead.step || 0, n);
    if (!lead.completed_at && lead.statut === 'nouveau') f.statut = 'en_cours';
    await touch(lead.id, f);
    await logEvent(lead.id, 'etape', { step: n });

    let justCompleted = false;
    if (n === TOTAL_STEPS && !lead.completed_at) {
      const fresh = await q.get('SELECT * FROM leads WHERE id = ?', lead.id);
      if (!fresh.session_id) throw new HttpError(400, 'Choisissez d\'abord une session de formation.');
      const s = await getSession(fresh.session_id);
      if (!fresh.prenom || !fresh.pass_hash) throw new HttpError(400, 'Quelques informations manquent encore. Revenez aux étapes précédentes.');
      const codeParrain = fresh.code_parrain || await makeReferralCode(fresh.prenom);
      await tx(async (t) => {
        await update('leads', lead.id, {
          completed_at: now(), statut: 'inscrit',
          prix_du: Math.round(currentPrice(s) * (1 - (fresh.remise_pct || 0) / 100) * 100) / 100,
          code_parrain: codeParrain,
        }, 'id', t);
        if (fresh.code_promo && !fresh.parrain_id) await t.run('UPDATE promo_codes SET utilisations = utilisations + 1 WHERE code = ?', fresh.code_promo);
      });
      await logEvent(lead.id, 'inscription_terminee', { session: s.id });
      justCompleted = true;
      const done = await q.get('SELECT * FROM leads WHERE id = ?', lead.id);
      await deliverToLead(done, 'inscription_confirmee', fill(getSetting('templates').inscription_confirmee, await messageVars(done)), { sujet: 'Votre inscription est validée' }).catch(console.error);
    }
    await refreshScore(lead.id);
    ok(res, { lead: await publicLead(await q.get('SELECT * FROM leads WHERE id = ?', lead.id)), completed: justCompleted });
  });

  // ------------------------------------------------ espace apprenant
  route('GET', '/api/espace', async (req, res) => {
    const lead = await currentLead(req);
    if (!lead) throw new HttpError(401, 'Connexion requise');
    const payments = await q.all("SELECT montant, methode, reference, created_at FROM payments WHERE lead_id = ? AND statut = 'recu' ORDER BY created_at", lead.id);
    const certificats = await q.all('SELECT code, formation, dates, delivre_le FROM certificats WHERE lead_id = ? AND revoque = 0', lead.id);
    const filleuls = await q.all("SELECT prenom, completed_at FROM leads WHERE parrain_id = ? ORDER BY created_at DESC", lead.id);
    const s = lead.session_id ? await getSession(lead.session_id) : null;
    const presences = s ? await q.all('SELECT jour, present FROM presences WHERE lead_id = ? AND session_id = ?', lead.id, s.id) : [];
    const autres = (await listSessions()).filter((x) => x.id !== lead.session_id && !x.complet).map((x) => ({ id: x.id, formation: x.formation_titre, dates: x.dates, prix: x.prix_actuel, image: x.formation_image }));
    ok(res, {
      lead: await publicLead(lead), payments, certificats,
      filleuls: filleuls.map((x) => ({ prenom: x.prenom || 'Inscrit(e)', inscrit: Boolean(x.completed_at) })),
      parrainage: getSetting('parrainage'),
      jours: s ? sessionDays(s.debut, s.fin).map((j) => ({ jour: j, label: fmtDate(j, { weekday: 'long', day: 'numeric', month: 'long' }), present: presences.find((p) => p.jour === j)?.present ?? null })) : [],
      autres,
      ecole: getSetting('ecole'),
    });
  });

  route('GET', '/api/espace/calendrier.ics', async (req, res) => {
    const lead = await currentLead(req);
    if (!lead?.session_id) throw new HttpError(404, 'Aucune session');
    const s = await getSession(lead.session_id);
    const [h1, h2] = String(s.horaire || '9h à 13h').match(/\d{1,2}/g) || ['9', '13'];
    const pad = (x) => String(x).padStart(2, '0');
    const ics = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//MBS//Plateforme//FR', 'CALSCALE:GREGORIAN'];
    for (const d of sessionDays(s.debut, s.fin)) {
      const day = d.replace(/-/g, '');
      // Kinshasa = UTC+1 : on ecrit en UTC
      ics.push('BEGIN:VEVENT', `UID:${s.id}-${day}@mbs`, `DTSTAMP:${new Date().toISOString().replace(/[-:]/g, '').slice(0, 15)}Z`,
        `DTSTART:${day}T${pad(Number(h1) - 1)}0000Z`, `DTEND:${day}T${pad(Number(h2 || Number(h1) + 4) - 1)}0000Z`,
        `SUMMARY:MBS · ${s.formation_titre}`, `LOCATION:${(s.lieu || '').replace(/[,;]/g, ' ')}`,
        'DESCRIPTION:Formation Modern Business School', 'END:VEVENT');
    }
    ics.push('END:VCALENDAR');
    send(res, 200, ics.join('\r\n'), { 'Content-Type': 'text/calendar; charset=utf-8', 'Content-Disposition': 'attachment; filename="mbs-formation.ics"' });
  });

  // ------------------------------------------------ Ama, l'assistante
  route('GET', '/api/assistant', async (req, res) => {
    const conv = parseCookies(req).mbs_conv;
    const msgs = conv ? await q.all('SELECT role, content, created_at FROM chat_messages WHERE conversation_id = ? ORDER BY id', conv) : [];
    const a = getSetting('assistant');
    ok(res, { nom: a.nom, accueil: a.accueil, messages: msgs, ia: aiEnabled() });
  });

  route('POST', '/api/assistant', async (req, res) => {
    const ip = clientIp(req);
    if (!rateLimit('chat:' + ip, 40, 600000)) throw new HttpError(429, 'Vous écrivez beaucoup ! Patientez quelques minutes, ou écrivez-nous sur WhatsApp.');
    const b = await readBody(req, { limit: 20000 });
    const text = String(b.message || '').trim().slice(0, 2000);
    if (!text) throw new HttpError(400, 'Message vide');
    const lead = await currentLead(req);
    let conv = parseCookies(req).mbs_conv;
    if (!conv || !await q.get('SELECT 1 FROM conversations WHERE id = ?', conv)) {
      conv = id('cv_');
      await insert('conversations', { id: conv, lead_id: lead?.id || null, visiteur: crypto.createHash('sha256').update(ip).digest('hex').slice(0, 12), page: String(b.page || '').slice(0, 200), created_at: now(), updated_at: now() });
      setCookie(res, 'mbs_conv', conv, { maxAge: 60 * 60 * 24 * 30 });
    } else if (lead) {
      await q.run('UPDATE conversations SET lead_id = COALESCE(lead_id, ?) WHERE id = ?', lead.id, conv);
    }
    const count = (await q.get('SELECT nb_messages n FROM conversations WHERE id = ?', conv)).n;
    if (count > 80) throw new HttpError(429, `Cette conversation est longue : pour aller plus loin, l'équipe vous répond sur WhatsApp au ${getSetting('ecole').whatsapp}.`);
    await q.run('INSERT INTO chat_messages (conversation_id, role, content, created_at) VALUES (?, ?, ?, ?)', conv, 'user', text, now());
    const history = await q.all('SELECT role, content FROM chat_messages WHERE conversation_id = ? ORDER BY id', conv);
    const { reply, mode } = await assistantReply(history, { lead });
    await q.run('INSERT INTO chat_messages (conversation_id, role, content, created_at) VALUES (?, ?, ?, ?)', conv, 'assistant', reply, now());
    await q.run('UPDATE conversations SET nb_messages = nb_messages + 2, updated_at = ? WHERE id = ?', now(), conv);
    if (lead) await refreshScore(lead.id);
    ok(res, { reply, mode });
  });

  // ------------------------------------------------ entreprises
  route('POST', '/api/entreprises/devis', async (req, res) => {
    const b = await readBody(req);
    ok(res, await quote(b));
  });

  route('POST', '/api/entreprises', async (req, res) => {
    if (!rateLimit('b2b:' + clientIp(req), 8, 3600000)) throw new HttpError(429, 'Trop de demandes. Contactez-nous directement par WhatsApp.');
    const b = await readBody(req);
    const societe = String(b.societe || '').trim().slice(0, 120);
    const contact = String(b.contact || '').trim().slice(0, 100);
    const telephone = normalizePhone(b.telephone);
    const email = String(b.email || '').trim().toLowerCase();
    if (societe.length < 2) throw new HttpError(400, 'Indiquez le nom de votre organisation.');
    if (contact.length < 2) throw new HttpError(400, 'Indiquez le nom de la personne à contacter.');
    if (!telephone) throw new HttpError(400, 'Indiquez un numéro de téléphone valide.');
    if (email && !isEmail(email)) throw new HttpError(400, 'Adresse email invalide.');
    const modules = Array.isArray(b.modules) ? b.modules.slice(0, 10) : [];
    if (!modules.length) throw new HttpError(400, 'Choisissez au moins un module.');
    const devis = await quote({ modules, participants: b.participants, jours: b.jours });
    const eid = id('en_');
    await insert('entreprises', {
      id: eid, societe, secteur: String(b.secteur || '').slice(0, 80), contact, fonction: String(b.fonction || '').slice(0, 80),
      email: email || null, telephone, taille: String(b.taille || '').slice(0, 40), participants: devis.participants,
      modules: devis.lignes.map((l) => l.formation_id), jours: devis.jours, format: String(b.format || 'presentiel').slice(0, 30),
      periode: String(b.periode || '').slice(0, 80), objectifs: String(b.objectifs || '').slice(0, 2000),
      devis_ht: devis.ht, devis_detail: devis, statut: 'nouveau', source: String(b.source || 'site').slice(0, 60),
      created_at: now(), updated_at: now(),
    });
    const vars = { contact, societe, devis: `${devis.ht.toLocaleString('fr-FR')} ${devis.devise} HT` };
    const msg = fill(getSetting('templates').b2b_accuse, vars);
    const ecole = getSetting('ecole');
    await (async () => {
      await deliver({ canal: 'whatsapp', to: telephone, contenu: msg, type: 'b2b_accuse', entrepriseId: eid });
      if (email) await deliver({ canal: 'email', to: email, sujet: 'Votre demande de formation · MBS', contenu: msg, type: 'b2b_accuse', entrepriseId: eid });
      await deliver({ canal: 'email', to: ecole.email, sujet: `Nouvelle demande entreprise : ${societe}`, contenu: `${societe} (${b.secteur || 'secteur ?'})\nContact : ${contact}, ${b.fonction || ''}\nTéléphone : ${telephone}\nEmail : ${email || '—'}\nModules : ${devis.lignes.map((l) => l.titre).join(', ')}\nParticipants : ${devis.participants}, ${devis.jours} jour(s)\nEstimation : ${devis.ht} $ HT\nObjectifs : ${b.objectifs || '—'}`, type: 'alerte_b2b_nouvelle', entrepriseId: eid });
    })().catch(console.error);
    await logEvent(null, 'demande_entreprise', { id: eid, ht: devis.ht });
    ok(res, { id: eid, devis });
  });

  // ------------------------------------------------ certificats
  route('GET', '/api/certificats/:code', async (req, res, { params }) => {
    const c = await q.get('SELECT code, nom_complet, formation, dates, delivre_le, revoque FROM certificats WHERE code = ?', String(params.code).toUpperCase());
    if (!c) throw new HttpError(404, 'Aucun certificat ne correspond à ce code.');
    ok(res, { ...c, valide: !c.revoque });
  });

  // ------------------------------------------------ webhook de paiement (agregateur mobile money / carte)
  // Format attendu (adaptable) : { reference: "MBS-<id dossier>", montant: 250, transaction_id: "...", statut: "success" }
  route('POST', '/api/webhooks/paiement', async (req, res, { url }) => {
    const secret = getSetting('integrations').webhook_secret;
    const given = url.searchParams.get('secret') || req.headers['x-webhook-secret'] || '';
    if (!secret || given.length !== secret.length || !crypto.timingSafeEqual(Buffer.from(given), Buffer.from(secret))) throw new HttpError(401, 'Signature invalide');
    const b = await readBody(req);
    const ref = String(b.reference || b.ref || '');
    const leadId = ref.replace(/^MBS-/, '');
    const lead = await q.get('SELECT * FROM leads WHERE id = ?', leadId);
    if (!lead) throw new HttpError(404, 'Dossier introuvable');
    const okStatus = ['success', 'succes', 'paid', 'completed', 'approved', 'recu', '0'].includes(String(b.statut ?? b.status ?? 'success').toLowerCase());
    const montant = Number(b.montant ?? b.amount);
    if (!okStatus || !(montant > 0)) return ok(res, { ignored: true });
    const txid = String(b.transaction_id || b.transactionId || b.id || '') || null;
    if (txid && await q.get('SELECT 1 FROM payments WHERE reference = ?', txid)) return ok(res, { duplicate: true });
    await insert('payments', { id: id('py_'), lead_id: lead.id, montant, methode: String(b.methode || b.method || 'en ligne').slice(0, 40), reference: txid, statut: 'recu', note: 'Webhook', par: 'webhook', created_at: now() });
    await logEvent(lead.id, 'paiement', { montant, via: 'webhook' });
    await refreshScore(lead.id);
    const fresh = await q.get('SELECT * FROM leads WHERE id = ?', lead.id);
    await deliverToLead(fresh, `paiement_recu_${txid || Date.now()}`, fill(getSetting('templates').paiement_recu, await messageVars(fresh)), { sujet: 'Paiement reçu' }).catch(console.error);
    ok(res, { recorded: true });
  });
}

export { publicLead };
