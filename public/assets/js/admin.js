// Espace equipe Modern Business School (application monopage, sans dependance).
(() => {
  // ================================================ outils
  const $ = (s, el = document) => el.querySelector(s);
  const $$ = (s, el = document) => [...el.querySelectorAll(s)];
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const money = (n) => `${Number(n || 0).toLocaleString('fr-FR', { maximumFractionDigits: 2 })} $`;
  const d = (iso, o = { day: 'numeric', month: 'short', year: 'numeric' }) => (iso ? new Date(iso.length === 10 ? iso + 'T12:00:00' : iso).toLocaleDateString('fr-FR', o) : '—');
  const dt = (iso) => (iso ? new Date(iso).toLocaleString('fr-FR', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) : '—');
  const ago = (iso) => {
    if (!iso) return '—';
    const m = Math.round((Date.now() - new Date(iso)) / 60000);
    if (m < 1) return 'à l\'instant';
    if (m < 60) return `il y a ${m} min`;
    if (m < 1440) return `il y a ${Math.round(m / 60)} h`;
    return `il y a ${Math.round(m / 1440)} j`;
  };
  const waLink = (phone, text = '') => `https://wa.me/${String(phone || '').replace(/\D/g, '')}${text ? '?text=' + encodeURIComponent(text) : ''}`;

  async function api(method, path, body) {
    const r = await fetch(path, { method, headers: body ? { 'Content-Type': 'application/json' } : {}, body: body ? JSON.stringify(body) : undefined });
    let data = {};
    try { data = await r.json(); } catch {}
    if (r.status === 401 && !path.includes('/login') && !path.includes('/setup')) { boot(); throw new Error('Session expirée'); }
    if (!r.ok) throw new Error(data.error || 'Erreur');
    return data;
  }
  const GET = (p) => api('GET', p);
  const POST = (p, b = {}) => api('POST', p, b);
  const PATCH = (p, b) => api('PATCH', p, b);
  const PUT = (p, b) => api('PUT', p, b);
  const DEL = (p) => api('DELETE', p);

  function toast(msg, err = false) {
    const t = document.createElement('div');
    t.className = 'toast' + (err ? ' err' : '');
    t.textContent = msg;
    $('#toasts').appendChild(t);
    setTimeout(() => t.remove(), 3500);
  }
  const fail = (e) => toast(e.message || String(e), true);

  function modal(html, { lg = false, onMount } = {}) {
    const bg = document.createElement('div');
    bg.className = 'modal-bg';
    bg.innerHTML = `<div class="modal ${lg ? 'lg' : ''}" role="dialog" aria-modal="true">${html}</div>`;
    document.body.appendChild(bg);
    const close = () => bg.remove();
    bg.addEventListener('click', (e) => { if (e.target === bg || e.target.closest('[data-close]')) close(); });
    document.addEventListener('keydown', function k(e) { if (e.key === 'Escape') { close(); document.removeEventListener('keydown', k); } });
    onMount?.(bg.firstElementChild, close);
    bg.querySelector('input, select, textarea')?.focus();
    return close;
  }
  const confirmBox = (msg, label = 'Confirmer') => new Promise((res) => {
    modal(`<h2>Confirmation</h2><p>${esc(msg)}</p><div class="actions"><button class="btn ghost" data-close>Annuler</button><button class="btn danger" id="ok">${esc(label)}</button></div>`, {
      onMount: (m, close) => { $('#ok', m).onclick = () => { close(); res(true); }; m.parentElement.addEventListener('click', (e) => { if (e.target.closest('[data-close]') || e.target === m.parentElement) res(false); }); },
    });
  });
  const formData = (form) => Object.fromEntries(new FormData(form));

  // ================================================ libelles
  const L = {
    statut: { nouveau: 'Nouveau', en_cours: 'En cours', inscrit: 'Inscrit', acompte: 'Acompte', paye: 'Payé', present: 'Présent', certifie: 'Certifié', abandon: 'Abandon', annule: 'Annulé' },
    statutCls: { nouveau: 'gris', en_cours: 'orange', inscrit: '', acompte: 'jaune', paye: 'vert', present: 'vert', certifie: 'vert', abandon: 'rouge', annule: 'rouge' },
    profil: { etudiant: 'Étudiant', salarie: 'Salarié', entrepreneur: 'Entrepreneur', freelance: 'Freelance', recherche: 'En recherche d\'emploi' },
    niveau: { debutant: 'Débutant', intermediaire: 'Intermédiaire', avance: 'Avancé' },
    objectif: { emploi: 'Trouver un emploi', carriere: 'Évoluer', business: 'Développer son business', freelance: 'Lancer un freelance', curiosite: 'Curiosité' },
    financement: { moi: 'Lui-même', employeur: 'Employeur', famille: 'Famille', cherche: 'Cherche un financement' },
    disponible: { oui: 'Disponible', non_sur: 'Pas sûr' },
    paiement_quand: { aujourdhui: 'Tout aujourd\'hui', acompte: 'Acompte', avant: 'Avant la formation', indecis: 'Indécis' },
    paiement_mode: { en_ligne: 'En ligne', bureau: 'Au bureau' },
    paiement: { aucun: ['—', 'gris'], rien: ['Rien reçu', 'rouge'], partiel: ['Partiel', 'jaune'], solde: ['Soldé', 'vert'] },
    temp: { chaud: 'Chaud', tiede: 'Tiède', froid: 'Froid' },
    b2b: { nouveau: 'Nouveau', qualifie: 'Qualifié', rdv: 'RDV planifié', devis_envoye: 'Devis envoyé', negociation: 'Négociation', gagne: 'Gagné', perdu: 'Perdu' },
    msg: { simule: ['Simulé', 'gris'], envoye: ['Envoyé', 'vert'], echec: ['Échec', 'rouge'] },
    event: {
      etape: ['fa-shoe-prints', (x) => `Étape ${x.step} validée`], inscription_terminee: ['fa-circle-check', () => 'Inscription terminée'],
      paiement: ['fa-money-bill-wave', (x) => `Paiement de ${money(x.montant)}${x.par ? ' · ' + x.par : ''}`], reprise: ['fa-rotate-right', () => 'A repris son inscription'],
      connexion: ['fa-right-to-bracket', () => 'Connexion à son espace'], changement_session: ['fa-shuffle', () => 'A changé de session'],
      certificat: ['fa-award', () => 'Certificat délivré'], message_manuel: ['fa-paper-plane', (x) => `Message ${x.canal} par ${x.par}`],
      creation_manuelle: ['fa-user-plus', (x) => `Dossier créé par ${x.par}`], visite: ['fa-eye', () => 'Visite'], clic_paiement: ['fa-credit-card', () => 'Clic sur le paiement'],
    },
    role: { admin: 'Administrateur', commercial: 'Commercial', formateur: 'Formateur' },
    source: { facebook: 'Facebook', tiktok: 'TikTok', instagram: 'Instagram', whatsapp: 'WhatsApp', ami: 'Bouche-à-oreille', google: 'Google', evenement: 'Événement', autre: 'Autre', bureau: 'Bureau' },
  };
  const pill = (txt, cls = '') => `<span class="pill ${cls}">${esc(txt)}</span>`;
  const statutPill = (s) => pill(L.statut[s] || s, L.statutCls[s]);
  const payPill = (p) => pill(...(L.paiement[p] || ['—', 'gris']));

  // ================================================ etat et navigation
  let me = null;
  let catalogueCache = null;
  const NAV = [
    ['dashboard', 'fa-chart-pie', 'Tableau de bord'],
    ['leads', 'fa-users', 'Inscrits'],
    ['entreprises', 'fa-building', 'Entreprises'],
    ['catalogue', 'fa-book-open', 'Catalogue'],
    ['presences', 'fa-clipboard-check', 'Présences & certificats'],
    ['messages', 'fa-paper-plane', 'Relances'],
    ['assistant', 'fa-robot', 'Assistante IA'],
    ['promo', 'fa-tags', 'Promo & parrainage'],
    ['reglages', 'fa-gear', 'Réglages'],
  ];
  const root = $('#root');

  async function boot() {
    try {
      const r = await fetch('/api/admin/me');
      if (r.status === 401) {
        const s = await GET('/api/admin/setup');
        return s.needed ? setupView() : loginView();
      }
      me = await r.json();
      shell();
      route();
    } catch (e) { root.innerHTML = `<div class="boot">${esc(e.message)}</div>`; }
  }

  function authFrame(inner) {
    root.innerHTML = `<div class="auth"><div class="side"><img class="m" src="/img/m-jaune.png" alt=""><h1>Espace équipe</h1><p>Inscriptions, paiements, entreprises, relances et certificats de Modern Business School, au même endroit.</p></div><div class="form">${inner}</div></div>`;
  }
  function loginView() {
    authFrame(`<form id="f"><img src="/img/logo-light-bg.png" alt="MBS"><h1>Connexion</h1><p class="muted">Réservé à l'équipe MBS.</p>
      <div class="field"><label>Email</label><input class="input" name="email" type="email" autocomplete="username" required></div>
      <div class="field"><label>Mot de passe</label><input class="input" name="password" type="password" autocomplete="current-password" required></div>
      <p class="err" id="e"></p><button class="btn y" style="width:100%;justify-content:center;padding:12px">Entrer</button>
      <p class="small muted" style="margin-top:18px"><a href="/">← Retour au site</a></p></form>`);
    $('#f').onsubmit = async (e) => {
      e.preventDefault();
      try { await POST('/api/admin/login', formData(e.target)); boot(); } catch (er) { $('#e').textContent = er.message; }
    };
  }
  function setupView() {
    authFrame(`<form id="f"><img src="/img/logo-light-bg.png" alt="MBS"><h1>Bienvenue 👋</h1><p class="muted">Créez le compte administrateur principal de la plateforme.</p>
      <div class="field"><label>Votre nom</label><input class="input" name="nom" required></div>
      <div class="field"><label>Email</label><input class="input" name="email" type="email" required></div>
      <div class="field"><label>Mot de passe (8 caractères minimum)</label><input class="input" name="password" type="password" minlength="8" autocomplete="new-password" required></div>
      <p class="err" id="e"></p><button class="btn y" style="width:100%;justify-content:center;padding:12px">Créer mon compte</button></form>`);
    $('#f').onsubmit = async (e) => {
      e.preventDefault();
      try { await POST('/api/admin/setup', formData(e.target)); toast('Compte créé'); boot(); } catch (er) { $('#e').textContent = er.message; }
    };
  }

  function shell() {
    root.innerHTML = `<div class="mobile-bar"><button id="burger" aria-label="Menu"><i class="fa-solid fa-bars"></i></button><img src="/img/logo-dark-bg.png" alt="MBS"></div>
    <div class="shell">
      <aside class="sidebar" id="sidebar">
        <div class="logo"><a href="/" target="_blank" title="Voir le site"><img src="/img/logo-dark-bg.png" alt="Modern Business School"></a></div>
        ${NAV.filter(([k]) => me.acces.includes(k)).map(([k, ic, t]) => `<a href="#/${k}" data-nav="${k}"><i class="fa-solid ${ic}"></i>${t}</a>`).join('')}
        <div class="me"><b>${esc(me.user.nom)}</b>${esc(L.role[me.user.role])}<br><button id="logout"><i class="fa-solid fa-arrow-right-from-bracket"></i> Se déconnecter</button></div>
      </aside>
      <div class="main" id="main"></div>
    </div>`;
    $('#logout').onclick = async () => { await POST('/api/admin/logout'); boot(); };
    $('#burger').onclick = () => $('#sidebar').classList.toggle('open');
    $('#sidebar').addEventListener('click', (e) => { if (e.target.closest('a')) $('#sidebar').classList.remove('open'); });
  }

  const VIEWS = {};
  function route() {
    if (!me) return;
    const [, name = 'dashboard', arg] = location.hash.split('/');
    const v = me.acces.includes(name) ? name : 'dashboard';
    $$('[data-nav]').forEach((a) => a.classList.toggle('on', a.dataset.nav === v));
    const main = $('#main');
    main.innerHTML = '<div class="empty"><i class="fa-solid fa-spinner fa-spin"></i></div>';
    VIEWS[v](main, arg).catch((e) => { main.innerHTML = `<div class="card empty"><i class="fa-solid fa-triangle-exclamation"></i>${esc(e.message)}</div>`; });
  }
  addEventListener('hashchange', route);

  async function catalogue(force = false) {
    if (!catalogueCache || force) catalogueCache = await GET('/api/admin/catalogue');
    return catalogueCache;
  }
  const sessionOptions = (sessions, selected, empty = 'Toutes les sessions') => `<option value="">${empty}</option>${sessions.map((s) => `<option value="${s.id}" ${s.id === selected ? 'selected' : ''}>${esc(s.formation_titre)} · ${esc(s.dates)}${s.passee ? ' (passée)' : ''}</option>`).join('')}`;

  // ================================================ tableau de bord
  VIEWS.dashboard = async (main) => {
    const jours = Number(sessionStorage.getItem('dash_j') || 30);
    const x = await GET(`/api/admin/dashboard?jours=${jours}`);
    const k = x.kpi;
    const maxSerie = Math.max(1, ...x.serie.map((s) => s.leads));
    const top = x.entonnoir[0]?.n || 1;
    const maxSrc = Math.max(1, ...x.sources.map((s) => s.n));
    const tmap = Object.fromEntries(x.temperatures.map((t) => [t.temperature, t.n]));
    main.innerHTML = `
      <div class="topbar"><div><h1>Bonjour ${esc(me.user.nom.split(' ')[0])} 👋</h1><div class="muted">Voici où en sont les inscriptions de Modern Business School.</div></div><div class="sp"></div>
        <select class="input" id="periode" style="width:auto">${[7, 30, 90, 365].map((j) => `<option value="${j}" ${j === jours ? 'selected' : ''}>${j === 365 ? '12 derniers mois' : j + ' derniers jours'}</option>`).join('')}</select>
        <a class="btn y" href="/" target="_blank"><i class="fa-solid fa-arrow-up-right-from-square"></i> Voir le site</a></div>
      ${!me.ia ? '<div class="notice"><i class="fa-solid fa-lightbulb"></i><div><b>L\'IA fonctionne en mode simple.</b> Ajoutez votre clé Claude dans Réglages › Intégrations pour activer l\'assistante intelligente, l\'analyse des dossiers et la rédaction des propositions.</div></div>' : ''}
      ${k.simules > 0 ? `<div class="notice"><i class="fa-solid fa-circle-info"></i><div><b>${k.simules} message(s) simulé(s)</b> : WhatsApp ou l'email ne sont pas encore connectés. Les messages sont préparés et visibles dans Relances, mais ne partent pas. Réglages › Intégrations.</div></div>` : ''}
      <div class="grid g4" style="margin-bottom:16px">
        <div class="kpi"><small><i class="fa-solid fa-eye"></i> Visiteurs</small><b>${k.visites}</b><span>sur la période</span></div>
        <div class="kpi"><small><i class="fa-solid fa-user-plus"></i> Dossiers ouverts</small><b>${k.leads}</b><span>${k.completes} inscriptions terminées</span></div>
        <div class="kpi y"><small><i class="fa-solid fa-bullseye"></i> Conversion</small><b>${k.conversion} %</b><span>dossiers → inscrits</span></div>
        <div class="kpi b"><small><i class="fa-solid fa-sack-dollar"></i> Encaissé</small><b>${money(k.encaisse)}</b><span>${money(k.attendu)} encore attendus</span></div>
      </div>
      <div class="grid g-2-1" style="margin-bottom:16px">
        <div class="card"><div class="card-head"><h2>Activité quotidienne</h2></div>
          <div class="bars">${x.serie.map((s) => `<div data-tip="${d(s.jour, { day: 'numeric', month: 'short' })} · ${s.leads} dossiers, ${s.completes} inscrits"><span class="a" style="height:${((s.leads - s.completes) / maxSerie) * 100}%"></span><span class="b" style="height:${(s.completes / maxSerie) * 100}%"></span></div>`).join('')}</div>
          <div class="legend"><span><i style="background:var(--jaune)"></i>Inscriptions terminées</span><span><i style="background:var(--bleu-pale)"></i>Dossiers en cours</span></div>
        </div>
        <div class="card"><div class="card-head"><h2>Entreprises</h2><a href="#/entreprises" class="small">Pipeline →</a></div>
          <div class="kpi" style="border:0;padding:0"><small>Pipeline en cours</small><b>${money(k.b2b_pipeline)}</b><span>${k.b2b_n} demande(s) sur la période</span></div>
          <div class="kpi" style="border:0;padding:0;margin-top:14px"><small>Contrats gagnés</small><b style="color:var(--vert)">${money(k.b2b_gagne)}</b></div>
          <div style="margin-top:16px"><small class="muted">Intérêt des prospects actifs</small><div style="display:flex;gap:14px;margin-top:6px">${['chaud', 'tiede', 'froid'].map((t) => `<span><span class="temp ${t}"></span> ${L.temp[t]} <b>${tmap[t] || 0}</b></span>`).join('')}</div></div>
        </div>
      </div>
      <div class="grid g2" style="margin-bottom:16px">
        <div class="card"><div class="card-head"><h2>Entonnoir d'inscription</h2><span class="muted small">Où les gens s'arrêtent</span></div>
          ${x.entonnoir.map((e, i) => { const prev = i ? x.entonnoir[i - 1].n : e.n; const drop = prev ? Math.round(((prev - e.n) / prev) * 100) : 0; return `<div class="funnel-row ${e.step === 14 ? 'last' : ''}"><span>${esc(e.label)}</span><div class="track"><span style="width:${(e.n / top) * 100}%"></span></div><span class="n">${e.n}${i && drop >= 15 ? ` <span class="drop">−${drop}%</span>` : ''}</span></div>`; }).join('')}
        </div>
        <div class="card"><div class="card-head"><h2>Sessions à venir</h2><a href="#/catalogue" class="small">Gérer →</a></div>
          ${x.sessions.length ? x.sessions.map((s) => `<div style="margin-bottom:14px"><div style="display:flex;justify-content:space-between;gap:10px"><b style="color:var(--bleu)">${esc(s.formation)}</b><span class="small muted">${esc(s.dates)}</span></div>
            <div class="fill ${s.restantes === 0 ? 'full' : ''}" style="margin:6px 0 4px"><span style="width:${Math.min(100, (s.prises / s.capacite) * 100)}%"></span></div>
            <div class="small muted">${s.prises}/${s.capacite} inscrits · ${s.commencees - s.prises} en cours · ${money(s.encaisse)} encaissés</div></div>`).join('') : '<div class="empty">Aucune session programmée.</div>'}
          <h3 style="margin-top:18px">Sources</h3>
          ${x.sources.map((s) => `<div class="hbar"><span>${esc(L.source[s.source] || s.source)}</span><div class="fill"><span style="width:${(s.n / maxSrc) * 100}%;background:var(--bleu)"></span></div><b>${s.n}</b></div>`).join('') || '<p class="muted small">Pas encore de données.</p>'}
        </div>
      </div>
      <div class="grid g2">
        <div class="card pad0"><div class="card-head" style="padding:18px 18px 0"><h2>À contacter en priorité</h2><a href="#/leads" class="small">Tous →</a></div>
          <div class="table-wrap"><table><tbody>${x.aRelancer.map((l) => `<tr class="click" data-lead="${l.id}"><td><span class="temp ${l.temperature}"></span></td><td><div class="name">${esc(l.prenom || 'Sans nom')} ${esc(l.nom || '')}</div><div class="sub">${esc(l.formation || '—')}</div></td><td>${statutPill(l.statut)}</td><td class="score">${l.score}</td><td><a class="btn wa sm" href="${waLink(l.whatsapp)}" target="_blank" onclick="event.stopPropagation()"><i class="fa-brands fa-whatsapp"></i></a></td></tr>`).join('') || '<tr><td class="empty">Personne à relancer.</td></tr>'}</tbody></table></div>
        </div>
        <div class="card"><div class="card-head"><h2>Dernières activités</h2></div>
          <ul class="timeline">${x.activite.map((a) => { const ev = L.event[a.type] || ['fa-circle', () => a.type.replace(/_/g, ' ')]; return `<li ${a.lead_id ? `class="click" data-lead="${a.lead_id}" style="cursor:pointer"` : ''}><span class="ic"><i class="fa-solid ${a.type === 'demande_entreprise' ? 'fa-building' : ev[0]}"></i></span><span><b>${esc(a.prenom || '')} ${esc(a.nom || '')}</b> ${a.type === 'demande_entreprise' ? `Nouvelle demande entreprise (${money(a.data.ht)} HT)` : esc(ev[1](a.data || {}))}</span><span class="when">${ago(a.created_at)}</span></li>`; }).join('') || '<li class="muted">Rien pour l\'instant.</li>'}</ul>
        </div>
      </div>`;
    $('#periode').onchange = (e) => { sessionStorage.setItem('dash_j', e.target.value); route(); };
    $$('[data-lead]', main).forEach((r) => r.addEventListener('click', () => openLead(r.dataset.lead)));
  };

  // ================================================ inscrits
  VIEWS.leads = async (main, arg) => {
    const cat = await catalogue();
    const f = JSON.parse(sessionStorage.getItem('leads_f') || '{}');
    main.innerHTML = `
      <div class="topbar"><h1>Inscrits</h1><div class="sp"></div>
        <button class="btn ghost" id="export"><i class="fa-solid fa-file-csv"></i> Exporter</button>
        <button class="btn y" id="add"><i class="fa-solid fa-user-plus"></i> Inscription manuelle</button></div>
      <div class="filters">
        <input class="input search" id="q" placeholder="Rechercher un nom, un numéro, un email..." value="${esc(f.q || '')}">
        <select class="input" data-f="session">${sessionOptions(cat.sessions, f.session)}</select>
        <select class="input" data-f="etat"><option value="">Tous les dossiers</option><option value="complets">Inscriptions terminées</option><option value="incomplets">Non terminées</option></select>
        <select class="input" data-f="paiement"><option value="">Tous paiements</option><option value="rien">Rien reçu</option><option value="partiel">Partiel</option><option value="solde">Soldé</option><option value="reste">Reste à payer</option></select>
        <select class="input" data-f="temperature"><option value="">Tout intérêt</option><option value="chaud">Chaud</option><option value="tiede">Tiède</option><option value="froid">Froid</option></select>
        <select class="input" data-f="statut"><option value="">Tous statuts</option>${Object.entries(L.statut).map(([k, v]) => `<option value="${k}">${v}</option>`).join('')}</select>
        <select class="input" data-f="tri"><option value="recent">Activité récente</option><option value="score">Score d'intérêt</option><option value="arrivee">Date d'arrivée</option><option value="nom">Nom</option></select>
      </div>
      <div class="card pad0"><div class="table-wrap"><table><thead><tr><th></th><th>Personne</th><th>Formation</th><th>Progression</th><th>Paiement</th><th>Score</th><th>Activité</th><th></th></tr></thead><tbody id="rows"><tr><td colspan="8" class="empty"><i class="fa-solid fa-spinner fa-spin"></i></td></tr></tbody></table></div><div class="small muted" id="count" style="padding:10px 14px"></div></div>`;
    $$('[data-f]', main).forEach((s) => { if (f[s.dataset.f]) s.value = f[s.dataset.f]; });
    const params = () => {
      const p = { q: $('#q').value.trim() };
      $$('[data-f]', main).forEach((s) => (p[s.dataset.f] = s.value));
      sessionStorage.setItem('leads_f', JSON.stringify(p));
      return new URLSearchParams(Object.entries(p).filter(([, v]) => v));
    };
    async function load() {
      const x = await GET('/api/admin/leads?' + params());
      $('#count').textContent = `${x.total} dossier(s)${x.total > 500 ? ' · 500 affichés' : ''}`;
      $('#rows').innerHTML = x.leads.map((l) => `<tr class="click" data-id="${l.id}">
        <td><span class="temp ${l.temperature}" title="${L.temp[l.temperature]}"></span></td>
        <td><div class="name">${esc(l.prenom || 'Sans nom')} ${esc(l.nom || '')}</div><div class="sub">${esc(l.whatsapp)}${l.email ? ' · ' + esc(l.email) : ''}</div></td>
        <td><div>${esc(l.formation || '—')}</div><div class="sub">${l.debut ? d(l.debut) : ''}</div></td>
        <td>${statutPill(l.statut)}<div class="sub">${l.completed ? 'Terminée ' + d(l.completed_at, { day: 'numeric', month: 'short' }) : `Étape ${l.step}/13`}</div></td>
        <td>${l.completed ? payPill(l.paiement) : '—'}${l.completed && l.reste > 0 ? `<div class="sub">reste ${money(l.reste)}</div>` : ''}</td>
        <td><span class="score">${l.score}</span></td>
        <td class="sub">${ago(l.last_activity)}</td>
        <td><a class="btn wa sm" href="${waLink(l.whatsapp, `Bonjour ${l.prenom || ''}, c'est l'équipe Modern Business School. `)}" target="_blank" onclick="event.stopPropagation()" title="Écrire sur WhatsApp"><i class="fa-brands fa-whatsapp"></i></a></td>
      </tr>`).join('') || '<tr><td colspan="8" class="empty"><i class="fa-solid fa-user-slash"></i>Aucun dossier ne correspond.</td></tr>';
      $$('#rows tr[data-id]').forEach((r) => r.addEventListener('click', () => openLead(r.dataset.id, load)));
    }
    let t;
    $('#q').addEventListener('input', () => { clearTimeout(t); t = setTimeout(load, 250); });
    $$('[data-f]', main).forEach((s) => s.addEventListener('change', load));
    $('#export').onclick = () => { location.href = '/api/admin/leads.csv?' + params(); };
    $('#add').onclick = () => modal(`<h2>Inscription manuelle</h2><p class="muted small">Pour une personne venue au bureau ou inscrite par téléphone.</p>
      <form id="mf"><div class="grid g2" style="gap:0 12px"><div class="field"><label>Prénom</label><input class="input" name="prenom" required></div><div class="field"><label>Nom</label><input class="input" name="nom" required></div>
      <div class="field"><label>WhatsApp</label><input class="input" name="whatsapp" required placeholder="+243..."></div><div class="field"><label>Email</label><input class="input" name="email" type="email"></div></div>
      <div class="field"><label>Session</label><select class="input" name="session_id">${sessionOptions(cat.sessions.filter((s) => !s.passee), '', 'Aucune pour l\'instant')}</select></div>
      <div class="field"><label>Notes</label><textarea class="input" name="notes"></textarea></div><p class="err" id="me"></p>
      <div class="actions"><button type="button" class="btn ghost" data-close>Annuler</button><button class="btn y">Créer le dossier</button></div></form>`, {
      onMount: (m, close) => { $('#mf', m).onsubmit = async (e) => { e.preventDefault(); try { const r = await POST('/api/admin/leads', formData(e.target)); close(); toast('Dossier créé'); load(); openLead(r.id, load); } catch (er) { $('#me', m).textContent = er.message; } }; },
    });
    await load();
    if (arg) openLead(arg, load);
  };

  // ------------------------------------------------ fiche d'un dossier
  async function openLead(id, onChange) {
    const old = $('.drawer-bg'); if (old) { old.remove(); $('.drawer')?.remove(); }
    const bg = document.createElement('div'); bg.className = 'drawer-bg';
    const dr = document.createElement('aside'); dr.className = 'drawer'; dr.setAttribute('role', 'dialog');
    dr.innerHTML = '<div class="empty"><i class="fa-solid fa-spinner fa-spin"></i></div>';
    document.body.append(bg, dr);
    const close = () => { bg.remove(); dr.remove(); onChange?.(); };
    bg.onclick = close;
    const cat = await catalogue();

    async function render() {
      const x = await GET('/api/admin/leads/' + id);
      const l = x.lead, b = x.balance, a = l.ia_analyse;
      const timeline = [
        ...x.events.map((e) => ({ at: e.created_at, ic: (L.event[e.type] || ['fa-circle'])[0], t: (L.event[e.type] || [null, () => e.type.replace(/_/g, ' ')])[1](e.data || {}) })),
        ...x.messages.map((m) => ({ at: m.created_at, ic: m.canal === 'email' ? 'fa-envelope' : 'fa-brands fa-whatsapp', t: `${m.type.replace(/_/g, ' ')} · ${m.canal}`, extra: m })),
      ].sort((p, q) => q.at.localeCompare(p.at));
      dr.innerHTML = `
      <div class="drawer-head"><div><h2>${esc(l.prenom || 'Sans nom')} ${esc(l.nom || '')}</h2><div class="sub">${esc(l.whatsapp)}${l.email ? ' · ' + esc(l.email) : ''} · arrivé ${ago(l.created_at)}</div>
        <div style="margin-top:10px;display:flex;gap:8px;flex-wrap:wrap">${statutPill(l.statut)} ${pill(`${L.temp[l.temperature]} · ${l.score}/100`, l.temperature === 'chaud' ? 'rouge' : l.temperature === 'tiede' ? 'jaune' : '')} ${l.opt_out ? pill('Désinscrit des messages', 'rouge') : ''}</div></div>
        <button class="close" aria-label="Fermer"><i class="fa-solid fa-xmark"></i></button></div>
      <div class="drawer-body">
        <div style="display:flex;gap:8px;flex-wrap:wrap">
          <a class="btn wa" href="${waLink(l.whatsapp, `Bonjour ${l.prenom || ''}, c'est l'équipe Modern Business School. `)}" target="_blank"><i class="fa-brands fa-whatsapp"></i> Ouvrir WhatsApp</a>
          <a class="btn ghost" href="tel:${esc(l.whatsapp)}"><i class="fa-solid fa-phone"></i> Appeler</a>
          <button class="btn ghost" id="send"><i class="fa-solid fa-paper-plane"></i> Envoyer un message</button>
          <button class="btn y" id="analyse"><i class="fa-solid fa-wand-magic-sparkles"></i> Analyser avec l'IA</button>
        </div>
        ${a ? `<div class="ai-box"><h3><i class="fa-solid fa-wand-magic-sparkles" style="color:var(--jaune-fonce)"></i> Lecture du dossier ${a.mode === 'simple' ? '<span class="pill gris">mode simple</span>' : ''}<span class="small muted" style="margin-left:auto;font-weight:400">${ago(a.date)}</span></h3>
          <p>${esc(a.resume)}</p>${a.freins?.length ? `<p class="small"><b>Freins probables :</b> ${a.freins.map(esc).join(' · ')}</p>` : ''}<p><b>Prochaine action :</b> ${esc(a.prochaine_action)}</p>
          <div class="card" style="background:#fff;padding:12px"><div class="small muted" style="margin-bottom:4px">Message proposé</div><div id="ai-msg" style="white-space:pre-wrap">${esc(a.message_whatsapp)}</div>
          <div style="display:flex;gap:8px;margin-top:10px"><a class="btn wa sm" target="_blank" href="${waLink(l.whatsapp, a.message_whatsapp)}"><i class="fa-brands fa-whatsapp"></i> Envoyer depuis mon WhatsApp</a><button class="btn ghost sm" id="ai-api">Envoyer via la plateforme</button></div></div></div>` : ''}
        <div class="grid g2">
          <div class="card"><div class="card-head"><h3>Formation</h3></div>
            <select class="input" id="sess">${sessionOptions(cat.sessions, l.session_id, 'Aucune session')}</select>
            ${x.session ? `<p class="small muted" style="margin:8px 0 0">${esc(x.session.horaire || '')} · ${esc(x.session.lieu || '')}<br>${x.session.restantes} places restantes</p>` : ''}
            ${!l.completed_at ? `<button class="btn ghost sm" id="complete" style="margin-top:10px"><i class="fa-solid fa-check"></i> Marquer l'inscription comme terminée</button>` : ''}
            <div class="field" style="margin-top:12px"><label>Statut</label><select class="input" id="statut">${Object.entries(L.statut).map(([k, v]) => `<option value="${k}" ${k === l.statut ? 'selected' : ''}>${v}</option>`).join('')}</select></div>
          </div>
          <div class="card"><div class="card-head"><h3>Paiement</h3>${payPill(b.du === 0 ? 'aucun' : b.solde ? 'solde' : b.paye > 0 ? 'partiel' : 'rien')}</div>
            <div class="fill ${b.solde ? 'full' : ''}"><span style="width:${b.du ? Math.min(100, (b.paye / b.du) * 100) : 0}%"></span></div>
            <p style="margin:8px 0">Payé <b>${money(b.paye)}</b> sur <b>${money(b.du)}</b> · reste <b style="color:${b.reste ? 'var(--rouge)' : 'var(--vert)'}">${money(b.reste)}</b>${l.remise_pct ? `<br><span class="small muted">Remise ${l.remise_pct} % (${esc(l.code_promo || '')})</span>` : ''}</p>
            <form id="pay" style="display:grid;grid-template-columns:1fr 1fr;gap:6px">
              <input class="input" name="montant" type="number" step="0.01" min="0" placeholder="Montant $" value="${b.reste || ''}" required>
              <select class="input" name="methode"><option value="mobile_money">Mobile money</option><option value="especes">Espèces</option><option value="carte">Carte</option><option value="virement">Virement</option></select>
              <input class="input" name="reference" placeholder="Référence (facultatif)" style="grid-column:1/-1">
              <label class="switch small" style="grid-column:1/-1"><input type="checkbox" name="notifier" checked> Envoyer un reçu par WhatsApp</label>
              <button class="btn y sm" style="grid-column:1/-1;justify-content:center"><i class="fa-solid fa-plus"></i> Enregistrer le paiement</button>
            </form>
            ${x.payments.length ? `<div style="margin-top:10px">${x.payments.map((p) => `<div class="small" style="display:flex;justify-content:space-between;gap:8px;padding:5px 0;border-top:1px solid var(--ligne);${p.statut === 'annule' ? 'text-decoration:line-through;opacity:.5' : ''}"><span>${d(p.created_at)} · ${esc(p.methode || '')} ${p.reference ? '· ' + esc(p.reference) : ''}</span><b>${money(p.montant)}</b>${p.statut !== 'annule' && me.acces.includes('reglages') ? `<button class="btn ghost sm" data-cancel="${p.id}" title="Annuler" style="padding:2px 7px">✕</button>` : ''}</div>`).join('')}</div>` : ''}
          </div>
        </div>
        <div class="card"><div class="card-head"><h3>Profil</h3><button class="btn ghost sm" id="edit"><i class="fa-solid fa-pen"></i> Modifier</button></div>
          <dl class="kv">
            <dt>Situation</dt><dd>${esc(L.profil[l.profil] || '—')}</dd><dt>Niveau</dt><dd>${esc(L.niveau[l.niveau] || '—')}</dd>
            <dt>Objectif</dt><dd>${esc(L.objectif[l.objectif] || '—')}</dd><dt>Motivation</dt><dd>${esc(l.motivation || '—')}</dd>
            <dt>Financement</dt><dd>${esc(L.financement[l.financement] || '—')}</dd><dt>Disponibilité</dt><dd>${esc(L.disponible[l.disponible] || '—')}</dd>
            <dt>Paiement prévu</dt><dd>${esc(L.paiement_quand[l.paiement_quand] || '—')} · ${esc(L.paiement_mode[l.paiement_mode] || '—')}</dd>
            <dt>Source</dt><dd>${esc(L.source[l.source] || l.source || '—')}${l.utm_source ? ` · utm ${esc(l.utm_source)}/${esc(l.utm_campaign || '')}` : ''}</dd>
            <dt>Parrainage</dt><dd>Code ${esc(l.code_parrain || '—')}${x.parrain ? ` · parrainé par <a href="#" data-open="${x.parrain.id}">${esc(x.parrain.prenom)} ${esc(x.parrain.nom || '')}</a>` : ''}${x.filleuls.length ? ` · ${x.filleuls.length} filleul(s)` : ''}</dd>
            ${x.certificats.length ? `<dt>Certificat</dt><dd>${x.certificats.map((c) => `<a href="/certificat/${c.code}" target="_blank">${c.code}</a>${c.revoque ? ' (révoqué)' : ''}`).join(', ')}</dd>` : ''}
          </dl>
          <div class="field" style="margin-top:14px"><label>Notes internes</label><textarea class="input" id="notes" placeholder="Appel du..., rappeler le...">${esc(l.notes || '')}</textarea></div>
          <label class="switch small"><input type="checkbox" id="optout" ${l.opt_out ? 'checked' : ''}> Ne plus envoyer de messages automatiques</label>
        </div>
        <div class="card"><div class="card-head"><h3>Score d'intérêt : ${x.score.score}/100</h3></div><div class="signals">${x.score.signals.map((s) => pill(`${s.pts > 0 ? '+' : ''}${s.pts} ${s.label}`, s.pts > 0 ? 'vert' : s.pts < 0 ? 'rouge' : 'gris')).join('')}</div></div>
        ${x.chat.length ? `<div class="card"><div class="card-head"><h3><i class="fa-solid fa-robot"></i> Conversation avec l'assistante</h3></div><div class="chat-log">${x.chat.map((m) => `<div class="m ${m.role}">${esc(m.content)}</div>`).join('')}</div></div>` : ''}
        <div class="card"><div class="card-head"><h3>Historique</h3></div><ul class="timeline">${timeline.map((t) => `<li><span class="ic"><i class="${t.ic.startsWith('fa-brands') ? t.ic : 'fa-solid ' + t.ic}"></i></span><span>${esc(t.t)}${t.extra ? ` ${pill(...L.msg[t.extra.statut])}<details class="small muted"><summary>voir</summary>${esc(t.extra.contenu)}${t.extra.erreur ? '<br><span style="color:var(--rouge)">' + esc(t.extra.erreur) + '</span>' : ''}</details>` : ''}</span><span class="when">${dt(t.at)}</span></li>`).join('')}</ul></div>
        ${me.acces.includes('reglages') ? '<button class="btn danger sm" id="del" style="justify-self:start"><i class="fa-solid fa-trash"></i> Supprimer ce dossier</button>' : ''}
      </div>`;
      $('.close', dr).onclick = close;
      const patch = async (body, msg = 'Enregistré') => { try { await PATCH('/api/admin/leads/' + id, body); toast(msg); render(); } catch (e) { fail(e); } };
      $('#sess', dr).onchange = (e) => patch({ session_id: e.target.value });
      $('#statut', dr).onchange = (e) => patch({ statut: e.target.value });
      $('#complete', dr)?.addEventListener('click', () => patch({ marquer_complet: true, session_id: $('#sess', dr).value }, 'Inscription terminée'));
      $('#notes', dr).onblur = (e) => { if (e.target.value !== (l.notes || '')) patch({ notes: e.target.value }, 'Note enregistrée'); };
      $('#optout', dr).onchange = (e) => patch({ opt_out: e.target.checked });
      $('[data-open]', dr)?.addEventListener('click', (e) => { e.preventDefault(); openLead(e.target.dataset.open, onChange); });
      $('#pay', dr).onsubmit = async (e) => {
        e.preventDefault();
        const f = formData(e.target);
        try { await POST(`/api/admin/leads/${id}/payments`, { ...f, notifier: e.target.notifier.checked }); toast('Paiement enregistré'); render(); } catch (er) { fail(er); }
      };
      $$('[data-cancel]', dr).forEach((bt) => bt.onclick = async () => { if (await confirmBox('Annuler ce paiement ?', 'Annuler le paiement')) { try { await DEL('/api/admin/payments/' + bt.dataset.cancel); render(); } catch (er) { fail(er); } } });
      $('#analyse', dr).onclick = async (e) => {
        e.target.disabled = true; e.target.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Analyse en cours...';
        try { await POST(`/api/admin/leads/${id}/analyse`); render(); } catch (er) { fail(er); e.target.disabled = false; }
      };
      $('#ai-api', dr)?.addEventListener('click', async () => {
        try { const r = await POST(`/api/admin/leads/${id}/message`, { canal: 'whatsapp', contenu: a.message_whatsapp }); toast(r.message.statut === 'simule' ? 'Message simulé (WhatsApp non connecté)' : 'Message envoyé'); render(); } catch (er) { fail(er); }
      });
      $('#send', dr).onclick = () => sendMessageModal(l, x.templates, render);
      $('#edit', dr).onclick = () => editLeadModal(l, render);
      $('#del', dr)?.addEventListener('click', async () => { if (await confirmBox('Supprimer définitivement ce dossier et son historique ? Cette action est irréversible.', 'Supprimer')) { await DEL('/api/admin/leads/' + id); toast('Dossier supprimé'); close(); } });
    }
    render().catch((e) => { dr.innerHTML = `<div class="empty">${esc(e.message)}</div>`; });
  }

  function sendMessageModal(l, templates, done) {
    modal(`<h2>Message à ${esc(l.prenom || '')}</h2>
      <form id="sf"><div class="field"><label>Canal</label><select class="input" name="canal"><option value="whatsapp">WhatsApp (${esc(l.whatsapp)})</option>${l.email ? `<option value="email">Email (${esc(l.email)})</option>` : ''}</select></div>
      <div class="field"><label>Partir d'un modèle</label><select class="input" id="tpl"><option value="">—</option>${Object.keys(templates).map((k) => `<option value="${k}">${k.replace(/_/g, ' ')}</option>`).join('')}</select></div>
      <div class="field"><label>Message</label><textarea class="input" name="contenu" rows="6" required></textarea><span class="help">Variables : {{prenom}}, {{formation}}, {{dates}}, {{reste}}, {{lien_paiement}}, {{lien_espace}}...</span></div>
      <div class="actions"><button type="button" class="btn ghost" data-close>Annuler</button><button class="btn y"><i class="fa-solid fa-paper-plane"></i> Envoyer</button></div></form>`, {
      onMount: (m, close) => {
        $('#tpl', m).onchange = (e) => { if (e.target.value) m.querySelector('[name=contenu]').value = templates[e.target.value]; };
        $('#sf', m).onsubmit = async (e) => { e.preventDefault(); try { const r = await POST(`/api/admin/leads/${l.id}/message`, formData(e.target)); close(); toast(r.message.statut === 'simule' ? 'Message simulé (canal non connecté)' : r.message.statut === 'echec' ? 'Échec : ' + r.message.erreur : 'Message envoyé'); done(); } catch (er) { fail(er); } };
      },
    });
  }

  function editLeadModal(l, done) {
    const sel = (name, map) => `<select class="input" name="${name}"><option value="">—</option>${Object.entries(map).map(([k, v]) => `<option value="${k}" ${l[name] === k ? 'selected' : ''}>${v}</option>`).join('')}</select>`;
    modal(`<h2>Modifier le dossier</h2><form id="ef"><div class="grid g2" style="gap:0 12px">
      <div class="field"><label>Prénom</label><input class="input" name="prenom" value="${esc(l.prenom || '')}"></div><div class="field"><label>Nom</label><input class="input" name="nom" value="${esc(l.nom || '')}"></div>
      <div class="field"><label>Email</label><input class="input" name="email" value="${esc(l.email || '')}"></div><div class="field"><label>Montant dû ($)</label><input class="input" name="prix_du" type="number" step="0.01" value="${l.prix_du ?? ''}"><span class="help">Laisser vide = prix de la session</span></div>
      <div class="field"><label>Situation</label>${sel('profil', L.profil)}</div><div class="field"><label>Niveau</label>${sel('niveau', L.niveau)}</div>
      <div class="field"><label>Objectif</label>${sel('objectif', L.objectif)}</div><div class="field"><label>Financement</label>${sel('financement', L.financement)}</div>
      <div class="field"><label>Paiement prévu</label>${sel('paiement_quand', L.paiement_quand)}</div><div class="field"><label>Mode</label>${sel('paiement_mode', L.paiement_mode)}</div></div>
      <div class="field"><label>Motivation</label><textarea class="input" name="motivation">${esc(l.motivation || '')}</textarea></div>
      <div class="actions"><button type="button" class="btn ghost" data-close>Annuler</button><button class="btn y">Enregistrer</button></div></form>`, {
      onMount: (m, close) => { $('#ef', m).onsubmit = async (e) => { e.preventDefault(); try { await PATCH('/api/admin/leads/' + l.id, formData(e.target)); close(); toast('Dossier mis à jour'); done(); } catch (er) { fail(er); } }; },
    });
  }

  // ================================================ entreprises
  VIEWS.entreprises = async (main) => {
    const x = await GET('/api/admin/entreprises');
    const total = (s) => x.entreprises.filter((e) => e.statut === s).reduce((a, e) => a + (e.valeur_finale ?? e.devis_ht ?? 0), 0);
    main.innerHTML = `<div class="topbar"><div><h1>Entreprises</h1><div class="muted">Glissez une carte pour changer son étape.</div></div><div class="sp"></div><a class="btn ghost" href="/entreprises" target="_blank"><i class="fa-solid fa-calculator"></i> Simulateur public</a><button class="btn y" id="add"><i class="fa-solid fa-plus"></i> Nouvelle opportunité</button></div>
      <div class="kanban">${x.statuts.map((s) => `<div class="col" data-col="${s}"><h3><span>${L.b2b[s]}</span><span class="muted">${money(total(s))}</span></h3>
        ${x.entreprises.filter((e) => e.statut === s).map((e) => `<div class="deal" draggable="true" data-id="${e.id}"><b>${esc(e.societe)}</b><span class="small muted">${esc(e.contact || '')}${e.secteur ? ' · ' + esc(e.secteur) : ''}</span><div class="small">${e.participants} pers. · ${e.jours} j · ${e.modules.length} module(s)</div><div class="v">${money(e.valeur_finale ?? e.devis_ht)}</div><div class="small muted">${ago(e.created_at)}</div></div>`).join('')}
      </div>`).join('')}</div>`;
    $$('.deal', main).forEach((c) => {
      c.addEventListener('dragstart', (e) => e.dataTransfer.setData('text/plain', c.dataset.id));
      c.addEventListener('click', () => openDeal(x.entreprises.find((e) => e.id === c.dataset.id), x.formations));
    });
    $$('.col', main).forEach((col) => {
      col.addEventListener('dragover', (e) => { e.preventDefault(); col.classList.add('over'); });
      col.addEventListener('dragleave', () => col.classList.remove('over'));
      col.addEventListener('drop', async (e) => { e.preventDefault(); col.classList.remove('over'); try { await PATCH('/api/admin/entreprises/' + e.dataTransfer.getData('text/plain'), { statut: col.dataset.col }); route(); } catch (er) { fail(er); } });
    });
    $('#add').onclick = () => modal(`<h2>Nouvelle opportunité</h2><form id="nf"><div class="grid g2" style="gap:0 12px"><div class="field"><label>Société</label><input class="input" name="societe" required></div><div class="field"><label>Contact</label><input class="input" name="contact"></div><div class="field"><label>Téléphone</label><input class="input" name="telephone"></div><div class="field"><label>Email</label><input class="input" name="email"></div><div class="field"><label>Participants</label><input class="input" name="participants" type="number" value="10"></div><div class="field"><label>Jours</label><select class="input" name="jours"><option>1</option><option selected>2</option><option>3</option></select></div></div>
      <div class="field"><label>Modules</label>${x.formations.map((f) => `<label class="switch small" style="margin:4px 0"><input type="checkbox" name="m" value="${f.id}"> ${esc(f.titre)}</label>`).join('')}</div>
      <div class="actions"><button type="button" class="btn ghost" data-close>Annuler</button><button class="btn y">Créer</button></div></form>`, {
      onMount: (m, close) => { $('#nf', m).onsubmit = async (e) => { e.preventDefault(); const f = formData(e.target); f.modules = $$('[name=m]:checked', m).map((c) => c.value); try { await POST('/api/admin/entreprises', f); close(); route(); } catch (er) { fail(er); } }; },
    });
  };

  function openDeal(e, formations) {
    const dv = e.devis_detail || { lignes: [], ht: 0, tva: 0, ttc: 0 };
    modal(`<div style="display:flex;justify-content:space-between;gap:12px;align-items:flex-start"><div><h2>${esc(e.societe)}</h2><div class="muted small">${esc(e.secteur || '')} ${e.taille ? '· ' + esc(e.taille) + ' salariés' : ''} · reçu ${dt(e.created_at)}</div></div><button class="btn ghost sm" data-close>✕</button></div>
      <div class="grid g2" style="margin-top:14px">
        <div class="card"><h3>Contact</h3><dl class="kv"><dt>Nom</dt><dd>${esc(e.contact || '—')}</dd><dt>Fonction</dt><dd>${esc(e.fonction || '—')}</dd><dt>Téléphone</dt><dd>${esc(e.telephone || '—')}</dd><dt>Email</dt><dd>${esc(e.email || '—')}</dd><dt>Format</dt><dd>${esc(e.format || '—')}</dd><dt>Période</dt><dd>${esc(e.periode || '—')}</dd></dl>
          <div style="display:flex;gap:6px;margin-top:12px;flex-wrap:wrap"><a class="btn wa sm" target="_blank" href="${waLink(e.telephone, `Bonjour ${e.contact || ''}, c'est Modern Business School, suite à votre demande de formation pour ${e.societe}.`)}"><i class="fa-brands fa-whatsapp"></i> WhatsApp</a>${e.email ? `<a class="btn ghost sm" href="mailto:${esc(e.email)}"><i class="fa-solid fa-envelope"></i> Email</a>` : ''}<a class="btn ghost sm" target="_blank" href="/admin/devis/${e.id}"><i class="fa-solid fa-file-invoice"></i> Devis imprimable</a></div></div>
        <div class="card"><h3>Devis</h3>${dv.lignes.map((l) => `<div class="small" style="display:flex;justify-content:space-between;padding:4px 0;border-bottom:1px dashed var(--ligne)"><span>${esc(l.titre)}</span><b>${money(l.total)}</b></div>`).join('')}
          <div style="display:flex;justify-content:space-between;margin-top:8px"><span>Total HT</span><b>${money(dv.ht)}</b></div><div class="small muted" style="display:flex;justify-content:space-between"><span>TTC (TVA ${dv.tva_pct} %)</span><span>${money(dv.ttc)}</span></div>
          <form id="df" style="margin-top:12px"><div class="grid g2" style="gap:0 8px"><div class="field"><label>Participants</label><input class="input" name="participants" type="number" value="${e.participants}"></div><div class="field"><label>Jours</label><select class="input" name="jours">${[1, 2, 3].map((j) => `<option ${j === e.jours ? 'selected' : ''}>${j}</option>`).join('')}</select></div></div>
          ${formations.map((f) => `<label class="switch small" style="margin:3px 0"><input type="checkbox" name="m" value="${f.id}" ${e.modules.includes(f.id) ? 'checked' : ''}> ${esc(f.titre)}</label>`).join('')}
          <button class="btn ghost sm" style="margin-top:8px">Recalculer</button></form></div>
      </div>
      ${e.objectifs ? `<div class="card" style="margin-top:14px"><h3>Objectifs exprimés</h3><p style="margin:0">${esc(e.objectifs)}</p></div>` : ''}
      <div class="grid g3" style="margin-top:14px">
        <div class="field"><label>Étape</label><select class="input" id="st">${Object.entries(L.b2b).map(([k, v]) => `<option value="${k}" ${k === e.statut ? 'selected' : ''}>${v}</option>`).join('')}</select></div>
        <div class="field"><label>Montant signé ($ HT)</label><input class="input" id="vf" type="number" value="${e.valeur_finale ?? ''}" placeholder="${dv.ht}"></div>
        <div class="field" style="align-self:end"><button class="btn ghost" id="save" style="width:100%;justify-content:center">Enregistrer</button></div>
      </div>
      <div class="field"><label>Notes</label><textarea class="input" id="nt">${esc(e.notes || '')}</textarea></div>
      <div class="card" style="margin-top:6px"><div class="card-head"><h3><i class="fa-solid fa-wand-magic-sparkles" style="color:var(--jaune-fonce)"></i> Proposition commerciale</h3><button class="btn y sm" id="gen">${e.ia_proposition ? 'Régénérer' : 'Rédiger avec l\'IA'}</button></div>
        <pre class="prop" id="prop">${esc(e.ia_proposition || 'Aucune proposition rédigée pour l\'instant.')}</pre>${e.ia_proposition ? '<button class="btn ghost sm" id="copy"><i class="fa-solid fa-copy"></i> Copier</button>' : ''}</div>
      <div class="actions"><button class="btn danger sm" id="del">Supprimer</button></div>`, {
      lg: true,
      onMount: (m, close) => {
        $('#save', m).onclick = async () => { try { await PATCH('/api/admin/entreprises/' + e.id, { statut: $('#st', m).value, valeur_finale: $('#vf', m).value, notes: $('#nt', m).value }); toast('Enregistré'); close(); route(); } catch (er) { fail(er); } };
        $('#df', m).onsubmit = async (ev) => { ev.preventDefault(); const f = formData(ev.target); try { await PATCH('/api/admin/entreprises/' + e.id, { participants: f.participants, jours: f.jours, modules: $$('[name=m]:checked', m).map((c) => c.value) }); toast('Devis recalculé'); close(); route(); } catch (er) { fail(er); } };
        $('#gen', m).onclick = async (ev) => { ev.target.disabled = true; ev.target.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Rédaction...'; try { const r = await POST(`/api/admin/entreprises/${e.id}/proposition`); $('#prop', m).textContent = r.proposition; e.ia_proposition = r.proposition; toast('Proposition prête'); } catch (er) { fail(er); } ev.target.disabled = false; ev.target.textContent = 'Régénérer'; };
        $('#copy', m)?.addEventListener('click', () => { navigator.clipboard.writeText($('#prop', m).textContent); toast('Copié'); });
        $('#del', m).onclick = async () => { if (await confirmBox(`Supprimer la demande de ${e.societe} ?`, 'Supprimer')) { await DEL('/api/admin/entreprises/' + e.id); close(); route(); } };
      },
    });
  }

  // ================================================ catalogue
  VIEWS.catalogue = async (main) => {
    const c = await catalogue(true);
    const tab = sessionStorage.getItem('cat_tab') || 'sessions';
    main.innerHTML = `<div class="topbar"><h1>Catalogue</h1><div class="sp"></div><button class="btn y" id="add"><i class="fa-solid fa-plus"></i> Ajouter</button></div>
      <div class="tabs">${[['sessions', 'Sessions'], ['formations', 'Formations'], ['formateurs', 'Formateurs']].map(([k, t]) => `<button data-tab="${k}" class="${k === tab ? 'on' : ''}">${t}</button>`).join('')}</div><div id="tab"></div>`;
    $$('[data-tab]', main).forEach((b) => b.onclick = () => { sessionStorage.setItem('cat_tab', b.dataset.tab); route(); });
    const box = $('#tab');
    if (tab === 'sessions') {
      box.innerHTML = `<div class="card pad0"><div class="table-wrap"><table><thead><tr><th>Formation</th><th>Dates</th><th>Format</th><th>Remplissage</th><th>Prix</th><th>Statut</th><th></th></tr></thead><tbody>
        ${c.sessions.map((s) => `<tr class="click" data-id="${s.id}"><td><div class="name">${esc(s.formation_titre)}</div><div class="sub">${esc(s.horaire || '')} · ${esc(s.lieu || '')}</div></td><td>${esc(s.dates)}${s.passee ? ' ' + pill('passée', 'gris') : ''}</td><td>${esc(s.format)}</td>
          <td style="min-width:140px"><div class="fill ${s.restantes === 0 ? 'full' : ''}"><span style="width:${Math.min(100, (s.prises / s.capacite) * 100)}%"></span></div><div class="sub">${s.prises}/${s.capacite} · ${s.commencees - s.prises} en cours</div></td>
          <td>${money(s.prix_actuel)}${s.early_actif ? ' ' + pill('early bird', 'vert') : ''}</td><td>${pill(s.statut, s.statut === 'ouverte' ? 'vert' : s.statut === 'annulee' ? 'rouge' : 'gris')}</td><td><i class="fa-solid fa-chevron-right muted"></i></td></tr>`).join('')}
      </tbody></table></div></div>`;
      $$('tr[data-id]', box).forEach((r) => r.onclick = () => sessionModal(c, c.sessions.find((s) => s.id === r.dataset.id)));
      $('#add').onclick = () => sessionModal(c);
    } else if (tab === 'formations') {
      box.innerHTML = `<div class="grid g2">${c.formations.map((f) => `<div class="card click" data-id="${f.id}" style="cursor:pointer;display:flex;gap:14px"><img src="${esc(f.image)}" alt="" style="width:110px;height:80px;object-fit:cover;border-radius:10px"><div style="flex:1"><h3>${esc(f.titre)} ${f.actif ? '' : pill('masquée', 'gris')}</h3><div class="small muted">${esc(f.duree)} · ${money(f.prix)} HT / participant · consultation ${money(f.consult_min)} à ${money(f.consult_max)}</div><div class="small" style="margin-top:4px">${esc(f.accroche || '')}</div></div></div>`).join('')}</div>`;
      $$('[data-id]', box).forEach((r) => r.onclick = () => formationModal(c, c.formations.find((f) => f.id === r.dataset.id)));
      $('#add').onclick = () => formationModal(c);
    } else {
      box.innerHTML = `<div class="grid g4">${c.formateurs.map((f) => `<div class="card click" data-id="${f.id}" style="cursor:pointer;text-align:center"><img src="${esc(f.photo || '/img/icon.png')}" alt="" style="width:90px;height:90px;border-radius:50%;object-fit:cover;object-position:top;margin:0 auto 10px"><h3>${esc(f.nom)}</h3><div class="small muted">${esc(f.titre || '')}</div>${f.actif ? '' : pill('masqué', 'gris')}</div>`).join('')}</div>`;
      $$('[data-id]', box).forEach((r) => r.onclick = () => formateurModal(c.formateurs.find((f) => f.id === r.dataset.id)));
      $('#add').onclick = () => formateurModal();
    }
  };

  function sessionModal(c, s = {}) {
    modal(`<h2>${s.id ? 'Modifier la session' : 'Nouvelle session'}</h2><form id="f">
      <div class="field"><label>Formation</label><select class="input" name="formation_id" required>${c.formations.map((f) => `<option value="${f.id}" ${f.id === s.formation_id ? 'selected' : ''}>${esc(f.titre)}</option>`).join('')}</select></div>
      <div class="grid g2" style="gap:0 12px">
        <div class="field"><label>Début</label><input class="input" type="date" name="debut" value="${s.debut || ''}" required></div><div class="field"><label>Fin</label><input class="input" type="date" name="fin" value="${s.fin || ''}"></div>
        <div class="field"><label>Horaire</label><input class="input" name="horaire" value="${esc(s.horaire || '9h à 13h')}"></div><div class="field"><label>Capacité</label><input class="input" type="number" name="capacite" value="${s.capacite || 25}"></div>
        <div class="field"><label>Format</label><select class="input" name="format">${['presentiel', 'en_ligne', 'hybride'].map((v) => `<option ${v === s.format ? 'selected' : ''}>${v}</option>`).join('')}</select></div>
        <div class="field"><label>Statut</label><select class="input" name="statut">${['ouverte', 'complete', 'brouillon', 'annulee'].map((v) => `<option ${v === (s.statut || 'ouverte') ? 'selected' : ''}>${v}</option>`).join('')}</select></div>
        <div class="field"><label>Prix ($ HT)</label><input class="input" type="number" step="0.01" name="prix" value="${s.prix ?? ''}" placeholder="prix de la formation"></div><div class="field"><label>Prix early bird</label><input class="input" type="number" step="0.01" name="prix_early" value="${s.prix_early ?? ''}"></div>
        <div class="field"><label>Early bird jusqu'au</label><input class="input" type="date" name="early_jusqu" value="${s.early_jusqu || ''}"></div>
      </div>
      <div class="field"><label>Lieu</label><input class="input" name="lieu" value="${esc(s.lieu || '')}" placeholder="Adresse ou lien de visioconférence"></div>
      ${s.id ? `<label class="switch small"><input type="checkbox" name="prevenir_report"> Si les dates changent, prévenir les inscrits par WhatsApp / email</label>` : ''}
      <p class="err" id="e"></p><div class="actions">${s.id ? '<button type="button" class="btn danger" id="del" style="margin-right:auto">Supprimer</button>' : ''}<button type="button" class="btn ghost" data-close>Annuler</button><button class="btn y">Enregistrer</button></div></form>`, {
      onMount: (m, close) => {
        $('#f', m).onsubmit = async (e) => {
          e.preventDefault();
          const f = formData(e.target); f.prevenir_report = !!e.target.prevenir_report?.checked;
          try { const r = s.id ? await PATCH('/api/admin/sessions/' + s.id, f) : await POST('/api/admin/sessions', f); close(); toast(r.prevenus != null ? `${r.prevenus} inscrit(s) prévenu(s)` : 'Session enregistrée'); catalogueCache = null; route(); } catch (er) { $('#e', m).textContent = er.message; }
        };
        $('#del', m)?.addEventListener('click', async () => { try { await DEL('/api/admin/sessions/' + s.id); close(); catalogueCache = null; route(); } catch (er) { $('#e', m).textContent = er.message; } });
      },
    });
  }

  function formationModal(c, f = { objectifs: [], contenu: [], formateurs: [], actif: 1 }) {
    modal(`<h2>${f.id ? 'Modifier la formation' : 'Nouvelle formation'}</h2><form id="f">
      <div class="grid g2" style="gap:0 12px"><div class="field"><label>Titre</label><input class="input" name="titre" value="${esc(f.titre || '')}" required></div><div class="field"><label>Lien (slug)</label><input class="input" name="slug" value="${esc(f.slug || '')}" placeholder="automatique"></div></div>
      <div class="field"><label>Accroche</label><input class="input" name="accroche" value="${esc(f.accroche || '')}"></div>
      <div class="grid g3" style="gap:0 12px"><div class="field"><label>Prix / participant ($ HT)</label><input class="input" type="number" name="prix" value="${f.prix ?? ''}"></div><div class="field"><label>Consultation min</label><input class="input" type="number" name="consult_min" value="${f.consult_min ?? 2500}"></div><div class="field"><label>Consultation max</label><input class="input" type="number" name="consult_max" value="${f.consult_max ?? 5000}"></div>
      <div class="field"><label>Durée</label><input class="input" name="duree" value="${esc(f.duree || '1 à 3 jours')}"></div><div class="field"><label>Domaine</label><input class="input" name="domaine" value="${esc(f.domaine || '')}"></div><div class="field"><label>Ordre</label><input class="input" type="number" name="ordre" value="${f.ordre ?? 0}"></div></div>
      <div class="field"><label>Objectifs (un par ligne)</label><textarea class="input" name="objectifs">${esc(f.objectifs.join('\n'))}</textarea></div>
      <div class="field"><label>Programme (un point par ligne)</label><textarea class="input" name="contenu">${esc(f.contenu.join('\n'))}</textarea></div>
      <div class="grid g2" style="gap:0 12px"><div class="field"><label>Public</label><input class="input" name="public" value="${esc(f.public || '')}"></div><div class="field"><label>Prérequis</label><input class="input" name="prerequis" value="${esc(f.prerequis || '')}"></div>
      <div class="field"><label>Image (chemin)</label><input class="input" name="image" value="${esc(f.image || '/img/ph-laptop.jpg')}"></div><div class="field"><label>Icône Font Awesome</label><input class="input" name="icone" value="${esc(f.icone || 'fa-graduation-cap')}"></div></div>
      <div class="field"><label>Formateurs</label>${c.formateurs.map((x) => `<label class="switch small" style="margin:3px 12px 3px 0"><input type="checkbox" name="fm" value="${x.id}" ${f.formateurs.includes(x.id) ? 'checked' : ''}> ${esc(x.nom)}</label>`).join('')}</div>
      <label class="switch small"><input type="checkbox" name="actif" ${f.actif ? 'checked' : ''}> Visible sur le site</label>
      <p class="err" id="e"></p><div class="actions">${f.id ? '<button type="button" class="btn danger" id="del" style="margin-right:auto">Supprimer</button>' : ''}<button type="button" class="btn ghost" data-close>Annuler</button><button class="btn y">Enregistrer</button></div></form>`, {
      lg: true,
      onMount: (m, close) => {
        $('#f', m).onsubmit = async (e) => {
          e.preventDefault();
          const v = formData(e.target);
          v.actif = e.target.actif.checked; v.formateurs = $$('[name=fm]:checked', m).map((x) => x.value);
          if (!v.slug) delete v.slug;
          try { f.id ? await PATCH('/api/admin/formations/' + f.id, v) : await POST('/api/admin/formations', v); close(); toast('Formation enregistrée'); catalogueCache = null; route(); } catch (er) { $('#e', m).textContent = er.message; }
        };
        $('#del', m)?.addEventListener('click', async () => { try { await DEL('/api/admin/formations/' + f.id); close(); catalogueCache = null; route(); } catch (er) { $('#e', m).textContent = er.message; } });
      },
    });
  }

  function formateurModal(f = { actif: 1 }) {
    modal(`<h2>${f.id ? 'Modifier' : 'Nouveau formateur'}</h2><form id="f"><div class="field"><label>Nom</label><input class="input" name="nom" value="${esc(f.nom || '')}" required></div><div class="field"><label>Titre</label><input class="input" name="titre" value="${esc(f.titre || '')}"></div><div class="field"><label>Bio</label><textarea class="input" name="bio">${esc(f.bio || '')}</textarea></div><div class="field"><label>Photo (chemin)</label><input class="input" name="photo" value="${esc(f.photo || '')}" placeholder="/img/..."></div><div class="field"><label>Ordre d'affichage</label><input class="input" type="number" name="ordre" value="${f.ordre ?? 0}"></div><label class="switch small"><input type="checkbox" name="actif" ${f.actif ? 'checked' : ''}> Visible</label>
      <div class="actions">${f.id ? '<button type="button" class="btn danger" id="del" style="margin-right:auto">Supprimer</button>' : ''}<button type="button" class="btn ghost" data-close>Annuler</button><button class="btn y">Enregistrer</button></div></form>`, {
      onMount: (m, close) => {
        $('#f', m).onsubmit = async (e) => { e.preventDefault(); const v = formData(e.target); v.actif = e.target.actif.checked; try { f.id ? await PATCH('/api/admin/formateurs/' + f.id, v) : await POST('/api/admin/formateurs', v); close(); catalogueCache = null; route(); } catch (er) { fail(er); } };
        $('#del', m)?.addEventListener('click', async () => { if (await confirmBox('Supprimer ce formateur ?', 'Supprimer')) { await DEL('/api/admin/formateurs/' + f.id); close(); catalogueCache = null; route(); } });
      },
    });
  }

  // ================================================ presences et certificats
  VIEWS.presences = async (main) => {
    const c = await catalogue(true);
    const prochaine = c.sessions.filter((s) => !s.passee).sort((a, b) => a.debut.localeCompare(b.debut))[0];
    const sid = sessionStorage.getItem('pres_s') || (prochaine || c.sessions[0])?.id;
    main.innerHTML = `<div class="topbar"><h1>Présences & certificats</h1><div class="sp"></div><select class="input" id="s" style="width:auto;max-width:100%">${sessionOptions(c.sessions, sid, 'Choisir une session')}</select></div><div id="box"></div>
      <div class="card pad0" style="margin-top:18px"><div class="card-head" style="padding:18px 18px 0"><h2>Certificats délivrés</h2></div><div id="certs"></div></div>`;
    $('#s').onchange = (e) => { sessionStorage.setItem('pres_s', e.target.value); route(); };
    if (sid) {
      const x = await GET(`/api/admin/sessions/${sid}/presences`);
      $('#box').innerHTML = `<div class="card pad0"><div class="card-head" style="padding:18px 18px 0"><div><h2>${esc(x.session.formation_titre)}</h2><div class="muted small">${esc(x.session.dates)} · ${x.participants.length} participant(s) · certificat à partir de ${x.seuil} % de présence</div></div>
        <div style="display:flex;gap:8px"><button class="btn ghost" id="print"><i class="fa-solid fa-print"></i> Feuille d'émargement</button><button class="btn y" id="certif"><i class="fa-solid fa-award"></i> Délivrer les certificats</button></div></div>
        <div class="table-wrap"><table class="pgrid"><thead><tr><th>Participant</th>${x.jours.map((j) => `<th class="c" style="text-align:center">${d(j, { weekday: 'short', day: 'numeric', month: 'short' })}</th>`).join('')}<th>Taux</th><th>Paiement</th><th>Certificat</th></tr></thead><tbody>
        ${x.participants.map((p) => `<tr><td><div class="name">${esc(p.prenom)} ${esc(p.nom)}</div><div class="sub">${esc(p.whatsapp)}</div></td>${x.jours.map((j) => `<td class="c"><input type="checkbox" data-l="${p.id}" data-j="${j}" ${p.presences[j] ? 'checked' : ''} aria-label="Présence ${esc(p.prenom)} ${j}"></td>`).join('')}
          <td><b>${p.taux} %</b></td><td>${payPill(p.paiement)}${p.reste ? `<div class="sub">reste ${money(p.reste)}</div>` : ''}</td><td>${p.certificat ? `<a href="/certificat/${p.certificat}" target="_blank" class="pill vert"><i class="fa-solid fa-award"></i> ${p.certificat}</a>` : `<button class="btn ghost sm" data-one="${p.id}">Délivrer</button>`}</td></tr>`).join('') || `<tr><td colspan="${x.jours.length + 4}" class="empty">Aucun inscrit sur cette session.</td></tr>`}
        </tbody></table></div></div>`;
      $$('[data-l]').forEach((cb) => cb.onchange = async () => { try { await POST(`/api/admin/sessions/${sid}/presences`, { lead_id: cb.dataset.l, jour: cb.dataset.j, present: cb.checked }); } catch (e) { fail(e); cb.checked = !cb.checked; } });
      $('#certif').onclick = async () => { if (!(await confirmBox(`Délivrer un certificat à chaque participant présent au moins ${x.seuil} % du temps ?`, 'Délivrer'))) return; try { const r = await POST(`/api/admin/sessions/${sid}/certificats`); toast(`${r.delivres} certificat(s) délivré(s)`); route(); } catch (e) { fail(e); } };
      $$('[data-one]').forEach((b) => b.onclick = async () => { try { await POST(`/api/admin/sessions/${sid}/certificats`, { lead_ids: [b.dataset.one] }); toast('Certificat délivré'); route(); } catch (e) { fail(e); } });
      $('#print').onclick = () => {
        const w = window.open('', '_blank');
        w.document.write(`<html><head><title>Émargement</title><style>body{font-family:Poppins,Arial;padding:24px;color:#04195E}table{width:100%;border-collapse:collapse}td,th{border:1px solid #999;padding:10px;font-size:13px;text-align:left}th{background:#FFBF31}</style></head><body><img src="/img/logo-light-bg.png" style="height:50px"><h2>Feuille d'émargement · ${esc(x.session.formation_titre)}</h2><p>${esc(x.session.dates)} · ${esc(x.session.horaire || '')} · ${esc(x.session.lieu || '')}</p><table><tr><th>#</th><th>Nom</th><th>Téléphone</th>${x.jours.map((j) => `<th>${d(j, { weekday: 'short', day: 'numeric', month: 'short' })}</th>`).join('')}</tr>${x.participants.map((p, i) => `<tr><td>${i + 1}</td><td>${esc(p.prenom)} ${esc(p.nom)}</td><td>${esc(p.whatsapp)}</td>${x.jours.map(() => '<td></td>').join('')}</tr>`).join('')}</table><script>window.onload=()=>window.print()<\/script></body></html>`);
        w.document.close();
      };
    } else $('#box').innerHTML = '<div class="card empty">Aucune session.</div>';
    const cs = await GET('/api/admin/certificats');
    $('#certs').innerHTML = `<div class="table-wrap"><table><thead><tr><th>Code</th><th>Nom</th><th>Formation</th><th>Délivré</th><th></th></tr></thead><tbody>${cs.certificats.map((x) => `<tr><td><a href="/certificat/${x.code}" target="_blank">${x.code}</a></td><td>${esc(x.nom_complet)}</td><td>${esc(x.formation)}<div class="sub">${esc(x.dates || '')}</div></td><td>${d(x.delivre_le)}</td><td>${me.acces.includes('reglages') ? `<button class="btn ${x.revoque ? 'ghost' : 'danger'} sm" data-rev="${x.id}" data-v="${x.revoque ? 0 : 1}">${x.revoque ? 'Rétablir' : 'Révoquer'}</button>` : x.revoque ? pill('révoqué', 'rouge') : ''}</td></tr>`).join('') || '<tr><td colspan="5" class="empty">Aucun certificat délivré pour l\'instant.</td></tr>'}</tbody></table></div>`;
    $$('[data-rev]').forEach((b) => b.onclick = async () => { await PATCH('/api/admin/certificats/' + b.dataset.rev, { revoque: b.dataset.v === '1' }); route(); });
  };

  // ================================================ relances
  VIEWS.messages = async (main) => {
    const x = await GET('/api/admin/messages');
    const cat = await catalogue();
    const tab = sessionStorage.getItem('msg_tab') || 'journal';
    const a = x.automation;
    const st = Object.fromEntries(x.stats.map((s) => [s.statut, s.n]));
    main.innerHTML = `<div class="topbar"><div><h1>Relances & messages</h1><div class="muted">L'automatisation tourne seule chaque minute, entre ${a.heure_debut} h et ${a.heure_fin} h (heure de Kinshasa).</div></div><div class="sp"></div>
      <span class="pill ${a.actif ? 'vert' : 'rouge'}" style="font-size:.85rem;padding:6px 12px">${a.actif ? '● Automatisation active' : '● Automatisation à l\'arrêt'}</span><button class="btn ghost" id="run"><i class="fa-solid fa-play"></i> Lancer maintenant</button></div>
      <div class="grid g3" style="margin-bottom:16px"><div class="kpi"><small>Envoyés (30 j)</small><b style="color:var(--vert)">${st.envoye || 0}</b></div><div class="kpi"><small>Simulés (canal non connecté)</small><b>${st.simule || 0}</b></div><div class="kpi"><small>Échecs</small><b style="color:var(--rouge)">${st.echec || 0}</b></div></div>
      <div class="tabs">${[['journal', 'Journal'], ['diffusion', 'Envoi groupé'], ['modeles', 'Modèles de messages'], ['auto', 'Règles d\'automatisation']].map(([k, t]) => `<button data-tab="${k}" class="${k === tab ? 'on' : ''}">${t}</button>`).join('')}</div><div id="tab"></div>`;
    $$('[data-tab]', main).forEach((b) => b.onclick = () => { sessionStorage.setItem('msg_tab', b.dataset.tab); route(); });
    $('#run').onclick = async () => { try { const r = await POST('/api/admin/automation/run'); toast(`${r.sent ?? 0} message(s) traité(s)`); route(); } catch (e) { fail(e); } };
    const box = $('#tab');
    if (tab === 'journal') {
      box.innerHTML = `<div class="card pad0"><div class="table-wrap"><table><thead><tr><th>Quand</th><th>Destinataire</th><th>Canal</th><th>Type</th><th>Statut</th><th>Message</th></tr></thead><tbody>${x.messages.map((m) => `<tr ${m.lead_id ? `class="click" data-lead="${m.lead_id}"` : ''}><td class="sub">${dt(m.created_at)}</td><td><div class="name">${esc(m.prenom ? `${m.prenom} ${m.nom || ''}` : m.societe || m.destinataire)}</div><div class="sub">${esc(m.destinataire)}</div></td><td>${m.canal === 'email' ? '<i class="fa-solid fa-envelope"></i>' : '<i class="fa-brands fa-whatsapp" style="color:#25D366"></i>'}</td><td class="small">${esc(m.type.replace(/_/g, ' '))}<div class="sub">${esc(m.par || '')}</div></td><td>${pill(...L.msg[m.statut])}</td><td class="small" style="max-width:380px">${esc(m.contenu.slice(0, 140))}${m.contenu.length > 140 ? '…' : ''}${m.erreur ? `<div style="color:var(--rouge)">${esc(m.erreur)}</div>` : ''}</td></tr>`).join('') || '<tr><td colspan="6" class="empty">Aucun message pour l\'instant.</td></tr>'}</tbody></table></div></div>`;
      $$('[data-lead]', box).forEach((r) => r.onclick = () => openLead(r.dataset.lead));
    } else if (tab === 'diffusion') {
      box.innerHTML = `<div class="grid g2"><form class="card" id="bf"><h2>Envoyer à un groupe</h2>
        <div class="grid g2" style="gap:0 12px"><div class="field"><label>Session</label><select class="input" name="session">${sessionOptions(cat.sessions, '')}</select></div>
        <div class="field"><label>Dossiers</label><select class="input" name="etat"><option value="">Tous</option><option value="complets">Inscriptions terminées</option><option value="incomplets">Non terminées</option></select></div>
        <div class="field"><label>Paiement</label><select class="input" name="paiement"><option value="">Tous</option><option value="reste">Reste à payer</option><option value="rien">Rien reçu</option><option value="solde">Soldé</option></select></div>
        <div class="field"><label>Canal</label><select class="input" name="canal"><option value="whatsapp">WhatsApp</option><option value="email">Email</option></select></div></div>
        <div class="field"><label>Message</label><textarea class="input" name="contenu" rows="6" required placeholder="Bonjour {{prenom}}, ..."></textarea><span class="help">Variables : {{prenom}}, {{formation}}, {{dates}}, {{horaire}}, {{lieu}}, {{reste}}, {{lien_paiement}}, {{lien_espace}}, {{code_parrain}}</span></div>
        <div id="prev" class="notice" style="display:none"></div>
        <div class="actions"><button type="button" class="btn ghost" id="ap">Aperçu</button><button class="btn y">Envoyer</button></div></form>
        <div class="card"><h2>Bonnes pratiques</h2><ul class="small" style="padding-left:18px;line-height:1.8"><li>WhatsApp Business n'autorise l'envoi libre que dans les 24 h suivant le dernier message de la personne. Au-delà, il faut des <b>modèles approuvés par Meta</b>.</li><li>Personnalisez avec {{prenom}} : le taux de réponse double.</li><li>Un seul appel à l'action par message.</li><li>Les personnes désinscrites des messages sont exclues automatiquement.</li></ul></div></div>`;
      const filt = (f) => ({ session: f.session, etat: f.etat, paiement: f.paiement });
      $('#ap').onclick = async () => { const f = formData($('#bf')); try { const r = await POST('/api/admin/broadcast', { contenu: f.contenu, filtres: filt(f), canal: f.canal, apercu: true }); const p = $('#prev'); p.style.display = 'flex'; p.innerHTML = `<i class="fa-solid fa-eye"></i><div><b>${r.n} destinataire(s).</b> Exemple :<br>${esc(r.exemple)}</div>`; } catch (e) { fail(e); } };
      $('#bf').onsubmit = async (e) => { e.preventDefault(); const f = formData(e.target); const pr = await POST('/api/admin/broadcast', { contenu: f.contenu, filtres: filt(f), apercu: true }); if (!(await confirmBox(`Envoyer ce message à ${pr.n} personne(s) ?`, 'Envoyer'))) return; try { const r = await POST('/api/admin/broadcast', { contenu: f.contenu, filtres: filt(f), canal: f.canal }); toast(`${r.envoyes} message(s) envoyé(s)`); sessionStorage.setItem('msg_tab', 'journal'); route(); } catch (er) { fail(er); } };
    } else if (tab === 'modeles') {
      const labels = { relance_incomplete_1: 'Inscription non terminée · 1re relance', relance_incomplete_2: 'Inscription non terminée · 2e relance', relance_incomplete_3: 'Inscription non terminée · dernière relance', inscription_confirmee: 'Confirmation d\'inscription', relance_paiement_1: 'Paiement en attente · 1re relance', relance_paiement_2: 'Paiement en attente · 2e relance', paiement_recu: 'Reçu de paiement', rappel_session: 'Rappel avant la formation', certificat: 'Certificat disponible', avis: 'Demande d\'avis', b2b_accuse: 'Accusé de réception entreprise ({{contact}}, {{societe}}, {{devis}})', report: 'Report de session' };
      box.innerHTML = `<form class="card" id="tf"><div class="notice"><i class="fa-solid fa-circle-info"></i><div>Variables disponibles : {{prenom}}, {{nom}}, {{formation}}, {{dates}}, {{date_debut}}, {{horaire}}, {{lieu}}, {{places}}, {{montant}}, {{reste}}, {{montant_paye}}, {{lien_reprise}}, {{lien_espace}}, {{lien_paiement}}, {{code_parrain}}, {{lien_parrainage}}, {{lien_certificat}}</div></div>
        ${Object.entries(x.templates).map(([k, v]) => `<div class="field"><label>${esc(labels[k] || k)}</label><textarea class="input" name="${k}" rows="3">${esc(v)}</textarea></div>`).join('')}
        <div class="actions"><button class="btn y">Enregistrer les modèles</button></div></form>`;
      $('#tf').onsubmit = async (e) => { e.preventDefault(); try { await PUT('/api/admin/settings/templates', formData(e.target)); toast('Modèles enregistrés'); } catch (er) { fail(er); } };
    } else {
      box.innerHTML = `<form class="card" id="af" style="max-width:760px">
        <label class="switch" style="margin-bottom:18px"><input type="checkbox" name="actif" ${a.actif ? 'checked' : ''}> <b>Automatisation active</b> (interrupteur général)</label>
        <div class="grid g3" style="gap:0 12px"><div class="field"><label>Heure de début</label><input class="input" type="number" name="heure_debut" min="0" max="23" value="${a.heure_debut}"></div><div class="field"><label>Heure de fin</label><input class="input" type="number" name="heure_fin" min="1" max="24" value="${a.heure_fin}"></div><div class="field"><label>Messages max / personne / 24 h</label><input class="input" type="number" name="max_par_jour" min="1" value="${a.max_par_jour}"></div></div>
        <div class="field"><label>Inscription non terminée : relances après (heures d'inactivité)</label><input class="input" name="relances_incompletes_heures" value="${a.relances_incompletes_heures.join(', ')}"><span class="help">Ex. : 1, 24, 72 = une heure, un jour, trois jours après la dernière activité</span></div>
        <div class="field"><label>Paiement en attente : relances après l'inscription (heures)</label><input class="input" name="relances_paiement_heures" value="${a.relances_paiement_heures.join(', ')}"><span class="help">Un dernier rappel part aussi automatiquement 7 jours avant la formation.</span></div>
        <div class="field"><label>Rappels avant la formation (jours avant)</label><input class="input" name="rappels_session_jours" value="${a.rappels_session_jours.join(', ')}"></div>
        <div class="field"><label>Alerte interne si une demande entreprise n'est pas traitée après (heures)</label><input class="input" type="number" name="b2b_relance_heures" value="${a.b2b_relance_heures}"></div>
        <div class="notice"><i class="fa-solid fa-route"></i><div><b>Parcours automatique :</b> inscription non terminée → relances espacées · inscription terminée → confirmation immédiate · paiement en attente → relances puis rappel J-7 · avant la formation → rappels J-3 et J-1 · après la formation → certificat puis demande d'avis.</div></div>
        <div class="actions"><button class="btn y">Enregistrer</button></div></form>`;
      $('#af').onsubmit = async (e) => { e.preventDefault(); const f = formData(e.target); f.actif = e.target.actif.checked; try { await PUT('/api/admin/settings/automation', f); toast('Règles enregistrées'); route(); } catch (er) { fail(er); } };
    }
  };

  // ================================================ assistante IA
  VIEWS.assistant = async (main) => {
    const x = await GET('/api/admin/conversations');
    const a = x.assistant;
    main.innerHTML = `<div class="topbar"><div><h1>Assistante IA · ${esc(a.nom)}</h1><div class="muted">Elle répond aux visiteurs 24 h/24 sur le site et dans l'espace apprenant.</div></div><div class="sp"></div>${pill(x.ia ? 'IA Claude connectée' : 'Mode simple (sans IA)', x.ia ? 'vert' : 'jaune')}</div>
      <div class="grid g-2-1"><div class="card pad0"><div class="card-head" style="padding:18px 18px 0"><h2>Conversations (${x.conversations.length})</h2></div>
        <div class="table-wrap"><table><tbody>${x.conversations.map((c) => `<tr class="click" data-c="${c.id}"><td><div class="name">${c.prenom ? esc(c.prenom + ' ' + (c.nom || '')) : 'Visiteur anonyme'}</div><div class="sub">${esc((c.premier || '').slice(0, 90))}</div></td><td class="sub">${c.nb_messages} msg</td><td class="sub">${ago(c.updated_at)}</td></tr>`).join('') || '<tr><td class="empty">Aucune conversation pour l\'instant.</td></tr>'}</tbody></table></div></div>
      <form class="card" id="af"><h2>Personnalité et connaissances</h2>
        <div class="field"><label>Prénom de l'assistante</label><input class="input" name="nom" value="${esc(a.nom)}"></div>
        <div class="field"><label>Message d'accueil</label><textarea class="input" name="accueil">${esc(a.accueil)}</textarea></div>
        <div class="field"><label>Base de connaissance complémentaire</label><textarea class="input" name="base_connaissance" rows="8" placeholder="Adresse exacte des bureaux, horaires d'ouverture, moyens de paiement acceptés, politique de remboursement, partenaires...">${esc(a.base_connaissance)}</textarea><span class="help">Le catalogue, les dates, les prix et la FAQ sont déjà connus automatiquement.</span></div>
        <button class="btn y">Enregistrer</button></form></div>`;
    $$('[data-c]', main).forEach((r) => r.onclick = async () => {
      const m = await GET('/api/admin/conversations/' + r.dataset.c);
      modal(`<h2>Conversation</h2><div class="chat-log" style="max-height:60vh">${m.messages.map((x) => `<div class="m ${x.role}">${esc(x.content)}<div class="small" style="opacity:.6;margin-top:3px">${dt(x.created_at)}</div></div>`).join('')}</div><div class="actions"><button class="btn ghost" data-close>Fermer</button></div>`, { lg: true });
    });
    $('#af').onsubmit = async (e) => { e.preventDefault(); try { await PUT('/api/admin/settings/assistant', formData(e.target)); toast('Assistante mise à jour'); } catch (er) { fail(er); } };
  };

  // ================================================ promo et parrainage
  VIEWS.promo = async (main) => {
    const x = await GET('/api/admin/promo');
    const p = x.parrainage;
    main.innerHTML = `<div class="topbar"><h1>Codes promo & parrainage</h1></div>
      <div class="grid g-2-1"><div class="grid" style="align-content:start">
        <div class="card pad0"><div class="card-head" style="padding:18px 18px 0"><h2>Codes promo</h2></div><div class="table-wrap"><table><thead><tr><th>Code</th><th>Remise</th><th>Utilisations</th><th>Expire</th><th>Actif</th><th></th></tr></thead><tbody>
          ${x.codes.map((c) => `<tr><td><b>${esc(c.code)}</b><div class="sub">${esc(c.note || '')}</div></td><td>${c.remise_pct} %</td><td>${c.utilisations}${c.max_utilisations ? ' / ' + c.max_utilisations : ''}</td><td>${c.expire_le ? d(c.expire_le) : '—'}</td><td><label class="switch"><input type="checkbox" data-act="${c.code}" ${c.actif ? 'checked' : ''}></label></td><td><button class="btn ghost sm" data-del="${c.code}">✕</button></td></tr>`).join('') || '<tr><td colspan="6" class="empty">Aucun code.</td></tr>'}
        </tbody></table></div>
        <form id="cf" style="display:flex;gap:8px;flex-wrap:wrap;padding:14px 18px;border-top:1px solid var(--ligne)"><input class="input" name="code" placeholder="CODE" style="width:130px;text-transform:uppercase" required><input class="input" name="remise_pct" type="number" placeholder="% remise" style="width:100px" required><input class="input" name="max_utilisations" type="number" placeholder="Max (facultatif)" style="width:140px"><input class="input" name="expire_le" type="date" style="width:160px"><input class="input" name="note" placeholder="Note (ex. : campagne TikTok)" style="flex:1;min-width:160px"><button class="btn y">Créer</button></form></div>
        <div class="card pad0"><div class="card-head" style="padding:18px 18px 0"><h2>Meilleurs parrains</h2></div><div class="table-wrap"><table><thead><tr><th>Parrain</th><th>Code</th><th>Filleuls</th><th>Inscrits</th></tr></thead><tbody>${x.parrains.map((r) => `<tr class="click" data-lead="${r.id}"><td class="name">${esc(r.prenom)} ${esc(r.nom || '')}</td><td>${esc(r.code_parrain)}</td><td>${r.filleuls}</td><td><b>${r.inscrits}</b></td></tr>`).join('') || '<tr><td colspan="4" class="empty">Pas encore de parrainage.</td></tr>'}</tbody></table></div></div>
      </div>
      <form class="card" id="pf" style="align-self:start"><h2>Programme de parrainage</h2>
        <label class="switch" style="margin-bottom:14px"><input type="checkbox" name="actif" ${p.actif ? 'checked' : ''}> Parrainage actif</label>
        <div class="field"><label>Remise pour le filleul (%)</label><input class="input" type="number" name="remise_filleul_pct" value="${p.remise_filleul_pct}"></div>
        <div class="field"><label>Récompense du parrain (texte affiché)</label><textarea class="input" name="recompense">${esc(p.recompense)}</textarea></div>
        <button class="btn y">Enregistrer</button></form></div>`;
    $('#cf').onsubmit = async (e) => { e.preventDefault(); try { await POST('/api/admin/promo', formData(e.target)); toast('Code créé'); route(); } catch (er) { fail(er); } };
    $$('[data-act]').forEach((c) => c.onchange = () => PATCH('/api/admin/promo/' + c.dataset.act, { actif: c.checked }).catch(fail));
    $$('[data-del]').forEach((b) => b.onclick = async () => { if (await confirmBox(`Supprimer le code ${b.dataset.del} ?`, 'Supprimer')) { await DEL('/api/admin/promo/' + b.dataset.del); route(); } });
    $$('[data-lead]').forEach((r) => r.onclick = () => openLead(r.dataset.lead));
    $('#pf').onsubmit = async (e) => { e.preventDefault(); const f = formData(e.target); f.actif = e.target.actif.checked; f.remise_filleul_pct = Number(f.remise_filleul_pct); try { await PUT('/api/admin/settings/parrainage', f); toast('Enregistré'); } catch (er) { fail(er); } };
  };

  // ================================================ reglages
  VIEWS.reglages = async (main) => {
    const s = await GET('/api/admin/settings');
    const tab = sessionStorage.getItem('reg_tab') || 'ecole';
    const tabs = [['ecole', 'École'], ['tarifs', 'Tarifs & certificats'], ['integrations', 'Intégrations'], ['equipe', 'Équipe'], ['compte', 'Mon compte'], ['audit', 'Journal d\'audit']].filter(([k]) => k !== 'equipe' || me.acces.includes('equipe'));
    main.innerHTML = `<div class="topbar"><h1>Réglages</h1></div><div class="tabs">${tabs.map(([k, t]) => `<button data-tab="${k}" class="${k === tab ? 'on' : ''}">${t}</button>`).join('')}</div><div id="tab"></div>`;
    $$('[data-tab]', main).forEach((b) => b.onclick = () => { sessionStorage.setItem('reg_tab', b.dataset.tab); route(); });
    const box = $('#tab');
    const fld = (name, label, val, type = 'text', help = '') => `<div class="field"><label>${label}</label><input class="input" name="${name}" type="${type}" value="${esc(val ?? '')}">${help ? `<span class="help">${help}</span>` : ''}</div>`;
    const save = (key, transform = (x) => x) => async (e) => { e.preventDefault(); try { await PUT('/api/admin/settings/' + key, transform(formData(e.target), e.target)); toast('Réglages enregistrés'); route(); } catch (er) { fail(er); } };

    if (tab === 'ecole') {
      const e = s.ecole;
      box.innerHTML = `<form class="card" id="f" style="max-width:820px"><div class="grid g2" style="gap:0 14px">
        ${fld('nom', 'Nom', e.nom)}${fld('sigle', 'Sigle', e.sigle)}${fld('baseline', 'Signature', e.baseline)}${fld('slogan', 'Slogan', e.slogan)}
        ${fld('telephone1', 'Téléphone 1', e.telephone1)}${fld('telephone2', 'Téléphone 2', e.telephone2)}${fld('whatsapp', 'WhatsApp (format international)', e.whatsapp)}${fld('email', 'Email', e.email, 'email')}
        ${fld('site', 'Site web', e.site)}${fld('adresse', 'Adresse des bureaux', e.adresse)}${fld('societe', 'Société porteuse', e.societe)}${fld('diplomes', 'Nombre de diplômés affiché', e.diplomes, 'number')}
        ${fld('facebook', 'Facebook', e.reseaux.facebook)}${fld('tiktok', 'TikTok', e.reseaux.tiktok)}${fld('instagram', 'Instagram', e.reseaux.instagram)}</div>
        <div class="field"><label>Accroche</label><textarea class="input" name="accroche">${esc(e.accroche)}</textarea></div><button class="btn y">Enregistrer</button></form>`;
      $('#f').onsubmit = save('ecole', (f) => { const { facebook, tiktok, instagram, ...rest } = f; return { ...rest, diplomes: Number(rest.diplomes), reseaux: { facebook, tiktok, instagram } }; });
    } else if (tab === 'tarifs') {
      box.innerHTML = `<div class="grid g2"><form class="card" id="t"><h2>Tarifs</h2>${fld('devise', 'Devise', s.tarifs.devise)}${fld('mention', 'Mention (HT / TTC)', s.tarifs.mention)}${fld('tva', 'TVA (%)', s.tarifs.tva, 'number')}${fld('acompte_pct', 'Acompte proposé (%)', s.tarifs.acompte_pct, 'number')}<button class="btn y">Enregistrer</button></form>
        <form class="card" id="c"><h2>Certificats</h2>${fld('seuil_presence_pct', 'Présence minimale pour le certificat (%)', s.certificats.seuil_presence_pct, 'number')}${fld('signataire', 'Signataire', s.certificats.signataire)}${fld('signataire_titre', 'Titre du signataire', s.certificats.signataire_titre)}<button class="btn y">Enregistrer</button></form></div>`;
      $('#t').onsubmit = save('tarifs', (f) => ({ ...f, tva: Number(f.tva), acompte_pct: Number(f.acompte_pct) }));
      $('#c').onsubmit = save('certificats', (f) => ({ ...f, seuil_presence_pct: Number(f.seuil_presence_pct) }));
    } else if (tab === 'integrations') {
      const i = s.integrations;
      box.innerHTML = `<form id="f" class="grid g2">
        <div class="card"><h2><i class="fa-solid fa-wand-magic-sparkles" style="color:var(--jaune-fonce)"></i> Intelligence artificielle (Claude)</h2><p class="small muted">Active l'assistante intelligente, l'analyse des dossiers et la rédaction des propositions. Clé à créer sur console.anthropic.com.</p>
          <label class="switch small" style="margin-bottom:10px"><input type="checkbox" name="ai_actif" ${i.ai_actif !== false ? 'checked' : ''}> IA activée</label>${fld('anthropic_key', 'Clé API Anthropic', i.anthropic_key, 'password')}${fld('ai_model', 'Modèle', i.ai_model, 'text', 'Par défaut : claude-opus-5-5')}</div>
        <div class="card"><h2><i class="fa-brands fa-whatsapp" style="color:#25D366"></i> WhatsApp Business (API Cloud de Meta)</h2><p class="small muted">Sans ces informations, les messages sont simulés et visibles dans le journal.</p>${fld('whatsapp_token', 'Jeton d\'accès permanent', i.whatsapp_token, 'password')}${fld('whatsapp_phone_id', 'Identifiant du numéro (Phone number ID)', i.whatsapp_phone_id)}</div>
        <div class="card"><h2><i class="fa-solid fa-envelope"></i> Email</h2><div class="field"><label>Fournisseur</label><select class="input" name="email_provider"><option value="brevo" ${i.email_provider === 'brevo' ? 'selected' : ''}>Brevo</option><option value="resend" ${i.email_provider === 'resend' ? 'selected' : ''}>Resend</option></select></div>${fld('email_key', 'Clé API', i.email_key, 'password')}${fld('email_from', 'Adresse d\'expédition', i.email_from, 'email')}${fld('email_from_nom', 'Nom d\'expéditeur', i.email_from_nom)}</div>
        <div class="card"><h2><i class="fa-solid fa-mobile-screen"></i> Paiement en ligne</h2><p class="small muted">Lien de votre page de paiement (agrégateur mobile money / carte). La référence MBS-&lt;dossier&gt; y est ajoutée automatiquement.</p>${fld('paiement_url', 'Lien de paiement', i.paiement_url, 'url')}${fld('webhook_secret', 'Secret du webhook', i.webhook_secret, 'password', 'Adresse à donner à l\'agrégateur : ' + location.origin + '/api/webhooks/paiement?secret=VOTRE_SECRET')}</div>
        <div class="card"><h2><i class="fa-solid fa-chart-simple"></i> Mesure d'audience</h2><p class="small muted">Tant que ces champs sont vides, aucun script extérieur n'est chargé.</p>${fld('meta_pixel', 'Pixel Meta (Facebook)', i.meta_pixel)}${fld('ga_id', 'Google Analytics (G-XXXX)', i.ga_id)}</div>
        <div class="card"><h2><i class="fa-solid fa-globe"></i> Adresse publique</h2>${fld('url_publique', 'Adresse du site', i.url_publique, 'url', 'Utilisée dans les liens envoyés (reprise, espace, certificat)')}
          <h3 style="margin-top:16px">Tester un canal</h3><div style="display:flex;gap:6px"><select class="input" id="tc" style="width:120px"><option value="whatsapp">WhatsApp</option><option value="email">Email</option></select><input class="input" id="tt" placeholder="Numéro ou email"><button type="button" class="btn ghost" id="test">Tester</button></div></div>
        <div style="grid-column:1/-1"><button class="btn y">Enregistrer les intégrations</button></div></form>`;
      $('#f').onsubmit = save('integrations', (f, form) => ({ ...f, ai_actif: form.ai_actif.checked }));
      $('#test').onclick = async () => { try { const r = await POST('/api/admin/test-message', { canal: $('#tc').value, to: $('#tt').value }); toast(r.message.statut === 'envoye' ? 'Message de test envoyé ✅' : r.message.statut === 'simule' ? 'Simulé : canal non configuré' : 'Échec : ' + r.message.erreur, r.message.statut === 'echec'); } catch (e) { fail(e); } };
    } else if (tab === 'equipe') {
      const u = await GET('/api/admin/users');
      box.innerHTML = `<div class="grid g-2-1"><div class="card pad0"><div class="table-wrap"><table><thead><tr><th>Membre</th><th>Rôle</th><th>Dernière connexion</th><th>Actif</th></tr></thead><tbody>${u.users.map((x) => `<tr><td><div class="name">${esc(x.nom)}</div><div class="sub">${esc(x.email)}</div></td><td>${x.id === me.user.id ? esc(L.role[x.role]) : `<select class="input" data-role="${x.id}" style="width:auto">${Object.entries(L.role).map(([k, v]) => `<option value="${k}" ${k === x.role ? 'selected' : ''}>${v}</option>`).join('')}</select>`}</td><td class="sub">${ago(x.last_login)}</td><td>${x.id === me.user.id ? '' : `<label class="switch"><input type="checkbox" data-actif="${x.id}" ${x.actif ? 'checked' : ''}></label>`}</td></tr>`).join('')}</tbody></table></div></div>
        <form class="card" id="nf"><h2>Ajouter un membre</h2>${fld('nom', 'Nom', '')}${fld('email', 'Email', '', 'email')}<div class="field"><label>Rôle</label><select class="input" name="role"><option value="commercial">Commercial (inscrits, entreprises, relances)</option><option value="formateur">Formateur (présences)</option><option value="admin">Administrateur (tout)</option></select></div>${fld('password', 'Mot de passe provisoire', '', 'text', '8 caractères minimum')}<button class="btn y">Ajouter</button></form></div>`;
      $('#nf').onsubmit = async (e) => { e.preventDefault(); try { await POST('/api/admin/users', formData(e.target)); toast('Membre ajouté'); route(); } catch (er) { fail(er); } };
      $$('[data-role]').forEach((x) => x.onchange = () => PATCH('/api/admin/users/' + x.dataset.role, { role: x.value }).then(() => toast('Rôle modifié')).catch(fail));
      $$('[data-actif]').forEach((x) => x.onchange = () => PATCH('/api/admin/users/' + x.dataset.actif, { actif: x.checked }).then(() => toast('Enregistré')).catch(fail));
    } else if (tab === 'compte') {
      box.innerHTML = `<form class="card" id="f" style="max-width:480px"><h2>Mon compte</h2>${fld('nom', 'Nom', me.user.nom)}${fld('ancien', 'Mot de passe actuel', '', 'password')}${fld('password', 'Nouveau mot de passe', '', 'password', 'Laisser vide pour ne pas changer')}<button class="btn y">Enregistrer</button></form>`;
      $('#f').onsubmit = async (e) => { e.preventDefault(); const f = formData(e.target); if (!f.password) { delete f.password; delete f.ancien; } try { await PATCH('/api/admin/users/' + me.user.id, f); toast('Compte mis à jour'); if (f.password) boot(); } catch (er) { fail(er); } };
    } else {
      const a = await GET('/api/admin/audit');
      box.innerHTML = `<div class="card pad0"><div class="table-wrap"><table><thead><tr><th>Quand</th><th>Qui</th><th>Action</th><th>Détail</th></tr></thead><tbody>${a.audit.map((x) => `<tr><td class="sub">${dt(x.created_at)}</td><td>${esc(x.nom || 'système')}</td><td>${esc(x.action.replace(/_/g, ' '))}</td><td class="small muted">${esc(x.detail ? JSON.stringify(x.detail).slice(0, 120) : '')}</td></tr>`).join('')}</tbody></table></div></div>`;
    }
  };

  boot();
})();
