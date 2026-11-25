// Calendario público y solicitud de renta. Requiere legal.js (WHATSAPP_NUMBER, API_BASE, waLink).
// La ocupación viene de la API propia y solo trae rangos de fechas por unidad, nunca datos de clientes.

const months = ['enero','febrero','marzo','abril','mayo','junio','julio','agosto','septiembre','octubre','noviembre','diciembre'];
const today = new Date(); today.setHours(0, 0, 0, 0);

const iso = date => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
const humanDate = date => date ? date.toLocaleDateString('es-MX', { day: 'numeric', month: 'short', year: 'numeric' }) : 'Elige una fecha';
// Fecha local de Mérida (UTC-6) de un instante ISO.
const meridaDate = isoString => new Date(new Date(isoString).getTime() - 6 * 3600e3).toISOString().slice(0, 10);
const mxn = cents => `$${(cents / 100).toLocaleString('es-MX', { maximumFractionDigits: 0 })}`;

const state = {
  month: new Date(today.getFullYear(), today.getMonth(), 1),
  start: null,
  end: null,
  units: [{ id: 'u1' }, { id: 'u2' }, { id: 'u3' }],
  busy: [],            // { unit, from, to } en fechas locales AAAA-MM-DD
  pricing: null,       // { daily_cents, weekly_cents, deposit_cents }
  loadError: false,
};

// Una fecha está ocupada para una unidad si cae entre el día de entrega y el de devolución.
const unitBusyOn = (unitId, dISO) => state.busy.some(b => b.unit === unitId && dISO >= b.from && dISO <= b.to);
const freeUnitsOn = dISO => state.units.filter(u => !unitBusyOn(u.id, dISO)).length;
const rangeHasFreeUnit = (startISO, endISO) => state.units.some(u =>
  !state.busy.some(b => b.unit === u.id && b.from <= endISO && b.to >= startISO));

async function loadPublicAvailability() {
  const from = iso(new Date(state.month.getFullYear(), state.month.getMonth(), 1));
  const to = iso(new Date(state.month.getFullYear(), state.month.getMonth() + 2, 0));
  try {
    const response = await fetch(`${API_BASE}/public/availability?from=${from}&to=${to}`);
    if (!response.ok) throw new Error('availability');
    const { vehicles, busy } = await response.json();
    if (vehicles.length) state.units = vehicles;
    state.busy = busy.map(b => ({ unit: b.vehicle_id, from: meridaDate(b.starts_at), to: meridaDate(b.ends_at) }));
    state.loadError = false;
  } catch (_error) {
    // Sin conexión con el sistema: se deja elegir fechas y se confirma por WhatsApp.
    state.busy = [];
    state.loadError = true;
  }
  renderCalendar();
}

async function loadPricing() {
  try {
    const response = await fetch(`${API_BASE}/public/pricing`);
    if (response.ok) state.pricing = await response.json();
  } catch (_error) { /* el estimado es opcional */ }
  renderEstimate();
}

function isBetween(date) { return state.start && state.end && date > state.start && date < state.end; }

function renderCalendar() {
  const { month } = state; const year = month.getFullYear(), number = month.getMonth();
  document.querySelector('#calendar-title').textContent = `${months[number]} ${year}`;
  const dayGrid = document.querySelector('#calendar-days');
  dayGrid.innerHTML = '';
  const first = (new Date(year, number, 1).getDay() + 6) % 7, count = new Date(year, number + 1, 0).getDate();
  for (let i = 0; i < first; i++) dayGrid.append(Object.assign(document.createElement('span'), { className: 'day blank' }));
  for (let n = 1; n <= count; n++) {
    const date = new Date(year, number, n);
    const dISO = iso(date);
    const fullyBooked = freeUnitsOn(dISO) === 0;
    const button = document.createElement('button');
    button.type = 'button'; button.className = 'day'; button.textContent = n;
    button.disabled = date < today || fullyBooked;
    button.title = date < today ? 'Fecha pasada' : (fullyBooked ? 'Sin unidades disponibles' : 'Disponible');
    if ((state.start && dISO === iso(state.start)) || (state.end && dISO === iso(state.end))) button.classList.add('selected');
    if (isBetween(date)) button.classList.add('in-range');
    if (fullyBooked) button.classList.add('full');
    button.addEventListener('click', () => selectDate(date));
    dayGrid.append(button);
  }
  document.querySelector('#start-display').textContent = humanDate(state.start);
  document.querySelector('#end-display').textContent = humanDate(state.end);
  renderEstimate();
  updateSubmitState();
}

function rentalDays() {
  if (!state.start || !state.end) return 0;
  return Math.max(1, Math.round((state.end - state.start) / 86400e3));
}

function quote(days) {
  const p = state.pricing;
  if (!p || !p.daily_cents) return null;
  const weeks = Math.floor(days / 7), rest = days % 7;
  return weeks * p.weekly_cents + Math.min(rest * p.daily_cents, p.weekly_cents);
}

