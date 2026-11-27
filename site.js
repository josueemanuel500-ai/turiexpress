// Código compartido por todas las páginas del sitio público (español e inglés):
// configuración de la API, menú móvil, año del pie y "precio desde" en pesos y dólares.
(() => {
  const LOCAL = ['localhost', '127.0.0.1'].includes(location.hostname);
  const lang = document.body.dataset.lang === 'en' ? 'en' : 'es';
  const locale = lang === 'en' ? 'en-US' : 'es-MX';
  const WHATSAPP = '529995095005';

  const fmtMXN = cents => `$${Math.round(cents / 100).toLocaleString(locale)} MXN`;
  // El dólar es solo referencia: se redondea a dólares enteros.
  const fmtUSD = (cents, rate) => (rate ? `US$${Math.round(cents / 100 / rate).toLocaleString(locale)}` : '');

  let pricingPromise = null;
  const TURI = window.TURI = {
    lang, locale, fmtMXN, fmtUSD,
    API_BASE: LOCAL ? 'http://localhost:3001/v1' : 'https://api.turiexpress.com.mx/v1',
    waLink: text => `https://wa.me/${WHATSAPP}?text=${encodeURIComponent(text || 'Hola')}`,
    t: (es, en) => (lang === 'en' ? en : es),
    pricing() {
      pricingPromise ??= fetch(`${TURI.API_BASE}/public/pricing`).then(r => (r.ok ? r.json() : null)).catch(() => null);
      return pricingPromise;
    },
  };

  // Menú móvil
  const toggle = document.querySelector('.menu-toggle');
  const mobileNav = document.querySelector('#mobile-nav');
  if (toggle && mobileNav) {
    const setOpen = open => {
      mobileNav.classList.toggle('open', open);
      toggle.setAttribute('aria-expanded', String(open));
      toggle.setAttribute('aria-label', open ? TURI.t('Cerrar menú', 'Close menu') : TURI.t('Abrir menú', 'Open menu'));
    };
    toggle.addEventListener('click', () => setOpen(!mobileNav.classList.contains('open')));
    mobileNav.addEventListener('click', e => { if (e.target.closest('a')) setOpen(false); });
    document.addEventListener('keydown', e => { if (e.key === 'Escape') setOpen(false); });
    document.addEventListener('click', e => { if (!mobileNav.contains(e.target) && !toggle.contains(e.target)) setOpen(false); });
  }

  document.querySelectorAll('[data-year]').forEach(el => { el.textContent = new Date().getFullYear(); });

  // "Precio desde": tarifa diaria en pesos y su equivalente aproximado en dólares.
  const boxes = document.querySelectorAll('[data-price-from]');
  if (boxes.length) {
    TURI.pricing().then(p => {
      if (!p || !p.daily_cents) return;
      const perDay = TURI.t('/ día', '/ day');
      const usd = fmtUSD(p.daily_cents, p.usd_rate);
      boxes.forEach(box => {
        box.querySelector('[data-mxn]').textContent = `${fmtMXN(p.daily_cents)} ${perDay}`;
        box.querySelector('[data-usd]').textContent = usd
          ? TURI.t(`≈ ${usd} por día · cobro en pesos`, `≈ ${usd} per day · charged in pesos`)
          : TURI.t('Tarifa semanal disponible', 'Weekly rate available');
        box.hidden = false;
      });
    });
  }
})();
