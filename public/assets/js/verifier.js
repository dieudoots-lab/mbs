// Verification publique d'un certificat par son code.
(() => {
  const form = document.getElementById('verify-form');
  const out = document.getElementById('verify-result');
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  async function check(code) {
    out.innerHTML = '';
    const r = await fetch('/api/certificats/' + encodeURIComponent(code.trim().toUpperCase()));
    const d = await r.json();
    if (!r.ok) { out.innerHTML = `<div class="verify-result ko"><b><i class="fa-solid fa-circle-xmark"></i> Certificat introuvable</b><p style="margin:6px 0 0">${esc(d.error)}</p></div>`; return; }
    out.innerHTML = d.valide
      ? `<div class="verify-result ok"><b style="color:var(--vert)"><i class="fa-solid fa-circle-check"></i> Certificat authentique</b>
         <p style="margin:12px 0 0;font-size:1.15rem;color:var(--bleu);font-weight:700">${esc(d.nom_complet)}</p>
         <p style="margin:0">${esc(d.formation)} · ${esc(d.dates || '')}</p>
         <p style="margin:6px 0 0;color:var(--gris);font-size:.9rem">Délivré le ${new Date(d.delivre_le).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' })} par Modern Business School</p>
         <a class="btn small bleu" style="margin-top:14px" href="/certificat/${esc(d.code)}">Voir le certificat</a></div>`
      : `<div class="verify-result ko"><b><i class="fa-solid fa-ban"></i> Ce certificat a été révoqué</b></div>`;
  }
  form.addEventListener('submit', (e) => { e.preventDefault(); check(form.code.value); });
  if (form.code.value) check(form.code.value);
})();
