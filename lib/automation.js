// Le moteur de relances. Il tourne chaque minute et decide, pour chaque dossier,
// s'il y a un message a envoyer. Garde-fous : interrupteur general, heures
// calmes (heure de Kinshasa), plafond de messages par jour et par personne,
// chaque message n'est envoye qu'une fois, desinscription respectee.
import { q, getSetting } from './db.js';
import { kinshasaHour, fill, daysBetween } from './util.js';
import { messageVars, balance, getSession, refreshScore, baseUrl } from './domain.js';
import { deliverToLead, alreadySent, sentToday, deliver } from './notify.js';

const hoursSince = (iso) => (Date.now() - new Date(iso).getTime()) / 3600000;

async function sendTemplate(lead, type, tplKey, extra) {
  const tpl = getSetting('templates')[tplKey];
  if (!tpl) return false;
  await deliverToLead(lead, type, fill(tpl, await messageVars(lead, extra)));
  return true;
}

export async function runAutomation({ force = false } = {}) {
  const cfg = getSetting('automation');
  if (!cfg.actif && !force) return { skipped: 'arret' };
  const h = kinshasaHour();
  if (!force && (h < cfg.heure_debut || h >= cfg.heure_fin)) return { skipped: 'heures_calmes' };

  let sent = 0;
  const leads = await q.all("SELECT * FROM leads WHERE opt_out = 0 AND whatsapp IS NOT NULL AND statut NOT IN ('annule','abandon') ORDER BY last_activity DESC LIMIT 2000");
  for (const lead of leads) {
    if (await sentToday(lead.id) >= cfg.max_par_jour) continue;
    const session = lead.session_id ? await getSession(lead.session_id) : null;
    const today = new Date().toISOString().slice(0, 10);

    // 1. inscriptions non terminees : relances espacees depuis la derniere activite
    if (!lead.completed_at) {
      if (session && session.passee) continue;
      const delais = cfg.relances_incompletes_heures || [];
      for (let i = 0; i < delais.length; i++) {
        const type = `relance_incomplete_${i + 1}`;
        if (await alreadySent(lead.id, type)) continue;
        if (hoursSince(lead.last_activity) >= delais[i]) {
          if (await sendTemplate(lead, type, `relance_incomplete_${Math.min(i + 1, 3)}`)) sent++;
        }
        break; // une etape a la fois
      }
      continue;
    }

    if (!session) continue;
    const b = await balance(lead);
    const joursAvant = daysBetween(today, session.debut);

    // 2. rappels de session (J-3, J-1...)
    let fait = false;
    for (const j of cfg.rappels_session_jours || []) {
      const type = `rappel_session_j${j}`;
      if (joursAvant === j && !await alreadySent(lead.id, type)) {
        await sendTemplate(lead, type, 'rappel_session');
        sent++; fait = true; break;
      }
    }
    if (fait) continue;

    // 3. paiement en attente
    if (b.reste > 0 && joursAvant >= 0) {
      const delais = cfg.relances_paiement_heures || [];
      for (let i = 0; i < delais.length; i++) {
        const type = `relance_paiement_${i + 1}`;
        if (await alreadySent(lead.id, type)) continue;
        if (hoursSince(lead.completed_at) >= delais[i]) {
          await sendTemplate(lead, type, `relance_paiement_${Math.min(i + 1, 2)}`);
          sent++;
        }
        break;
      }
      // dernier appel a une semaine de la formation
      if (joursAvant === 7 && !await alreadySent(lead.id, 'relance_paiement_j7')) {
        await sendTemplate(lead, 'relance_paiement_j7', 'relance_paiement_2');
        sent++;
      }
      continue;
    }

    // 4. apres la formation : certificat puis demande d'avis
    if (session.passee) {
      const cert = await q.get('SELECT * FROM certificats WHERE lead_id = ? AND session_id = ? AND revoque = 0', lead.id, session.id);
      if (cert && !await alreadySent(lead.id, 'certificat')) {
        await sendTemplate(lead, 'certificat', 'certificat', { lien_certificat: `${baseUrl()}/certificat/${cert.code}` });
        sent++;
      } else if (cert && !await alreadySent(lead.id, 'avis') && daysBetween(session.fin || session.debut, today) >= 2) {
        await sendTemplate(lead, 'avis', 'avis');
        sent++;
      }
    }
  }

  // 5. entreprises : alerte interne si une demande n'a pas ete traitee
  const ecole = getSetting('ecole');
  const att = await q.all("SELECT * FROM entreprises WHERE statut = 'nouveau'");
  for (const e of att) {
    const deja = await q.get("SELECT 1 FROM messages WHERE entreprise_id = ? AND type = 'alerte_b2b'", e.id);
    if (!deja && hoursSince(e.created_at) >= (cfg.b2b_relance_heures || 24)) {
      await deliver({ canal: 'email', to: ecole.email, sujet: `Demande entreprise en attente : ${e.societe}`, contenu: `La demande de ${e.societe} (${e.contact}, ${e.telephone}) attend depuis plus de ${cfg.b2b_relance_heures} h. Estimation : ${e.devis_ht} $ HT.`, type: 'alerte_b2b', entrepriseId: e.id });
      sent++;
    }
  }

  // scores rafraichis (l'inactivite fait baisser l'interet)
  // seuls les dossiers recents bougent (la penalite d'inactivite tombe apres 7 jours)
  const recent = new Date(Date.now() - 10 * 86400000).toISOString();
  for (const l of leads) if (l.last_activity > recent) await refreshScore(l.id);
  return { sent };
}

let running = false;
export function startAutomation() {
  const tick = async () => {
    if (running) return;
    running = true;
    try { await runAutomation(); } catch (e) { console.error('[automatisation]', e); } finally { running = false; }
  };
  setTimeout(tick, 5000);
  return setInterval(tick, 60000);
}
