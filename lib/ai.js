// L'intelligence artificielle de la plateforme (Claude, d'Anthropic).
//  - Ama, l'assistante virtuelle du site et de l'espace apprenant
//  - l'analyse d'un dossier pour l'equipe commerciale
//  - la redaction d'une proposition pour une entreprise
// Sans cle API, Ama repond a partir de la FAQ et du catalogue (mode simple).
import Anthropic from '@anthropic-ai/sdk';
import { getSetting, q } from './db.js';
import { listFormations, listSessions, balance, computeScore, getSession } from './domain.js';
import { FAQ, PROGRAMMES } from './content.js';
import { money } from './util.js';

const FALLBACK_BETA = 'server-side-fallback-2026-07-01';
let cached = { key: null, client: null };

function client() {
  const cfg = getSetting('integrations');
  const key = cfg.anthropic_key || process.env.ANTHROPIC_API_KEY || '';
  if (!key || cfg.ai_actif === false) return null;
  if (cached.key !== key) cached = { key, client: new Anthropic({ apiKey: key, maxRetries: 2, timeout: 60_000 }) };
  return cached.client;
}
export const aiEnabled = () => Boolean(client());
const model = () => getSetting('integrations').ai_model || 'claude-opus-5-5';

function textOf(resp) {
  return resp.content.filter((b) => b.type === 'text').map((b) => b.text).join('').trim();
}

// ------------------------------------------------ connaissance de l'ecole
export async function knowledge() {
  const ecole = getSetting('ecole');
  const tarifs = getSetting('tarifs');
  const parr = getSetting('parrainage');
  const forms = await listFormations();
  const sessions = await listSessions();
  const lines = [];
  lines.push(`# ${ecole.nom} (${ecole.sigle})`);
  lines.push(`${ecole.baseline}. Portée par la société ${ecole.societe}. Ville : ${ecole.ville}. Plus de ${ecole.diplomes} diplômés.`);
  lines.push(`Contact : WhatsApp ${ecole.whatsapp}, téléphone ${ecole.telephone1} / ${ecole.telephone2}, email ${ecole.email}, site ${ecole.site}. Réseaux : @mbsofficiel (Facebook, TikTok, Instagram).`);
  lines.push('\n## Programmes');
  for (const p of PROGRAMMES) lines.push(`- ${p.titre} : ${p.texte} (pour : ${p.pour})`);
  lines.push('\n## Formations (prix par participant, ' + tarifs.mention + ')');
  for (const f of forms) {
    lines.push(`### ${f.titre} · ${money(f.prix, tarifs.devise)} ${tarifs.mention} par participant · durée ${f.duree}`);
    lines.push(`Page : /formations/${f.slug}`);
    lines.push(`Objectifs : ${f.objectifs.join(' ')}`);
    if (f.contenu.length) lines.push(`Au programme : ${f.contenu.join(' ; ')}`);
    lines.push(`Public : ${f.public}. Prérequis : ${f.prerequis}.`);
  }
  lines.push('\n## Prochaines sessions ouvertes aux particuliers');
  if (!sessions.length) lines.push('Aucune session programmée pour le moment : proposer de laisser son numéro via la page d\'inscription ou WhatsApp.');
  for (const s of sessions) {
    lines.push(`- ${s.formation_titre} : ${s.dates}, ${s.horaire || ''}, ${s.lieu || ''}, format ${s.format}. Prix : ${money(s.prix_actuel, tarifs.devise)}${s.early_actif ? ' (tarif early bird)' : ''}. ${s.complet ? 'COMPLET' : `${s.restantes} places restantes`}. Lien d'inscription : /inscription?session=${s.id}`);
  }
  lines.push('\n## Entreprises (Renforcement de capacité)');
  lines.push(`Modules de 1 à 3 jours. Frais de consultation entre 2 500 et 5 000 $ HT selon la durée, plus les frais par participant du module. TVA ${tarifs.tva} %. HORECA (salle, repas) à la charge du client. Devis instantané et demande sur /entreprises.`);
  lines.push('\n## Paiement');
  lines.push(`Inscription en ligne gratuite. Frais réglables en ligne (mobile money, carte) ou aux bureaux, en une fois ou avec un acompte de ${tarifs.acompte_pct} %.`);
  if (parr.actif) lines.push(`Parrainage : le filleul a ${parr.remise_filleul_pct} % de remise avec le code de son parrain ; le parrain reçoit ${parr.recompense}.`);
  lines.push('\n## Questions fréquentes');
  for (const f of FAQ) lines.push(`- ${f.q} ${f.r}`);
  const kb = getSetting('assistant').base_connaissance;
  if (kb) lines.push('\n## Informations complémentaires fournies par l\'équipe\n' + kb);
  return lines.join('\n');
}

