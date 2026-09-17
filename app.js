// Configura aquí el WhatsApp del negocio: código de país + número, sin signos ni espacios.
const WHATSAPP_NUMBER = '529995095005';

// Disuade copiar imágenes casualmente. No es protección real: cualquiera con
// herramientas de desarrollador o "ver código fuente" lo evita igual.
document.addEventListener('contextmenu', event => event.preventDefault());

// Proyecto Supabase de Turi Express. La clave "publishable" es segura de exponer
// en el cliente: el acceso real está controlado por las políticas RLS en la base de datos.
const SUPABASE_URL = 'https://wccrvrnyrsxkccwfqbae.supabase.co';
const SUPABASE_ANON_KEY = 'sb_publishable_9nAIxg3Y3uSKVKSw823HgQ_by2ZOexw';
const db = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

const UNITS = [{ id: 1, name: 'Unidad 1' }, { id: 2, name: 'Unidad 2' }, { id: 3, name: 'Unidad 3' }];
const months = ['enero','febrero','marzo','abril','mayo','junio','julio','agosto','septiembre','octubre','noviembre','diciembre'];
const today = new Date(); today.setHours(0, 0, 0, 0);

const iso = date => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
const parseISO = value => { const [y, m, d] = value.split('-').map(Number); return new Date(y, m - 1, d); };
const humanDate = date => date ? date.toLocaleDateString('es-MX', { day: 'numeric', month: 'short', year: 'numeric' }) : 'Elige una fecha';
const overlapsRange = (bStart, bEnd, start, end) => start <= bEnd && end >= bStart;

const state = {
  month: new Date(today.getFullYear(), today.getMonth(), 1),
  start: null,
  end: null,
  bookings: [],       // {unit_id, start_date, end_date} público, sin datos del cliente
  staffBookings: [],  // filas completas, solo visibles para personal autenticado
  staffUnitId: 1,
  pickerField: null,  // 'start' | 'end' | null: qué selector de fecha del panel de personal está abierto
  pickerMonth: new Date(today.getFullYear(), today.getMonth(), 1),
  adminStart: null,   // fecha ISO elegida en el picker del panel de personal
  adminEnd: null,
};

function freeUnitsFor(startISO, endISO, bookings) {
  return UNITS.filter(u => !bookings.some(b => b.unit_id === u.id && overlapsRange(b.start_date, b.end_date, startISO, endISO)));
}

async function loadPublicAvailability() {
  const { data, error } = await db.from('public_availability').select('unit_id,start_date,end_date');
  if (!error && data) state.bookings = data;
  renderCalendar();
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
    const freeCount = UNITS.filter(u => !state.bookings.some(b => b.unit_id === u.id && dISO >= b.start_date && dISO <= b.end_date)).length;
    const fullyBooked = freeCount === 0;
    const button = document.createElement('button');
    button.type = 'button'; button.className = 'day'; button.textContent = n;
    button.disabled = date < today || fullyBooked;
    button.title = date < today ? 'Fecha pasada' : (fullyBooked ? 'Sin unidades disponibles' : 'Disponible');
    if ((state.start && iso(date) === iso(state.start)) || (state.end && iso(date) === iso(state.end))) button.classList.add('selected');
    if (isBetween(date)) button.classList.add('in-range');
    if (fullyBooked) button.classList.add('full');
    button.addEventListener('click', () => selectDate(date));
    dayGrid.append(button);
  }
  document.querySelector('#start-display').textContent = humanDate(state.start);
  document.querySelector('#end-display').textContent = humanDate(state.end);
  updateSubmitState();
}

function selectDate(date) {
  if (!state.start || state.end || date < state.start) { state.start = date; state.end = null; }
  else { state.end = date; }
  renderCalendar();
}

function updateSubmitState() {
  const submitButton = document.querySelector('#submit-request');
  const hint = document.querySelector('#submit-hint');
  const hasDates = !!(state.start && state.end);
  const hasInfo = !!(document.querySelector('#name').value.trim() && document.querySelector('#phone').value.replace(/\D/g, '').length >= 10);
  const ready = hasDates && hasInfo;
  submitButton.disabled = !ready;
  hint.textContent = ready
    ? 'Tu apartado queda registrado y se confirma por WhatsApp.'
    : (!hasDates && !hasInfo ? 'Elige tus fechas y escribe tu nombre y teléfono.'
      : (!hasDates ? 'Elige tu fecha de inicio y fin en el calendario.'
        : 'Escribe tu nombre y teléfono para continuar.'));
}

