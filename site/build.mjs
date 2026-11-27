// Genera el sitio público estático en español (raíz) e inglés (/en/) desde una sola plantilla.
// Uso:  node site/build.mjs        → escribe los .html, sitemap.xml y en/*.html en la raíz del repo.
// Para cambiar un texto, edítalo aquí (cada texto va en pareja español/inglés) y vuelve a ejecutar.
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { LEGAL } from './legal.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const SITE = 'https://turiexpress.com.mx';
const VERSION = '20261127d';
const WA = '529995095005';
const WA_DISPLAY = '+52 999 509 5005';
const PANEL_URL = 'https://api.turiexpress.com.mx/';

// ───────────────────────────── Páginas y rutas ─────────────────────────────
const PAGES = [
  { id: 'home', es: 'index.html', en: 'en/index.html' },
  { id: 'fleet', es: 'flota.html', en: 'en/fleet.html' },
  { id: 'availability', es: 'disponibilidad.html', en: 'en/availability.html' },
  { id: 'requirements', es: 'requisitos.html', en: 'en/requirements.html' },
  { id: 'contact', es: 'contacto.html', en: 'en/contact.html' },
  { id: 'merida', es: 'renta-urvan-merida.html', en: 'en/van-rental-merida.html' },
  { id: 'yucatan', es: 'renta-urvan-yucatan.html', en: 'en/van-rental-yucatan.html' },
  { id: 'airport', es: 'traslado-aeropuerto-merida.html', en: 'en/merida-airport-transfer.html' },
  { id: 'terms', es: 'terminos.html', en: 'en/terms.html' },
  { id: 'privacy', es: 'aviso-privacidad.html', en: 'en/privacy.html' },
];
const NAV = ['home', 'fleet', 'availability', 'requirements', 'contact'];
// URL pública sin ".html" (el .htaccess de Hostinger la resuelve) e index como carpeta.
const urlOf = (id, lang) => {
  const file = PAGES.find(p => p.id === id)[lang];
  return '/' + file.replace(/(^|\/)index\.html$/, '$1').replace(/\.html$/, '');
};

// ───────────────────────────── Íconos (trazo) ─────────────────────────────
const P = {
  van: '<path d="M3 16V8a2 2 0 0 1 2-2h10l5 5v5a1 1 0 0 1-1 1h-1"/><path d="M3 16a1 1 0 0 0 1 1h1"/><path d="M9 17h6"/><circle cx="7" cy="17" r="2"/><circle cx="17" cy="17" r="2"/><path d="M15 6v5h5"/><path d="M3 11h12"/>',
  plane: '<path d="M10.5 13.5 4 11l1.5-1.5 7 1 4-4a2.1 2.1 0 0 1 3 3l-4 4 1 7L16 22l-2.5-6.5L10 19v2.5L8.5 23 7 19l-4-1.5L4.5 16H7z"/>',
  sun: '<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/>',
  calendar: '<rect x="3" y="4.5" width="18" height="16.5" rx="3"/><path d="M8 2.5v4M16 2.5v4M3 10h18"/>',
  users: '<circle cx="9" cy="8" r="3.5"/><path d="M2.5 20a6.5 6.5 0 0 1 13 0"/><path d="M16 4.6a3.5 3.5 0 0 1 0 6.8M18.5 14.2A6.5 6.5 0 0 1 21.5 20"/>',
  snow: '<path d="M12 2v20M4.2 6.5l15.6 9M4.2 17.5l15.6-9"/><path d="M9.5 3.5 12 6l2.5-2.5M9.5 20.5 12 18l2.5 2.5"/>',
  music: '<path d="M7 7l10 10-5 5V2l5 5L7 17"/>',
  gear: '<circle cx="6" cy="6" r="2"/><circle cx="12" cy="6" r="2"/><circle cx="18" cy="6" r="2"/><circle cx="6" cy="18" r="2"/><circle cx="12" cy="18" r="2"/><path d="M6 8v10M12 8v10M18 8v4H6"/>',
  chat: '<path d="M21 12a8.5 8.5 0 0 1-12.4 7.6L3 21l1.4-5.4A8.5 8.5 0 1 1 21 12z"/>',
  lock: '<rect x="4" y="11" width="16" height="10" rx="2.5"/><path d="M8 11V7a4 4 0 0 1 8 0v4"/>',
  arrow: '<path d="M5 12h14M13 6l6 6-6 6"/>',
  menu: '<path d="M4 7h16M4 12h16M4 17h16"/>',
  id: '<rect x="3" y="5" width="18" height="14" rx="3"/><circle cx="9" cy="11" r="2.2"/><path d="M5.8 16a3.4 3.4 0 0 1 6.4 0M14.5 10h4M14.5 13.5h3"/>',
  shield: '<path d="M12 3l7.5 3v5.5c0 4.6-3.2 8.3-7.5 9.5-4.3-1.2-7.5-4.9-7.5-9.5V6z"/><path d="M8.8 12.2l2.2 2.2 4.4-4.4"/>',
  clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3.2 2"/>',
  pin: '<path d="M12 21s-7-6.1-7-11.5a7 7 0 0 1 14 0C19 14.9 12 21 12 21z"/><circle cx="12" cy="9.5" r="2.5"/>',
  route: '<circle cx="6" cy="18" r="2.5"/><circle cx="18" cy="6" r="2.5"/><path d="M8.5 18H15a3.5 3.5 0 0 0 0-7H9a3.5 3.5 0 0 1 0-7h6.5"/>',
  bag: '<rect x="4" y="7" width="16" height="13" rx="2.5"/><path d="M9 7V5a3 3 0 0 1 6 0v2M4 12h16"/>',
};
const icon = (name, cls = '') => `<svg class="${cls}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${P[name]}</svg>`;
const WA_ICON = '<svg viewBox="0 0 32 32" aria-hidden="true"><path fill="currentColor" d="M16 3a13 13 0 0 0-11.2 19.6L3 29l6.6-1.7A13 13 0 1 0 16 3zm0 23.6a10.6 10.6 0 0 1-5.4-1.5l-.4-.2-3.9 1 1-3.8-.2-.4A10.6 10.6 0 1 1 16 26.6zm5.8-7.9c-.3-.2-1.9-.9-2.2-1s-.5-.2-.7.2-.8 1-1 1.2-.4.2-.7 0a8.7 8.7 0 0 1-4.3-3.8c-.3-.6.3-.5.9-1.7.1-.2 0-.4 0-.6l-1-2.4c-.3-.6-.5-.5-.7-.5h-.6a1.2 1.2 0 0 0-.9.4 3.6 3.6 0 0 0-1.1 2.7 6.3 6.3 0 0 0 1.3 3.3 14.4 14.4 0 0 0 5.5 4.9c2 .9 2.8.9 3.8.8a3.3 3.3 0 0 0 2.1-1.5 2.7 2.7 0 0 0 .2-1.5c-.1-.2-.3-.3-.6-.4z"/></svg>';

