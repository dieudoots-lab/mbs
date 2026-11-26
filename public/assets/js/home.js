// Page d'accueil : compte a rebours de la prochaine session et quiz d'orientation.
(() => {
  // ------------------------------------------------ compte a rebours (Kinshasa = UTC+1)
  const card = document.getElementById('next-card');
  if (card) {
    const target = new Date(card.dataset.debut + 'T09:00:00+01:00').getTime();
    const cells = Object.fromEntries([...card.querySelectorAll('[data-cd]')].map((el) => [el.dataset.cd, el]));
    const two = (n) => String(n).padStart(2, '0');
    const tick = () => {
      const s = Math.max(0, Math.floor((target - Date.now()) / 1000));
      cells.j.textContent = Math.floor(s / 86400);
      cells.h.textContent = two(Math.floor(s / 3600) % 24);
      cells.m.textContent = two(Math.floor(s / 60) % 60);
      cells.s.textContent = two(s % 60);
    };
    tick();
    setInterval(tick, 1000);
  }

  // ------------------------------------------------ quiz
  const box = document.getElementById('quiz');
  const data = JSON.parse(document.getElementById('quiz-data')?.textContent || '[]');
  if (!box || !data.length) return;
  const bySlug = (frag) => data.find((f) => f.slug.includes(frag));
  const Q = [
    { q: 'Quelle est votre situation ?', o: [
      ['Étudiant(e) ou jeune diplômé(e)', { contenu: 2, marketing: 1 }],
      ['Salarié(e)', { ia: 2, marketing: 1 }],
      ['Entrepreneur ou commerçant', { prospection: 2, marketing: 2 }],
      ['Freelance ou créateur', { contenu: 3 }],
    ] },
    { q: 'Qu\'aimeriez-vous accomplir en premier ?', o: [
      ['Attirer plus de clients en ligne', { marketing: 3, prospection: 1 }],
      ['Créer des vidéos et des posts qui captivent', { contenu: 3 }],
      ['Gagner du temps grâce à l\'IA', { ia: 3 }],
      ['Vendre plus et décrocher des rendez-vous', { prospection: 3 }],
    ] },
    { q: 'Votre rapport aux outils numériques ?', o: [
      ['Je débute, je veux des bases solides', { contenu: 1, marketing: 1 }],
      ['Je me débrouille, je veux passer un cap', { marketing: 1, prospection: 1 }],
      ['À l\'aise, je veux les outils les plus avancés', { ia: 2 }],
    ] },
  ];
  const keys = { marketing: 'marketing', contenu: 'contenu', ia: 'intelligence', prospection: 'prospection' };
  let i = 0;
  const score = { marketing: 0, contenu: 0, ia: 0, prospection: 0 };

  function render() {
    if (i >= Q.length) return result();
    const item = Q[i];
    box.innerHTML = `<div class="progress"><span style="width:${(i / Q.length) * 100}%"></span></div>
      <small style="color:var(--gris);font-weight:600">Question ${i + 1} sur ${Q.length}</small>
      <h3>${item.q}</h3>
      <div class="options">${item.o.map((o, k) => `<button class="option" data-k="${k}"><span class="key">${'ABCD'[k]}</span><span>${o[0]}</span></button>`).join('')}</div>`;
    requestAnimationFrame(() => (box.querySelector('.progress span').style.width = `${((i + 1) / Q.length) * 100}%`));
    box.querySelectorAll('.option').forEach((b) => b.addEventListener('click', () => {
      b.classList.add('selected');
      for (const [k, v] of Object.entries(item.o[Number(b.dataset.k)][1])) score[k] += v;
      setTimeout(() => { i++; render(); }, 250);
    }));
  }

  function result() {
    const best = Object.entries(score).sort((a, b) => b[1] - a[1])[0][0];
    const f = bySlug(keys[best]) || data[0];
    window.mbsTrack?.('quiz_termine', f.slug);
    box.innerHTML = `<div class="quiz-result">
      <div class="eyebrow bleu" style="justify-content:center">Notre recommandation</div>
      <h3 style="font-size:1.7rem">${f.titre}</h3>
      <img src="${f.image}" alt="">
      <p style="color:var(--gris)">${f.accroche || ''}</p>
      ${f.dates ? `<p style="font-weight:600;color:var(--bleu)"><i class="fa-solid fa-calendar"></i> Prochaine session : ${f.dates}</p>` : ''}
      <div style="display:flex;gap:10px;justify-content:center;flex-wrap:wrap;margin-top:18px">
        <a class="btn" href="/inscription${f.session ? '?session=' + f.session : ''}" data-track="clic_inscription">Réserver ma place</a>
        <a class="btn ghost" style="color:var(--bleu)" href="/formations/${f.slug}">Voir le programme</a>
      </div>
      <p style="margin-top:18px"><button class="option" style="display:inline-flex;width:auto;padding:8px 14px" id="quiz-again"><i class="fa-solid fa-rotate-left"></i> Recommencer</button></p>
    </div>`;
    box.querySelector('#quiz-again').onclick = () => { i = 0; Object.keys(score).forEach((k) => (score[k] = 0)); render(); };
  }
  render();
})();