document.querySelector('#previous-month').onclick = () => { state.month = new Date(state.month.getFullYear(), state.month.getMonth() - 1, 1); renderCalendar(); };
document.querySelector('#next-month').onclick = () => { state.month = new Date(state.month.getFullYear(), state.month.getMonth() + 1, 1); renderCalendar(); };
document.querySelector('#clear-dates').onclick = () => { state.start = null; state.end = null; renderCalendar(); };
document.querySelector('#name').addEventListener('input', updateSubmitState);
document.querySelector('#phone').addEventListener('input', updateSubmitState);

document.querySelector('#booking-form').addEventListener('submit', async event => {
  event.preventDefault();
  const name = document.querySelector('#name').value.trim();
  const phone = document.querySelector('#phone').value.trim();
  const message = document.querySelector('#form-message');
  const submitButton = event.target.querySelector('button[type="submit"]');
  if (!state.start || !state.end) { message.textContent = 'Selecciona una fecha de inicio y una fecha de fin.'; return; }
  if (phone.replace(/\D/g, '').length < 10) { message.textContent = 'Escribe un teléfono válido (al menos 10 dígitos).'; return; }

  const startISO = iso(state.start), endISO = iso(state.end);
  const free = freeUnitsFor(startISO, endISO, state.bookings)[0];
  if (!free) { message.textContent = 'Justo se ocupó esa fecha. Elige otro rango.'; await loadPublicAvailability(); return; }

  // Se abre la pestaña en blanco de forma síncrona (dentro del gesto de clic) porque
  // los navegadores bloquean window.open si llega después de un await: perderían el
  // permiso de "acción iniciada por el usuario" mientras se espera el insert.
  const whatsappTab = window.open('', '_blank', 'noopener');

  submitButton.disabled = true;
  const { error } = await db.from('bookings').insert({
    unit_id: free.id, start_date: startISO, end_date: endISO, client_name: name, client_phone: phone,
  });
  submitButton.disabled = false;
  if (error) {
    if (whatsappTab) whatsappTab.close();
    message.textContent = 'No se pudo registrar el apartado. Intenta de nuevo.';
    await loadPublicAvailability();
    return;
  }

  message.textContent = '';
  const text = `Hola, soy ${name}. Quiero solicitar una Nissan Urvan del ${humanDate(state.start)} al ${humanDate(state.end)}. Mi teléfono es ${phone}. ¿Me confirman disponibilidad?`;
  const waURL = `https://wa.me/${WHATSAPP_NUMBER}?text=${encodeURIComponent(text)}`;
  if (whatsappTab) whatsappTab.location = waURL; else window.open(waURL, '_blank', 'noopener');
  state.start = null; state.end = null;
  document.querySelector('#booking-form').reset();
  await loadPublicAvailability();
});

document.querySelectorAll('.whatsapp-link').forEach(link => {
  link.href = `https://wa.me/${WHATSAPP_NUMBER}?text=${encodeURIComponent(link.dataset.message || 'Hola')}`;
});
document.querySelector('.menu-button').onclick = event => {
  const nav = document.querySelector('.main-nav');
  nav.classList.toggle('open');
  event.currentTarget.setAttribute('aria-expanded', nav.classList.contains('open'));
};
document.querySelector('#year').textContent = new Date().getFullYear();

// ==== Panel de personal ====
const staffModal = document.querySelector('#staff-modal');
const staffLoginView = document.querySelector('#staff-login-view');
const staffPanelView = document.querySelector('#staff-panel-view');

function openStaffModal() { staffModal.hidden = false; }
function closeStaffModal() { staffModal.hidden = true; }

document.querySelectorAll('.staff-open').forEach(btn => btn.addEventListener('click', openStaffModal));
document.querySelector('#staff-close').addEventListener('click', closeStaffModal);
staffModal.addEventListener('click', event => { if (event.target === staffModal) closeStaffModal(); });
window.addEventListener('keydown', event => { if (event.key === 'Escape' && !staffModal.hidden) closeStaffModal(); });
if (new URLSearchParams(location.search).get('admin') === '1') openStaffModal();

document.querySelector('#staff-login-form').addEventListener('submit', async event => {
  event.preventDefault();
  const email = document.querySelector('#staff-email').value.trim();
  const password = document.querySelector('#staff-password').value;
  const errorEl = document.querySelector('#staff-login-error');
  const submitButton = event.currentTarget.querySelector('button[type="submit"]');
  errorEl.textContent = '';
  submitButton.disabled = true;
  submitButton.textContent = 'Verificando acceso…';

  try {
    const { data, error } = await db.auth.signInWithPassword({ email, password });
    if (error || !data.session) {
      const detail = error?.message?.toLowerCase() || '';
      errorEl.textContent = detail.includes('email not confirmed')
        ? 'Confirma el correo de esta cuenta antes de iniciar sesión.'
        : 'No fue posible iniciar sesión. Revisa tu correo y contraseña.';
      return;
    }

    // No dependemos únicamente del evento de Supabase: al validar la sesión,
    // el panel se presenta inmediatamente en esta misma pantalla.
    document.querySelector('#staff-login-form').reset();
    applySession(data.session);
  } catch (_error) {
    errorEl.textContent = 'No pudimos conectar con el acceso. Revisa tu conexión e inténtalo de nuevo.';
  } finally {
    submitButton.disabled = false;
    submitButton.textContent = 'Entrar';
  }
});