const esc = s => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const waHref = text => `https://wa.me/${WA}?text=${encodeURIComponent(text)}`;

// ───────────────────────────── Textos compartidos ─────────────────────────────
const NAV_LABEL = { home: ['Inicio', 'Home'], fleet: ['Flota', 'Fleet'], availability: ['Disponibilidad', 'Availability'], requirements: ['Requisitos', 'Requirements'], contact: ['Contacto', 'Contact'] };

function faqs(x) {
  return [
    [x('¿Cuál es la edad mínima para rentar una Urvan?', 'What is the minimum age to rent a van?'),
      x('25 años cumplidos, con licencia de conducir vigente e identificación oficial (INE o pasaporte).', '25 years old, with a valid driver’s license and official ID (passport or Mexican INE).')],
    [x('¿Qué documentos necesito para rentar?', 'Which documents do I need?'),
      x('Licencia de conducir vigente, identificación oficial (INE o pasaporte) y un depósito en garantía reembolsable al devolver la unidad.', 'A valid driver’s license, official ID (passport or INE) and a security deposit that is refunded when you return the van.')],
    [x('¿Puedo rentar la Urvan por un solo día?', 'Can I rent the van for just one day?'),
      x('Sí. Rentamos por día o por semana, según lo que necesite tu viaje o evento.', 'Yes. We rent by the day or by the week, depending on your trip or event.')],
    [x('¿Cómo se confirma mi reserva?', 'How is my booking confirmed?'),
      x('Al enviar tu solicitud apartamos la unidad unas horas. La reserva se confirma cuando el personal te responde por WhatsApp.', 'When you send your request we hold a van for a few hours. The booking is confirmed when our team replies on WhatsApp.')],
    [x('¿Puedo pagar en dólares?', 'Can I pay in US dollars?'),
      x('El precio se cobra en pesos mexicanos. Te mostramos el equivalente aproximado en dólares solo como referencia; la forma de pago se acuerda por WhatsApp.', 'Prices are charged in Mexican pesos. We show an approximate US dollar amount for reference only; payment methods are arranged on WhatsApp.')],
    [x('¿El kilometraje es libre?', 'Is mileage unlimited?'),
      x('Sí, dentro del área metropolitana. Si tu viaje sale de esa zona, lo acordamos contigo antes de confirmar.', 'Yes, within the metropolitan area. If your trip goes beyond it, we agree on it with you before confirming.')],
    [x('¿Hacen traslados al aeropuerto de Mérida?', 'Do you do transfers to Mérida airport?'),
      x('Sí, coordinamos traslados de grupo al aeropuerto con espacio para pasajeros y equipaje.', 'Yes, we arrange group transfers to the airport with room for passengers and luggage.')],
  ];
}

// Bloque de calendario y formulario: lo usan la portada y la página de disponibilidad.
// Los textos dinámicos (meses, mensajes) los pone app.js según el idioma de la página.
function bookingBlock(x, lang) {
  const terms = urlOf('terms', lang), privacy = urlOf('privacy', lang);
  return `<div class="booking">
      <div class="panel">
        <div class="calendar-top"><button id="previous-month" type="button" aria-label="${x('Mes anterior', 'Previous month')}">‹</button><h3 id="calendar-title"></h3><button id="next-month" type="button" aria-label="${x('Mes siguiente', 'Next month')}">›</button></div>
        <p id="calendar-hint" class="calendar-hint" data-step="start" aria-live="polite"><i aria-hidden="true"></i><span></span></p>
        <div class="weekdays">${x(['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom'], ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']).map(d => `<span>${d}</span>`).join('')}</div>
        <div id="calendar-days" class="calendar-days" aria-live="polite"></div>
        <div class="legend"><span><i class="dot-free"></i>${x('Disponible', 'Available')}</span><span><i class="dot-full"></i>${x('Ocupado', 'Booked')}</span><span><i class="dot-selected"></i>${x('Tu selección', 'Your dates')}</span></div>
      </div>
      <form id="booking-form" class="panel booking-form">
        <div class="panel-head" style="margin:0;padding-bottom:14px"><div><h3>${x('Solicita tu Nissan Urvan', 'Request your Nissan Urvan')}</h3><small>${x('Toca primero el día de entrega y luego el de devolución.', 'Tap your pick-up day first, then your return day.')}</small></div></div>
        <div class="date-summary"><div><small>${x('ENTREGA', 'PICK-UP')}</small><strong id="start-display"></strong></div><div><small>${x('DEVOLUCIÓN', 'RETURN')}</small><strong id="end-display"></strong></div></div>
        <button id="clear-dates" class="text-link" type="button">${x('Elegir de nuevo', 'Choose again')}</button>
        <label>${x('Tu nombre', 'Your name')}<input id="name" name="name" autocomplete="name" placeholder="${x('Ej. Juan Pérez', 'e.g. John Smith')}" required></label>
        <label>${x('Tu teléfono (WhatsApp)', 'Your phone (WhatsApp)')}<input id="phone" name="phone" autocomplete="tel" inputmode="tel" placeholder="${x('Ej. 999 123 4567', 'e.g. +1 555 123 4567')}" required></label>
        <div id="price-estimate" class="price-estimate" hidden></div>
        <input type="text" name="website" id="website" class="hp-field" tabindex="-1" autocomplete="off" aria-hidden="true">
        <p id="form-message" class="form-message" role="alert"></p>
        <button class="btn btn-primary" type="submit" id="submit-request" disabled>${WA_ICON}${x('Apartar y enviar por WhatsApp', 'Hold my dates on WhatsApp')}</button>
        <p id="submit-hint" class="fine-print"></p>
        <p class="consent-note">${x(`Al enviar aceptas los <a href="${terms}">Términos y Condiciones</a> y el <a href="${privacy}">Aviso de Privacidad</a>. Usamos tu nombre y teléfono solo para confirmar tu renta.`,
    `By sending you accept our <a href="${terms}">Terms and Conditions</a> and <a href="${privacy}">Privacy Notice</a>. We only use your name and phone to confirm your rental.`)}</p>
      </form>
    </div>`;
}

