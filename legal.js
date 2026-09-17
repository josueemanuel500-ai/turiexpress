// Script mínimo para las páginas legales: no necesitan Supabase ni calendario.
const WHATSAPP_NUMBER = '529995095005';

document.addEventListener('contextmenu', event => event.preventDefault());

document.querySelectorAll('.whatsapp-link').forEach(link => {
  link.href = `https://wa.me/${WHATSAPP_NUMBER}?text=${encodeURIComponent(link.dataset.message || 'Hola')}`;
});

const year = document.querySelector('#year');
if (year) year.textContent = new Date().getFullYear();

const menu = document.querySelector('.menu-button');
if (menu) menu.addEventListener('click', event => {
  const nav = document.querySelector('.main-nav');
  nav.classList.toggle('open');
  event.currentTarget.setAttribute('aria-expanded', String(nav.classList.contains('open')));
});