async function systemPrompt() {
  const a = getSetting('assistant');
  const ecole = getSetting('ecole');
  return `Tu es ${a.nom}, l'assistante virtuelle de ${ecole.nom}, une école de formation aux métiers du numérique à Kinshasa. Tu échanges avec des visiteurs du site, souvent sur téléphone.

Ton rôle : aider chaque personne à trouver la formation qui lui correspond, répondre à ses questions et l'accompagner jusqu'à l'inscription (ou vers un devis pour une entreprise).

Façon d'écrire : en français, chaleureux et direct, comme un message WhatsApp soigné. Deux à cinq phrases en général. Pose une question à la fois pour comprendre le besoin (situation, objectif, budget, disponibilités) avant de recommander. Quand tu recommandes une formation, explique en une phrase pourquoi elle correspond à la personne, puis donne le lien d'inscription de la session (format Markdown [texte](/inscription?session=...)).

Règles :
- Appuie-toi uniquement sur les informations ci-dessous pour les prix, dates, places et contenus. Si une information manque, dis-le simplement et propose le WhatsApp de l'école (${ecole.whatsapp}).
- Tu es une assistante virtuelle : si on te demande si tu es humaine, réponds honnêtement que non, et propose de passer le relais à un conseiller sur WhatsApp.
- Ne promets ni emploi, ni remise, ni délai qui ne figurent pas ci-dessous.
- Ne demande jamais de mot de passe ni de numéro de carte bancaire.
- Pour une entreprise ou une équipe, oriente vers la page /entreprises (devis instantané).

${await knowledge()}`;
}

// ------------------------------------------------ Ama : conversation
export async function assistantReply(history, { lead } = {}) {
  const c = client();
  if (!c) return { reply: await fallbackReply(history.at(-1)?.content || ''), mode: 'simple' };

  const system = [{ type: 'text', text: await systemPrompt(), cache_control: { type: 'ephemeral' } }];
  if (lead) {
    const s = lead.session_id ? await getSession(lead.session_id) : null;
    const b = await balance(lead);
    system.push({
      type: 'text',
      text: `Contexte : tu parles à ${lead.prenom || 'un inscrit'} ${lead.nom || ''}, inscrit(e) ${s ? `à « ${s.formation_titre} » (${s.dates}, ${s.horaire})` : 'sans session choisie'}. Inscription ${lead.completed_at ? 'terminée' : `en cours (étape ${lead.step})`}. Montant dû : ${b.du} $, déjà payé : ${b.paye} $, reste : ${b.reste} $. Son espace personnel est sur /espace. Son code de parrainage : ${lead.code_parrain || '—'}.`,
    });
  }
  const messages = history.slice(-20).map((m) => ({ role: m.role === 'user' ? 'user' : 'assistant', content: String(m.content).slice(0, 4000) }));
  while (messages.length && messages[0].role !== 'user') messages.shift();

  try {
    const resp = await c.beta.messages.create({
      model: model(),
      max_tokens: 2048,
      betas: [FALLBACK_BETA],
      fallbacks: 'default',
      output_config: { effort: 'low' },
      system,
      messages,
    });
    if (resp.stop_reason === 'refusal') {
      return { reply: `Je ne peux pas répondre à cette demande. Pour toute question, l'équipe MBS vous répond sur WhatsApp au ${getSetting('ecole').whatsapp}.`, mode: 'ia' };
    }
    return { reply: textOf(resp) || await fallbackReply(history.at(-1)?.content || ''), mode: 'ia' };
  } catch (e) {
    console.error('[ia] assistant', e instanceof Anthropic.APIError ? `${e.status} ${e.message}` : e);
    return { reply: await fallbackReply(history.at(-1)?.content || ''), mode: 'simple' };
  }
}