const specChips = x => `<div class="spec-chips">
  <span>${icon('users')}${x('15 pasajeros', '15 passengers')}</span><span>${icon('snow')}${x('Aire acondicionado', 'Air conditioning')}</span>
  <span>${icon('music')}Bluetooth</span><span>${icon('gear')}${x('Transmisión manual', 'Manual transmission')}</span></div>`;

const ctaBand = (x, lang) => `<section class="section"><div class="wrap"><div class="cta-band">
  <div><span class="eyebrow">TURI EXPRESS MX</span><h2 style="margin-top:14px">${x('¿Listo para tu próximo viaje?', 'Ready for your next trip?')}</h2>
  <p>${x('Cuéntanos a dónde vas y las fechas que necesitas. Te ayudamos a organizar el traslado de tu grupo.', 'Tell us where you are going and your dates. We help you plan your group’s trip.')}</p></div>
  <div class="actions"><a class="btn btn-primary" href="${urlOf('availability', lang)}">${icon('calendar')}${x('Ver disponibilidad', 'Check availability')}</a>
  <a class="btn btn-light" href="${waHref(x('Hola, quiero cotizar una Nissan Urvan para mi próximo viaje.', 'Hi, I would like a quote for a Nissan Urvan for my next trip.'))}" target="_blank" rel="noopener">${WA_ICON}WhatsApp</a></div>
</div></div></section>`;

