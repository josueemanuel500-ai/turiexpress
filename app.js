// Calendario público y solicitud de renta (español e inglés). Requiere site.js (window.TURI).
// La ocupación viene de la API propia y solo trae rangos de fechas por unidad, nunca datos de clientes.
(() => {
  const { API_BASE, waLink, t, locale, fmtMXN, fmtUSD, lang } = window.TURI;
  if (!document.querySelector('#booking-form')) return;

  const today = new Date(); today.setHours(0, 0, 0, 0);
  const iso = d => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  const humanDate = d => (d ? d.toLocaleDateString(locale, { day: 'numeric', month: 'short', year: 'numeric' }) : t('Elige una fecha', 'Pick a date'));
  // Fecha local de Mérida (UTC-6) de un instante ISO.
  const meridaDate = s => new Date(new Date(s).getTime() - 6 * 3600e3).toISOString().slice(0, 10);
  const plural = (n, es, esP, en, enP) => `${n} ${n === 1 ? t(es, en) : t(esP, enP)}`;

  const state = {
    month: new Date(today.getFullYear(), today.getMonth(), 1),
    start: null, end: null,
    units: [{ id: 'u1' }, { id: 'u2' }, { id: 'u3' }],
    busy: [],          // { unit, from, to } en fechas locales AAAA-MM-DD
    pricing: null,     // { daily_cents, weekly_cents, deposit_cents, usd_rate }
  };
  const $ = s => document.querySelector(s);

  const unitBusyOn = (unitId, d) => state.busy.some(b => b.unit === unitId && d >= b.from && d <= b.to);
  const freeUnitsOn = d => state.units.filter(u => !unitBusyOn(u.id, d)).length;
  const rangeHasFreeUnit = (s, e) => state.units.some(u => !state.busy.some(b => b.unit === u.id && b.from <= e && b.to >= s));

  async function loadAvailability() {
    const from = iso(new Date(state.month.getFullYear(), state.month.getMonth(), 1));
    const to = iso(new Date(state.month.getFullYear(), state.month.getMonth() + 2, 0));
    try {
      const res = await fetch(`${API_BASE}/public/availability?from=${from}&to=${to}`);
      if (!res.ok) throw new Error('availability');
      const { vehicles, busy } = await res.json();
      if (vehicles.length) state.units = vehicles;
      state.busy = busy.map(b => ({ unit: b.vehicle_id, from: meridaDate(b.starts_at), to: meridaDate(b.ends_at) }));
    } catch {
      // Sin conexión con el sistema: se deja elegir fechas y se confirma por WhatsApp.
      state.busy = [];
    }
    render();
  }

  function render() {
    const y = state.month.getFullYear(), m = state.month.getMonth();
    const title = state.month.toLocaleDateString(locale, { month: 'long', year: 'numeric' });
    $('#calendar-title').textContent = title.charAt(0).toUpperCase() + title.slice(1);
    const grid = $('#calendar-days');
    grid.innerHTML = '';
    const first = (new Date(y, m, 1).getDay() + 6) % 7, count = new Date(y, m + 1, 0).getDate();
    for (let i = 0; i < first; i++) grid.append(Object.assign(document.createElement('span'), { className: 'day blank' }));
    for (let n = 1; n <= count; n++) {
      const date = new Date(y, m, n), d = iso(date);
      const full = freeUnitsOn(d) === 0;
      const b = document.createElement('button');
      b.type = 'button'; b.className = 'day'; b.textContent = n;
      b.disabled = date < today || full;
      b.title = date < today ? t('Fecha pasada', 'Past date') : full ? t('Sin unidades disponibles', 'No vans available') : t('Disponible', 'Available');
      if ((state.start && d === iso(state.start)) || (state.end && d === iso(state.end))) b.classList.add('selected');
      if (state.start && state.end && date > state.start && date < state.end) b.classList.add('in-range');
      if (full) b.classList.add('full');
      if (d === iso(today)) b.classList.add('today');
      b.addEventListener('click', () => select(date));
      grid.append(b);
    }
    $('#previous-month').disabled = state.month <= new Date(today.getFullYear(), today.getMonth(), 1);
    $('#start-display').textContent = humanDate(state.start);
    $('#end-display').textContent = humanDate(state.end);
    renderEstimate();
    updateSubmit();
  }

  const rentalDays = () => (state.start && state.end ? Math.max(1, Math.round((state.end - state.start) / 86400e3)) : 0);
  function localQuote(days) {
    const p = state.pricing;
    if (!p || !p.daily_cents) return null;
    return Math.floor(days / 7) * p.weekly_cents + Math.min((days % 7) * p.daily_cents, p.weekly_cents);
  }

  let ticket = 0;
  function renderEstimate() {
    const box = $('#price-estimate');
    const days = rentalDays();
    const local = days ? localQuote(days) : null;
    if (!days || local === null) { box.hidden = true; return; }
    const paint = (total, seasons = [], rate = state.pricing?.usd_rate) => {
      const usd = fmtUSD(total, rate);
      const deposit = state.pricing?.deposit_cents;
      box.hidden = false;
      box.innerHTML = `<strong>${plural(days, 'día', 'días', 'day', 'days')} · ${t('estimado', 'estimate')} ${fmtMXN(total)}</strong>
        ${usd ? `<span class="usd">≈ ${usd} ${t('(referencia en dólares)', '(US dollar reference)')}</span>` : ''}
        <small>${seasons.length ? t(`Incluye tarifa de temporada (${seasons.join(', ')}). `, `Includes seasonal rate (${seasons.join(', ')}). `) : ''}${deposit ? t(`Más depósito reembolsable de ${fmtMXN(deposit)}. `, `Plus a refundable deposit of ${fmtMXN(deposit)}. `) : ''}${t('El cobro es en pesos; el precio final se confirma por WhatsApp.', 'Charged in Mexican pesos; final price confirmed on WhatsApp.')}</small>`;
    };
    paint(local);
    // Precio exacto del servidor (considera temporadas: Navidad, Semana Santa, verano…).
    const mine = ++ticket;
    fetch(`${API_BASE}/public/quote?start_date=${iso(state.start)}&end_date=${iso(state.end)}`)
      .then(r => (r.ok ? r.json() : null))
      .then(q => { if (q && mine === ticket && q.days) paint(q.total_cents, q.seasons, q.usd_rate); })
      .catch(() => {});
  }

  function select(date) {
    const msg = $('#form-message');
    if (!state.start || state.end || date <= state.start) { state.start = date; state.end = null; msg.textContent = ''; }
    else {
      if (!rangeHasFreeUnit(iso(state.start), iso(date))) {
        msg.textContent = t('No hay una unidad libre en todo ese rango. Prueba otras fechas o escríbenos por WhatsApp.', 'No single van is free for that whole range. Try other dates or message us on WhatsApp.');
        return;
      }
      msg.textContent = '';
      state.end = date;
    }
    render();
  }

  function updateSubmit() {
    const hasDates = !!(state.start && state.end);
    const hasInfo = $('#name').value.trim().length >= 3 && $('#phone').value.replace(/\D/g, '').length >= 10;
    $('#submit-request').disabled = !(hasDates && hasInfo);
    $('#submit-hint').textContent = hasDates && hasInfo
      ? t('Tu apartado queda registrado y se confirma por WhatsApp.', 'Your hold is registered and confirmed on WhatsApp.')
      : !hasDates && !hasInfo ? t('Elige tus fechas y escribe tu nombre y teléfono.', 'Pick your dates and enter your name and phone.')
        : !hasDates ? t('Elige tu fecha de entrega y de devolución en el calendario.', 'Pick your pick-up and return dates on the calendar.')
          : t('Escribe tu nombre y teléfono para continuar.', 'Enter your name and phone to continue.');
  }

  $('#previous-month').onclick = () => { state.month = new Date(state.month.getFullYear(), state.month.getMonth() - 1, 1); loadAvailability(); };
  $('#next-month').onclick = () => { state.month = new Date(state.month.getFullYear(), state.month.getMonth() + 1, 1); loadAvailability(); };
  $('#clear-dates').onclick = () => { state.start = null; state.end = null; $('#form-message').textContent = ''; render(); };
  $('#name').addEventListener('input', updateSubmit);
  $('#phone').addEventListener('input', updateSubmit);

  $('#booking-form').addEventListener('submit', async event => {
    event.preventDefault();
    const name = $('#name').value.trim(), phone = $('#phone').value.trim();
    const msg = $('#form-message'), btn = $('#submit-request');
    if (!state.start || !state.end) { msg.textContent = t('Selecciona la fecha de entrega y la de devolución.', 'Select your pick-up and return dates.'); return; }
    if (phone.replace(/\D/g, '').length < 10) { msg.textContent = t('Escribe un teléfono válido (al menos 10 dígitos).', 'Enter a valid phone number (at least 10 digits).'); return; }

    // La pestaña se abre en el mismo clic: los navegadores bloquean window.open después de esperar al servidor.
    const tab = window.open('', '_blank');
    btn.disabled = true;
    msg.textContent = t('Registrando tu apartado…', 'Registering your hold…');
    let res = null, data = null;
    try {
      res = await fetch(`${API_BASE}/public/reservations`, {
        method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ start_date: iso(state.start), end_date: iso(state.end), client_name: name, client_phone: phone, website: $('#website')?.value || '' }),
      });
      data = await res.json().catch(() => null);
    } catch { res = null; }
    btn.disabled = false;

    const days = rentalDays();
    const range = `${humanDate(state.start)} – ${humanDate(state.end)} (${plural(days, 'día', 'días', 'day', 'days')})`;
    // El mensaje de WhatsApp va en el idioma del cliente; el personal ve el folio en el panel.
    const base = t(`Hola, soy ${name}. Quiero rentar una Nissan Urvan: ${range}.`, `Hi, I'm ${name}. I'd like to rent a Nissan Urvan: ${range}.`);
    let text;
    if (res && res.ok && data?.reservation) {
      const r = data.reservation;
      const est = r.total_cents ? t(` y el estimado es ${fmtMXN(r.total_cents)}`, ` and the estimate is ${fmtMXN(r.total_cents)}`) : '';
      text = `${base} ${t(`Mi folio es ${r.folio}${est}. ¿Me confirman?`, `My booking number is ${r.folio}${est}. Can you confirm?`)}`;
      msg.textContent = t(`¡Listo! Tu folio es ${r.folio} y te apartamos la unidad unas horas. Escríbenos por WhatsApp para confirmarla.`,
        `Done! Your booking number is ${r.folio} and we are holding a van for a few hours. Message us on WhatsApp to confirm.`);
    } else if (res && res.status === 409) {
      tab?.close();
      msg.textContent = t('Esas fechas se acaban de ocupar. Elige otras.', 'Those dates were just booked. Please choose others.');
      await loadAvailability();
      return;
    } else if (res && res.status >= 400 && res.status < 500) {
      tab?.close();
      msg.textContent = lang === 'es' && data?.error?.message ? data.error.message : t('Revisa tus datos e intenta de nuevo.', 'Please check your details and try again.');
      return;
    } else {
      // El sistema no respondió: la solicitud sigue por WhatsApp para no perder al cliente.
      text = `${base} ${t(`Mi teléfono es ${phone}. ¿Tienen disponibilidad?`, `My phone is ${phone}. Is it available?`)}`;
      msg.textContent = t('Te llevamos a WhatsApp para terminar tu solicitud.', 'Taking you to WhatsApp to finish your request.');
    }
    const url = waLink(text);
    if (tab) tab.location = url; else window.location.href = url;
    state.start = null; state.end = null;
    $('#booking-form').reset();
    await loadAvailability();
  });

  render();
  loadAvailability();
  window.TURI.pricing().then(p => { state.pricing = p; renderEstimate(); });
})();