document.querySelector('#staff-logout').addEventListener('click', async () => { await db.auth.signOut(); });

function renderUnitTabs() {
  const wrap = document.querySelector('#staff-unit-tabs');
  wrap.innerHTML = '';
  UNITS.forEach(u => {
    const btn = document.createElement('button');
    btn.type = 'button'; btn.textContent = u.name;
    btn.className = 'unit-tab' + (state.staffUnitId === u.id ? ' active' : '');
    btn.addEventListener('click', () => { state.staffUnitId = u.id; renderStaffBookings(); });
    wrap.append(btn);
  });
}

async function loadStaffBookings() {
  const { data, error } = await db.from('bookings').select('*').order('start_date');
  if (!error && data) state.staffBookings = data;
  renderStaffBookings();
}

function renderStaffBookings() {
  renderUnitTabs();
  const list = document.querySelector('#staff-bookings-list');
  list.innerHTML = '';
  const rows = state.staffBookings.filter(b => b.unit_id === state.staffUnitId);
  if (!rows.length) { list.innerHTML = '<p class="fine-print">Sin ocupaciones registradas para esta unidad.</p>'; return; }
  rows.forEach(b => {
    const digits = (b.client_phone || '').replace(/\D/g, '');
    const intl = digits.length === 10 ? `52${digits}` : digits;
    const row = document.createElement('div');
    row.className = 'staff-booking-row';
    row.innerHTML = `
      <div class="staff-row-info">
        <strong>${b.client_name}</strong>${b.pending ? ' <span class="badge-pending">Por confirmar</span>' : ''}
        <div class="staff-row-meta">${humanDate(parseISO(b.start_date))} → ${humanDate(parseISO(b.end_date))}</div>
        <div class="staff-row-meta">${b.client_phone || 'Sin teléfono'}</div>
        ${b.note ? `<div class="staff-row-meta">${b.note}</div>` : ''}
      </div>
      <div class="staff-row-actions">
        ${digits.length >= 10 ? `<a class="button button-small" href="https://wa.me/${intl}" target="_blank" rel="noopener">WhatsApp</a>` : ''}
        <button type="button" class="button-danger">Eliminar</button>
      </div>`;
    row.querySelector('.button-danger').addEventListener('click', () => removeBooking(b.id));
    list.append(row);
  });
}

async function removeBooking(id) {
  if (!window.confirm('¿Eliminar esta ocupación?')) return;
  await db.from('bookings').delete().eq('id', id);
  await loadStaffBookings();
  await loadPublicAvailability();
}

// ==== Selector de fecha (mini calendario) del panel de personal ====
function closePicker() {
  state.pickerField = null;
  document.querySelector('#admin-start-picker').hidden = true;
  document.querySelector('#admin-end-picker').hidden = true;
}

function openPicker(field) {
  state.pickerField = field;
  state.pickerMonth = new Date(today.getFullYear(), today.getMonth(), 1);
  document.querySelector('#admin-start-picker').hidden = field !== 'start';
  document.querySelector('#admin-end-picker').hidden = field !== 'end';
  renderPicker();
}

function renderPicker() {
  const field = state.pickerField;
  if (!field) return;
  const box = document.querySelector(`#admin-${field}-picker`);
  const month = state.pickerMonth;
  const year = month.getFullYear(), number = month.getMonth();
  const first = (new Date(year, number, 1).getDay() + 6) % 7;
  const count = new Date(year, number + 1, 0).getDate();
  const unitBookings = state.staffBookings.filter(b => b.unit_id === state.staffUnitId);
  const weekdayLabels = ['L', 'M', 'M', 'J', 'V', 'S', 'D'];
  let daysHTML = '';
  for (let i = 0; i < first; i++) daysHTML += '<span></span>';
  for (let n = 1; n <= count; n++) {
    const dISO = iso(new Date(year, number, n));
    const booked = unitBookings.some(b => dISO >= b.start_date && dISO <= b.end_date);
    daysHTML += `<button type="button" class="picker-day${booked ? ' booked' : ''}" data-date="${dISO}">${n}</button>`;
  }
  box.innerHTML = `
    <div class="picker-top">
      <button type="button" class="picker-prev">‹</button>
      <span class="picker-title">${months[number]} ${year}</span>
      <button type="button" class="picker-next">›</button>
    </div>
    <div class="picker-grid">
      ${weekdayLabels.map(l => `<span class="picker-weekday">${l}</span>`).join('')}
      ${daysHTML}
    </div>`;
  box.querySelector('.picker-prev').addEventListener('click', () => { state.pickerMonth = new Date(year, number - 1, 1); renderPicker(); });
  box.querySelector('.picker-next').addEventListener('click', () => { state.pickerMonth = new Date(year, number + 1, 1); renderPicker(); });
  box.querySelectorAll('.picker-day').forEach(btn => btn.addEventListener('click', () => selectPickerDate(btn.dataset.date)));
}

