// Comportements communs du site public : menu, apparitions, mesure, origine des visites.
(() => {
  const store = {
    get(k) { try { return JSON.parse(localStorage.getItem(k)); } catch { return null; } },
    set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch {} },
  };
  window.mbsStore = store;

  // origine de la visite (UTM, code de parrainage dans ?ref=) gardee pour l'inscription
  const p = new URLSearchParams(location.search);
  if (p.get('utm_source') || p.get('ref')) {
    const prev = store.get('mbs_origine') || {};
    store.set('mbs_origine', {
      utm: { source: p.get('utm_source') || prev.utm?.source, medium: p.get('utm_medium') || prev.utm?.medium, campaign: p.get('utm_campaign') || prev.utm?.campaign },
      ref: p.get('ref') || prev.ref,
      referrer: prev.referrer || document.referrer || '',
    });
  } else if (!store.get('mbs_origine') && document.referrer && !document.referrer.includes(location.host)) {
    store.set('mbs_origine', { utm: {}, referrer: document.referrer });
  }

  window.mbsTrack = (type, info) => {
    try {
      fetch('/api/track', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ type, page: location.pathname, info }), keepalive: true });
      if (window.fbq && type === 'clic_inscription') fbq('track', 'Lead');
    } catch {}
  };
  if (!location.pathname.startsWith('/admin')) mbsTrack(location.pathname.startsWith('/formations/') ? 'vue_formation' : 'visite');
  document.addEventListener('click', (e) => {
    const t = e.target.closest('[data-track]');
    if (t) mbsTrack(t.dataset.track, t.getAttribute('href') || '');
  });

  // menu
  const nav = document.getElementById('nav');
  const burger = document.getElementById('burger');
  const menu = document.getElementById('menu');
  if (nav) {
    const onScroll = () => nav.classList.toggle('scrolled', scrollY > 10);
    addEventListener('scroll', onScroll, { passive: true });
    onScroll();
  }
  burger?.addEventListener('click', () => {
    const open = menu.classList.toggle('open');
    burger.setAttribute('aria-expanded', String(open));
    burger.innerHTML = open ? '<i class="fa-solid fa-xmark"></i>' : '<i class="fa-solid fa-bars"></i>';
  });
  menu?.addEventListener('click', (e) => { if (e.target.tagName === 'A') { menu.classList.remove('open'); burger.innerHTML = '<i class="fa-solid fa-bars"></i>'; } });

  // apparitions au defilement
  const reveals = document.querySelectorAll('.reveal');
  if ('IntersectionObserver' in window && !matchMedia('(prefers-reduced-motion: reduce)').matches) {
    const io = new IntersectionObserver((entries) => {
      for (const en of entries) if (en.isIntersecting) { en.target.classList.add('in'); io.unobserve(en.target); }
    }, { threshold: 0.12, rootMargin: '0px 0px -40px 0px' });
    reveals.forEach((el) => io.observe(el));
  } else reveals.forEach((el) => el.classList.add('in'));

  // bouton collant mobile : apparait apres le premier ecran
  const sticky = document.getElementById('sticky-cta');
  if (sticky && sticky.children.length) {
    addEventListener('scroll', () => sticky.classList.toggle('show', scrollY > innerHeight * 0.8), { passive: true });
  }

  // liens qui ouvrent l'assistante avec une question pre-remplie
  document.addEventListener('click', (e) => {
    const a = e.target.closest('[data-ama]');
    if (!a) return;
    e.preventDefault();
    window.ouvrirAma?.(a.dataset.ama || '');
  });
})();