// ───────────────────────────── Contenido de cada página ─────────────────────────────
const CONTENT = {
  home: {
    title: ['TURI EXPRESS MX | Renta de Nissan Urvan en Mérida', 'TURI EXPRESS MX | Nissan Urvan Rental in Mérida, Mexico'],
    description: ['Renta de Nissan Urvan para grupos y traslados en Mérida, Yucatán. Hasta 15 pasajeros, por día o por semana. Disponibilidad en línea y confirmación por WhatsApp.',
      'Rent a 15-passenger Nissan Urvan in Mérida, Yucatán, by the day or week. Check availability online, see prices in pesos and US dollars, and confirm on WhatsApp.'],
    body: (x, lang) => `
<section class="hero"><div class="wrap">
  <div class="hero-card">
    <div class="hero-main">
      <span class="eyebrow">${x('Renta de vans en Mérida, Yucatán', 'Van rental in Mérida, Yucatán')}</span>
      <h1>${x('Nissan Urvan<br><span>para todo tu grupo</span>', 'Nissan Urvan<br><span>for your whole group</span>')}</h1>
      <p>${x('Renta por día o por semana. Revisa fechas libres en línea y confirma directo por WhatsApp.', 'Rent by the day or week. Check open dates online and confirm directly on WhatsApp.')}</p>
      ${specChips(x)}
      <div class="hero-van"><img src="/urvan-hero.webp" alt="${x('Nissan Urvan blanca de Turi Express con la puerta lateral abierta', 'White Turi Express Nissan Urvan with its sliding door open')}" width="2000" height="1125" fetchpriority="high"></div>
    </div>
    <div class="hero-side">
      <div class="panel">
        <div class="panel-head"><div><h2>${x('Reserva rápida', 'Quick booking')}</h2><small>${x('¿En qué te ayudamos?', 'How can we help?')}</small></div><a class="icon-btn" href="${urlOf('availability', lang)}" aria-label="${x('Ver disponibilidad', 'Check availability')}">${icon('arrow')}</a></div>
        <div class="price-from" data-price-from hidden>
          <small>${x('PRECIO DESDE', 'PRICES FROM')}</small>
          <strong data-mxn></strong>
          <span data-usd></span>
        </div>
        <div class="tiles">
          <a class="tile" href="${urlOf('availability', lang)}">${icon('calendar')}<strong>${x('Elegir fechas', 'Pick dates')}</strong><small>${x('Calendario en línea', 'Live calendar')}</small></a>
          <a class="tile" href="${urlOf('requirements', lang)}">${icon('id')}<strong>${x('Requisitos', 'Requirements')}</strong><small>${x('Licencia, ID y depósito', 'License, ID, deposit')}</small></a>
          <a class="tile" href="${urlOf('airport', lang)}">${icon('plane')}<strong>${x('Aeropuerto', 'Airport')}</strong><small>${x('Traslados en grupo', 'Group transfers')}</small></a>
          <a class="tile" href="${waHref(x('Hola, quisiera información sobre la renta de una Nissan Urvan.', 'Hi, I would like information about renting a Nissan Urvan.'))}" target="_blank" rel="noopener">${icon('chat')}<strong>WhatsApp</strong><small>${x('Respuesta directa', 'Talk to us')}</small></a>
        </div>
      </div>
      <div class="panel">
        <div class="panel-head" style="margin-bottom:12px"><div><h3>${x('Así de fácil', 'That easy')}</h3><small>${x('Tu viaje en tres pasos', 'Your trip in three steps')}</small></div></div>
        <ul class="check-list">
          <li>${x('Elige tus fechas en el calendario', 'Choose your dates on the calendar')}</li>
          <li>${x('Envía tu nombre y teléfono', 'Send your name and phone')}</li>
          <li>${x('Te confirmamos por WhatsApp', 'We confirm on WhatsApp')}</li>
        </ul>
      </div>
    </div>
  </div>
  <div class="stats">
    <div class="stat"><small>${x('Capacidad', 'Capacity')}</small><strong>15</strong><p>${x('pasajeros con espacio para equipaje', 'passengers with room for luggage')}</p></div>
    <div class="stat"><small>${x('Renta', 'Rental')}</small><strong>${x('Día · Semana', 'Day · Week')}</strong><p>${x('tarifa semanal más conveniente', 'weekly rate saves you more')}</p></div>
    <div class="stat"><small>${x('Atención', 'Service')}</small><strong>8–20 h</strong><p>${x('todos los días por WhatsApp', 'every day on WhatsApp')}</p></div>
  </div>
</div></section>

<section class="section"><div class="wrap">
  <div class="section-head center"><span class="eyebrow">${x('Viaja a tu manera', 'Travel your way')}</span><h2>${x('Una Urvan para cada plan', 'A van for every plan')}</h2>
    <p>${x('Una salida familiar, un traslado importante o varios días de viaje: llega cómodo con tu grupo.', 'A family day out, an important transfer or a multi-day trip: travel comfortably with your group.')}</p></div>
  <div class="grid-3">
    <article class="card"><span class="icon">${icon('plane')}</span><h3>${x('Traslados al aeropuerto', 'Airport transfers')}</h3><p>${x('Llega con tu grupo y equipaje sin depender de varios vehículos.', 'Arrive with your group and luggage without juggling several cars.')}</p><a class="link-arrow" href="${urlOf('airport', lang)}">${x('Conocer el servicio', 'Learn more')}${icon('arrow')}</a></article>
    <article class="card"><span class="icon">${icon('sun')}</span><h3>${x('Viajes y escapadas', 'Trips and getaways')}</h3><p>${x('Cenotes, playas y zonas arqueológicas con espacio para todos.', 'Cenotes, beaches and Mayan ruins with room for everyone.')}</p><a class="link-arrow" href="${urlOf('yucatan', lang)}">${x('Ver opciones', 'See options')}${icon('arrow')}</a></article>
    <article class="card"><span class="icon">${icon('calendar')}</span><h3>${x('Renta por día o semana', 'Daily or weekly rental')}</h3><p>${x('Para eventos, recorridos, trabajo o vacaciones largas.', 'For events, tours, work or longer holidays.')}</p><a class="link-arrow" href="${urlOf('merida', lang)}">${x('Renta en Mérida', 'Rent in Mérida')}${icon('arrow')}</a></article>
  </div>
</div></section>

<section class="section" id="${x('disponibilidad', 'availability')}"><div class="wrap">
  <div class="section-head"><span class="eyebrow">${x('Disponibilidad', 'Availability')}</span><h2>${x('Elige tus fechas', 'Pick your dates')}</h2>
    <p>${x('Todas nuestras unidades son Nissan Urvan. Si una está ocupada, te asignamos otra libre automáticamente.', 'All our vans are Nissan Urvan. If one is booked, we automatically assign you another free one.')}</p></div>
  ${bookingBlock(x, lang)}
</div></section>

<section class="section req"><div class="wrap">
  <div class="section-head"><span class="eyebrow">${x('Antes de rentar', 'Before you rent')}</span><h2>${x('Requisitos sencillos', 'Simple requirements')}</h2></div>
  ${requirementCards(x)}
</div></section>

<section class="section"><div class="wrap">
  <div class="section-head center"><span class="eyebrow">${x('Preguntas frecuentes', 'FAQ')}</span><h2>${x('Resuelve tus dudas', 'Your questions, answered')}</h2></div>
  <div class="faq">${faqs(x).map(([q, a]) => `<details><summary>${q}</summary><p>${a}</p></details>`).join('')}</div>
</div></section>
${ctaBand(x, lang)}`,
    scripts: ['app'],
    jsonld: (x, lang) => [{
      '@context': 'https://schema.org', '@type': 'AutoRental', name: 'Turi Express MX', url: SITE + urlOf('home', lang),
      telephone: '+529995095005', image: SITE + '/og-image.jpg', priceRange: '$$', openingHours: 'Mo-Su 08:00-20:00',
      description: x('Renta de Nissan Urvan para grupos, traslados y viajes de varios días en Mérida, Yucatán.', 'Nissan Urvan rental for groups, transfers and multi-day trips in Mérida, Yucatán.'),
      areaServed: { '@type': 'City', name: 'Mérida, Yucatán, México' },
    }, {
      '@context': 'https://schema.org', '@type': 'FAQPage',
      mainEntity: faqs(x).map(([q, a]) => ({ '@type': 'Question', name: q, acceptedAnswer: { '@type': 'Answer', text: a } })),
    }],
  },

  fleet: {
    title: ['Flota | TURI EXPRESS MX', 'Fleet | TURI EXPRESS MX'],
    description: ['Conoce la Nissan Urvan de 15 pasajeros disponible para renta con Turi Express MX en Mérida.', 'Meet the 15-passenger Nissan Urvan available for rent with Turi Express MX in Mérida.'],
    body: (x, lang) => `
<section class="wrap"><div class="page-hero"><span class="eyebrow">${x('Nuestra flota', 'Our fleet')}</span><h1>${x('Una Urvan para cada gran plan.', 'A van for every big plan.')}</h1>
  <p>${x('Espacio, comodidad y atención directa para tu grupo.', 'Space, comfort and direct service for your group.')}</p></div></section>
<section class="section" style="padding-top:20px"><div class="wrap split">
  <article class="card photo-card"><img src="/urvan-flota.webp" alt="${x('Nissan Urvan de Turi Express MX', 'Turi Express MX Nissan Urvan')}" width="1448" height="1086" loading="lazy">
    <div class="card-body"><span class="eyebrow" style="background:var(--surface)">Nissan Urvan</span><h2 style="font-size:30px">${x('Lista para tu grupo', 'Ready for your group')}</h2>
    <p>${x('Ideal para traslados al aeropuerto, eventos, viajes familiares y recorridos de varios días.', 'Great for airport transfers, events, family trips and multi-day tours.')}</p></div></article>
  <div class="panel">
    <div class="panel-head"><div><h3>${x('Equipamiento', 'Features')}</h3><small>${x('Todas las unidades', 'Every van')}</small></div></div>
    <ul class="check-list">
      <li>${x('Hasta 15 pasajeros', 'Up to 15 passengers')}</li><li>${x('Aire acondicionado', 'Air conditioning')}</li>
      <li>${x('Transmisión manual', 'Manual transmission')}</li><li>Bluetooth</li><li>${x('Espacio para equipaje', 'Room for luggage')}</li>
    </ul>
    <div class="price-from" data-price-from hidden style="margin:20px 0 0"><small>${x('PRECIO DESDE', 'PRICES FROM')}</small><strong data-mxn></strong><span data-usd></span></div>
    <div class="actions" style="margin-top:20px"><a class="btn btn-primary" href="${urlOf('availability', lang)}">${icon('calendar')}${x('Consultar fechas', 'Check dates')}</a></div>
  </div>
</div></section>
${ctaBand(x, lang)}`,
  },

  availability: {
    title: ['Disponibilidad | TURI EXPRESS MX', 'Availability | TURI EXPRESS MX'],
    description: ['Consulta la disponibilidad de Nissan Urvan para renta en Mérida y aparta tus fechas.', 'Check Nissan Urvan availability in Mérida and hold your dates, with prices in pesos and US dollars.'],
    body: (x, lang) => `
<section class="wrap"><div class="page-hero"><span class="eyebrow">${x('Disponibilidad', 'Availability')}</span><h1>${x('Elige las fechas de tu viaje.', 'Choose your travel dates.')}</h1>
  <p>${x('Revisa el calendario; te asignamos una Nissan Urvan libre para tu grupo.', 'Check the calendar; we assign a free Nissan Urvan to your group.')}</p></div></section>
<section class="section" style="padding-top:20px"><div class="wrap">${bookingBlock(x, lang)}</div></section>`,
    scripts: ['app'],
  },

  requirements: {
    title: ['Requisitos | TURI EXPRESS MX', 'Requirements | TURI EXPRESS MX'],
    description: ['Requisitos y políticas para rentar una Nissan Urvan con Turi Express MX en Mérida.', 'Requirements and rental policies for a Nissan Urvan with Turi Express MX in Mérida.'],
    body: (x, lang) => `
<section class="wrap"><div class="page-hero"><span class="eyebrow">${x('Antes de rentar', 'Before you rent')}</span><h1>${x('Todo listo para salir.', 'All set to hit the road.')}</h1>
  <p>${x('Ten estos documentos a la mano para que la entrega sea rápida.', 'Have these documents ready for a quick pick-up.')}</p></div></section>
<section class="section req" style="padding-top:20px"><div class="wrap">
  ${requirementCards(x)}
  <div class="policy panel">
    <div><span class="eyebrow" style="background:var(--surface)">${x('Información importante', 'Good to know')}</span><h2 style="font-size:30px;margin-top:14px">${x('Políticas de uso', 'Rental policies')}</h2>
      <p class="muted" style="margin-top:10px">${x('Las condiciones generales de la renta, claras desde el inicio.', 'The general rental terms, clear from the start.')}</p></div>
    <ul>
      <li><strong>${x('Combustible:', 'Fuel:')}</strong> ${x('se entrega y se devuelve con el mismo nivel.', 'return the van with the same fuel level.')}</li>
      <li><strong>${x('Kilometraje:', 'Mileage:')}</strong> ${x('libre dentro del área metropolitana.', 'unlimited within the metropolitan area.')}</li>
      <li><strong>${x('Entrega:', 'Pick-up:')}</strong> ${x('fecha, hora y lugar se confirman por WhatsApp.', 'date, time and place are confirmed on WhatsApp.')}</li>
      <li><strong>${x('Pago:', 'Payment:')}</strong> ${x('en pesos mexicanos; el monto en dólares es una referencia aproximada.', 'in Mexican pesos; the US dollar amount is an approximate reference.')}</li>
    </ul>
  </div>
</div></section>
${ctaBand(x, lang)}`,
  },

  contact: {
    title: ['Contacto | TURI EXPRESS MX', 'Contact | TURI EXPRESS MX'],
    description: ['Contacta a Turi Express MX por WhatsApp para cotizar la renta de una Nissan Urvan en Mérida.', 'Contact Turi Express MX on WhatsApp for a Nissan Urvan rental quote in Mérida.'],
    body: (x, lang) => `
<section class="wrap"><div class="split" style="margin-top:12px">
  <div class="page-hero" style="margin:0"><span class="eyebrow">${x('Hablemos de tu viaje', 'Let’s plan your trip')}</span><h1>${x('Tu próximo traslado empieza aquí.', 'Your next trip starts here.')}</h1>
    <p>${x('Cuéntanos fechas, destino y número de pasajeros. Te respondemos directamente por WhatsApp.', 'Tell us your dates, destination and group size. We reply directly on WhatsApp.')}</p>
    <a class="btn btn-primary" href="${waHref(x('Hola, quisiera información sobre la renta de una Nissan Urvan.', 'Hi, I would like information about renting a Nissan Urvan.'))}" target="_blank" rel="noopener">${WA_ICON}${x('Escribir por WhatsApp', 'Message us on WhatsApp')}</a></div>
  <aside class="panel contact-lines">
    <div><small>WHATSAPP</small><a href="https://wa.me/${WA}" target="_blank" rel="noopener">${WA_DISPLAY}</a></div>
    <div><small>${x('HORARIO', 'HOURS')}</small><strong>${x('Lun–Dom · 8:00–20:00', 'Mon–Sun · 8 am – 8 pm')}</strong></div>
    <div><small>${x('UBICACIÓN', 'LOCATION')}</small><strong>Mérida, Yucatán, México</strong></div>
    <div><small>${x('IDIOMAS', 'LANGUAGES')}</small><strong>${x('Español · Inglés', 'Spanish · English')}</strong></div>
  </aside>
</div></section>`,
  },

  merida: local({
    title: ['Renta de Urvan en Mérida | Turi Express MX', 'Van Rental in Mérida | Turi Express MX'],
    description: ['Renta una Nissan Urvan para grupos en Mérida, Yucatán. Hasta 15 pasajeros y aire acondicionado.', 'Rent a Nissan Urvan for groups in Mérida, Yucatán. Up to 15 passengers and air conditioning.'],
    eyebrow: ['Renta de Urvan en Mérida', 'Van rental in Mérida'],
    h1: ['Tu grupo se mueve mejor en Mérida.', 'Your group moves better in Mérida.'],
    lead: ['Una Nissan Urvan cómoda para salidas familiares, eventos, recorridos y viajes de varios días.', 'A comfortable Nissan Urvan for family outings, events, tours and multi-day trips.'],
    h2: ['Una opción práctica para grupos', 'A practical choice for groups'],
    text: ['Cuando varias personas viajan juntas, una Urvan hace el traslado más cómodo y sencillo: un solo vehículo, hasta 15 pasajeros y aire acondicionado.', 'When several people travel together, a van makes it easier: one vehicle, up to 15 passengers and air conditioning.'],
    list: [['Ideal para familias, eventos y recorridos', 'Great for families, events and tours'], ['Espacio para pasajeros y equipaje', 'Room for passengers and luggage'], ['Atención directa para confirmar tus fechas', 'Direct service to confirm your dates']],
    aside: ['¿Necesitas una Urvan en Mérida?', 'Need a van in Mérida?'],
    asideText: ['Compártenos fecha, destino y número de pasajeros.', 'Share your dates, destination and group size.'],
    wa: ['Hola, necesito una Urvan para mi grupo en Mérida.', 'Hi, I need a van for my group in Mérida.'],
    icon: 'pin',
  }),
  yucatan: local({
    title: ['Renta de Urvan en Yucatán | Turi Express MX', 'Van Rental in Yucatán | Turi Express MX'],
    description: ['Renta una Nissan Urvan para viajes y grupos en Yucatán: cenotes, playas y zonas arqueológicas.', 'Rent a Nissan Urvan to explore Yucatán with your group: cenotes, beaches and Mayan ruins.'],
    eyebrow: ['Renta de Urvan en Yucatán', 'Van rental in Yucatán'],
    h1: ['Más espacio para conocer Yucatán.', 'More room to explore Yucatán.'],
    lead: ['Una Nissan Urvan para grupos que planean una salida, un recorrido o un viaje de varios días.', 'A Nissan Urvan for groups planning a day trip, a tour or a multi-day journey.'],
    h2: ['Que el camino también sea parte del plan', 'Make the road part of the plan'],
    text: ['Viajen juntos a cenotes, playas, pueblos mágicos y zonas arqueológicas. Cuéntanos tus fechas y el número de pasajeros para orientarte.', 'Travel together to cenotes, beaches, colonial towns and Mayan ruins. Tell us your dates and group size and we will help you plan.'],
    list: [['Hasta 15 pasajeros', 'Up to 15 passengers'], ['Aire acondicionado y espacio para el grupo', 'Air conditioning and room for everyone'], ['Confirmación por WhatsApp', 'Confirmation on WhatsApp']],
    aside: ['Planea tu recorrido', 'Plan your tour'],
    asideText: ['Consulta disponibilidad para las fechas de tu viaje.', 'Check availability for your travel dates.'],
    wa: ['Hola, quisiera cotizar una Nissan Urvan para viajar en Yucatán.', 'Hi, I would like a quote for a Nissan Urvan to travel around Yucatán.'],
    icon: 'route',
  }),
  airport: local({
    title: ['Traslado al Aeropuerto de Mérida para Grupos | Turi Express MX', 'Mérida Airport Group Transfer | Turi Express MX'],
    description: ['Transporte para grupos al aeropuerto de Mérida en Nissan Urvan, con espacio para 15 pasajeros y equipaje.', 'Group transportation to Mérida airport in a Nissan Urvan with room for 15 passengers and luggage.'],
    eyebrow: ['Traslados al aeropuerto de Mérida', 'Mérida airport transfers'],
    h1: ['Viaja al aeropuerto con todo tu grupo.', 'Get to the airport with your whole group.'],
    lead: ['Pasajeros y equipaje en una sola Nissan Urvan, con horario y punto de salida confirmados.', 'Passengers and luggage in a single Nissan Urvan, with time and meeting point confirmed.'],
    h2: ['Menos vehículos, más comodidad', 'Fewer cars, more comfort'],
    text: ['Al pedir tu cotización indica fecha, hora de vuelo, punto de partida y número de pasajeros.', 'When you ask for a quote, tell us the date, flight time, pick-up point and number of passengers.'],
    list: [['Hasta 15 pasajeros', 'Up to 15 passengers'], ['Espacio para maletas', 'Room for suitcases'], ['Horario coordinado por WhatsApp', 'Timing arranged on WhatsApp']],
    aside: ['¿Tu vuelo ya tiene fecha?', 'Flight already booked?'],
    asideText: ['Envíanos los datos de tu grupo y revisamos disponibilidad.', 'Send us your group details and we will check availability.'],
    wa: ['Hola, quisiera cotizar un traslado al aeropuerto de Mérida.', 'Hi, I would like a quote for a transfer to Mérida airport.'],
    icon: 'plane',
  }),

  terms: legal('terms', ['Términos y Condiciones | TURI EXPRESS MX', 'Terms and Conditions | TURI EXPRESS MX'],
    ['Términos y condiciones del servicio de renta de Nissan Urvan de Turi Express MX.', 'Terms and conditions for Nissan Urvan rentals with Turi Express MX.']),
  privacy: legal('privacy', ['Aviso de Privacidad | TURI EXPRESS MX', 'Privacy Notice | TURI EXPRESS MX'],
    ['Aviso de privacidad de Turi Express MX: qué datos recabamos, para qué y cuánto tiempo los conservamos.', 'Turi Express MX privacy notice: what data we collect, why, and how long we keep it.']),
};