// Mode simple : mots-cles -> reponses tirees du catalogue et de la FAQ.
export async function fallbackReply(text) {
  const t = text.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
  const ecole = getSetting('ecole');
  const tarifs = getSetting('tarifs');
  const sessions = await listSessions();
  const forms = await listFormations();
  const SYNONYMES = [
    ['intelligence', /\bia\b|intelligence|automatis|chatgpt|temps|productiv|outil|excel|process/],
    ['contenu', /contenu|video|tiktok|post|createur|storytelling|photo|instagram|redaction|influence/],
    ['prospection', /prospect|client|vend|commercial|linkedin|rendez|social selling|chiffre/],
    ['marketing', /marketing|pub|publicite|reseaux|seo|google|campagne|visibilite|digital|facebook|communication/],
  ];
  const cle = SYNONYMES.find(([, re]) => re.test(t))?.[0];
  const match = cle ? forms.find((f) => f.slug.includes(cle)) : null;
  if (/entreprise|equipe|societe|devis|collaborateur|staff/.test(t)) {
    return `Pour former une équipe, notre programme Renforcement de capacité s'adapte à vos objectifs (1 à 3 jours). Obtenez une estimation immédiate sur [la page Entreprises](/entreprises) : un conseiller vous rappelle sous 24 h.`;
  }
  if (match) {
    const s = sessions.find((x) => x.formation_id === match.id && !x.complet);
    return `« ${match.titre} » : ${match.objectifs[0]} ${s ? `Prochaine session : ${s.dates}, ${s.horaire}, ${money(s.prix_actuel, tarifs.devise)} ${tarifs.mention}. Il reste ${s.restantes} places. [Je m'inscris](/inscription?session=${s.id})` : `Pas de session programmée pour l'instant : écrivez-nous sur WhatsApp (${ecole.whatsapp}) pour être prévenu.`}`;
  }
  if (/prix|cout|combien|tarif|\$|dollar|payer|paiement/.test(t)) {
    return `Nos bootcamps vont de ${money(Math.min(...forms.map((f) => f.prix)), tarifs.devise)} à ${money(Math.max(...forms.map((f) => f.prix)), tarifs.devise)} ${tarifs.mention} par participant. L'inscription en ligne est gratuite, le paiement se fait en ligne (mobile money, carte) ou à nos bureaux, en une fois ou avec un acompte. Quelle formation vous intéresse ?`;
  }
  if (/date|quand|session|prochain|calendrier/.test(t)) {
    if (!sessions.length) return `Aucune session n'est programmée pour le moment. Écrivez-nous sur WhatsApp (${ecole.whatsapp}) pour être prévenu en priorité.`;
    return 'Nos prochaines sessions :\n' + sessions.slice(0, 5).map((s) => `• ${s.formation_titre} : ${s.dates} ${s.complet ? '(complet)' : `· [s'inscrire](/inscription?session=${s.id})`}`).join('\n');
  }
  if (/certificat|diplome|attestation/.test(t)) return FAQ[1].r;
  if (/humain|robot|personne|conseiller|appeler/.test(t)) return `Je suis l'assistante virtuelle de MBS. Pour parler à un conseiller : WhatsApp ${ecole.whatsapp} ou ${ecole.telephone1}.`;
  if (/inscri/.test(t)) return "L'inscription prend deux minutes : [commencer mon inscription](/inscription). Chaque étape est enregistrée, vous pouvez reprendre à tout moment.";
  return `Je peux vous renseigner sur nos formations (Marketing Digital, Création de Contenu, IA & Automatisation, Prospection 2.0), les dates, les prix ou les offres entreprises. Que cherchez-vous ? Vous pouvez aussi écrire à l'équipe sur WhatsApp : ${ecole.whatsapp}.`;
}

// ------------------------------------------------ analyse d'un dossier (equipe commerciale)
const ANALYSE_SCHEMA = {
  type: 'object',
  properties: {
    resume: { type: 'string', description: 'Deux ou trois phrases sur la personne et où elle en est.' },
    temperature: { type: 'string', enum: ['chaud', 'tiede', 'froid'] },
    freins: { type: 'array', items: { type: 'string' }, description: 'Objections ou freins probables.' },
    prochaine_action: { type: 'string', description: 'La prochaine action concrète pour le conseiller.' },
    message_whatsapp: { type: 'string', description: 'Un message WhatsApp personnalisé, prêt à envoyer, signé MBS.' },
  },
  required: ['resume', 'temperature', 'freins', 'prochaine_action', 'message_whatsapp'],
  additionalProperties: false,
};

export async function analyseLead(lead) {
  const s = lead.session_id ? await getSession(lead.session_id) : null;
  const b = await balance(lead);
  const sc = await computeScore(lead);
  const msgs = await q.all('SELECT type, canal, statut, created_at FROM messages WHERE lead_id = ? ORDER BY created_at DESC LIMIT 15', lead.id);
  const chat = (await q.all(`SELECT m.role, m.content FROM chat_messages m JOIN conversations c ON c.id = m.conversation_id WHERE c.lead_id = ? ORDER BY m.id DESC LIMIT 20`, lead.id)).reverse();
  const dossier = {
    prenom: lead.prenom, nom: lead.nom, profil: lead.profil, niveau: lead.niveau, objectif: lead.objectif, motivation: lead.motivation,
    financement: lead.financement, disponible: lead.disponible, paiement_quand: lead.paiement_quand, paiement_mode: lead.paiement_mode,
    source: lead.source, etape: lead.step, terminee: Boolean(lead.completed_at), inscrit_le: lead.created_at, derniere_activite: lead.last_activity,
    formation: s?.formation_titre, dates: s?.dates, places_restantes: s?.restantes, montant_du: b.du, paye: b.paye, reste: b.reste,
    score: sc.score, signaux: sc.signals.map((x) => x.label), relances_envoyees: msgs.map((m) => `${m.type} (${m.canal}, ${m.statut})`),
    conversation_assistante: chat.map((m) => `${m.role === 'user' ? 'Prospect' : 'Ama'}: ${m.content}`).join('\n').slice(0, 6000),
  };

  const c = client();
  if (!c) return heuristicAnalysis(lead, dossier, sc);

  try {
    const resp = await c.beta.messages.create({
      model: model(),
      max_tokens: 4000,
      betas: [FALLBACK_BETA],
      fallbacks: 'default',
      output_config: { effort: 'medium', format: { type: 'json_schema', schema: ANALYSE_SCHEMA } },
      system: "Tu es un directeur commercial expérimenté dans une école de formation au numérique à Kinshasa (Modern Business School). Tu analyses un dossier de prospect pour aider un conseiller à le convertir, avec respect et sans pression abusive. Réponds en français.",
      messages: [{ role: 'user', content: `Analyse ce dossier et propose la meilleure suite.\n\n${JSON.stringify(dossier, null, 2)}` }],
    });
    if (resp.stop_reason === 'refusal') return heuristicAnalysis(lead, dossier, sc);
    const data = JSON.parse(textOf(resp));
    return { ...data, mode: 'ia', date: new Date().toISOString() };
  } catch (e) {
    console.error('[ia] analyse', e instanceof Anthropic.APIError ? `${e.status} ${e.message}` : e);
    return heuristicAnalysis(lead, dossier, sc);
  }
}

function heuristicAnalysis(lead, d, sc) {
  const freins = [];
  if (d.paiement_quand === 'indecis') freins.push('Budget ou moment du paiement incertain');
  if (d.disponible === 'non_sur') freins.push('Disponibilité aux dates non confirmée');
  if (!d.terminee) freins.push(`Inscription interrompue à l'étape ${d.etape}`);
  let action = 'Appeler pour confirmer la place et le mode de paiement.';
  if (!d.terminee) action = "Envoyer un message WhatsApp personnel pour l'aider à terminer son inscription.";
  else if (d.reste > 0 && d.paye > 0) action = 'Proposer un échéancier pour le solde.';
  else if (d.reste <= 0) action = 'Confirmer les informations pratiques et proposer le parrainage.';
  const msg = !d.terminee
    ? `Bonjour ${d.prenom || ''} 👋 C'est l'équipe MBS. J'ai vu que vous aviez commencé votre inscription${d.formation ? ` à « ${d.formation} »` : ''}. Avez-vous une question avant de terminer ? Je suis là pour vous aider.`
    : d.reste > 0
      ? `Bonjour ${d.prenom || ''}, c'est l'équipe MBS. Votre place à « ${d.formation} » (${d.dates}) est réservée. Il reste ${d.reste} $ à régler : souhaitez-vous payer en ligne ou passer à nos bureaux ? Nous pouvons aussi convenir d'un échéancier.`
      : `Bonjour ${d.prenom || ''}, tout est en ordre pour « ${d.formation} ». Merci pour votre confiance ! Si un ami est intéressé, votre code ${lead.code_parrain} lui offre une remise.`;
  return { resume: `${d.prenom || 'Prospect'} ${d.nom || ''}, ${d.profil || 'profil non précisé'}, ${d.terminee ? 'inscription terminée' : 'inscription en cours'}${d.formation ? ` pour « ${d.formation} »` : ''}. Score ${sc.score}/100.`, temperature: sc.temperature, freins, prochaine_action: action, message_whatsapp: msg, mode: 'simple', date: new Date().toISOString() };
}

// ------------------------------------------------ proposition commerciale entreprise
export async function proposalForCompany(e, devis) {
  const c = client();
  const modules = devis.lignes.map((l) => l.titre).join(', ');
  const forms = (await listFormations()).filter((f) => devis.lignes.some((l) => l.formation_id === f.id));
  if (!c) {
    return `Proposition de renforcement de capacité pour ${e.societe}\n\nContexte et objectifs\n${e.objectifs || 'Développer les compétences numériques de vos équipes.'}\n\nProgramme proposé : ${modules}, sur ${devis.jours} jour(s), pour ${devis.participants} participant(s), en format ${e.format || 'présentiel'}.\n\n${forms.map((f) => `${f.titre}\n- ${f.objectifs.join('\n- ')}`).join('\n\n')}\n\nNotre approche : pratique, modulaire et orientée résultats, animée par des formateurs experts.\n\nInvestissement : ${devis.ht.toLocaleString('fr-FR')} $ HT (TVA ${devis.tva_pct} % : ${devis.ttc.toLocaleString('fr-FR')} $ TTC). HORECA à la charge du client.\n\nProchaine étape : un entretien de cadrage de 30 minutes pour ajuster le programme à vos priorités.`;
  }
  try {
    const resp = await c.beta.messages.create({
      model: model(),
      max_tokens: 8000,
      betas: [FALLBACK_BETA],
      fallbacks: 'default',
      output_config: { effort: 'medium' },
      system: `Tu rédiges des propositions commerciales pour Modern Business School (MBS), école du business moderne et des métiers du numérique à Kinshasa, portée par Go Freelance Sarlu. Ton : professionnel, concret, orienté résultats. Texte brut avec titres simples (pas de Markdown lourd), en français. N'invente aucun chiffre en dehors de ceux fournis.\n\n${await knowledge()}`,
      messages: [{ role: 'user', content: `Rédige une proposition de renforcement de capacité (1 page et demie maximum) pour :\nSociété : ${e.societe} (secteur : ${e.secteur || 'non précisé'}, taille : ${e.taille || 'non précisée'})\nContact : ${e.contact}, ${e.fonction || ''}\nObjectifs exprimés : ${e.objectifs || 'non précisés'}\nModules : ${modules}\nParticipants : ${devis.participants}, durée : ${devis.jours} jour(s), format : ${e.format || 'présentiel'}, période souhaitée : ${e.periode || 'à définir'}\nInvestissement : ${devis.ht} $ HT, TVA ${devis.tva_pct} % = ${devis.ttc} $ TTC. Détail : ${devis.lignes.map((l) => `${l.titre} : consultation ${l.consultation} $ + ${l.participants} x ${l.prix_participant} $`).join(' ; ')}. HORECA à la charge du client.\n\nStructure : contexte et enjeux, objectifs pédagogiques, programme et déroulé, méthode, formateurs, investissement, prochaines étapes.` }],
    });
    return textOf(resp);
  } catch (err) {
    console.error('[ia] proposition', err instanceof Anthropic.APIError ? `${err.status} ${err.message}` : err);
    throw new Error("L'IA n'a pas pu rédiger la proposition. Réessayez dans un instant.");
  }
}
