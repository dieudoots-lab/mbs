// Espace apprenant : dossier, paiements, presences, certificats, parrainage.
(() => {
  const app = document.getElementById('app');
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const money = (n) => `${Number(n || 0).toLocaleString('fr-FR', { maximumFractionDigits: 2 })} $`;
  const date = (iso) => new Date(iso).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' });
  const post = (url, body) => fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body || {}) });

  function loginView(err = '') {
    app.innerHTML = `<section class="espace-hero" style="padding-bottom:60px"><img class="m-deco" src="/img/m-blanc.png" alt=""><div class="wrap"><div class="eyebrow">Espace apprenant</div><h1>Retrouvez votre formation</h1><p style="color:#D3D9F0">Paiements, horaires, certificat et parrainage, au même endroit.</p></div></section>
    <section style="padding-top:40px"><div class="wrap login-box"><form class="card" id="login" style="padding:28px">
      <div class="field"><label for="w">Numéro WhatsApp</label><input class="input" id="w" name="whatsapp" type="tel" autocomplete="tel" placeholder="+243 ..." required></div>
      <div class="field"><label for="p">Mot de passe</label><input class="input" id="p" name="password" type="password" autocomplete="current-password" required></div>
      <p class="error-msg" role="alert">${esc(err)}</p>
      <button class="btn bleu block" type="submit">Me connecter</button>
      <p class="hint" style="margin:16px 0 0;text-align:center;font-size:.9rem;color:var(--gris)">Pas encore inscrit(e) ? <a href="/inscription">S'inscrire en deux minutes</a></p>
    </form></div></section>`;
    document.getElementById('login').addEventListener('submit', async (e) => {
      e.preventDefault();
      const f = e.target;
      const r = await post('/api/inscription/login', { whatsapp: f.whatsapp.value, password: f.password.value });
      const d = await r.json();
      if (!r.ok) return loginView(d.error);
      load();
    });
  }

  function view(d) {
    const l = d.lead;
    const s = l.session;
    const pct = l.du ? Math.min(100, Math.round((l.paye / l.du) * 100)) : 0;
    const share = encodeURIComponent(`Je me forme chez Modern Business School ! Avec mon code ${l.code_parrain} tu as ${d.parrainage.remise_filleul_pct} % de remise : ${location.origin}/?ref=${l.code_parrain}`);
    const debut = s ? new Date(s.debut + 'T09:00:00+01:00') : null;
    const jRest = debut ? Math.ceil((debut - Date.now()) / 86400000) : null;
    app.innerHTML = `
    <section class="espace-hero"><img class="m-deco" src="/img/m-blanc.png" alt=""><div class="wrap">
      <div style="display:flex;justify-content:space-between;gap:12px;align-items:center;flex-wrap:wrap"><div class="eyebrow" style="margin:0">Espace apprenant</div><button class="btn ghost small" id="logout">Se déconnecter</button></div>
      <h1 style="margin-top:14px">Bonjour ${esc(l.prenom || '')} 👋</h1>
      <p style="color:#D3D9F0;margin:0">${!l.completed ? 'Votre inscription n\'est pas encore terminée.' : jRest > 0 ? `Votre formation commence dans <b style="color:var(--jaune)">${jRest} jour${jRest > 1 ? 's' : ''}</b>.` : jRest !== null && jRest <= 0 ? 'Votre formation a commencé. Bonne formation !' : ''}</p>
    </div></section>
    <section style="padding-top:0"><div class="wrap espace-grid">
      <div style="display:grid;gap:22px">
        ${!l.completed ? `<div class="card" style="border:2px solid var(--jaune)"><h3><i class="fa-solid fa-hourglass-half" style="color:var(--jaune-fonce)"></i> Terminez votre inscription</h3><p>Vous vous êtes arrêté(e) à l'étape ${l.step} sur 13. Il ne reste que quelques questions.</p><a class="btn" href="/inscription" style="margin-top:14px">Reprendre</a></div>` : ''}
        ${s ? `<div class="card" style="padding:0;overflow:hidden">
          <img src="${esc(s.image)}" alt="" style="width:100%;aspect-ratio:21/8;object-fit:cover">
          <div style="padding:24px">
            <div class="eyebrow bleu" style="margin-bottom:8px">Ma formation</div>
            <h2 style="font-size:1.6rem">${esc(s.formation)}</h2>
            <div class="chips" style="margin-top:8px">
              <span class="status-pill wait" style="background:var(--bleu-pale);color:var(--bleu)"><i class="fa-solid fa-calendar"></i> ${esc(s.dates)}</span>
              ${s.horaire ? `<span class="status-pill wait" style="background:var(--bleu-pale);color:var(--bleu)"><i class="fa-solid fa-clock"></i> ${esc(s.horaire)}</span>` : ''}
              <span class="status-pill wait" style="background:var(--bleu-pale);color:var(--bleu)"><i class="fa-solid fa-location-dot"></i> ${esc(s.lieu || '')}</span>
            </div>
            ${d.jours.length ? `<div class="days">${d.jours.map((j) => `<div><span style="text-transform:capitalize">${esc(j.label)}</span><span>${j.present === 1 ? '<span class="status-pill ok"><i class="fa-solid fa-check"></i> Présent(e)</span>' : j.present === 0 ? '<span class="status-pill wait">Absent(e)</span>' : '<span style="color:var(--gris)">' + esc(s.horaire || '') + '</span>'}</span></div>`).join('')}</div>` : ''}
            <div class="row" style="display:flex;gap:10px;flex-wrap:wrap;margin-top:18px"><a class="btn bleu small" href="/api/espace/calendrier.ics"><i class="fa-solid fa-calendar-plus"></i> Ajouter à mon agenda</a><a class="btn ghost small" style="color:var(--bleu)" href="/formations/${esc(s.slug)}">Programme</a></div>
          </div></div>` : `<div class="card"><h3>Aucune formation choisie</h3><a class="btn" href="/inscription">Choisir une formation</a></div>`}
        ${d.certificats.length ? `<div class="card"><h3><i class="fa-solid fa-award" style="color:var(--jaune-fonce)"></i> Mes certificats</h3>${d.certificats.map((c) => `<div style="display:flex;justify-content:space-between;align-items:center;gap:12px;padding:12px 0;border-top:1px solid var(--ligne)"><div><b style="color:var(--bleu)">${esc(c.formation)}</b><br><small style="color:var(--gris)">${esc(c.code)} · ${date(c.delivre_le)}</small></div><a class="btn small" href="/certificat/${esc(c.code)}">Voir</a></div>`).join('')}</div>` : ''}
        ${d.autres.length ? `<div class="card"><h3>Continuer à apprendre</h3><div style="display:grid;gap:10px;margin-top:10px">${d.autres.slice(0, 3).map((a) => `<a href="/inscription?session=${esc(a.id)}" style="display:flex;gap:12px;align-items:center;text-decoration:none;padding:8px;border-radius:12px;background:var(--fond-2)"><img src="${esc(a.image)}" alt="" style="width:56px;height:56px;border-radius:10px;object-fit:cover"><span style="flex:1"><b style="color:var(--bleu)">${esc(a.formation)}</b><br><small style="color:var(--gris)">${esc(a.dates)}</small></span><b style="color:var(--bleu)">${money(a.prix)}</b></a>`).join('')}</div></div>` : ''}
      </div>
      <div style="display:grid;gap:22px;align-content:start">
        ${l.completed ? `<div class="card">
          <h3>Paiement</h3>
          ${l.solde ? '<span class="status-pill ok"><i class="fa-solid fa-circle-check"></i> Formation soldée</span>' : `<span class="status-pill wait">Reste ${money(l.reste)}</span>`}
          <div class="pay-meter"><span style="width:${pct}%"></span></div>
          <div style="display:flex;justify-content:space-between;font-size:.9rem;color:var(--gris)"><span>Payé : <b style="color:var(--bleu)">${money(l.paye)}</b></span><span>Total : ${money(l.du)}</span></div>
          ${!l.solde ? `<a class="btn block" style="margin-top:16px" href="${esc(l.lien_paiement)}" target="_blank" rel="noopener" data-track="clic_paiement"><i class="fa-solid fa-mobile-screen"></i> Payer en ligne</a><p style="font-size:.82rem;color:var(--gris);margin:10px 0 0">Ou à nos bureaux (${esc(d.ecole.adresse)}). Référence : MBS-${esc(l.id)}</p>` : ''}
          ${d.payments.length ? `<div style="margin-top:16px">${d.payments.map((p) => `<div style="display:flex;justify-content:space-between;font-size:.88rem;padding:8px 0;border-top:1px solid var(--ligne)"><span>${date(p.created_at)} · ${esc(p.methode || '')}</span><b>${money(p.montant)}</b></div>`).join('')}</div>` : ''}
        </div>` : ''}
        ${d.parrainage.actif && l.code_parrain ? `<div class="share-box" style="margin:0">
          <b><i class="fa-solid fa-gift"></i> Mon code de parrainage</b><br><span class="code">${esc(l.code_parrain)}</span>
          <p style="margin:0 0 12px">${d.parrainage.remise_filleul_pct} % de remise pour vos amis, et pour vous : ${esc(d.parrainage.recompense)}.</p>
          <a class="btn bleu small" href="https://wa.me/?text=${share}" target="_blank" rel="noopener"><i class="fa-brands fa-whatsapp"></i> Partager</a>
          <p style="margin:14px 0 0;font-weight:600">${d.filleuls.length ? `${d.filleuls.filter((f) => f.inscrit).length} filleul(s) inscrit(s) sur ${d.filleuls.length}` : 'Pas encore de filleul'}</p>
        </div>` : ''}
        <div class="card"><h3>Une question ?</h3><p>Ama, notre assistante, connaît votre dossier et répond tout de suite. L'équipe reste joignable sur WhatsApp.</p>
          <div style="display:flex;gap:10px;flex-wrap:wrap;margin-top:14px"><button class="btn bleu small" data-ama="">Demander à Ama</button><a class="btn ghost small" style="color:var(--bleu)" href="https://wa.me/${esc(d.ecole.whatsapp.replace(/\D/g, ''))}"><i class="fa-brands fa-whatsapp"></i> WhatsApp</a></div></div>
      </div>
    </div></section>`;
    document.getElementById('logout').addEventListener('click', async () => { await post('/api/inscription/logout'); loginView(); });
  }

  async function load() {
    const r = await fetch('/api/espace');
    if (r.status === 401) return loginView();
    view(await r.json());
  }
  load();
})();
