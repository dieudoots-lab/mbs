// Pages publiques rendues cote serveur (referencement et affichage immediat).
import { getSetting, q } from './db.js';
import { listFormations, listSessions, getSession, formationRow } from './domain.js';
import { PROGRAMMES, ATOUTS, CLIENTS, DOMAINES, FAQ } from './content.js';
import { esc, money, fmtDate, fmtRange } from './util.js';

const FA = 'https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.5.2/css/all.min.css';
const FONTS = 'https://fonts.googleapis.com/css2?family=Poppins:wght@300;400;500;600;700;800&display=swap';

function tracking() {
  const i = getSetting('integrations');
  let s = '';
  if (i.meta_pixel) s += `<script>!function(f,b,e,v,n,t,s){if(f.fbq)return;n=f.fbq=function(){n.callMethod?n.callMethod.apply(n,arguments):n.queue.push(arguments)};if(!f._fbq)f._fbq=n;n.push=n;n.loaded=!0;n.version='2.0';n.queue=[];t=b.createElement(e);t.async=!0;t.src=v;s=b.getElementsByTagName(e)[0];s.parentNode.insertBefore(t,s)}(window,document,'script','https://connect.facebook.net/en_US/fbevents.js');fbq('init',${JSON.stringify(i.meta_pixel)});fbq('track','PageView');</script>`;
  if (i.ga_id) s += `<script async src="https://www.googletagmanager.com/gtag/js?id=${esc(i.ga_id)}"></script><script>window.dataLayer=window.dataLayer||[];function gtag(){dataLayer.push(arguments)}gtag('js',new Date());gtag('config',${JSON.stringify(i.ga_id)});</script>`;
  return s;
}

export async function layout({ title, description = '', body, scripts = [], bare = false, canonical = '', formations = null }) {
  const ecole = getSetting('ecole');
  const t = title ? `${title} · ${ecole.sigle}` : `${ecole.nom} · ${ecole.baseline}`;
  return `<!doctype html>
<html lang="fr">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<title>${esc(t)}</title>
<meta name="description" content="${esc(description || ecole.accroche)}">
<meta name="theme-color" content="#030B26">
<meta name="color-scheme" content="dark">
<meta property="og:title" content="${esc(t)}">
<meta property="og:description" content="${esc(description || ecole.accroche)}">
<meta property="og:image" content="/img/promo.jpg">
<meta property="og:type" content="website">
${canonical ? `<link rel="canonical" href="${esc(canonical)}">` : ''}
<link rel="icon" href="/img/favicon.png">
<link rel="apple-touch-icon" href="/img/apple-touch-icon.png">
<link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="${FONTS}">
<link rel="stylesheet" href="${FA}">
<link rel="stylesheet" href="/assets/css/site.css?v=4">
${tracking()}
</head>
<body>
<a class="skip" href="#main">Aller au contenu</a>
${bare ? '' : nav()}
<main id="main">${body}</main>
${bare ? '' : await footer(formations)}
${bare ? '' : '<script src="/assets/js/ama.js?v=3" defer></script>'}
<script src="/assets/js/site.js?v=2" defer></script>
${scripts.map((s) => `<script src="${s}" defer></script>`).join('\n')}
</body>
</html>`;
}

function nav() {
  return `<header class="nav" id="nav"><div class="wrap">
  <a class="logo" href="/" aria-label="Accueil Modern Business School"><img src="/img/logo-dark-bg.png" alt="Modern Business School" width="98" height="46"></a>
  <nav id="menu" aria-label="Navigation principale">
    <a href="/#formations">Formations</a>
    <a href="/#calendrier">Calendrier</a>
    <a href="/entreprises">Entreprises</a>
    <a href="/#formateurs">Formateurs</a>
    <a href="/#faq">Questions</a>
  </nav>
  <div class="actions">
    <a class="espace-link" href="/espace"><i class="fa-solid fa-circle-user"></i><span>Mon espace</span></a>
    <a class="btn small" href="/inscription" data-track="clic_inscription">S'inscrire</a>
  </div>
  <button class="burger" id="burger" aria-label="Ouvrir le menu" aria-expanded="false" aria-controls="menu"><i class="fa-solid fa-bars"></i></button>
</div></header>`;
}