let estimateTicket = 0;
function renderEstimate() {
  const box = document.querySelector('#price-estimate');
  if (!box) return;
  const days = rentalDays();
  const total = days ? quote(days) : null;
  if (!days || total === null) { box.hidden = true; return; }
  const paint = (amount, seasons = []) => {
    box.hidden = false;
    box.innerHTML = `<strong>${days} día${days === 1 ? '' : 's'} · estimado ${mxn(amount)} MXN</strong>
      <small>${seasons.length ? `Incluye tarifa de temporada (${seasons.join(', ')}). ` : ''}${state.pricing.deposit_cents ? `Más depósito en garantía reembolsable de ${mxn(state.pricing.deposit_cents)}. ` : ''}El precio final se confirma por WhatsApp.</small>`;
  };
  paint(total);
  // Precio exacto del servidor (considera temporadas: Navidad, Semana Santa, verano…).
  const ticket = ++estimateTicket;
  fetch(`${API_BASE}/public/quote?start_date=${iso(state.start)}&end_date=${iso(state.end)}`)
    .then(r => (r.ok ? r.json() : null))
    .then(q => { if (q && ticket === estimateTicket && q.days) paint(q.total_cents, q.seasons); })
    .catch(() => {});
}

function selectDate(date) {
  if (!state.start || state.end || date <= state.start) { state.start = date; state.end = null; }
  else {
    if (!rangeHasFreeUnit(iso(state.start), iso(date))) {
      document.querySelector('#form-message').textContent = 'No hay una sola unidad libre todo ese rango. Prueba con otras fechas o escríbenos por WhatsApp.';
      return;
    }
    document.querySelector('#form-message').textContent = '';
    state.end = date;
  }
  renderCalendar();
}

function updateSubmitState() {
  const submitButton = document.querySelector('#submit-request');
  const hint = document.querySelector('#submit-hint');
  const hasDates = !!(state.start && state.end);
  const hasInfo = !!(document.querySelector('#name').value.trim().length >= 3 && document.querySelector('#phone').value.replace(/\D/g, '').length >= 10);
  const ready = hasDates && hasInfo;
  submitButton.disabled = !ready;
  hint.textContent = ready
    ? 'Tu apartado queda registrado y se confirma por WhatsApp.'
    : (!hasDates && !hasInfo ? 'Elige tus fechas y escribe tu nombre y teléfono.'
      : (!hasDates ? 'Elige tu fecha de entrega y de devolución en el calendario.'
        : 'Escribe tu nombre y teléfono para continuar.'));
}

document.querySelector('#previous-month').onclick = () => { state.month = new Date(state.month.getFullYear(), state.month.getMonth() - 1, 1); loadPublicAvailability(); };
document.querySelector('#next-month').onclick = () => { state.month = new Date(state.month.getFullYear(), state.month.getMonth() + 1, 1); loadPublicAvailability(); };
document.querySelector('#clear-dates').onclick = () => { state.start = null; state.end = null; renderCalendar(); };
document.querySelector('#name').addEventListener('input', updateSubmitState);
document.querySelector('#phone').addEventListener('input', updateSubmitState);

document.querySelector('#booking-form').addEventListener('submit', async event => {
  event.preventDefault();
  const name = document.querySelector('#name').value.trim();
  const phone = document.querySelector('#phone').value.trim();
  const message = document.querySelector('#form-message');
  const submitButton = event.target.querySelector('button[type="submit"]');
  if (!state.start || !state.end) { message.textContent = 'Selecciona la fecha de entrega y la de devolución.'; return; }
  if (phone.replace(/\D/g, '').length < 10) { message.textContent = 'Escribe un teléfono válido (al menos 10 dígitos).'; return; }

  // La pestaña se abre en el mismo gesto de clic: los navegadores bloquean
  // window.open si llega después de esperar la respuesta del servidor.
  const whatsappTab = window.open('', '_blank');

  submitButton.disabled = true;
  message.textContent = 'Registrando tu apartado…';
  let response = null, data = null;
  try {
    response = await fetch(`${API_BASE}/public/reservations`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        start_date: iso(state.start),
        end_date: iso(state.end),
        client_name: name,
        client_phone: phone,
        website: document.querySelector('#website')?.value || '',
      }),
    });
    data = await response.json().catch(() => null);
  } catch (_error) { response = null; }
  submitButton.disabled = false;

  const days = rentalDays();
  const base = `Hola, soy ${name}. Quiero rentar una Nissan Urvan del ${humanDate(state.start)} al ${humanDate(state.end)} (${days} día${days === 1 ? '' : 's'}).`;
  let text;
  if (response && response.ok && data?.reservation) {
    const r = data.reservation;
    text = `${base} Mi folio es ${r.folio}${r.total_cents ? ` y el estimado es ${mxn(r.total_cents)}` : ''}. ¿Me confirman?`;
    message.textContent = `¡Listo! Tu folio es ${r.folio} y te apartamos la unidad unas horas. Escríbenos por WhatsApp para confirmarla.`;
  } else if (response && response.status === 409) {
    if (whatsappTab) whatsappTab.close();
    message.textContent = data?.error?.message || 'Esas fechas se acaban de ocupar. Elige otras.';
    await loadPublicAvailability();
    return;
  } else if (response && response.status >= 400 && response.status < 500) {
    if (whatsappTab) whatsappTab.close();
    message.textContent = data?.error?.message || 'Revisa tus datos e intenta de nuevo.';
    return;
  } else {
    // El sistema no respondió: la solicitud sigue por WhatsApp para no perder al cliente.
    text = `${base} Mi teléfono es ${phone}. ¿Tienen disponibilidad?`;
    message.textContent = 'Te llevamos a WhatsApp para terminar tu solicitud.';
  }
  const url = waLink(text);
  if (whatsappTab) whatsappTab.location = url; else window.location.href = url;
  state.start = null; state.end = null;
  document.querySelector('#booking-form').reset();
  await loadPublicAvailability();
});

renderCalendar();
loadPublicAvailability();
loadPricing();
