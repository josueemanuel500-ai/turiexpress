// Código compartido por todas las páginas: WhatsApp, menú, pie de página,
// botón flotante de WhatsApp y acceso oculto al panel de personal.
const WHATSAPP_NUMBER = '529995095005';
// En pruebas locales (localhost) se usa la API local.
const LOCAL = ['localhost', '127.0.0.1'].includes(location.hostname);
const API_BASE = LOCAL ? 'http://localhost:3001/v1' : 'https://api.turiexpress.com.mx/v1';
const PANEL_URL = LOCAL ? 'http://localhost:3001/' : 'https://api.turiexpress.com.mx/';
const waLink = text => `https://wa.me/${WHATSAPP_NUMBER}?text=${encodeURIComponent(text || 'Hola')}`;

document.addEventListener('contextmenu', event => event.preventDefault());

document.querySelectorAll('.whatsapp-link').forEach(link => {
  link.href = waLink(link.dataset.message);
});

const menu = document.querySelector('.menu-button');
if (menu) {
  const nav = document.querySelector('.main-nav');
  const closeMenu = () => {
    nav.classList.remove('open');
    menu.setAttribute('aria-expanded', 'false');
    menu.setAttribute('aria-label', 'Abrir menú');
  };
  menu.addEventListener('click', () => {
    const isOpen = nav.classList.toggle('open');
    menu.setAttribute('aria-expanded', String(isOpen));
    menu.setAttribute('aria-label', isOpen ? 'Cerrar menú' : 'Abrir menú');
  });
  nav.addEventListener('click', event => { if (event.target.closest('a')) closeMenu(); });
  document.addEventListener('keydown', event => { if (event.key === 'Escape') closeMenu(); });
}

function standardizeFooter() {
  const footer = document.querySelector('footer');
  if (!footer) return;
  footer.innerHTML = `
    <div><a class="brand" href="/">TURI EXPRESS <span>MX</span></a><p>Renta de Nissan Urvan para grupos y traslados.</p></div>
    <div><h3>Horario</h3><p>Lun–Dom · 8:00–20:00</p></div>
    <div><h3>¿Listo para viajar?</h3><a class="button" href="${waLink('Hola, quisiera información sobre la renta de una Nissan Urvan.')}" target="_blank" rel="noopener">Hablar por WhatsApp</a></div>
    <div><h3>Legal</h3><p><a class="footer-link" href="/aviso-privacidad">Aviso de privacidad</a></p><p><a class="footer-link" href="/terminos">Términos y condiciones</a></p></div>
    <small>© ${new Date().getFullYear()} TURI EXPRESS MX. Todos los derechos reservados.</small>`;
}
standardizeFooter();

// Botón flotante de WhatsApp en todas las páginas. El mensaje menciona la página
// desde la que escriben, para saber qué estaban viendo.
function floatingWhatsApp() {
  if (document.querySelector('.wa-float')) return;
  const page = document.title.split('|')[0].trim();
  const a = document.createElement('a');
  a.className = 'wa-float';
  a.href = waLink(`Hola, vengo de la página "${page}". Quiero información para rentar una Nissan Urvan.`);
  a.target = '_blank';
  a.rel = 'noopener';
  a.setAttribute('aria-label', 'Escríbenos por WhatsApp');
  a.innerHTML = '<svg viewBox="0 0 32 32" width="30" height="30" aria-hidden="true"><path fill="currentColor" d="M16 3a13 13 0 0 0-11.2 19.6L3 29l6.6-1.7A13 13 0 1 0 16 3zm0 23.6a10.6 10.6 0 0 1-5.4-1.5l-.4-.2-3.9 1 1-3.8-.2-.4A10.6 10.6 0 1 1 16 26.6zm5.8-7.9c-.3-.2-1.9-.9-2.2-1s-.5-.2-.7.2-.8 1-1 1.2-.4.2-.7 0a8.7 8.7 0 0 1-4.3-3.8c-.3-.6.3-.5.9-1.7.1-.2 0-.4 0-.6l-1-2.4c-.3-.6-.5-.5-.7-.5h-.6a1.2 1.2 0 0 0-.9.4 3.6 3.6 0 0 0-1.1 2.7 6.3 6.3 0 0 0 1.3 3.3 14.4 14.4 0 0 0 5.5 4.9c2 .9 2.8.9 3.8.8a3.3 3.3 0 0 0 2.1-1.5 2.7 2.7 0 0 0 .2-1.5c-.1-.2-.3-.3-.6-.4z"/></svg><span>¿Rentamos?</span>';
  document.body.append(a);
}
floatingWhatsApp();

// Acceso oculto al panel: 4 toques rápidos sobre el logo abren el panel de personal.
// Un clic normal navega igual que siempre.
function setupStaffGesture() {
  const brand = document.querySelector('.site-header .brand') || document.querySelector('.brand');
  if (!brand) return;
  const targetHref = brand.getAttribute('href');
  let tapCount = 0;
  let tapTimer = null;
  brand.addEventListener('click', event => {
    if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    event.preventDefault();
    tapCount += 1;
    clearTimeout(tapTimer);
    if (tapCount >= 4) { tapCount = 0; window.location.href = PANEL_URL; return; }
    tapTimer = setTimeout(() => { tapCount = 0; window.location.href = targetHref; }, 900);
  });
}
setupStaffGesture();