async function footer(formations) {
  const e = getSetting('ecole');
  return `<footer><div class="wrap">
  <div class="cols">
    <div>
      <a class="logo" href="/"><img src="/img/logo-dark-bg.png" alt="Modern Business School" width="110" height="52"></a>
      <p>${esc(e.baseline)}. ${esc(e.accroche)}</p>
      <div class="socials">
        <a href="${esc(e.reseaux.facebook)}" target="_blank" rel="noopener" aria-label="Facebook"><i class="fa-brands fa-facebook-f"></i></a>
        <a href="${esc(e.reseaux.tiktok)}" target="_blank" rel="noopener" aria-label="TikTok"><i class="fa-brands fa-tiktok"></i></a>
        <a href="${esc(e.reseaux.instagram)}" target="_blank" rel="noopener" aria-label="Instagram"><i class="fa-brands fa-instagram"></i></a>
        <a href="https://wa.me/${esc(e.whatsapp.replace(/\D/g, ''))}" target="_blank" rel="noopener" aria-label="WhatsApp" data-track="clic_whatsapp"><i class="fa-brands fa-whatsapp"></i></a>
      </div>
    </div>
    <div>
      <h4>Formations</h4>
      ${(formations || await listFormations()).map((f) => `<a href="/formations/${esc(f.slug)}">${esc(f.titre)}</a>`).join('')}
    </div>
    <div>
      <h4>Plateforme</h4>
      <a href="/inscription">S'inscrire</a>
      <a href="/espace">Mon espace apprenant</a>
      <a href="/entreprises">Former mon équipe</a>
      <a href="/verifier">Vérifier un certificat</a>
    </div>
    <div>
      <h4>Contact</h4>
      <a href="https://wa.me/${esc(e.whatsapp.replace(/\D/g, ''))}" data-track="clic_whatsapp"><i class="fa-brands fa-whatsapp"></i> ${esc(e.telephone1)}</a>
      <a href="tel:${esc(e.telephone2.replace(/\s/g, ''))}"><i class="fa-solid fa-phone"></i> ${esc(e.telephone2)}</a>
      <a href="mailto:${esc(e.email)}"><i class="fa-solid fa-envelope"></i> ${esc(e.email)}</a>
      <a href="https://${esc(e.site.replace(/^https?:\/\//, ''))}"><i class="fa-solid fa-globe"></i> ${esc(e.site)}</a>
    </div>
  </div>
  <div class="bottom"><span>© ${new Date().getFullYear()} ${esc(e.nom)} · Porté par ${esc(e.societe)}</span><span><a href="/admin" style="display:inline">Espace équipe</a></span></div>
</div></footer>`;
}

// ------------------------------------------------ fragments
const short = (iso) => {
  const d = new Date(iso + 'T12:00:00+01:00');
  return { j: d.getDate(), m: new Intl.DateTimeFormat('fr-FR', { month: 'short' }).format(d).replace('.', '') };
};

function placesBadge(s) {
  if (s.complet) return '<span class="places complet">Complet</span>';
  if (s.tension) return `<span class="places tendu">Plus que ${s.restantes} place${s.restantes > 1 ? 's' : ''}</span>`;
  return `<span class="places">${s.restantes} places disponibles</span>`;
}

function sessionRow(s, tarifs) {
  const d = short(s.debut);
  return `<div class="session-row reveal">
    <div class="date"><b>${d.j}</b><span>${esc(d.m)}</span></div>
    <div>
      <h3>${esc(s.formation_titre)}</h3>
      <div class="meta"><span><i class="fa-solid fa-calendar"></i>${esc(s.dates)}</span>${s.horaire ? `<span><i class="fa-solid fa-clock"></i>${esc(s.horaire)}</span>` : ''}<span><i class="fa-solid fa-location-dot"></i>${esc({ presentiel: 'Présentiel', en_ligne: 'En ligne', hybride: 'Hybride' }[s.format] || s.format)}</span></div>
      <div style="margin-top:8px">${placesBadge(s)}</div>
    </div>
    <div class="right">
      <div>${s.early_actif ? `<s>${money(s.prix ?? s.formation_prix, tarifs.devise)}</s>` : ''}<b>${money(s.prix_actuel, tarifs.devise)}</b> <small style="color:var(--gris)">${esc(tarifs.mention)}</small></div>
      ${s.complet ? '<span class="btn small" disabled>Complet</span>' : `<a class="btn small" href="/inscription?session=${esc(s.id)}" data-track="clic_inscription">Réserver ma place</a>`}
    </div>
  </div>`;
}

function formationCard(f, sessions, tarifs) {
  const next = sessions.find((s) => s.formation_id === f.id && !s.complet) || sessions.find((s) => s.formation_id === f.id);
  return `<article class="card formation-card reveal">
    <a class="img" href="/formations/${esc(f.slug)}" tabindex="-1" aria-hidden="true"><img src="${esc(f.image)}" alt="" loading="lazy"><span class="tag"><i class="fa-solid ${esc(f.icone || 'fa-graduation-cap')}"></i> ${esc(f.duree)}</span></a>
    <div class="body">
      <h3><a href="/formations/${esc(f.slug)}">${esc(f.titre)}</a></h3>
      <p>${esc(f.accroche || '')}</p>
      <div class="prix"><b>${money(next?.prix_actuel ?? f.prix, tarifs.devise)}</b><span>${esc(tarifs.mention)} · par participant</span></div>
      ${next ? `<div class="session-line"><i class="fa-solid fa-calendar-check"></i> Prochaine session : ${esc(next.dates)}</div><div class="session-line"><i></i>${placesBadge(next)}</div>` : '<div class="session-line"><i class="fa-solid fa-bell"></i> Prochaine session bientôt annoncée</div>'}
      <div class="actions">
        <a class="btn ghost small" href="/formations/${esc(f.slug)}" style="color:var(--bleu)">Programme</a>
        <a class="btn small" href="/inscription${next && !next.complet ? `?session=${esc(next.id)}` : ''}" data-track="clic_inscription">S'inscrire</a>
      </div>
    </div>
  </article>`;
}

function faqBlock(items) {
  return `<div class="faq">${items.map((f) => `<details class="reveal"><summary>${esc(f.q)}</summary><p>${esc(f.r)}</p></details>`).join('')}</div>`;
}

