// Tunnel d'inscription : une question par ecran, chaque etape enregistree sur le serveur.
// Le serveur est la source de verite ; on reprend toujours la ou la personne s'est arretee.
(() => {
  const app = document.getElementById('app');
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const money = (n, d = '$') => `${Number(n || 0).toLocaleString('fr-FR', { maximumFractionDigits: 2 })} ${d}`;
  const params = new URLSearchParams(location.search);
  const TOTAL = 13;

  let cat = null;       // catalogue
  let lead = null;      // dossier courant (serveur)
  let current = 1;
  let chosenSession = params.get('session') || null;
  let pendingPhone = '';

  async function api(path, body) {
    const r = await fetch(path, body ? { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) } : {});
    let data = {};
    try { data = await r.json(); } catch {}
    return { ok: r.ok, status: r.status, data };
  }

  // ------------------------------------------------ cadre
  app.innerHTML = `<div class="funnel">
    <div class="funnel-top"><div class="wrap"><a href="/" aria-label="Accueil"><img src="/img/logo-light-bg.png" alt="Modern Business School"></a><span class="count" id="count"></span></div><div class="funnel-bar" role="progressbar" aria-valuemin="1" aria-valuemax="${TOTAL}" id="bar"><span></span></div></div>
    <div class="funnel-body"><div id="stage" style="width:100%;display:flex;justify-content:center"></div></div>
    <div class="saved" id="saved"><i class="fa-solid fa-check"></i> Étape enregistrée</div>
  </div>`;
  const stage = document.getElementById('stage');
  const flash = () => { const s = document.getElementById('saved'); s.classList.add('show'); setTimeout(() => s.classList.remove('show'), 1500); };

  function progress() {
    const n = Math.min(current, TOTAL);
    document.querySelector('#bar span').style.width = current > TOTAL ? '100%' : `${((n - 1) / TOTAL) * 100}%`;
    document.getElementById('bar').setAttribute('aria-valuenow', String(n));
    document.getElementById('count').textContent = current > TOTAL ? 'Inscription validée' : `Étape ${n} sur ${TOTAL}`;
  }

  function sessionById(id) { return cat.sessions.find((s) => s.id === id); }
  const sel = () => (lead?.session ? sessionById(lead.session.id) || lead.session : sessionById(chosenSession));

  function screen(html, { onSubmit, focus = true } = {}) {
    stage.innerHTML = `<form class="step" novalidate>${html}</form>`;
    const form = stage.querySelector('form');
    progress();
    if (onSubmit) form.addEventListener('submit', (e) => { e.preventDefault(); onSubmit(form); });
    const f = form.querySelector('input:not([type=hidden]), textarea');
    if (focus && f && matchMedia('(pointer: fine)').matches) setTimeout(() => f.focus(), 200);
    form.querySelector('[data-back]')?.addEventListener('click', () => go(Math.max(1, current - 1)));
    scrollTo({ top: 0, behavior: 'smooth' });
    return form;
  }
  const errorBox = '<p class="error-msg" role="alert" data-err></p>';
  const setErr = (form, msg) => { const e = form.querySelector('[data-err]'); if (e) e.textContent = msg || ''; };
  const busy = (form, on) => form.querySelectorAll('button').forEach((b) => (b.disabled = on));
  const back = () => '<button type="button" class="back" data-back><i class="fa-solid fa-arrow-left"></i> Retour</button>';
  const enter = '<span class="hint">ou appuyez sur Entrée ↵</span>';

  async function save(form, step, data, next) {
    setErr(form, '');
    busy(form, true);
    const r = await api('/api/inscription/step', { step, data });
    busy(form, false);
    if (r.status === 401) { setErr(form, r.data.error); setTimeout(() => go(2), 1200); return false; }
    if (!r.ok) { setErr(form, r.data.error || 'Un problème est survenu. Réessayez.'); return false; }
    lead = r.data.lead;
    flash();
    if (r.data.completed) {
      if (window.fbq) fbq('track', 'CompleteRegistration', { value: lead.du, currency: 'USD' });
      try { localStorage.removeItem('mbs_origine'); } catch {}
    }
    go(next ?? step + 1);
    return true;
  }

  // choix multiples : boutons A, B, C... avec raccourcis clavier
  function choices(field, opts, step, extraHtml = '', extraData = () => ({})) {
    const val = lead?.[field];
    return {
      html: `${extraHtml}<div class="options">${opts.map(([v, t, d], k) => `<button type="button" class="option ${val === v ? 'selected' : ''}" data-v="${v}"><span class="key">${'ABCDEFGH'[k]}</span><span>${t}${d ? `<small>${d}</small>` : ''}</span></button>`).join('')}</div>${errorBox}<div class="row">${back()}</div>`,
      bind(form) {
        const pickV = async (btn) => {
          form.querySelectorAll('.option').forEach((b) => b.classList.toggle('selected', b === btn));
          await save(form, step, { [field]: btn.dataset.v, ...extraData(form) });
        };
        form.querySelectorAll('.option').forEach((b) => b.addEventListener('click', () => pickV(b)));
        keyHandler = (e) => {
          if (e.target.tagName === 'TEXTAREA' || e.target.tagName === 'INPUT') return;
          const k = 'abcdefgh'.indexOf(e.key.toLowerCase());
          const btns = form.querySelectorAll('.option');
          if (k >= 0 && btns[k]) pickV(btns[k]);
        };
      },
    };
  }
  let keyHandler = null;
  document.addEventListener('keydown', (e) => keyHandler?.(e));

  // ------------------------------------------------ etapes
  const STEPS = {
    1() {
      const s = sessionById(chosenSession);
      const list = cat.sessions;
      if (!list.length) {
        return screen(`<div class="kicker">Modern Business School</div><h1>Les inscriptions ouvrent bientôt</h1><p class="sub">Aucune session n'est programmée pour le moment. Écrivez-nous sur WhatsApp pour être prévenu en priorité.</p><a class="btn" href="https://wa.me/${cat.ecole.whatsapp.replace(/\D/g, '')}"><i class="fa-brands fa-whatsapp"></i> Me prévenir</a>`);
      }
      const form = screen(`
        <div class="kicker">Bienvenue chez Modern Business School</div>
        <h1>${s ? 'Votre formation' : 'Quelle formation vous intéresse ?'}</h1>
        <p class="sub">Inscription gratuite en deux minutes. Chaque étape est enregistrée : si vous êtes interrompu, vous reprendrez exactement où vous étiez.</p>
        <div class="session-pick">${list.map((x) => `<button type="button" class="session-opt ${x.id === chosenSession ? 'selected' : ''}" data-id="${x.id}" ${x.complet ? 'disabled' : ''}>
          <img src="${esc(x.formation_image)}" alt="">
          <span><b>${esc(x.formation_titre)}</b><small>${esc(x.dates)} · ${esc(x.horaire || '')}</small><br><small style="color:${x.tension ? '#C46A00' : 'var(--vert)'};font-weight:600">${x.complet ? 'Complet' : `${x.restantes} places restantes`}</small></span>
          <span class="p">${money(x.prix_actuel, cat.tarifs.devise)}<br><small>${esc(cat.tarifs.mention)}</small></span></button>`).join('')}</div>
        ${errorBox}
        <div class="row"><button class="btn" type="submit">Commencer <i class="fa-solid fa-arrow-right"></i></button>${enter}</div>
        <p class="hint" style="margin-top:22px">Déjà commencé ? <a href="#" data-resume>Reprendre mon inscription</a></p>`, {
        onSubmit: async (f) => {
          if (!chosenSession) return setErr(f, 'Choisissez une session pour continuer.');
          if (lead) { const r = await api('/api/inscription/session', { session_id: chosenSession }); if (!r.ok) return setErr(f, r.data.error); lead = r.data.lead; go(nextStep()); }
          else go(2);
        },
      });
      form.querySelectorAll('.session-opt').forEach((b) => b.addEventListener('click', () => {
        chosenSession = b.dataset.id;
        form.querySelectorAll('.session-opt').forEach((x) => x.classList.toggle('selected', x === b));
        setErr(form, '');
      }));
      form.querySelector('[data-resume]').addEventListener('click', (e) => { e.preventDefault(); go(2, { resume: true }); });
    },

    2(opts = {}) {
      screen(`
        <div class="kicker">${opts.resume ? 'Reprendre mon inscription' : 'Étape 2 · Contact'}</div>
        <h1>Votre numéro WhatsApp</h1>
        <p class="sub">${opts.resume ? 'Saisissez le numéro utilisé lors de votre inscription.' : 'C\'est là que nous vous enverrons la confirmation, les rappels et les informations pratiques.'}</p>
        <input class="input big-input" type="tel" name="whatsapp" inputmode="tel" autocomplete="tel" placeholder="+243 899 000 000" value="${esc(pendingPhone || lead?.whatsapp || '')}">
        ${errorBox}
        <div class="row">${opts.resume ? '' : back()}<button class="btn" type="submit">Continuer</button>${enter}</div>
        <p class="hint" style="margin-top:18px"><i class="fa-solid fa-lock"></i> Votre numéro reste confidentiel. Vous pouvez vous désinscrire des messages à tout moment.</p>`, {
        onSubmit: async (f) => {
          pendingPhone = f.whatsapp.value.trim();
          if (pendingPhone.replace(/\D/g, '').length < 9) return setErr(f, 'Indiquez votre numéro complet.');
          busy(f, true);
          let origine = null;
          try { origine = JSON.parse(localStorage.getItem('mbs_origine')); } catch {}
          const r = await api('/api/inscription/start', { whatsapp: pendingPhone, session_id: chosenSession, utm: origine?.utm, ref: origine?.ref, referrer: origine?.referrer });
          busy(f, false);
          if (!r.ok) return setErr(f, r.data.error);
          if (r.data.needLogin) return loginScreen(r.data.prenom);
          lead = r.data.lead;
          if (window.fbq) fbq('track', 'Lead');
          go(nextStep());
        },
      });
    },

    3() {
      screen(`<div class="kicker">Étape 3 · Contact</div><h1>Votre adresse email</h1><p class="sub">Pour recevoir votre récapitulatif, votre facture et votre certificat.</p>
        <input class="input big-input" type="email" name="email" autocomplete="email" placeholder="votre@email.com" value="${esc(lead?.email || '')}">
        ${errorBox}<div class="row">${back()}<button class="btn" type="submit">Valider</button><button class="btn ghost small" type="button" data-skip style="color:var(--bleu)">Je n'en ai pas</button></div>`, {
        onSubmit: (f) => save(f, 3, { email: f.email.value.trim() }),
      }).querySelector('[data-skip]').addEventListener('click', (e) => save(e.target.form, 3, { email: '' }));
    },

    4() {
      if (lead?.hasPassword) return go(5);
      const f = screen(`<div class="kicker">Étape 4 · Sécurité</div><h1>Protégez votre dossier</h1><p class="sub">Choisissez un mot de passe : il vous servira à reprendre votre inscription et à accéder à votre espace apprenant.</p>
        <div style="position:relative"><input class="input big-input" type="password" name="password" autocomplete="new-password" placeholder="6 caractères minimum" minlength="6"><button type="button" class="back" data-toggle style="position:absolute;right:10px;top:50%;transform:translateY(-50%)">voir</button></div>
        ${errorBox}<div class="row">${back()}<button class="btn" type="submit">Sécuriser mon inscription</button></div>`, {
        onSubmit: (form) => {
          if (form.password.value.length < 6) return setErr(form, 'Choisissez au moins 6 caractères.');
          save(form, 4, { password: form.password.value });
        },
      });
      f.querySelector('[data-toggle]').addEventListener('click', (e) => { const i = f.password; i.type = i.type === 'password' ? 'text' : 'password'; e.target.textContent = i.type === 'password' ? 'voir' : 'masquer'; });
    },

    5() {
      screen(`<div class="kicker">Étape 5 · Identité</div><h1>Comment vous appelez-vous ?</h1><p class="sub">Tel que vous souhaitez le voir écrit sur votre certificat.</p>
        <div class="grid g2" style="gap:12px"><input class="input big-input" name="prenom" autocomplete="given-name" placeholder="Prénom" value="${esc(lead?.prenom || '')}"><input class="input big-input" name="nom" autocomplete="family-name" placeholder="Nom" value="${esc(lead?.nom || '')}"></div>
        ${errorBox}<div class="row">${back()}<button class="btn" type="submit">Continuer</button>${enter}</div>`, {
        onSubmit: (f) => save(f, 5, { prenom: f.prenom.value, nom: f.nom.value }),
      });
    },

    6() {
      const c = choices('profil', [['etudiant', 'Étudiant(e)'], ['salarie', 'Salarié(e)'], ['entrepreneur', 'Entrepreneur(e) / commerçant(e)'], ['freelance', 'Freelance / créateur(trice)'], ['recherche', 'En recherche d\'emploi']], 6);
      c.bind(screen(`<div class="kicker">Étape 6 · Profil</div><h1>Enchanté(e) ${esc(lead?.prenom || '')} ! Quelle est votre situation ?</h1><p class="sub">Pour adapter les exemples et les exercices à votre réalité.</p>${c.html}`));
    },

    7() {
      const c = choices('niveau', [['debutant', 'Je débute', 'Je veux des bases solides'], ['intermediaire', 'Je me débrouille', 'J\'utilise déjà quelques outils'], ['avance', 'Je suis à l\'aise', 'Je veux aller plus loin']], 7);
      c.bind(screen(`<div class="kicker">Étape 7 · Niveau</div><h1>Votre aisance avec le numérique ?</h1><p class="sub">Aucune mauvaise réponse : nos formateurs s'adaptent à chacun.</p>${c.html}`));
    },

    8() {
      const c = choices('objectif', [['emploi', 'Trouver un emploi'], ['carriere', 'Évoluer dans mon poste'], ['business', 'Développer mon business'], ['freelance', 'Lancer une activité freelance'], ['curiosite', 'Me former par curiosité']], 8,
        `<textarea class="input" name="motivation" placeholder="En une phrase, ce que vous aimeriez savoir faire après la formation (facultatif)" style="min-height:80px;margin-bottom:14px">${esc(lead?.motivation || '')}</textarea>`,
        (form) => ({ motivation: form.motivation.value }));
      c.bind(screen(`<div class="kicker">Étape 8 · Objectif</div><h1>Qu'attendez-vous de cette formation ?</h1>${c.html}`, { focus: false }));
    },

    9() {
      const c = choices('financement', [['moi', 'Moi-même'], ['employeur', 'Mon employeur', 'Nous pouvons établir une facture à son nom'], ['famille', 'Ma famille'], ['cherche', 'Je cherche encore un financement']], 9);
      c.bind(screen(`<div class="kicker">Étape 9 · Financement</div><h1>Qui finance votre formation ?</h1>${c.html}`));
    },

    10() {
      const s = sel();
      const c = choices('disponible', [['oui', 'Oui, je suis disponible', 'Les dates sont notées dans mon agenda'], ['non_sur', 'Je ne suis pas encore sûr(e)', 'Gardez-moi la place, je confirme dès que possible']], 10);
      c.bind(screen(`<div class="kicker">Étape 10 · Disponibilité</div><h1>Êtes-vous disponible ${s ? `du ${esc(s.dates)}` : 'aux dates prévues'} ?</h1><p class="sub">${s?.horaire ? `Horaire : ${esc(s.horaire)}.` : ''} ${s?.lieu ? esc(s.lieu) + '.' : ''}</p>${c.html}`));
    },

    11() {
      const s = sel();
      const prix = s?.prix_actuel ?? s?.prix ?? 0;
      const remise = lead?.remise_pct || 0;
      const total = Math.round(prix * (1 - remise / 100) * 100) / 100;
      const ac = Math.round(total * (cat.tarifs.acompte_pct / 100));
      const c = choices('paiement_quand', [
        ['aujourdhui', 'Je paie tout aujourd\'hui', `${money(total, cat.tarifs.devise)}, et je n'y pense plus`],
        ['acompte', `Je verse un acompte de ${cat.tarifs.acompte_pct} %`, `${money(ac, cat.tarifs.devise)} maintenant, le reste avant la formation`],
        ['avant', 'Je paie tout avant la formation', s ? `Avant le ${new Date(s.debut + 'T12:00:00').toLocaleDateString('fr-FR', { day: 'numeric', month: 'long' })}` : ''],
        ['indecis', 'Je ne peux pas encore dire', 'Un conseiller peut vous proposer une solution'],
      ], 11);
      c.bind(screen(`<div class="kicker">Étape 11 · Frais de formation</div><h1>Quand souhaitez-vous régler les frais ?</h1><p class="sub">L'inscription est gratuite. Frais de formation : <b>${money(total, cat.tarifs.devise)} ${esc(cat.tarifs.mention)}</b>${remise ? ` (remise de ${remise} % incluse)` : ''}.</p>${c.html}`));
    },

    12() {
      const c = choices('paiement_mode', [['en_ligne', 'En ligne', 'Mobile money (M-Pesa, Orange Money, Airtel Money) ou carte'], ['bureau', 'À nos bureaux', `${esc(cat.ecole.adresse)} · en espèces ou mobile money`]], 12);
      c.bind(screen(`<div class="kicker">Étape 12 · Paiement</div><h1>Comment préférez-vous payer ?</h1><p class="sub">Vous pourrez changer d'avis plus tard.</p>${c.html}`));
    },

    13() {
      let origine = null;
      try { origine = JSON.parse(localStorage.getItem('mbs_origine')); } catch {}
      const preCode = lead?.code_promo || origine?.ref || '';
      const opts = [['facebook', 'Facebook'], ['tiktok', 'TikTok'], ['instagram', 'Instagram'], ['whatsapp', 'WhatsApp'], ['ami', 'Un ami / bouche-à-oreille'], ['google', 'Google'], ['evenement', 'Un événement'], ['autre', 'Autre']];
      const f = screen(`<div class="kicker">Dernière étape</div><h1>Comment avez-vous connu MBS ?</h1>
        <div class="options" style="grid-template-columns:1fr 1fr">${opts.map(([v, t], k) => `<button type="button" class="option ${lead?.source === v ? 'selected' : ''}" data-v="${v}"><span class="key">${'ABCDEFGH'[k]}</span><span>${t}</span></button>`).join('')}</div>
        <div class="field" style="margin-top:22px"><label for="code">Code promo ou code de parrainage (facultatif)</label>
          <div style="display:flex;gap:8px"><input class="input" id="code" name="code" autocapitalize="characters" placeholder="Ex. : AMANI7KQ" value="${esc(preCode)}"><button type="button" class="btn bleu small" data-check>Appliquer</button></div>
          <span class="hint" data-code-msg></span></div>
        ${errorBox}<div class="row">${back()}<button class="btn" type="submit">Valider mon inscription <i class="fa-solid fa-check"></i></button></div>`, {
        focus: false,
        onSubmit: (form) => {
          const src = form.querySelector('.option.selected')?.dataset.v;
          if (!src) return setErr(form, 'Choisissez une réponse.');
          save(form, 13, { source: src, code: form.code.value.trim() }, 14);
        },
      });
      f.querySelectorAll('.option').forEach((b) => b.addEventListener('click', () => { f.querySelectorAll('.option').forEach((x) => x.classList.toggle('selected', x === b)); setErr(f, ''); }));
      const check = async () => {
        const msg = f.querySelector('[data-code-msg]');
        if (!f.code.value.trim()) { msg.textContent = ''; return; }
        const r = await api('/api/inscription/code', { code: f.code.value });
        msg.innerHTML = r.data.valid ? `<span class="success-msg"><i class="fa-solid fa-gift"></i> ${esc(r.data.label)}</span>` : `<span style="color:var(--rouge)">${esc(r.data.error || 'Code invalide')}</span>`;
      };
      f.querySelector('[data-check]').addEventListener('click', check);
      if (preCode) check();
    },

    14() {
      keyHandler = null;
      const s = lead.session || {};
      const online = lead.paiement_mode === 'en_ligne';
      const soldé = lead.solde;
      const shareText = encodeURIComponent(`Je me suis inscrit(e) à « ${s.formation} » chez Modern Business School ! Avec mon code ${lead.code_parrain} tu as ${cat.parrainage.remise_filleul_pct} % de remise : ${location.origin}/?ref=${lead.code_parrain}`);
      screen(`<div style="text-align:center"><div class="icon-badge" style="margin:0 auto 18px;width:72px;height:72px;font-size:2rem;background:var(--jaune)"><i class="fa-solid fa-graduation-cap"></i></div>
        <div class="kicker">Inscription validée</div><h1>Bravo ${esc(lead.prenom)}, votre place est réservée !</h1>
        <p class="sub">Une confirmation vient de partir sur votre WhatsApp${lead.email ? ' et par email' : ''}.</p></div>
        <div class="recap">
          <div class="r"><span>Formation</span><span>${esc(s.formation || '')}</span></div>
          <div class="r"><span>Dates</span><span>${esc(s.dates || '')}</span></div>
          <div class="r"><span>Horaire</span><span>${esc(s.horaire || '')}</span></div>
          <div class="r"><span>Lieu</span><span>${esc(s.lieu || '')}</span></div>
          <div class="r"><span>Frais</span><span>${money(lead.du, cat.tarifs.devise)} ${lead.remise_pct ? `(−${lead.remise_pct} %)` : ''}</span></div>
          <div class="r"><span>Reste à payer</span><span>${money(lead.reste, cat.tarifs.devise)}</span></div>
        </div>
        ${!soldé ? (online && cat.paiement_en_ligne
          ? `<a class="btn block" href="${esc(lead.lien_paiement)}" target="_blank" rel="noopener" data-track="clic_paiement"><i class="fa-solid fa-mobile-screen"></i> Payer ${lead.paiement_quand === 'acompte' ? 'mon acompte' : 'maintenant'} en ligne</a><p class="hint" style="text-align:center;margin-top:8px">Mobile money ou carte · moins d'une minute · référence MBS-${esc(lead.id)}</p>`
          : `<div class="recap" style="background:var(--bleu-pale);border:0"><b style="color:var(--bleu)"><i class="fa-solid fa-building"></i> Paiement à nos bureaux</b><p style="margin:6px 0 0;color:var(--gris)">Passez nous voir (${esc(cat.ecole.adresse)}) en donnant simplement votre nom : votre dossier est prêt. Une question ? WhatsApp ${esc(cat.ecole.telephone1)}.</p></div>`) : ''}
        ${cat.parrainage.actif ? `<div class="share-box"><b><i class="fa-solid fa-gift"></i> Venez à plusieurs !</b><br><span class="code">${esc(lead.code_parrain)}</span><p style="margin:0 0 12px">Vos amis ont ${cat.parrainage.remise_filleul_pct} % de remise avec ce code, et vous recevez ${esc(cat.parrainage.recompense)}.</p><a class="btn bleu small" href="https://wa.me/?text=${shareText}" target="_blank" rel="noopener"><i class="fa-brands fa-whatsapp"></i> Partager sur WhatsApp</a></div>` : ''}
        <div class="row" style="justify-content:center"><a class="btn ghost small" style="color:var(--bleu)" href="/api/espace/calendrier.ics"><i class="fa-solid fa-calendar-plus"></i> Ajouter à mon agenda</a><a class="btn bleu small" href="/espace"><i class="fa-solid fa-circle-user"></i> Mon espace apprenant</a></div>`);
      confetti();
    },
  };

  function loginScreen(prenom) {
    const f = screen(`<div class="kicker">Bon retour${prenom ? ' ' + esc(prenom) : ''} !</div><h1>Ce numéro a déjà un dossier protégé</h1><p class="sub">Saisissez votre mot de passe pour reprendre exactement où vous étiez.</p>
      <input class="input big-input" type="password" name="password" autocomplete="current-password" placeholder="Votre mot de passe">
      ${errorBox}<div class="row"><button class="btn" type="submit">Reprendre mon inscription</button><button type="button" class="back" data-other>Utiliser un autre numéro</button></div>
      <p class="hint" style="margin-top:18px">Mot de passe oublié ? <a href="https://wa.me/${cat.ecole.whatsapp.replace(/\D/g, '')}?text=${encodeURIComponent('Bonjour, j\'ai oublié le mot de passe de mon inscription MBS.')}">Écrivez-nous sur WhatsApp</a>, nous le réinitialisons.</p>`, {
      onSubmit: async (form) => {
        busy(form, true);
        const r = await api('/api/inscription/login', { whatsapp: pendingPhone, password: form.password.value });
        busy(form, false);
        if (!r.ok) return setErr(form, r.data.error);
        lead = r.data.lead;
        go(nextStep());
      },
    });
    f.querySelector('[data-other]').addEventListener('click', () => { pendingPhone = ''; go(2); });
  }

  function nextStep() {
    if (!lead) return chosenSession ? 2 : 1;
    if (lead.completed) return 14;
    if (!lead.session) return 1;
    return Math.min(Math.max((lead.step || 2) + 1, 3), TOTAL);
  }

  function go(n, opts) {
    keyHandler = null;
    current = n;
    history.replaceState(null, '', location.pathname + (chosenSession && !lead ? `?session=${chosenSession}` : ''));
    STEPS[n](opts);
  }

  function confetti() {
    if (matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    const c = document.createElement('div');
    c.className = 'confetti';
    const colors = ['#FFBF31', '#04195E', '#FFFFFF', '#E9A70F'];
    for (let i = 0; i < 90; i++) {
      const p = document.createElement('i');
      p.style.left = Math.random() * 100 + 'vw';
      p.style.background = colors[i % colors.length];
      p.style.animationDuration = 2 + Math.random() * 2.5 + 's';
      p.style.animationDelay = Math.random() * 0.6 + 's';
      c.appendChild(p);
    }
    document.body.appendChild(c);
    setTimeout(() => c.remove(), 5500);
  }

  // ------------------------------------------------ demarrage
  (async () => {
    const [c, me] = await Promise.all([api('/api/catalogue'), api('/api/inscription/me')]);
    cat = c.data;
    lead = me.data.lead;
    if (chosenSession && !sessionById(chosenSession)) chosenSession = null;
    if (lead?.session && !chosenSession) chosenSession = lead.session.id;
    if (lead && params.get('session') && !lead.completed && params.get('session') !== lead.session?.id) {
      const r = await api('/api/inscription/session', { session_id: params.get('session') });
      if (r.ok) lead = r.data.lead;
    }
    if (!lead && params.get('reprendre')) return go(2, { resume: true });
    if (!lead && chosenSession) {
      // session deja choisie depuis une page formation : on montre le choix pour confirmation
      return go(1);
    }
    go(nextStep());
  })();
})();