function requirementCards(x) {
  return `<div class="grid-4">
    <article class="card"><strong class="badge">25+</strong><h3>${x('Edad mínima', 'Minimum age')}</h3><p>${x('25 años cumplidos.', '25 years or older.')}</p></article>
    <article class="card"><span class="icon">${icon('id')}</span><h3>${x('Licencia vigente', 'Valid license')}</h3><p>${x('Licencia de conducir no vencida.', 'A driver’s license that has not expired.')}</p></article>
    <article class="card"><span class="icon">${icon('shield')}</span><h3>${x('Identificación oficial', 'Official ID')}</h3><p>${x('INE o pasaporte vigente.', 'Valid passport or Mexican INE.')}</p></article>
    <article class="card"><strong class="badge">$</strong><h3>${x('Depósito en garantía', 'Security deposit')}</h3><p>${x('Reembolsable al devolver la unidad.', 'Refunded when you return the van.')}</p></article>
  </div>`;
}

function local(c) {
  return {
    title: c.title, description: c.description,
    body: (x, lang) => {
      const pick = pair => x(pair[0], pair[1]);
      return `
<section class="wrap"><div class="page-hero"><span class="eyebrow">${pick(c.eyebrow)}</span><h1>${pick(c.h1)}</h1><p>${pick(c.lead)}</p>
  <div class="actions"><a class="btn btn-primary" href="${waHref(pick(c.wa))}" target="_blank" rel="noopener">${WA_ICON}${x('Cotizar por WhatsApp', 'Get a quote on WhatsApp')}</a>
  <a class="btn btn-soft" href="${urlOf('availability', lang)}">${icon('calendar')}${x('Ver disponibilidad', 'Check availability')}</a></div></div></section>
<section class="section" style="padding-top:20px"><div class="wrap split">
  <div class="card"><span class="icon">${icon(c.icon)}</span><h2 style="font-size:30px">${pick(c.h2)}</h2><p>${pick(c.text)}</p>
    <ul class="check-list">${c.list.map(l => `<li>${pick(l)}</li>`).join('')}</ul></div>
  <aside class="panel"><div class="panel-head"><div><h3>${pick(c.aside)}</h3><small>${pick(c.asideText)}</small></div></div>
    <div class="price-from" data-price-from hidden><small>${x('PRECIO DESDE', 'PRICES FROM')}</small><strong data-mxn></strong><span data-usd></span></div>
    <a class="btn btn-primary" style="width:100%" href="${urlOf('availability', lang)}">${icon('calendar')}${x('Consultar fechas', 'Check dates')}</a></aside>
</div></section>
${ctaBand(x, lang)}`;
    },
  };
}