// ------------------------------------------------ accueil
export async function homePage() {
  const ecole = getSetting('ecole');
  const tarifs = getSetting('tarifs');
  const parr = getSetting('parrainage');
  const [forms, sessions, formateurs] = await Promise.all([listFormations(), listSessions(), q.all('SELECT * FROM formateurs WHERE actif = 1 ORDER BY ordre, nom')]);
  const next = sessions.find((s) => !s.complet);


  const body = `
<section class="hero" style="padding:0">
  <div class="wrap">
    <div>
      <div class="eyebrow">${esc(ecole.baseline)}</div>
      <h1>Apprendre à créer de <em>l'impact</em>.</h1>
      <p class="lead">${esc(ecole.accroche)} Bootcamps pratiques en marketing digital, création de contenu, intelligence artificielle et prospection, à Kinshasa.</p>
      <div class="ctas">
        <a class="btn" href="#orientation"><i class="fa-solid fa-compass"></i> Trouver ma formation</a>
        <a class="btn ghost" href="#formations">Voir les formations</a>
      </div>
      <div class="stats">
        <div><b>${esc(ecole.diplomes)}+</b><span>diplômés</span></div>
        <div><b>${forms.length}</b><span>bootcamps</span></div>
        <div><b>1 à 3</b><span>jours intensifs</span></div>
        <div><b>100 %</b><span>pratique</span></div>
      </div>
    </div>
    <div class="hero-visual" aria-hidden="${next ? 'false' : 'true'}">
      <img class="brush" src="/img/m-jaune.png" alt="">
      <img class="photo" src="/img/ph-tablette.jpg" alt="Apprenante souriante avec une tablette">
      ${next ? `<div class="next-card" id="next-card" data-debut="${esc(next.debut)}">
        <small>Prochaine session</small>
        <h4>${esc(next.formation_titre)}</h4>
        <div class="meta">${esc(next.dates)} · ${esc(next.horaire || '')}</div>
        <div class="countdown" id="countdown"><div><b data-cd="j">–</b><span>jours</span></div><div><b data-cd="h">–</b><span>heures</span></div><div><b data-cd="m">–</b><span>min</span></div><div><b data-cd="s">–</b><span>sec</span></div></div>
        <div style="display:flex;justify-content:space-between;align-items:center;gap:10px">${placesBadge(next)}<a class="btn small" href="/inscription?session=${esc(next.id)}" data-track="clic_inscription">Réserver</a></div>
      </div>` : ''}
    </div>
  </div>
</section>

<div class="clients"><div class="wrap">
  <p>Ils nous ont fait confiance</p>
  ${CLIENTS.map((c) => `<img src="${esc(c.logo)}" alt="${esc(c.nom)}" class="${c.nom === 'Canal+' ? 'canal' : ''}" loading="lazy">`).join('')}
</div></div>

<section id="programmes">
  <div class="wrap">
    <div class="section-head center reveal">
      <div class="eyebrow bleu">Nos programmes</div>
      <h2>Trois entrées simples selon votre besoin</h2>
      <p>Apprendre vite, former une équipe ou avancer sur un projet entrepreneurial.</p>
    </div>
    <div class="grid g3">
      ${PROGRAMMES.map((p) => `<div class="card programme-card reveal">
        <div class="icon-badge"><i class="fa-solid ${p.icone}"></i></div>
        <h3>${esc(p.titre)}</h3>
        <p>${esc(p.texte)}</p>
        <div class="pour"><i class="fa-solid fa-user-check"></i> ${esc(p.pour)}</div>
        <a class="lien" href="${p.cle === 'renforcement' ? '/entreprises' : p.cle === 'campus' ? '#' : '#formations'}" ${p.cle === 'campus' ? 'data-ama="Je suis entrepreneur et je voudrais en savoir plus sur le Campus des entrepreneurs."' : ''}>${p.cle === 'renforcement' ? 'Obtenir un devis' : p.cle === 'campus' ? 'Parler à un conseiller' : 'Voir les bootcamps'} <i class="fa-solid fa-arrow-right"></i></a>
      </div>`).join('')}
    </div>
  </div>
</section>

<section id="formations" class="alt">
  <div class="wrap">
    <div class="section-head reveal">
      <div class="eyebrow bleu">Bootcamps</div>
      <h2>Des compétences que le marché recherche, maintenant</h2>
      <p>Des formations courtes et intensives, conçues pour pratiquer et appliquer directement. Certificat MBS vérifiable à la clé.</p>
    </div>
    <div class="grid formations">
      ${forms.map((f) => formationCard(f, sessions, tarifs)).join('')}
    </div>
  </div>
</section>

<section id="orientation" class="dark" style="position:relative;overflow:hidden">
  <img src="/img/m-blanc.png" alt="" style="position:absolute;left:-120px;top:-60px;width:480px;opacity:.05;pointer-events:none">
  <div class="wrap">
    <div class="section-head center reveal">
      <div class="eyebrow">Orientation en 30 secondes</div>
      <h2>Quelle formation est faite pour vous ?</h2>
      <p>Trois questions, une recommandation personnalisée.</p>
    </div>
    <div class="quiz reveal" id="quiz" aria-live="polite"></div>
  </div>
</section>

<section id="pourquoi">
  <div class="wrap split">
    <div class="photo-stack reveal">
      <img class="main" src="/img/promo.jpg" alt="Une promotion de diplômés MBS" loading="lazy">
      <div class="badge-float"><b>${esc(ecole.diplomes)}+</b><span>diplômés MBS</span></div>
    </div>
    <div>
      <div class="eyebrow bleu reveal">Pourquoi MBS ?</div>
      <h2 class="reveal">Ce qui nous différencie des autres</h2>
      <p class="reveal" style="color:var(--gris)">Chez Modern Business School, nous croyons que la compétence est le premier levier de croissance.</p>
      <div class="atouts">
        ${ATOUTS.map((a) => `<div class="atout reveal"><div class="icon-badge"><i class="fa-solid ${a.icone}"></i></div><div><h3>${esc(a.titre)}</h3><p>${esc(a.texte)}</p></div></div>`).join('')}
      </div>
    </div>
  </div>
</section>

<section id="calendrier" class="alt">
  <div class="wrap">
    <div class="section-head reveal">
      <div class="eyebrow bleu">Calendrier</div>
      <h2>Prochaines sessions</h2>
      <p>Les places sont limitées pour garantir un vrai suivi de chaque participant.</p>
    </div>
    <div class="sessions-list">
      ${sessions.length ? sessions.map((s) => sessionRow(s, tarifs)).join('') : `<div class="card">Les prochaines dates seront annoncées très bientôt. <a href="https://wa.me/${esc(ecole.whatsapp.replace(/\D/g, ''))}">Écrivez-nous sur WhatsApp</a> pour être prévenu en priorité.</div>`}
    </div>
  </div>
</section>

<section id="formateurs">
  <div class="wrap">
    <div class="section-head reveal">
      <div class="eyebrow bleu">Nos formateurs experts</div>
      <h2>Des professionnels reconnus, sur le terrain</h2>
      <p>Nos formations sont animées par des praticiens qui ont une solide expérience dans leur domaine.</p>
    </div>
    <div class="grid g4">
      ${formateurs.map((f) => `<div class="card formateur reveal"><img src="${esc(f.photo || '/img/m-jaune.png')}" alt="${esc(f.nom)}" loading="lazy"><div class="body"><h3>${esc(f.nom)}</h3><p>${esc(f.titre || '')}</p>${f.bio ? `<p style="margin-top:6px">${esc(f.bio)}</p>` : ''}</div></div>`).join('')}
    </div>
  </div>
</section>

<section style="padding-top:0">
  <div class="wrap">
    <div class="band bleu reveal">
      <img class="m-deco" src="/img/m-blanc.png" alt="">
      <div>
        <div class="eyebrow">Renforcement de capacité</div>
        <h2>Ne laissez pas vos équipes être à la traîne.</h2>
        <p style="color:#D3D9F0">Nos programmes sont plus qu'une simple formation : une véritable transformation pour vos collaborateurs et un levier de croissance pour votre entreprise.</p>
        <ul>
          <li><i class="fa-solid fa-circle-check" style="color:var(--jaune)"></i> Modules de 1 à 3 jours, adaptés à vos objectifs</li>
          <li><i class="fa-solid fa-circle-check" style="color:var(--jaune)"></i> Estimation instantanée, proposition sous 24 h</li>
          <li><i class="fa-solid fa-circle-check" style="color:var(--jaune)"></i> Rawbank, Canal+, Silikin Village nous font confiance</li>
        </ul>
      </div>
      <div style="display:flex;flex-direction:column;gap:12px">
        <a class="btn" href="/entreprises"><i class="fa-solid fa-calculator"></i> Calculer mon devis</a>
        <a class="btn ghost" href="https://wa.me/${esc(ecole.whatsapp.replace(/\D/g, ''))}" data-track="clic_whatsapp"><i class="fa-brands fa-whatsapp"></i> Planifier une consultation</a>
      </div>
    </div>
  </div>
</section>

<section class="alt">
  <div class="wrap grid g2">
    <div class="card reveal" style="padding:28px">
      <div class="icon-badge"><i class="fa-solid fa-qrcode"></i></div>
      <h3>Un certificat vérifiable en un scan</h3>
      <p>Chaque certificat MBS porte un QR code unique. Un recruteur le scanne et voit instantanément qu'il est authentique.</p>
      <a class="btn bleu small" href="/verifier" style="margin-top:18px">Vérifier un certificat</a>
    </div>
    ${parr.actif ? `<div class="card card-jaune reveal" style="padding:28px">
      <div class="icon-badge"><i class="fa-solid fa-gift"></i></div>
      <h3>Venez à plusieurs, payez moins</h3>
      <p>Chaque inscrit reçoit un code de parrainage. Vos amis ont <b>${esc(parr.remise_filleul_pct)} % de remise</b>, et vous recevez ${esc(parr.recompense)}.</p>
      <a class="btn bleu small" href="/inscription" style="margin-top:18px">Obtenir mon code</a>
    </div>` : ''}
  </div>
</section>

<section id="faq">
  <div class="wrap">
    <div class="section-head center reveal"><div class="eyebrow bleu">Questions</div><h2>Ce qu'on nous demande le plus</h2></div>
    ${faqBlock(FAQ)}
    <p style="text-align:center;margin-top:28px;color:var(--gris)">Une autre question ? <a href="#" data-ama="">Demandez à Ama, notre assistante</a> ou écrivez-nous sur <a href="https://wa.me/${esc(ecole.whatsapp.replace(/\D/g, ''))}">WhatsApp</a>.</p>
  </div>
</section>

<section style="padding-top:0">
  <div class="wrap">
    <div class="band jaune reveal">
      <img class="m-deco" src="/img/icon.png" alt="">
      <div>
        <h2>Pour rester compétitif, il faut devancer le rythme.</h2>
        <p style="font-weight:500">L'inscription est gratuite et prend deux minutes. Chaque étape est enregistrée.</p>
      </div>
      <div><a class="btn bleu block" href="/inscription" data-track="clic_inscription">Je m'inscris maintenant <i class="fa-solid fa-arrow-right"></i></a><p style="margin:12px 0 0;text-align:center;font-size:.9rem"><a href="/inscription?reprendre=1">Déjà commencé ? Reprendre mon inscription</a></p></div>
    </div>
  </div>
</section>

<div class="sticky-cta" id="sticky-cta"><a class="btn bleu" href="/inscription" data-track="clic_inscription">Je m'inscris gratuitement</a></div>
<script type="application/json" id="quiz-data">${JSON.stringify(forms.map((f) => ({ id: f.id, slug: f.slug, titre: f.titre, image: f.image, accroche: f.accroche, session: sessions.find((s) => s.formation_id === f.id && !s.complet)?.id || null, dates: sessions.find((s) => s.formation_id === f.id && !s.complet)?.dates || null }))).replace(/</g, '\\u003c')}</script>
<script type="application/ld+json">${JSON.stringify({ '@context': 'https://schema.org', '@type': 'EducationalOrganization', name: ecole.nom, url: 'https://' + ecole.site, telephone: ecole.telephone1, email: ecole.email, address: { '@type': 'PostalAddress', addressLocality: 'Kinshasa', addressCountry: 'CD' } }).replace(/</g, '\\u003c')}</script>`;
  return await layout({ formations: forms, body, description: `${ecole.nom} : bootcamps en marketing digital, création de contenu, IA et prospection à Kinshasa. ${ecole.diplomes}+ diplômés.`, scripts: ['/assets/js/home.js?v=1'] });
}

