// Script mínimo para las páginas legales: no necesitan Supabase ni calendario.
const WHATSAPP_NUMBER = '529995095005';

document.addEventListener('contextmenu', event => event.preventDefault());

document.querySelectorAll('.whatsapp-link').forEach(link => {
  link.href = `https://wa.me/${WHATSAPP_NUMBER}?text=${encodeURIComponent(link.dataset.message || 'Hola')}`;
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
  const whatsappText = 'Hola, quisiera información sobre la renta de una Nissan Urvan.';
  footer.innerHTML = `
    <div><a class="brand" href="/">TURI EXPRESS <span>MX</span></a><p>Renta de Nissan Urvan para grupos y traslados.</p></div>
    <div><h3>Horario</h3><p>Lun–Dom · 8:00–20:00</p></div>
    <div><h3>¿Listo para viajar?</h3><a class="button" href="https://wa.me/${WHATSAPP_NUMBER}?text=${encodeURIComponent(whatsappText)}" target="_blank" rel="noopener">Hablar por WhatsApp</a></div>
    <div><h3>Legal</h3><p><a class="footer-link" href="/aviso-privacidad">Aviso de privacidad</a></p><p><a class="footer-link" href="/terminos">Términos y condiciones</a></p></div>
    <small>© ${new Date().getFullYear()} TURI EXPRESS MX. Todos los derechos reservados.</small>`;
}

standardizeFooter();

// Acceso de personal oculto: 4 toques rápidos sobre el logo llevan al panel
// (estas páginas no tienen el modal, así que se navega a /disponibilidad?admin=1).
// Un clic normal navega igual que antes; solo se intercepta la secuencia de 4 toques.
function setupStaffGesture() {
  const brand = document.querySelector('.brand');
  if (!brand) return;
  const targetHref = brand.getAttribute('href');
  let tapCount = 0;
  let tapTimer = null;

  brand.addEventListener('click', event => {
    if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    event.preventDefault();
    tapCount += 1;
    clearTimeout(tapTimer);

    if (tapCount >= 4) {
      tapCount = 0;
      window.location.href = 'disponibilidad.html?admin=1';
      return;
    }

    tapTimer = setTimeout(() => { tapCount = 0; window.location.href = targetHref; }, 500);
  });
}
setupStaffGesture();