function legal(key, title, description) {
  return { title, description, body: (x, lang) => `<section class="wrap"><article class="legal">${LEGAL[key][lang](urlOf, WA_DISPLAY, waHref)}</article></section>` };
}

// ───────────────────────────── Plantilla general ─────────────────────────────
function layout(page, lang) {
  const x = (es, en) => (lang === 'es' ? es : en);
  const c = CONTENT[page.id];
  const other = lang === 'es' ? 'en' : 'es';
  const url = SITE + urlOf(page.id, lang);
  const title = x(...c.title), description = x(...c.description);
  const wa = waHref(x('Hola, quisiera información sobre la renta de una Nissan Urvan.', 'Hi, I would like information about renting a Nissan Urvan.'));
  const navLinks = NAV.map(id => `<a href="${urlOf(id, lang)}"${id === page.id ? ' aria-current="page"' : ''}>${x(...NAV_LABEL[id])}</a>`).join('');
  const langSwitch = `<nav class="lang" aria-label="${x('Idioma', 'Language')}">
      <a href="${urlOf(page.id, 'es')}" hreflang="es" lang="es"${lang === 'es' ? ' aria-current="true"' : ''}>ES</a>
      <a href="${urlOf(page.id, 'en')}" hreflang="en" lang="en"${lang === 'en' ? ' aria-current="true"' : ''}>EN</a></nav>`;
  const jsonld = c.jsonld ? c.jsonld(x, lang).map(o => `<script type="application/ld+json">${JSON.stringify(o)}</script>`).join('\n  ') : '';
  const scripts = [`<script src="/site.js?v=${VERSION}" defer></script>`, ...(c.scripts ?? []).map(s => `<script src="/${s}.js?v=${VERSION}" defer></script>`)].join('');

  return `<!doctype html>
<html lang="${x('es-MX', 'en')}">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
  <title>${esc(title)}</title>
  <meta name="description" content="${esc(description)}">
  <meta name="robots" content="index,follow,max-image-preview:large">
  <meta name="theme-color" content="#eef0f3">
  <link rel="canonical" href="${url}">
  <link rel="alternate" hreflang="es-MX" href="${SITE + urlOf(page.id, 'es')}">
  <link rel="alternate" hreflang="en" href="${SITE + urlOf(page.id, 'en')}">
  <link rel="alternate" hreflang="x-default" href="${SITE + urlOf(page.id, 'es')}">
  <link rel="icon" href="/favicon.svg" type="image/svg+xml">
  <link rel="icon" href="/favicon-32.png" sizes="32x32" type="image/png">
  <link rel="apple-touch-icon" href="/apple-touch-icon.png">
  <link rel="preload" href="/fonts/manrope-latin.woff2" as="font" type="font/woff2" crossorigin>
  <link rel="stylesheet" href="/styles.css?v=${VERSION}">
  <meta property="og:type" content="website">
  <meta property="og:site_name" content="Turi Express MX">
  <meta property="og:title" content="${esc(title)}">
  <meta property="og:description" content="${esc(description)}">
  <meta property="og:url" content="${url}">
  <meta property="og:image" content="${SITE}/og-image.jpg">
  <meta property="og:locale" content="${x('es_MX', 'en_US')}">
  <meta property="og:locale:alternate" content="${x('en_US', 'es_MX')}">
  <meta name="twitter:card" content="summary_large_image">
  ${jsonld}
</head>
<body data-lang="${lang}" data-page="${page.id}">
  <a class="sr-only" href="#main">${x('Ir al contenido', 'Skip to content')}</a>
  <header class="site-header"><div class="wrap header-row">
    <a class="brand" href="${urlOf('home', lang)}"><span class="brand-mark">${icon('van')}</span><span>TURI EXPRESS <small>MX</small></span></a>
    <nav class="nav" aria-label="${x('Navegación principal', 'Main navigation')}">${navLinks}</nav>
    <div class="header-tools">
      ${langSwitch}
      <a class="btn btn-dark btn-sm" href="${wa}" target="_blank" rel="noopener">${WA_ICON}WhatsApp</a>
      <a class="icon-btn" href="${PANEL_URL}" rel="nofollow" title="${x('Panel administrativo', 'Staff panel')}" aria-label="${x('Panel administrativo', 'Staff panel')}">${icon('lock')}</a>
      <button class="icon-btn menu-toggle" type="button" aria-expanded="false" aria-controls="mobile-nav" aria-label="${x('Abrir menú', 'Open menu')}">${icon('menu')}</button>
    </div>
  </div></header>
  <nav id="mobile-nav" class="mobile-nav" aria-label="${x('Menú', 'Menu')}">${navLinks}
    <a class="btn btn-dark" href="${wa}" target="_blank" rel="noopener">${WA_ICON}WhatsApp</a>
    <a href="${PANEL_URL}" rel="nofollow">${x('Panel administrativo', 'Staff panel')}</a></nav>

  <main id="main">
${c.body(x, lang)}
  </main>

  <footer class="footer"><div class="wrap">
    <div class="footer-card">
      <div><a class="brand" href="${urlOf('home', lang)}"><span class="brand-mark">${icon('van')}</span><span>TURI EXPRESS <small>MX</small></span></a>
        <p>${x('Renta de Nissan Urvan para grupos y traslados en Mérida, Yucatán.', 'Nissan Urvan rental for groups and transfers in Mérida, Yucatán.')}</p></div>
      <div><h3>${x('Sitio', 'Site')}</h3><ul>${NAV.map(id => `<li><a href="${urlOf(id, lang)}">${x(...NAV_LABEL[id])}</a></li>`).join('')}</ul></div>
      <div><h3>${x('Servicios', 'Services')}</h3><ul>
        <li><a href="${urlOf('merida', lang)}">${x('Renta en Mérida', 'Rental in Mérida')}</a></li>
        <li><a href="${urlOf('yucatan', lang)}">${x('Viajes por Yucatán', 'Yucatán trips')}</a></li>
        <li><a href="${urlOf('airport', lang)}">${x('Traslado al aeropuerto', 'Airport transfer')}</a></li></ul></div>
      <div><h3>${x('Contacto', 'Contact')}</h3><ul>
        <li><a href="https://wa.me/${WA}" target="_blank" rel="noopener">${WA_DISPLAY}</a></li>
        <li>${x('Lun–Dom · 8:00–20:00', 'Mon–Sun · 8 am – 8 pm')}</li>
        <li><a href="${urlOf('terms', lang)}">${x('Términos y condiciones', 'Terms and conditions')}</a></li>
        <li><a href="${urlOf('privacy', lang)}">${x('Aviso de privacidad', 'Privacy notice')}</a></li></ul></div>
    </div>
    <div class="footer-bottom"><span>© <span data-year>2026</span> TURI EXPRESS MX</span>
      <a href="${urlOf(page.id, other)}" hreflang="${other}" style="color:inherit">${x('View this page in English', 'Ver esta página en español')}</a></div>
  </div></footer>

  <a class="wa-float" href="${waHref(x(`Hola, vengo de la página "${title.split('|')[0].trim()}". Quiero información para rentar una Nissan Urvan.`, `Hi, I'm on the "${title.split('|')[0].trim()}" page. I'd like information about renting a Nissan Urvan.`))}" target="_blank" rel="noopener" aria-label="${x('Escríbenos por WhatsApp', 'Message us on WhatsApp')}">${WA_ICON}<span>${x('¿Rentamos?', 'Chat with us')}</span></a>
  ${scripts}
</body>
</html>
`;
}

// ───────────────────────────── Escritura ─────────────────────────────
let count = 0;
for (const page of PAGES) {
  for (const lang of ['es', 'en']) {
    const out = join(ROOT, page[lang]);
    mkdirSync(dirname(out), { recursive: true });
    writeFileSync(out, layout(page, lang));
    count++;
  }
}
const sitemap = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:xhtml="http://www.w3.org/1999/xhtml">
${PAGES.flatMap(p => ['es', 'en'].map(lang => `  <url><loc>${SITE + urlOf(p.id, lang)}</loc>
    <xhtml:link rel="alternate" hreflang="es-MX" href="${SITE + urlOf(p.id, 'es')}"/>
    <xhtml:link rel="alternate" hreflang="en" href="${SITE + urlOf(p.id, 'en')}"/>
  </url>`)).join('\n')}
</urlset>
`;
writeFileSync(join(ROOT, 'sitemap.xml'), sitemap);
console.log(`Sitio generado: ${count} páginas + sitemap.xml (versión ${VERSION})`);
