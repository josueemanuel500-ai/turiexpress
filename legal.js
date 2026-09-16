// Script mínimo para las páginas legales: no necesitan Supabase ni calendario.
const WHATSAPP_NUMBER = '529995095005';

document.addEventListener('contextmenu', event => event.preventDefault());

document.querySelectorAll('.whatsapp-link').forEach(link => {
  link.href = `https://wa.me/${WHATSAPP_NUMBER}?text=${encodeURIComponent(link.dataset.message || 'Hola')}`;
});

document.querySelector('#year').textContent = new Date().getFullYear();
