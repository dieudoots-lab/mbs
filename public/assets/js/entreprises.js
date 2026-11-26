// Page Entreprises : simulateur de devis en temps reel puis demande de proposition.
(() => {
  const sim = document.getElementById('sim');
  if (!sim) return;
  const fmt = (n) => Number(n || 0).toLocaleString('fr-FR', { maximumFractionDigits: 0 }) + ' $';
  const boxes = [...sim.querySelectorAll('input[name=modules]')];
  const range = document.getElementById('participants');
  const out = document.getElementById('participants-out');
  const seg = document.getElementById('jours');
  let jours = 2;
  let lastQuote = null;
  let timer = null;

  const pre = new URLSearchParams(location.search).get('module');
  boxes.forEach((b) => { if (pre && b.dataset.slug === pre) b.checked = true; });
  if (!boxes.some((b) => b.checked) && boxes[0]) boxes[0].checked = true;

  async function refresh() {
    boxes.forEach((b) => b.closest('.module-opt').classList.toggle('on', b.checked));
    out.textContent = range.value;
    const modules = boxes.filter((b) => b.checked).map((b) => b.value);
    if (!modules.length) {
      document.getElementById('quote-lines').innerHTML = '<p style="color:#AEB7DB">Choisissez au moins un module.</p>';
      ['quote-ht', 'quote-tva', 'quote-ttc'].forEach((id) => (document.getElementById(id).textContent = '0 $'));
      lastQuote = null;
      return;
    }
    const r = await fetch('/api/entreprises/devis', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ modules, participants: Number(range.value), jours }) });
    const q = await r.json();
    lastQuote = q;
    document.getElementById('quote-lines').innerHTML = q.lignes.map((l) => `
      <div class="line"><span><b style="color:#fff">${l.titre}</b><br>Consultation (${q.jours} j)</span><span>${fmt(l.consultation)}</span></div>
      <div class="line"><span>${l.participants} participant${l.participants > 1 ? 's' : ''} × ${fmt(l.prix_participant)}</span><span>${fmt(l.total_participants)}</span></div>`).join('');
    document.getElementById('quote-ht').textContent = fmt(q.ht);
    document.getElementById('quote-tva').textContent = fmt(q.tva);
    document.getElementById('quote-ttc').textContent = fmt(q.ttc);
  }
  const later = () => { clearTimeout(timer); timer = setTimeout(() => { refresh(); window.mbsTrack?.('devis_simule'); }, 180); };
  boxes.forEach((b) => b.addEventListener('change', later));
  range.addEventListener('input', () => { out.textContent = range.value; later(); });
  seg.addEventListener('click', (e) => {
    const b = e.target.closest('button');
    if (!b) return;
    jours = Number(b.dataset.v);
    seg.querySelectorAll('button').forEach((x) => x.classList.toggle('on', x === b));
    later();
  });
  refresh();

  const form = document.getElementById('b2b-form');
  const err = document.getElementById('b2b-error');
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    err.textContent = '';
    const modules = boxes.filter((b) => b.checked).map((b) => b.value);
    const data = Object.fromEntries(new FormData(form));
    const btn = form.querySelector('button[type=submit]');
    btn.disabled = true;
    try {
      const r = await fetch('/api/entreprises', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ...data, modules, participants: Number(range.value), jours }) });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error);
      if (window.fbq) fbq('track', 'Lead', { value: d.devis.ht, currency: 'USD' });
      form.innerHTML = `<div style="text-align:center;padding:20px 0">
        <div class="icon-badge" style="margin:0 auto 16px;background:var(--jaune)"><i class="fa-solid fa-check"></i></div>
        <h3>Merci, ${data.contact.split(' ')[0]} !</h3>
        <p style="color:var(--gris)">Votre demande pour <b>${data.societe.replace(/</g, '&lt;')}</b> est bien reçue. Un conseiller MBS vous contacte sous 24 h pour affiner votre programme.</p>
        <p style="font-weight:600;color:var(--bleu)">Estimation : ${fmt(d.devis.ht)} HT</p>
      </div>`;
    } catch (ex) {
      err.textContent = ex.message || 'Une erreur est survenue.';
      btn.disabled = false;
    }
  });
})();
