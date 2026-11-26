// Envoi des messages : WhatsApp (API Cloud de Meta) et email (Brevo ou Resend).
// Sans cle configuree, rien ne part : le message est journalise avec le statut
// « simule », visible dans l'admin, pour tester toute la chaine sans risque.
import { q, insert, getSetting } from './db.js';
import { id, now } from './util.js';

async function sendWhatsApp(to, body) {
  const cfg = getSetting('integrations');
  if (!cfg.whatsapp_token || !cfg.whatsapp_phone_id) return { statut: 'simule' };
  const res = await fetch(`https://graph.facebook.com/v21.0/${encodeURIComponent(cfg.whatsapp_phone_id)}/messages`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${cfg.whatsapp_token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ messaging_product: 'whatsapp', to: to.replace(/^\+/, ''), type: 'text', text: { body, preview_url: true } }),
    signal: AbortSignal.timeout(15000),
  });
  if (!res.ok) return { statut: 'echec', erreur: `WhatsApp ${res.status}: ${(await res.text()).slice(0, 300)}` };
  return { statut: 'envoye' };
}

async function sendEmail(to, subject, text) {
  const cfg = getSetting('integrations');
  if (!cfg.email_key || !cfg.email_from) return { statut: 'simule' };
  const html = `<div style="font-family:Poppins,Arial,sans-serif;font-size:15px;line-height:1.6;color:#04195E">${text
    .replace(/&/g, '&amp;').replace(/</g, '&lt;')
    .replace(/(https?:\/\/[^\s]+)/g, '<a href="$1" style="color:#04195E;font-weight:600">$1</a>')
    .replace(/\n/g, '<br>')}<p style="margin-top:28px;color:#666;font-size:12px">Modern Business School · L'école du Business Moderne</p></div>`;
  let res;
  if (cfg.email_provider === 'resend') {
    res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: `Bearer ${cfg.email_key}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ from: `${cfg.email_from_nom} <${cfg.email_from}>`, to: [to], subject, text, html }),
      signal: AbortSignal.timeout(15000),
    });
  } else {
    res = await fetch('https://api.brevo.com/v3/smtp/email', {
      method: 'POST',
      headers: { 'api-key': cfg.email_key, 'Content-Type': 'application/json' },
      body: JSON.stringify({ sender: { name: cfg.email_from_nom, email: cfg.email_from }, to: [{ email: to }], subject, textContent: text, htmlContent: html }),
      signal: AbortSignal.timeout(15000),
    });
  }
  if (!res.ok) return { statut: 'echec', erreur: `Email ${res.status}: ${(await res.text()).slice(0, 300)}` };
  return { statut: 'envoye' };
}

/**
 * Envoie un message et le journalise. canal : 'whatsapp' | 'email'.
 * Retourne la ligne journalisee.
 */
export async function deliver({ canal, to, contenu, sujet = 'Modern Business School', type = 'manuel', leadId = null, entrepriseId = null, par = 'automatisation' }) {
  let r;
  try {
    if (!to) r = { statut: 'echec', erreur: 'Destinataire manquant' };
    else if (canal === 'email') r = await sendEmail(to, sujet, contenu);
    else r = await sendWhatsApp(to, contenu);
  } catch (e) {
    r = { statut: 'echec', erreur: String(e.message || e).slice(0, 300) };
  }
  return await insert('messages', {
    id: id('ms_'), lead_id: leadId, entreprise_id: entrepriseId, canal, destinataire: to || '', type,
    statut: r.statut, contenu, erreur: r.erreur || null, par, created_at: now(),
  });
}

// Envoie sur WhatsApp et, si l'adresse existe, en copie par email.
export async function deliverToLead(lead, type, contenu, { sujet, par } = {}) {
  const out = [];
  if (lead.whatsapp) out.push(await deliver({ canal: 'whatsapp', to: lead.whatsapp, contenu, type, leadId: lead.id, par }));
  if (lead.email) out.push(await deliver({ canal: 'email', to: lead.email, contenu, sujet: sujet || 'Modern Business School', type, leadId: lead.id, par }));
  return out;
}

export async function alreadySent(leadId, type) {
  return Boolean(await q.get("SELECT 1 FROM messages WHERE lead_id = ? AND type = ? AND statut != 'echec' LIMIT 1", leadId, type));
}

export async function sentToday(leadId) {
  const since = new Date(Date.now() - 24 * 3600 * 1000).toISOString();
  return (await q.get("SELECT COUNT(DISTINCT type) n FROM messages WHERE lead_id = ? AND created_at > ? AND par = 'automatisation' AND statut != 'echec'", leadId, since)).n;
}