function selectPickerDate(dateISO) {
  if (state.pickerField === 'start') { state.adminStart = dateISO; document.querySelector('#admin-start-toggle').textContent = humanDate(parseISO(dateISO)); }
  else if (state.pickerField === 'end') { state.adminEnd = dateISO; document.querySelector('#admin-end-toggle').textContent = humanDate(parseISO(dateISO)); }
  closePicker();
}

document.querySelector('#admin-start-toggle').addEventListener('click', event => { event.stopPropagation(); state.pickerField === 'start' ? closePicker() : openPicker('start'); });
document.querySelector('#admin-end-toggle').addEventListener('click', event => { event.stopPropagation(); state.pickerField === 'end' ? closePicker() : openPicker('end'); });
document.querySelector('#admin-start-picker').addEventListener('click', event => event.stopPropagation());
document.querySelector('#admin-end-picker').addEventListener('click', event => event.stopPropagation());
document.addEventListener('click', () => closePicker());

document.querySelector('#staff-add-booking').addEventListener('click', async () => {
  const clientName = document.querySelector('#admin-client-name').value.trim();
  const clientPhone = document.querySelector('#admin-client-phone').value.trim();
  const note = document.querySelector('#admin-note').value.trim();
  const errorEl = document.querySelector('#staff-add-error');
  errorEl.textContent = '';
  if (!state.adminStart || !state.adminEnd) { errorEl.textContent = 'Selecciona ambas fechas.'; return; }
  if (state.adminEnd < state.adminStart) { errorEl.textContent = 'La fecha de fin debe ser posterior al inicio.'; return; }
  if (!clientName) { errorEl.textContent = 'Escribe el nombre del cliente.'; return; }
  if (clientPhone.replace(/\D/g, '').length < 10) { errorEl.textContent = 'Escribe un teléfono válido.'; return; }

  const { error } = await db.from('bookings').insert({
    unit_id: state.staffUnitId, start_date: state.adminStart, end_date: state.adminEnd,
    client_name: clientName, client_phone: clientPhone, note: note || null,
  });
  if (error) { errorEl.textContent = 'Ya existe una ocupación que se cruza con esas fechas.'; return; }

  state.adminStart = null; state.adminEnd = null;
  document.querySelector('#admin-start-toggle').textContent = 'Selecciona fecha';
  document.querySelector('#admin-end-toggle').textContent = 'Selecciona fecha';
  document.querySelector('#admin-client-name').value = '';
  document.querySelector('#admin-client-phone').value = '';
  document.querySelector('#admin-note').value = '';
  await loadStaffBookings();
  await loadPublicAvailability();
});

function applySession(session) {
  if (session) {
    staffLoginView.hidden = true;
    staffPanelView.hidden = false;
    const name = session.user.user_metadata?.name || session.user.email;
    document.querySelector('#staff-session-label').textContent = `Sesión de ${name}`;
    loadStaffBookings();
  } else {
    staffLoginView.hidden = false;
    staffPanelView.hidden = true;
  }
}

db.auth.onAuthStateChange((_event, session) => applySession(session));
db.auth.getSession().then(({ data }) => applySession(data.session));

renderCalendar();
loadPublicAvailability();

// Respaldo para el acceso de personal desde cualquier enlace o con ?admin=1.
// Se ejecuta al final para evitar que una carga lenta del SDK interfiera con el modal.
function revealStaffAccess() {
  const modal = document.querySelector('#staff-modal');
  if (modal) modal.hidden = false;
}
document.addEventListener('click', event => {
  if (event.target.closest('.staff-open')) {
    event.preventDefault();
    revealStaffAccess();
  }
});
if (new URLSearchParams(window.location.search).get('admin') === '1') {
  window.requestAnimationFrame(revealStaffAccess);
}
