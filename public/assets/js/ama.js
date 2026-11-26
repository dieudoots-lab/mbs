// Ama, l'assistante virtuelle de MBS (bulle en bas a droite de chaque page).
(() => {
  const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  // Markdown minimal et sur : liens [texte](url) internes ou https, gras **x**
  const md = (s) => esc(s)
    .replace(/\[([^\]]+)\]\(((?:\/|https:\/\/)[^)\s]*)\)/g, (_, t, u) => `<a href="${u}"${u.startsWith('http') ? ' target="_blank" rel="noopener"' : ''}>${t}</a>`)
    .replace(/\*\*([^*]+)\*\*/g, '<b>$1</b>');

  const root = document.createElement('div');
  root.innerHTML = `
  <button class="ama-bubble" id="ama-bubble" aria-label="Discuter avec Ama, l'assistante virtuelle" aria-expanded="false" aria-controls="ama-panel"><img src="/img/m-jaune.png" alt=""><span class="dot"></span></button>
  <div class="ama-panel" id="ama-panel" role="dialog" aria-label="Discussion avec l'assistante">
    <div class="ama-head"><div class="av"><img src="/img/icon.png" alt=""></div><div><b id="ama-nom">Ama</b><small>Assistante virtuelle MBS · répond en quelques secondes</small></div><button id="ama-close" aria-label="Fermer"><i class="fa-solid fa-xmark"></i></button></div>
    <div class="ama-msgs" id="ama-msgs"></div>
    <div class="ama-quick" id="ama-quick"></div>
    <form class="ama-form" id="ama-form"><textarea id="ama-input" rows="1" placeholder="Écrivez votre question..." aria-label="Votre message"></textarea><button type="submit" aria-label="Envoyer"><i class="fa-solid fa-paper-plane"></i></button></form>
    <div class="ama-note">Ama est une assistante virtuelle. Un conseiller humain reste joignable sur WhatsApp.</div>
  </div>`;
  document.body.appendChild(root);

  const bubble = root.querySelector('#ama-bubble');
  const panel = root.querySelector('#ama-panel');
  const list = root.querySelector('#ama-msgs');
  const form = root.querySelector('#ama-form');
  const input = root.querySelector('#ama-input');
  const quick = root.querySelector('#ama-quick');
  let loaded = false;
  let busy = false;

  const add = (role, text) => {
    const d = document.createElement('div');
    d.className = 'msg ' + (role === 'user' ? 'user' : 'bot');
    d.innerHTML = md(text);
    list.appendChild(d);
    list.scrollTop = list.scrollHeight;
    return d;
  };
  const setQuick = (items) => {
    quick.innerHTML = '';
    for (const t of items) {
      const b = document.createElement('button');
      b.type = 'button'; b.textContent = t;
      b.onclick = () => envoyer(t);
      quick.appendChild(b);
    }
  };

  async function charger() {
    if (loaded) return;
    loaded = true;
    try {
      const r = await fetch('/api/assistant');
      const d = await r.json();
      root.querySelector('#ama-nom').textContent = d.nom || 'Ama';
      add('assistant', d.accueil);
      d.messages.forEach((m) => add(m.role, m.content));
      if (!d.messages.length) setQuick(['Quelle formation me conseilles-tu ?', 'Quelles sont les prochaines dates ?', 'Combien ça coûte ?', 'Former mon équipe']);
    } catch { add('assistant', 'Bonjour ! Comment puis-je vous aider ?'); }
  }

  async function envoyer(text) {
    text = String(text || '').trim();
    if (!text || busy) return;
    busy = true;
    setQuick([]);
    add('user', text);
    input.value = '';
    input.style.height = '';
    const typing = document.createElement('div');
    typing.className = 'msg bot typing';
    typing.innerHTML = '<span></span><span></span><span></span>';
    list.appendChild(typing);
    list.scrollTop = list.scrollHeight;
    try {
      const r = await fetch('/api/assistant', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ message: text, page: location.pathname }) });
      const d = await r.json();
      typing.remove();
      add('assistant', r.ok ? d.reply : d.error || 'Désolée, une erreur est survenue.');
    } catch {
      typing.remove();
      add('assistant', 'Connexion interrompue. Réessayez dans un instant.');
    } finally { busy = false; input.focus(); }
  }

  function ouvrir(question) {
    panel.classList.add('open');
    bubble.setAttribute('aria-expanded', 'true');
    bubble.querySelector('.dot')?.remove();
    document.getElementById('ama-teaser')?.remove();
    charger().then(() => { if (question) envoyer(question); else input.focus(); });
  }
  function fermer() { panel.classList.remove('open'); bubble.setAttribute('aria-expanded', 'false'); bubble.focus(); }
  window.ouvrirAma = ouvrir;

  bubble.addEventListener('click', () => (panel.classList.contains('open') ? fermer() : ouvrir()));
  root.querySelector('#ama-close').addEventListener('click', fermer);
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && panel.classList.contains('open')) fermer(); });
  form.addEventListener('submit', (e) => { e.preventDefault(); envoyer(input.value); });
  input.addEventListener('keydown', (e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); envoyer(input.value); } });
  input.addEventListener('input', () => { input.style.height = 'auto'; input.style.height = Math.min(120, input.scrollHeight) + 'px'; });

  // petite invitation discrete apres 25 secondes, une fois par jour
  let vu = null;
  try { vu = localStorage.getItem('ama_teaser'); } catch {}
  if (!vu || Date.now() - Number(vu) > 86400000) {
    setTimeout(() => {
      if (panel.classList.contains('open')) return;
      const t = document.createElement('div');
      t.className = 'ama-teaser'; t.id = 'ama-teaser';
      t.innerHTML = 'Besoin d\'aide pour choisir votre formation ? Je réponds tout de suite 👋<button aria-label="Fermer">✕</button>';
      t.onclick = (e) => { if (e.target.tagName === 'BUTTON') { t.remove(); return; } ouvrir(); };
      document.body.appendChild(t);
      try { localStorage.setItem('ama_teaser', String(Date.now())); } catch {}
    }, 25000);
  }
})();