// ------------------------------------------------ page formation
export async function formationPage(slug) {
  const f = formationRow(await q.get('SELECT * FROM formations WHERE slug = ? AND actif = 1', slug));
  if (!f) return null;
  const tarifs = getSetting('tarifs');
  const ecole = getSetting('ecole');
  const sessions = await listSessions({ formationId: f.id });
  const next = sessions.find((s) => !s.complet);
  const formateurs = (await Promise.all(f.formateurs.map((fid) => q.get('SELECT * FROM formateurs WHERE id = ? AND actif = 1', fid)))).filter(Boolean);
  const body = `
<section class="page-hero">
  <img class="m-deco" src="/img/m-blanc.png" alt="">
  <div class="wrap" style="position:relative">
    <div class="crumbs"><a href="/">Accueil</a> / <a href="/#formations">Formations</a> / ${esc(f.titre)}</div>
    <div class="eyebrow">Bootcamp · ${esc(f.domaine || '')}</div>
    <h1>${esc(f.titre)}</h1>
    <p class="lead">${esc(f.accroche || '')}</p>
    <div class="chips">
      <span class="chip"><i class="fa-solid fa-clock"></i> ${esc(f.duree)}</span>
      <span class="chip"><i class="fa-solid fa-hand-sparkles"></i> 100 % pratique</span>
      <span class="chip"><i class="fa-solid fa-certificate"></i> Certificat vérifiable</span>
      ${next ? `<span class="chip"><i class="fa-solid fa-calendar"></i> ${esc(next.dates)}</span>` : ''}
    </div>
  </div>
</section>
<section style="padding-top:48px">
  <div class="wrap layout-2">
    <div>
      <div class="block reveal"><h2>Objectifs pédagogiques</h2><ul class="check-list">${f.objectifs.map((o) => `<li>${esc(o)}</li>`).join('')}</ul></div>
      ${f.contenu.length ? `<div class="block reveal"><h2>Au programme</h2><ol class="timeline">${f.contenu.map((c) => `<li>${esc(c)}</li>`).join('')}</ol></div>` : ''}
      <div class="block reveal info-grid">
        <div class="card"><h4>Pour qui ?</h4><p style="color:var(--texte)">${esc(f.public || '—')}</p></div>
        <div class="card"><h4>Prérequis</h4><p style="color:var(--texte)">${esc(f.prerequis || 'Aucun')}</p></div>
        <div class="card"><h4>Méthode</h4><p style="color:var(--texte)">Mises en pratique, cas réels, exercices guidés par le formateur.</p></div>
        <div class="card"><h4>À la fin</h4><p style="color:var(--texte)">Certificat MBS avec QR code de vérification.</p></div>
      </div>
      <div class="block" id="sessions"><h2 class="reveal">Sessions</h2>
        <div class="sessions-list">${sessions.length ? sessions.map((s) => sessionRow(s, tarifs)).join('') : `<div class="card">Aucune session programmée pour l'instant. <a href="https://wa.me/${esc(ecole.whatsapp.replace(/\D/g, ''))}">Prévenez-moi sur WhatsApp</a></div>`}</div>
      </div>
      ${formateurs.length ? `<div class="block"><h2 class="reveal">Vos formateurs</h2><div class="grid g2">${formateurs.map((x) => `<div class="card reveal" style="display:flex;gap:16px;align-items:center"><img src="${esc(x.photo)}" alt="" style="width:84px;height:84px;border-radius:18px;object-fit:cover;object-position:top"><div><h3 style="margin-bottom:4px">${esc(x.nom)}</h3><p style="font-size:.86rem">${esc(x.titre)}</p></div></div>`).join('')}</div></div>` : ''}
      <div class="block"><h2 class="reveal">Questions fréquentes</h2>${faqBlock(FAQ.slice(0, 3))}</div>
    </div>
    <aside class="aside-card">
      <img src="${esc(f.image)}" alt="">
      <div class="prix"><b>${money(next?.prix_actuel ?? f.prix, tarifs.devise)}</b> <span style="color:var(--gris)">${esc(tarifs.mention)} / participant</span></div>
      ${next?.early_actif ? `<p style="color:var(--vert);font-weight:600;margin:4px 0 0"><i class="fa-solid fa-tag"></i> Tarif early bird jusqu'au ${esc(fmtDate(next.early_jusqu))}</p>` : ''}
      <ul>
        <li><i class="fa-solid fa-calendar"></i> ${next ? esc(next.dates) : 'Dates à venir'}</li>
        ${next?.horaire ? `<li><i class="fa-solid fa-clock"></i> ${esc(next.horaire)}</li>` : ''}
        <li><i class="fa-solid fa-location-dot"></i> ${esc(next?.lieu || ecole.ville)}</li>
        <li><i class="fa-solid fa-wallet"></i> Paiement en ligne ou au bureau, acompte possible</li>
      </ul>
      ${next ? `<div style="margin-bottom:14px">${placesBadge(next)}</div><a class="btn block" href="/inscription?session=${esc(next.id)}" data-track="clic_inscription">Réserver ma place</a>` : `<a class="btn block" href="https://wa.me/${esc(ecole.whatsapp.replace(/\D/g, ''))}">Être prévenu</a>`}
      <a class="btn ghost block" style="margin-top:10px;color:var(--bleu)" href="/entreprises?module=${esc(f.slug)}">Former mon équipe</a>
    </aside>
  </div>
</section>
<div class="sticky-cta" id="sticky-cta">${next ? `<a class="btn bleu" href="/inscription?session=${esc(next.id)}">Réserver · ${money(next.prix_actuel, tarifs.devise)}</a>` : ''}</div>
<script type="application/ld+json">${JSON.stringify({ '@context': 'https://schema.org', '@type': 'Course', name: f.titre, description: f.objectifs.join(' '), provider: { '@type': 'Organization', name: ecole.nom }, offers: next ? { '@type': 'Offer', price: next.prix_actuel, priceCurrency: 'USD' } : undefined }).replace(/</g, '\\u003c')}</script>
<script>window.MBS_PAGE=${JSON.stringify({ formation: f.slug }).replace(/</g, '\\u003c')}</script>`;
  return await layout({ title: f.titre, description: `${f.titre} : ${f.objectifs[0]}`, body });
}

// ------------------------------------------------ entreprises
export async function entreprisesPage() {
  const forms = await listFormations();
  const tarifs = getSetting('tarifs');
  const body = `
<section class="page-hero">
  <img class="m-deco" src="/img/m-blanc.png" alt="">
  <div class="wrap" style="position:relative">
    <div class="crumbs"><a href="/">Accueil</a> / Entreprises</div>
    <div class="eyebrow">Renforcement de capacité</div>
    <h1>Investir dans les compétences de vos équipes.</h1>
    <p class="lead">C'est la clé de la réussite dans l'économie numérique. Composez votre programme, obtenez une estimation immédiate, et recevez une proposition adaptée sous 24 h.</p>
    <div class="chips"><span class="chip"><i class="fa-solid fa-puzzle-piece"></i> Modulaire</span><span class="chip"><i class="fa-solid fa-chart-line"></i> Orienté résultats</span><span class="chip"><i class="fa-solid fa-building"></i> Dans vos locaux ou chez nous</span></div>
  </div>
</section>
<div class="clients"><div class="wrap"><p>Ils nous ont fait confiance</p>${CLIENTS.map((c) => `<img src="${esc(c.logo)}" alt="${esc(c.nom)}" class="${c.nom === 'Canal+' ? 'canal' : ''}">`).join('')}</div></div>
<section>
  <div class="wrap">
    <div class="section-head reveal"><div class="eyebrow bleu">Simulateur</div><h2>Votre devis en temps réel</h2><p>Base tarifaire officielle : frais de consultation (2 500 à 5 000 $ HT selon la durée) et frais par participant. HORECA à la charge du client.</p></div>
    <div class="sim" id="sim">
      <div>
        <div class="field"><label>1. Modules</label><div class="modules">
          ${forms.map((f) => `<label class="module-opt"><input type="checkbox" name="modules" value="${esc(f.id)}" data-slug="${esc(f.slug)}"><span class="t">${esc(f.titre)}</span><span class="p">${money(f.prix, tarifs.devise)} / pers.</span></label>`).join('')}
        </div></div>
        <div class="field"><label for="participants">2. Nombre de participants</label><div class="range-row"><input type="range" id="participants" min="1" max="100" value="10"><output id="participants-out">10</output></div></div>
        <div class="field"><label>3. Durée par module</label><div class="seg" id="jours"><button type="button" data-v="1">1 jour</button><button type="button" data-v="2" class="on">2 jours</button><button type="button" data-v="3">3 jours</button></div></div>
        <form id="b2b-form" class="card" style="margin-top:24px;padding:24px" novalidate>
          <h3>4. Recevoir ma proposition</h3>
          <div class="grid g2" style="gap:0 16px">
            <div class="field"><label for="societe">Organisation *</label><input class="input" id="societe" name="societe" autocomplete="organization" required></div>
            <div class="field"><label for="secteur">Secteur</label><input class="input" id="secteur" name="secteur" placeholder="Banque, télécoms, ONG..."></div>
            <div class="field"><label for="contact">Votre nom *</label><input class="input" id="contact" name="contact" autocomplete="name" required></div>
            <div class="field"><label for="fonction">Fonction</label><input class="input" id="fonction" name="fonction" placeholder="DRH, Responsable formation..."></div>
            <div class="field"><label for="telephone">Téléphone / WhatsApp *</label><input class="input" id="telephone" name="telephone" type="tel" autocomplete="tel" placeholder="+243 ..." required></div>
            <div class="field"><label for="email">Email professionnel</label><input class="input" id="email" name="email" type="email" autocomplete="email"></div>
            <div class="field"><label for="taille">Taille de l'organisation</label><select class="input" id="taille" name="taille"><option value="">—</option><option>1 à 10</option><option>11 à 50</option><option>51 à 200</option><option>201 à 1000</option><option>Plus de 1000</option></select></div>
            <div class="field"><label for="periode">Période souhaitée</label><input class="input" id="periode" name="periode" placeholder="Ex. : mars 2027"></div>
          </div>
          <div class="field"><label for="format">Format</label><select class="input" id="format" name="format"><option value="presentiel">Présentiel dans nos locaux</option><option value="intra">Dans vos locaux</option><option value="en_ligne">En ligne</option><option value="hybride">Hybride</option></select></div>
          <div class="field"><label for="objectifs">Vos objectifs</label><textarea class="input" id="objectifs" name="objectifs" placeholder="Ce que vos équipes doivent savoir faire à la fin de la formation"></textarea></div>
          <p class="error-msg" id="b2b-error" role="alert"></p>
          <button class="btn bleu block" type="submit">Recevoir ma proposition sous 24 h <i class="fa-solid fa-paper-plane"></i></button>
        </form>
      </div>
      <div class="quote-box" id="quote-box" aria-live="polite">
        <h3>Estimation</h3>
        <div id="quote-lines"><p style="color:#AEB7DB">Choisissez au moins un module.</p></div>
        <div class="total"><span>Total HT</span><b id="quote-ht">0 $</b></div>
        <div class="line" style="border:0"><span>TVA ${esc(tarifs.tva)} %</span><span id="quote-tva">0 $</span></div>
        <div class="line" style="border:0;font-weight:600;color:#fff"><span>Total TTC</span><span id="quote-ttc">0 $</span></div>
        <small>Estimation indicative basée sur la grille officielle MBS. HORECA (salle, repas) à la charge du client. La proposition finale est ajustée après un échange de cadrage.</small>
      </div>
    </div>
  </div>
</section>
<section class="alt">
  <div class="wrap grid g4">
    ${ATOUTS.map((a) => `<div class="card reveal"><div class="icon-badge"><i class="fa-solid ${a.icone}"></i></div><h3>${esc(a.titre)}</h3><p>${esc(a.texte)}</p></div>`).join('')}
  </div>
</section>`;
  return await layout({ formations: forms, title: 'Former vos équipes', description: 'Renforcement de capacité pour entreprises à Kinshasa : IA, marketing digital, contenu, prospection. Devis instantané.', body, scripts: ['/assets/js/entreprises.js?v=1'] });
}

// ------------------------------------------------ coquilles des applications
export async function appShell({ title, script, description, bare = false }) {
  return await layout({ title, description, bare, body: '<div id="app" aria-live="polite"><div style="min-height:60vh;display:grid;place-items:center;color:var(--gris)"><i class="fa-solid fa-spinner fa-spin fa-2x"></i></div></div>', scripts: [script] });
}

export async function verifierPage(codeInit = '') {
  const body = `
<section class="page-hero"><img class="m-deco" src="/img/m-blanc.png" alt=""><div class="wrap" style="position:relative"><div class="eyebrow">Authenticité</div><h1>Vérifier un certificat MBS</h1><p class="lead">Saisissez le code inscrit sur le certificat, ou scannez son QR code.</p></div></section>
<section><div class="wrap verify-box">
  <form id="verify-form" class="card" style="padding:28px">
    <div class="field"><label for="code">Code du certificat</label><input class="input" id="code" name="code" placeholder="MBS-XXXX-XXXX" value="${esc(codeInit)}" autocapitalize="characters" required></div>
    <button class="btn bleu block" type="submit">Vérifier</button>
  </form>
  <div id="verify-result"></div>
</div></section>`;
  return await layout({ title: 'Vérifier un certificat', body, scripts: ['/assets/js/verifier.js?v=1'] });
}

export function certificatPage(cert) {
  const ecole = getSetting('ecole');
  const c = getSetting('certificats');
  return `<!doctype html><html lang="fr"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>Certificat · ${esc(cert.nom_complet)} · MBS</title>
<meta property="og:title" content="${esc(cert.nom_complet)} est certifié(e) Modern Business School">
<meta property="og:description" content="Formation : ${esc(cert.formation)}">
<link rel="icon" href="/img/favicon.png">
<link rel="stylesheet" href="${FONTS}">
<style>
@page { size: A4 landscape; margin: 0; }
* { box-sizing: border-box; }
body { margin: 0; font-family: Poppins, sans-serif; background: #E9ECF5; color: #04195E; }
.bar { max-width: 1123px; margin: 18px auto; display: flex; gap: 10px; justify-content: flex-end; padding: 0 12px; }
.bar a, .bar button { font: inherit; font-weight: 600; font-size: 14px; padding: 10px 18px; border-radius: 999px; border: 0; background: #04195E; color: #fff; text-decoration: none; cursor: pointer; }
.bar .y { background: #FFBF31; color: #04195E; }
.cert { width: 1123px; height: 794px; max-width: 100%; margin: 0 auto 30px; background: #fff; position: relative; overflow: hidden; box-shadow: 0 30px 60px -30px rgba(4,25,94,.5); }
.cert .side { position: absolute; left: 0; top: 0; bottom: 0; width: 300px; background: #04195E; }
.cert .side img.m { position: absolute; left: -60px; bottom: -40px; width: 460px; opacity: .95; }
.cert .side img.logo { position: absolute; left: 40px; top: 44px; width: 190px; }
.cert .main { position: absolute; left: 360px; right: 60px; top: 70px; bottom: 60px; display: flex; flex-direction: column; }
.k { font-size: 14px; letter-spacing: .3em; text-transform: uppercase; color: #E9A70F; font-weight: 700; }
h1 { font-size: 54px; margin: 8px 0 26px; font-weight: 800; line-height: 1; }
.dec { font-size: 17px; color: #5C6380; }
.name { font-size: 46px; font-weight: 700; margin: 6px 0 4px; border-bottom: 4px solid #FFBF31; display: inline-block; padding-bottom: 6px; }
.form { font-size: 26px; font-weight: 600; margin: 10px 0 0; }
.foot { margin-top: auto; display: flex; justify-content: space-between; align-items: flex-end; gap: 30px; }
.sig { border-top: 2px solid #04195E; padding-top: 8px; min-width: 240px; font-size: 14px; }
.sig b { display: block; font-size: 16px; }
.qr { text-align: center; font-size: 11px; color: #5C6380; }
.qr #qr { width: 116px; height: 116px; margin: 0 auto 6px; }
.revoked { position: absolute; inset: 0; display: grid; place-items: center; background: rgba(255,255,255,.75); font-size: 64px; font-weight: 800; color: #D33A3A; transform: rotate(-12deg); }
@media print { body { background: #fff; } .bar { display: none; } .cert { box-shadow: none; margin: 0; } }
@media (max-width: 1140px) { .cert { transform-origin: top left; } }
</style></head><body>
<div class="bar"><a class="y" href="https://www.linkedin.com/profile/add?startTask=CERTIFICATION_NAME&name=${encodeURIComponent(cert.formation)}&organizationName=${encodeURIComponent(ecole.nom)}&certId=${encodeURIComponent(cert.code)}&certUrl=${encodeURIComponent('')}" id="linkedin" target="_blank" rel="noopener">Ajouter à LinkedIn</a><button onclick="window.print()">Imprimer / PDF</button></div>
<div class="cert" id="cert">
  <div class="side"><img class="logo" src="/img/logo-dark-bg.png" alt="Modern Business School"><img class="m" src="/img/m-jaune.png" alt=""></div>
  <div class="main">
    <div class="k">Certificat de réussite</div>
    <h1>Modern Business School</h1>
    <div class="dec">Ce certificat est décerné à</div>
    <div><span class="name">${esc(cert.nom_complet)}</span></div>
    <div class="dec" style="margin-top:18px">pour avoir suivi avec succès la formation</div>
    <div class="form">${esc(cert.formation)}</div>
    <div class="dec" style="margin-top:6px">${esc(cert.dates || '')} · Kinshasa</div>
    <div class="foot">
      <div class="sig"><b>${esc(c.signataire)}</b>${esc(c.signataire_titre)}<br>Délivré le ${esc(fmtDate(cert.delivre_le))}</div>
      <div class="qr"><div id="qr"></div>${esc(cert.code)}<br>Vérifiable sur /verifier</div>
    </div>
  </div>
  ${cert.revoque ? '<div class="revoked">CERTIFICAT RÉVOQUÉ</div>' : ''}
</div>
<script src="https://cdnjs.cloudflare.com/ajax/libs/qrcodejs/1.0.0/qrcode.min.js"></script>
<script>
  var url = location.origin + '/verifier/' + ${JSON.stringify(cert.code)};
  try { new QRCode(document.getElementById('qr'), { text: url, width: 116, height: 116, colorDark: '#04195E', colorLight: '#ffffff' }); } catch (e) {}
  var l = document.getElementById('linkedin'); l.href = l.href.replace('certUrl=', 'certUrl=' + encodeURIComponent(url));
  function fit(){ var c=document.getElementById('cert'); var s=Math.min(1,(window.innerWidth-16)/1123); c.style.transform= s<1?'scale('+s+')':''; c.style.marginBottom = s<1 ? (-(794*(1-s))+20)+'px' : '30px'; }
  window.addEventListener('resize', fit); fit();
</script>
</body></html>`;
}

export async function notFoundPage() {
  return await layout({ title: 'Page introuvable', body: `<section><div class="wrap" style="text-align:center;padding:60px 0"><img src="/img/m-jaune.png" alt="" style="width:110px;margin:0 auto 24px"><h1>Page introuvable</h1><p style="color:var(--gris)">Cette page n'existe pas ou a été déplacée.</p><a class="btn" href="/">Retour à l'accueil</a></div></section>` });
}
