// Panel de Turi Express. Sin dependencias ni compilación: módulos nativos del navegador.
// La sesión vive en una cookie httpOnly (el JavaScript nunca ve el token).

import { ic, hydrateIcons } from './icons.js?v=3';

const APP_VERSION = '1.1.0'; // Versión del panel; debe coincidir con version.json al desplegar.
const TZ = 'America/Merida';
const OFFSET_H = 6; // Mérida: UTC-6 todo el año
const $ = (s, el = document) => el.querySelector(s);
const $$ = (s, el = document) => [...el.querySelectorAll(s)];

const STATUS = {
  new: 'Solicitud', quoted: 'Cotizada', hold: 'Apartada', deposit_pending: 'Esperando anticipo',
  confirmed: 'Confirmada', assigned: 'Asignada', in_service: 'En renta', completed: 'Terminada',
  cancelled: 'Cancelada', no_show: 'No se presentó',
};
const EXPENSE_CAT = {
  fuel: 'Gasolina', maintenance: 'Mantenimiento', repair: 'Reparación', insurance: 'Seguro',
  cleaning: 'Limpieza', tolls: 'Casetas', taxes: 'Impuestos/tenencia', salary: 'Sueldos', other: 'Otro',
};
const EXPENSE_ICON = { fuel: 'fuel', maintenance: 'wrench', repair: 'hammer', insurance: 'shield', cleaning: 'sparkles', tolls: 'ticket', taxes: 'receipt', salary: 'user', other: 'box' };
const PAY_KIND = { deposit: 'Anticipo', payment: 'Pago', refund: 'Reembolso' };
const PAY_METHOD = { cash: 'Efectivo', transfer: 'Transferencia', card: 'Tarjeta', other: 'Otro' };
const FUEL = ['Vacío', '1/4', '1/2', '3/4', 'Lleno'];
const FILTERS = {
  solicitudes: { label: 'Solicitudes', status: 'new,quoted' },
  activas: { label: 'Por entregar', status: 'confirmed,assigned,hold,deposit_pending' },
  enrenta: { label: 'En renta', status: 'in_service' },
  terminadas: { label: 'Terminadas', status: 'completed' },
  canceladas: { label: 'Canceladas', status: 'cancelled,no_show' },
  todas: { label: 'Todas', status: '' },
};

const state = { me: null, vehicles: [], pricing: {}, business: {}, push: {} };

// ───────────────────────────── utilidades ─────────────────────────────
const esc = v => String(v ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const mxn = cents => `$${((cents ?? 0) / 100).toLocaleString('es-MX', { minimumFractionDigits: 0, maximumFractionDigits: 2 })}`;
const toCents = v => Math.round(Number(String(v).replace(/[^\d.]/g, '') || 0) * 100);
const pesos = cents => (cents ?? 0) / 100;
const fmtDT = iso => iso ? new Date(iso).toLocaleString('es-MX', { timeZone: TZ, weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) : '—';
const fmtD = iso => iso ? new Date(iso.length === 10 ? `${iso}T12:00:00-06:00` : iso).toLocaleDateString('es-MX', { timeZone: TZ, day: 'numeric', month: 'short', year: 'numeric' }) : '—';
const localISODate = (d = new Date()) => new Date(d.getTime() - OFFSET_H * 3600e3).toISOString().slice(0, 10);
const thisMonth = () => localISODate().slice(0, 7);
const toLocalInput = iso => new Date(new Date(iso).getTime() - OFFSET_H * 3600e3).toISOString().slice(0, 16);
const fromLocalInput = v => new Date(`${v}:00-06:00`).toISOString();
const monthLabel = ym => { const t = new Date(`${ym}-15T12:00:00-06:00`).toLocaleDateString('es-MX', { month: 'long', year: 'numeric' }); return t[0].toUpperCase() + t.slice(1); };
const shiftMonth = (ym, n) => { const [y, m] = ym.split('-').map(Number); const d = new Date(Date.UTC(y, m - 1 + n, 1)); return d.toISOString().slice(0, 7); };
const monthNav = (view, ym) => `<div class="month-nav">
  <a class="btn sm icon" href="#/${view}?m=${shiftMonth(ym, -1)}" aria-label="Mes anterior">${ic('left')}</a>
  <strong>${monthLabel(ym)}</strong>
  <a class="btn sm icon" href="#/${view}?m=${shiftMonth(ym, 1)}" aria-label="Mes siguiente">${ic('right')}</a></div>`;
const pill = s =>`<span class="pill ${esc(s)}">${esc(STATUS[s] ?? s)}</span>`;
const wa = (phone, text) => `https://wa.me/${String(phone).replace(/\D/g, '')}?text=${encodeURIComponent(text)}`;
function localQuote(a, b, daily, weekly, discount = 0) {
  const days = daysBetween(a, b), weeks = Math.floor(days / 7), rest = days % 7;
  return Math.max(0, weeks * weekly + Math.min(rest * daily, weekly) - discount);
}
const daysBetween = (a, b) => Math.max(1, Math.ceil((new Date(b) - new Date(a) - 2 * 3600e3) / 86400e3));

class ApiError extends Error { constructor(message, status, expired = false) { super(message); this.status = status; this.expired = expired; } }

async function api(path, { method = 'GET', body } = {}) {
  const res = await fetch(`/v1${path}`, {
    method, credentials: 'same-origin',
    headers: body ? { 'content-type': 'application/json' } : {},
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await res.json().catch(() => ({}));
  if (res.status === 401 && !path.startsWith('/auth/login')) { showLogin(data?.error?.message); throw new ApiError('Sesión requerida', 401, true); }
  if (!res.ok) throw new ApiError(data?.error?.message || 'No se pudo completar la acción', res.status);
  return data;
}

let toastTimer;
function toast(msg, error = false) {
  const el = $('#toast');
  el.textContent = msg; el.className = `toast${error ? ' error' : ''}`; el.hidden = false;
  clearTimeout(toastTimer); toastTimer = setTimeout(() => { el.hidden = true; }, error ? 5000 : 2800);
}

function openModal(html, onReady) {
  $('#modal-card').innerHTML = html;
  $('#modal').hidden = false;
  onReady?.($('#modal-card'));
  $('#modal-card input, #modal-card select')?.focus();
}
const closeModal = () => { $('#modal').hidden = true; $('#modal-card').innerHTML = ''; };
$('#modal').addEventListener('click', e => { if (e.target.id === 'modal' || e.target.closest('[data-action="close-modal"]')) closeModal(); });

/** Envía un formulario sin recargar, desactivando el botón mientras tanto. */
function onSubmit(form, handler) {
  form.addEventListener('submit', async e => {
    e.preventDefault();
    const btn = form.querySelector('[type=submit]');
    const err = form.querySelector('.form-error');
    if (err) err.hidden = true;
    if (btn) btn.disabled = true;
    try { await handler(Object.fromEntries(new FormData(form)), form); }
    catch (error) {
      if (error.expired) return;
      if (err) { err.textContent = error.message; err.hidden = false; } else toast(error.message, true);
    } finally { if (btn) btn.disabled = false; }
  });
}

// ───────────────────────────── sesión ─────────────────────────────
function showLogin(message) {
  state.me = null;
  $('#boot').hidden = true; $('#app').hidden = true; $('#login').hidden = false;
  const err = $('#login-error');
  if (message && message !== 'Sesión requerida') { err.textContent = message; err.hidden = false; }
}

onSubmit($('#login-form'), async data => {
  await api('/auth/login', { method: 'POST', body: { email: data.email, password: data.password } });
  $('#login-form').reset();
  await hydrateIcons();
start();
});

async function start() {
  try {
    const boot = await api('/ops/bootstrap');
    Object.assign(state, { me: boot.user, vehicles: boot.vehicles, pricing: boot.pricing, business: boot.business, push: boot.push });
  } catch (error) {
    if (!error.expired) { $('#boot').innerHTML = `<p class="empty">No se pudo conectar con el servidor.<br><button class="btn" data-action="reload">Reintentar</button></p>`; }
    return;
  }
  $('#me-name').textContent = state.me.name;
  $('#boot').hidden = true; $('#login').hidden = true; $('#app').hidden = false;
  route();
  // Permiso y suscripción automáticos (en iPhone necesita un toque: aviso en Inicio).
  ensurePush(!IOS).then(r => { if (r === 'granted' && $('#push-banner')) $('#push-banner').remove(); }).catch(() => {});
}

// ───────────────────────────── router ─────────────────────────────
const views = {};
let currentRender = 0;

async function route() {
  if (!state.me) return;
  const [path, query = ''] = location.hash.replace(/^#\/?/, '').split('?');
  const [name = 'inicio', id] = path.split('/');
  const params = Object.fromEntries(new URLSearchParams(query));
  const view = views[name] ?? views.inicio;
  $$('#nav a').forEach(a => a.classList.toggle('active', a.dataset.nav === (name === 'nueva' ? 'reservas' : name)));
  // El botón flotante solo en las listas; en fichas y formularios estorbaría a los botones de abajo.
  $('#fab').hidden = !['inicio', 'reservas', 'calendario', 'clientes'].includes(name) || Boolean(id);
  const ticket = ++currentRender;
  const el = $('#view');
  el.innerHTML = '<div class="empty"><div class="spinner" style="margin:auto"></div></div>';
  try {
    const html = await view.render(id, params);
    if (ticket !== currentRender) return;
    el.innerHTML = html;
    view.after?.(el, id, params);
    el.focus({ preventScroll: true });
    window.scrollTo(0, 0);
  } catch (error) {
    if (error.expired || ticket !== currentRender) return;
    el.innerHTML = `<div class="empty">${esc(error.message)}<br><br><button class="btn" data-action="reload-view">Reintentar</button></div>`;
  }
  refreshBadge();
}
window.addEventListener('hashchange', route);

async function refreshBadge() {
  try {
    const { data } = await api('/ops/reservations?status=new,quoted&limit=99');
    const b = $('#pending-badge');
    b.textContent = data.length; b.hidden = !data.length;
    if ('setAppBadge' in navigator) data.length ? navigator.setAppBadge(data.length) : navigator.clearAppBadge();
  } catch { /* sin conexión */ }
}

// ───────────────────────────── Inicio ─────────────────────────────
views.inicio = {
  async render(_id, params) {
    const month = params.m || thisMonth();
    const d = await api(`/ops/dashboard?month=${month}`);
    const max = Math.max(1, ...d.series.flatMap(s => [s.income_cents, s.expense_cents]));
    const fleet = d.fleet.map(v => {
      const rented = v.current_id && v.current_status === 'in_service';
      const reserved = v.current_id && !rented;
      const cls = rented ? 'rented' : reserved ? 'reserved' : '';
      const label = rented ? '<span class="pill in_service">Rentada</span>' : reserved ? '<span class="pill confirmed">Por entregar</span>' : '<span class="pill ok">Disponible</span>';
      return `<div class="card unit ${cls}">
        <h3>${esc(v.name)} ${label}</h3>
        ${v.current_id ? `<p><a href="#/reservas/${v.current_id}"><strong>${esc(v.current_client)}</strong></a><br>
            <small class="muted">${rented ? 'Regresa' : 'Entrega'} ${fmtDT(rented ? v.current_ends : v.current_starts)}</small></p>
            <a class="btn wa sm" href="${wa(v.current_phone, `Hola ${v.current_client}, te escribimos de ${state.business.name || 'Turi Express'}.`)}" target="_blank" rel="noopener">WhatsApp</a>`
          : `<p class="muted">Libre ahora.</p>`}
        ${v.next_id ? `<p><small class="muted">Siguiente: <a href="#/reservas/${v.next_id}">${esc(v.next_client)}</a> · ${fmtDT(v.next_starts)}</small></p>` : ''}
      </div>`;
    }).join('');
    const agenda = d.agenda.length ? d.agenda.map(a => `
      <a class="item" href="#/reservas/${a.id}">
        <div><strong class="with-ic">${a.kind === 'pickup' ? `${ic('van')}Entrega` : `${ic('undo')}Devolución`} · ${esc(a.client_name)}</strong>
          <div class="meta">${fmtDT(a.at)} · ${esc(a.vehicle_name ?? 'Sin unidad')} · ${esc(a.folio)}</div></div>
        <div class="right">${new Date(a.at) < new Date() && a.kind === 'return' ? '<span class="pill bad">Atrasada</span>' : pill(a.status)}</div>
      </a>`).join('') : '<p class="empty">Sin entregas ni devoluciones en los próximos días.</p>';

    return `
      <div class="view-head">
        <h1>Hola, ${esc(state.me.name.split(' ')[0])}</h1>
        ${monthNav('inicio', month)}
      </div>
      <div id="push-banner">${pushBanner()}</div>
      ${d.pending_requests ? `<a class="banner" href="#/reservas?f=solicitudes"><span class="with-ic">${ic('bell')}${d.pending_requests} solicitud${d.pending_requests > 1 ? 'es' : ''} nueva${d.pending_requests > 1 ? 's' : ''} por atender</span><span class="with-ic">Ver${ic('right')}</span></a>` : ''}
      <div class="kpis section">
        <div class="kpi good"><small>Cobrado</small><strong>${mxn(d.income_cents)}</strong></div>
        <div class="kpi bad"><small>Gastos</small><strong>${mxn(d.expense_cents)}</strong></div>
        <div class="kpi ${d.profit_cents >= 0 ? 'good' : 'bad'}"><small>Utilidad</small><strong>${mxn(d.profit_cents)}</strong></div>
        <div class="kpi warn"><small>Por cobrar</small><strong>${mxn(d.outstanding_cents)}</strong></div>
        <div class="kpi"><small>Rentas del mes</small><strong>${d.rentals}</strong></div>
        <div class="kpi"><small>Ocupación</small><strong>${Math.round(d.occupancy * 100)}%</strong></div>
      </div>
      <div class="section"><h2>Unidades ahora</h2><div class="fleet">${fleet}</div></div>
      <div class="section"><h2>Agenda próxima</h2><div class="list">${agenda}</div></div>
      <div class="section card">
        <h2>Ingresos vs gastos (6 meses)</h2>
        <div class="bars">${d.series.map(s => `
          <div class="bar-col" title="${monthLabel(s.month)}: cobrado ${mxn(s.income_cents)} · gastos ${mxn(s.expense_cents)}">
            <div class="bar-pair"><div class="bar in" style="height:${(s.income_cents / max) * 100}%"></div><div class="bar out" style="height:${(s.expense_cents / max) * 100}%"></div></div>
            <span>${new Date(`${s.month}-15T12:00:00-06:00`).toLocaleDateString('es-MX', { month: 'short' })}</span>
          </div>`).join('')}</div>
        <div class="legend"><span><i style="background:var(--bright)"></i>Cobrado</span><span><i style="background:#f0a39a"></i>Gastos</span></div>
      </div>
      <div class="section card">
        <h2>Por unidad · ${monthLabel(month)}</h2>
        <div class="table-wrap"><table>
          <thead><tr><th>Unidad</th><th class="num">Días rentada</th><th class="num">Cobrado</th><th class="num">Gastos</th><th class="num">Utilidad</th></tr></thead>
          <tbody>${d.per_vehicle.map(v => `<tr><td>${esc(v.name)}</td><td class="num">${Math.round(v.rented_days)}</td>
            <td class="num">${mxn(v.income_cents)}</td><td class="num">${mxn(v.expense_cents)}</td>
            <td class="num"><strong>${mxn(v.income_cents - v.expense_cents)}</strong></td></tr>`).join('')}</tbody>
        </table></div>
        <p class="muted"><small>Facturado (rentas que inician este mes): ${mxn(d.billed_cents)}. "Cobrado" es el dinero recibido en el mes.</small></p>
      </div>`;
  },
};

// ───────────────────────────── Rentas (lista) ─────────────────────────────
views.reservas = {
  async render(id, params) {
    if (id) return views.detalle.render(id, params);
    const f = FILTERS[params.f] ? params.f : 'activas';
    const q = params.q || '';
    const qs = new URLSearchParams({ limit: '200' });
    if (FILTERS[f].status) qs.set('status', FILTERS[f].status);
    if (q) qs.set('q', q);
    const { data } = await api(`/ops/reservations?${qs}`);
    // Próximas primero en filtros de operación; historial en orden inverso.
    if (['solicitudes', 'activas', 'enrenta'].includes(f)) data.sort((a, b) => new Date(a.starts_at) - new Date(b.starts_at));
    return `
      <div class="view-head"><h1>Rentas</h1><a class="btn primary" href="#/nueva">${ic('plus')}Nueva renta</a></div>
      <div class="chips">${Object.entries(FILTERS).map(([k, v]) => `<a class="chip ${k === f ? 'active' : ''}" href="#/reservas?f=${k}${q ? `&q=${encodeURIComponent(q)}` : ''}">${v.label}</a>`).join('')}</div>
      <form id="search" class="row" style="margin-bottom:12px"><input name="q" type="search" placeholder="Buscar por nombre, teléfono o folio" value="${esc(q)}"><input type="hidden" name="f" value="${f}"></form>
      <div class="list">${data.length ? data.map(reservationItem).join('') : '<p class="empty">No hay rentas en esta vista.</p>'}</div>`;
  },
  after(el, id, params) {
    if (id) return views.detalle.after(el, id, params);
    const form = $('#search', el);
    form?.addEventListener('submit', e => { e.preventDefault(); const d = new FormData(form); location.hash = `#/reservas?f=${d.get('f')}&q=${encodeURIComponent(d.get('q'))}`; });
  },
};

function reservationItem(r) {
  return `<a class="item" href="#/reservas/${r.id}">
    <div><strong>${esc(r.client_name)}</strong> <small class="muted">${esc(r.folio)}</small>
      <div class="meta">${fmtDT(r.starts_at)} → ${fmtDT(r.ends_at)}</div>
      <div class="meta">${esc(r.vehicle_name ?? 'Sin unidad')} · ${daysBetween(r.starts_at, r.ends_at)} días${r.source === 'website' ? ' · web' : ''}</div></div>
    <div class="right">${pill(r.status)}<div class="amount">${mxn(r.quote_cents)}</div>
      ${r.balance_cents > 0 && !['cancelled', 'no_show', 'new', 'quoted'].includes(r.status) ? `<small class="amount due">Debe ${mxn(r.balance_cents)}</small>` : ''}</div>
  </a>`;
}

// ───────────────────────────── Detalle de renta ─────────────────────────────
views.detalle = {
  async render(id) {
    const { reservation: r, payments, events, client } = await api(`/ops/reservations/${id}`);
    this.data = { r, payments, client };
    const days = daysBetween(r.starts_at, r.ends_at);
    const b = state.business.name || 'Turi Express';
    const msgs = {
      confirm: `Hola ${r.client_name}, tu renta ${r.folio} con ${b} está confirmada ✅\n🚐 ${r.vehicle_name ?? 'Nissan Urvan'}\n📅 Entrega: ${fmtDT(r.starts_at)}\n📅 Devolución: ${fmtDT(r.ends_at)}\n💰 Total: ${mxn(r.quote_cents)}${r.paid_cents ? ` · Pagado: ${mxn(r.paid_cents)}` : ''} · Saldo: ${mxn(r.balance_cents)}\n🔒 Depósito en garantía: ${mxn(r.guarantee_cents)} (reembolsable)\nTrae INE y licencia de conducir vigente. ¡Gracias!`,
      remind: `Hola ${r.client_name}, te recordamos tu entrega de ${r.vehicle_name ?? 'la Urvan'} el ${fmtDT(r.starts_at)}. Lugar: ${r.pickup}. Cualquier cambio avísanos por aquí.`,
      return: `Hola ${r.client_name}, te recordamos que la devolución de ${r.vehicle_name ?? 'la unidad'} es el ${fmtDT(r.ends_at)}, con el mismo nivel de combustible. ¡Gracias por viajar con ${b}!`,
      balance: `Hola ${r.client_name}, de tu renta ${r.folio} queda un saldo de ${mxn(r.balance_cents)}. ¿Nos confirmas cómo prefieres pagarlo?`,
    };
    const actions = statusActions(r);
    return `
      <a class="back" href="#/reservas">${ic('left')}Rentas</a>
      <div class="view-head"><div><h1>${esc(r.client_name)}</h1><span class="muted">${esc(r.folio)} · ${r.source === 'website' ? 'Solicitud web' : 'Capturada por personal'}</span></div>${pill(r.status)}</div>
      ${client?.blocked ? `<p class="form-error with-ic">${ic('alert')}Este cliente está marcado como bloqueado. Revisa sus notas antes de rentar.</p>` : ''}
      <div class="actions">${actions}
        <a class="btn" href="#/editar/${r.id}">${ic('edit')}Editar</a>
        <button class="btn" data-action="contract" data-id="${r.id}" data-folio="${esc(r.folio)}">${ic('file')}Contrato PDF</button>
      </div>
      <div class="section card">
        <dl class="dl">
          <div><dt>Unidad</dt><dd>${esc(r.vehicle_name ?? 'Sin asignar')}</dd></div>
          <div><dt>Días</dt><dd>${days}</dd></div>
          <div><dt>Entrega</dt><dd>${fmtDT(r.starts_at)}</dd></div>
          <div><dt>Devolución</dt><dd>${fmtDT(r.ends_at)}</dd></div>
          <div><dt>Lugar de entrega</dt><dd>${esc(r.pickup)}</dd></div>
          <div><dt>Teléfono</dt><dd><a href="tel:+${esc(r.client_phone)}">+${esc(r.client_phone)}</a></dd></div>
          ${r.km_out != null ? `<div><dt>Salida</dt><dd>${r.km_out} km · ${esc(r.fuel_out ?? '')}</dd></div>` : ''}
          ${r.km_in != null ? `<div><dt>Regreso</dt><dd>${r.km_in} km · ${esc(r.fuel_in ?? '')}${r.km_out != null ? ` (${r.km_in - r.km_out} km recorridos)` : ''}</dd></div>` : ''}
          ${client ? `<div><dt>Cliente</dt><dd><a href="#/clientes/${client.id}">Ver ficha e historial</a></dd></div>` : ''}
        </dl>
        ${r.notes ? `<p><small class="muted">Notas</small><br>${esc(r.notes)}</p>` : ''}
      </div>
      <div class="section card">
        <h2>WhatsApp al cliente</h2>
        <div class="actions">
          <a class="btn wa sm" target="_blank" rel="noopener" href="${wa(r.client_phone, msgs.confirm)}">Confirmación</a>
          <a class="btn wa sm" target="_blank" rel="noopener" href="${wa(r.client_phone, msgs.remind)}">Recordar entrega</a>
          <a class="btn wa sm" target="_blank" rel="noopener" href="${wa(r.client_phone, msgs.return)}">Recordar devolución</a>
          ${r.balance_cents > 0 ? `<a class="btn wa sm" target="_blank" rel="noopener" href="${wa(r.client_phone, msgs.balance)}">Cobrar saldo</a>` : ''}
          <a class="btn sm" target="_blank" rel="noopener" href="${wa(r.client_phone, '')}">${ic('chat')}Chat libre</a>
        </div>
      </div>
      <div class="section card">
        <div class="row between"><h2>Cobro</h2><button class="btn sm primary" data-action="add-payment">${ic('plus')}Registrar pago</button></div>
        <div class="money-box">
          <div class="line"><span>Tarifa</span><span>${mxn(r.daily_rate_cents)}/día · ${mxn(r.weekly_rate_cents)}/semana</span></div>
          ${r.discount_cents ? `<div class="line"><span>Descuento</span><span>−${mxn(r.discount_cents)}</span></div>` : ''}
          <div class="line total"><span>Total de la renta</span><span>${mxn(r.quote_cents)}</span></div>
          <div class="line"><span>Pagado</span><span>${mxn(r.paid_cents)}</span></div>
          <div class="line total"><span>Saldo</span><span class="${r.balance_cents > 0 ? 'amount due' : ''}">${mxn(r.balance_cents)}</span></div>
          <div class="line"><span>Depósito en garantía</span><span>${mxn(r.guarantee_cents)} ${r.guarantee_cents ? (r.guarantee_returned ? '<span class="pill ok">Devuelto</span>' : '<span class="pill">Retenido</span>') : ''}</span></div>
        </div>
        ${payments.length ? `<div class="table-wrap" style="margin-top:10px"><table><tbody>${payments.map(p => `
          <tr><td>${fmtD(p.paid_at)}</td><td>${PAY_KIND[p.kind]}</td><td>${PAY_METHOD[p.method]}</td>
            <td class="num ${p.kind === 'refund' ? 'amount due' : ''}">${p.kind === 'refund' ? '−' : ''}${mxn(p.amount_cents)}</td>
            <td>${state.me.role === 'admin' ? `<button class="btn ghost sm" data-action="del-payment" data-id="${p.id}" aria-label="Eliminar pago">${ic('trash')}</button>` : ''}</td></tr>`).join('')}
        </tbody></table></div>` : '<p class="muted">Sin pagos registrados.</p>'}
      </div>
      <div class="section card">
        <h2>Historial</h2>
        <ul class="timeline">${events.map(e => `<li><strong>${esc(eventLabel(e))}</strong> · ${esc(e.actor)}<br><small class="muted">${fmtDT(e.occurred_at)}</small></li>`).join('')}</ul>
        ${state.me.role === 'admin' ? `<button class="btn danger block" style="margin-top:14px" data-action="delete-reservation" data-id="${r.id}">${ic('trash')}Eliminar renta definitivamente</button>` : ''}
      </div>`;
  },
  after() {},
};

function eventLabel(e) {
  if (e.event.startsWith('status:')) return `Estado: ${STATUS[e.event.slice(7)] ?? e.event.slice(7)}${e.detail?.km ? ` (${e.detail.km} km)` : ''}`;
  if (e.event.startsWith('payment:')) {
    const k = e.event.slice(8);
    return k === 'deleted' ? 'Pago eliminado' : `${PAY_KIND[k] ?? k} ${mxn(e.detail?.amount_cents)}`;
  }
  return { created: 'Renta creada', created_public: 'Solicitud recibida desde la web', updated: 'Datos actualizados' }[e.event] ?? e.event;
}

function statusActions(r) {
  const btn = (status, label, cls = '') => `<button class="btn ${cls}" data-action="status" data-status="${status}">${label}</button>`;
  switch (r.status) {
    case 'new': case 'quoted':
      return btn('confirmed', `${ic('check')}Confirmar`, 'primary') + btn('cancelled', `${ic('x')}Rechazar`, 'danger');
    case 'confirmed': case 'assigned': case 'hold': case 'deposit_pending':
      return btn('in_service', `${ic('van')}Entregar unidad`, 'primary') + btn('no_show', 'No se presentó') + btn('cancelled', `${ic('x')}Cancelar`, 'danger');
    case 'in_service':
      return btn('completed', `${ic('undo')}Recibir unidad`, 'primary');
    case 'completed':
      return r.guarantee_cents && !r.guarantee_returned ? '<button class="btn" data-action="guarantee">Marcar garantía devuelta</button>' : '';
    default:
      return btn('new', 'Reactivar');
  }
}

async function changeStatus(status) {
  const { r } = views.detalle.data;
  const id = r.id;
  const send = async body => {
    await api(`/ops/reservations/${id}/status`, { method: 'POST', body: { status, ...body } });
    closeModal(); toast(`Renta: ${STATUS[status]}`); route();
  };
  if (status === 'confirmed') {
    const { free_vehicle_ids } = await api(`/ops/quote?starts_at=${encodeURIComponent(r.starts_at)}&ends_at=${encodeURIComponent(r.ends_at)}&exclude=${id}`);
    const options = state.vehicles.filter(v => v.active).map(v => {
      const free = free_vehicle_ids.includes(v.id);
      return `<option value="${v.id}" ${!free ? 'disabled' : ''} ${v.id === r.vehicle_id && free ? 'selected' : ''}>${esc(v.name)}${free ? '' : ' (ocupada)'}</option>`;
    }).join('');
    if (!free_vehicle_ids.length) return toast('No hay unidades libres en esas fechas. Edita las fechas primero.', true);
    return openModal(`<h2>Confirmar renta</h2><form id="mform" class="stack">
      <label>Unidad<select name="vehicle_id" required>${options}</select></label>
      <p class="muted"><small>Al confirmar, las fechas quedan bloqueadas en el calendario y en la web.</small></p>
      <p class="form-error" hidden></p>
      <div class="row"><button class="btn primary" type="submit">Confirmar</button><button class="btn" type="button" data-action="close-modal">Cancelar</button></div></form>`,
    card => onSubmit($('#mform', card), d => send({ vehicle_id: d.vehicle_id })));
  }
  if (status === 'in_service' || status === 'completed') {
    const vehicle = state.vehicles.find(v => v.id === r.vehicle_id);
    const out = status === 'in_service';
    return openModal(`<h2>${out ? 'Entregar unidad' : 'Recibir unidad'}</h2><form id="mform" class="stack">
      <div class="grid2">
        <label>Kilometraje<input name="km" type="number" inputmode="numeric" min="0" value="${out ? (vehicle?.odometer_km ?? '') : (r.km_out ?? '')}"></label>
        <label>Combustible<select name="fuel">${FUEL.map(f => `<option ${f === (out ? 'Lleno' : r.fuel_out) ? 'selected' : ''}>${f}</option>`).join('')}</select></label>
      </div>
      ${out ? `<p class="muted"><small>Verifica INE y licencia vigente. Saldo pendiente: <strong>${mxn(r.balance_cents)}</strong>.</small></p>`
        : `${r.guarantee_cents ? `<label class="check"><input type="checkbox" name="guarantee_returned"> Devolví el depósito en garantía (${mxn(r.guarantee_cents)})</label>` : ''}
           ${r.balance_cents > 0 ? `<p class="form-error" style="display:block">El cliente aún debe ${mxn(r.balance_cents)}.</p>` : ''}`}
      <p class="form-error" hidden></p>
      <div class="row"><button class="btn primary" type="submit">${out ? 'Entregar' : 'Recibir'}</button><button class="btn" type="button" data-action="close-modal">Cancelar</button></div></form>`,
    card => onSubmit($('#mform', card), d => send({ km: d.km ? Number(d.km) : undefined, fuel: d.fuel, guarantee_returned: d.guarantee_returned ? true : undefined })));
  }
  if (['cancelled', 'no_show'].includes(status) && !confirm(`¿Marcar la renta como "${STATUS[status]}"? Las fechas se liberan.`)) return;
  await send({});
}

function paymentModal() {
  const { r } = views.detalle.data;
  const suggested = r.balance_cents > 0 ? pesos(r.balance_cents) : '';
  openModal(`<h2>Registrar pago</h2><form id="mform" class="stack">
    <div class="grid2">
      <label>Tipo<select name="kind"><option value="deposit">Anticipo</option><option value="payment" selected>Pago</option><option value="refund">Reembolso</option></select></label>
      <label>Forma<select name="method">${Object.entries(PAY_METHOD).map(([k, v]) => `<option value="${k}">${v}</option>`).join('')}</select></label>
    </div>
    <div class="grid2">
      <label>Monto (MXN)<input name="amount" type="number" inputmode="decimal" min="1" step="0.01" required value="${suggested}"></label>
      <label>Fecha<input name="date" type="date" value="${localISODate()}" required></label>
    </div>
    <label>Nota<input name="note" maxlength="300" placeholder="Opcional: referencia de transferencia, etc."></label>
    <p class="form-error" hidden></p>
    <div class="row"><button class="btn primary" type="submit">Guardar</button><button class="btn" type="button" data-action="close-modal">Cancelar</button></div></form>`,
  card => onSubmit($('#mform', card), async d => {
    const isToday = d.date === localISODate();
    await api(`/ops/reservations/${r.id}/payments`, { method: 'POST', body: {
      kind: d.kind, method: d.method, amount_cents: toCents(d.amount), note: d.note,
      paid_at: isToday ? undefined : new Date(`${d.date}T12:00:00-06:00`).toISOString(),
    } });
    closeModal(); toast('Pago registrado'); route();
  }));
}

async function contract(id, folio) {
  const url = `/v1/ops/reservations/${id}/contract.pdf`;
  try {
    const res = await fetch(url, { credentials: 'same-origin' });
    if (!res.ok) throw new Error('No se pudo generar el contrato');
    const blob = await res.blob();
    const file = new File([blob], `contrato-${folio}.pdf`, { type: 'application/pdf' });
    // En el celular abre el menú de compartir (WhatsApp, correo…); en computadora abre el PDF.
    if (navigator.canShare?.({ files: [file] })) {
      await navigator.share({ files: [file], title: `Contrato ${folio}` }).catch(() => {});
    } else {
      window.open(URL.createObjectURL(blob), '_blank');
    }
  } catch (error) { toast(error.message, true); }
}

// ───────────────────────────── Nueva / editar renta ─────────────────────────────
views.nueva = {
  async render(_id, params) {
    const client = params.client ? (await api(`/ops/clients/${params.client}`)).client : null;
    return reservationForm(client ? { reservation: null, client } : null, params);
  },
  after: el => bindReservationForm(el, null),
};
views.editar = {
  async render(id) { const d = await api(`/ops/reservations/${id}`); this.data = d; return reservationForm(d); },
  after(el, id) { bindReservationForm(el, id); },
};

function reservationForm(existing, params = {}) {
  const r = existing?.reservation;
  const c = existing?.client;
  const p = state.pricing;
  const startDate = params.date || localISODate(new Date(Date.now() + 86400e3));
  const starts = r ? toLocalInput(r.starts_at) : `${startDate}T09:00`;
  const endD = new Date(`${startDate}T12:00:00Z`); endD.setUTCDate(endD.getUTCDate() + 1);
  const ends = r ? toLocalInput(r.ends_at) : `${endD.toISOString().slice(0, 10)}T09:00`;
  const vehicleId = r?.vehicle_id ?? params.vehicle ?? '';
  // Es "manual" si el total guardado no coincide con lo que darían las tarifas.
  const manual = Boolean(r) && r.quote_cents !== localQuote(r.starts_at, r.ends_at, r.daily_rate_cents, r.weekly_rate_cents, r.discount_cents);
  return `
    <a class="back" href="${r ? `#/reservas/${r.id}` : '#/reservas'}">${ic('left')}${r ? 'Volver' : 'Rentas'}</a>
    <h1>${r ? `Editar ${esc(r.folio)}` : 'Nueva renta'}</h1>
    <form id="rform" class="stack section">
      <fieldset><legend>Cliente</legend>
        ${r || c ? '' : `<label>Buscar cliente existente<input id="client-search" type="search" placeholder="Nombre o teléfono" autocomplete="off"></label><div id="client-suggest" class="suggest" hidden></div>`}
        <div class="grid2">
          <label>Nombre completo<input name="full_name" required minlength="3" value="${esc(r?.client_name ?? c?.full_name ?? '')}"></label>
          <label>WhatsApp / teléfono<input name="phone" required inputmode="tel" placeholder="999 123 4567" value="${esc(r?.client_phone ?? c?.phone ?? '')}"></label>
        </div>
        <details ${c?.id_document || c?.license_number ? 'open' : ''}><summary class="muted" style="cursor:pointer;font-weight:600">Documentos y datos para el contrato</summary>
          <div class="stack" style="margin-top:10px">
            <div class="grid2">
              <label>INE / pasaporte (número)<input name="id_document" value="${esc(c?.id_document ?? '')}"></label>
              <label>Licencia de conducir<input name="license_number" value="${esc(c?.license_number ?? '')}"></label>
            </div>
            <div class="grid2">
              <label>Vigencia de licencia<input name="license_expires" type="date" value="${esc(c?.license_expires ?? '')}"></label>
              <label>Correo<input name="email" type="email" value="${esc(r?.client_email ?? c?.email ?? '')}"></label>
            </div>
            <label>Domicilio<input name="address" value="${esc(c?.address ?? '')}"></label>
          </div>
        </details>
      </fieldset>
      <fieldset><legend>Renta</legend>
        <div class="grid2">
          <label>Entrega<input name="starts_at" type="datetime-local" required value="${starts}"></label>
          <label>Devolución<input name="ends_at" type="datetime-local" required value="${ends}"></label>
        </div>
        <div class="grid2">
          <label>Unidad<select name="vehicle_id"><option value="">Sin asignar</option>${state.vehicles.filter(v => v.active).map(v => `<option value="${v.id}" ${v.id === vehicleId ? 'selected' : ''}>${esc(v.name)}</option>`).join('')}</select></label>
          <label>Estado<select name="status">${['new', 'confirmed', 'in_service', 'completed', 'cancelled'].map(s => `<option value="${s}" ${(r?.status ?? 'confirmed') === s ? 'selected' : ''}>${STATUS[s]}</option>`).join('')}</select></label>
        </div>
        <label>Lugar de entrega<input name="pickup" maxlength="300" placeholder="Oficina, aeropuerto, hotel…" value="${esc(r?.pickup ?? '')}"></label>
        <label>Notas<textarea name="notes" maxlength="2000" placeholder="Destino, número de pasajeros, acuerdos…">${esc(r?.notes ?? '')}</textarea></label>
      </fieldset>
      <fieldset><legend>Precio</legend>
        <div class="grid3">
          <label>Tarifa diaria<input name="daily" type="number" inputmode="decimal" min="0" step="0.01" value="${pesos(r?.daily_rate_cents ?? p.daily_cents)}"></label>
          <label>Tarifa semanal<input name="weekly" type="number" inputmode="decimal" min="0" step="0.01" value="${pesos(r?.weekly_rate_cents ?? p.weekly_cents)}"></label>
          <label>Descuento<input name="discount" type="number" inputmode="decimal" min="0" step="0.01" value="${pesos(r?.discount_cents ?? 0)}"></label>
        </div>
        <div class="grid2">
          <label>Total de la renta<input name="total" type="number" inputmode="decimal" min="0" step="0.01" value="${manual ? pesos(r.quote_cents) : ''}" ${manual ? '' : 'readonly'}></label>
          <label>Depósito en garantía<input name="guarantee" type="number" inputmode="decimal" min="0" step="0.01" value="${pesos(r?.guarantee_cents ?? p.deposit_cents)}"></label>
        </div>
        <label class="check"><input type="checkbox" name="manual" ${manual ? 'checked' : ''}> Precio acordado manualmente</label>
        <p id="quote-info" class="muted"></p>
      </fieldset>
      <p class="form-error" hidden></p>
      <div class="row"><button class="btn primary" type="submit">${r ? 'Guardar cambios' : 'Guardar renta'}</button><a class="btn" href="${r ? `#/reservas/${r.id}` : '#/reservas'}">Cancelar</a></div>
    </form>`;
}

function bindReservationForm(el, id) {
  const form = $('#rform', el);
  const f = n => form.elements[n];
  let timer;
  const requote = () => {
    clearTimeout(timer);
    timer = setTimeout(async () => {
      if (!f('starts_at').value || !f('ends_at').value) return;
      const qs = new URLSearchParams({
        starts_at: fromLocalInput(f('starts_at').value), ends_at: fromLocalInput(f('ends_at').value),
        daily_rate_cents: toCents(f('daily').value), weekly_rate_cents: toCents(f('weekly').value), discount_cents: toCents(f('discount').value),
      });
      if (id) qs.set('exclude', id);
      try {
        const q = await api(`/ops/quote?${qs}`);
        if (!f('manual').checked) f('total').value = pesos(q.total_cents);
        $('#quote-info', el).textContent = q.days > 0
          ? `${q.days} día${q.days > 1 ? 's' : ''}${q.weeks ? ` (${q.weeks} semana${q.weeks > 1 ? 's' : ''} + ${q.rest_days} día${q.rest_days === 1 ? '' : 's'})` : ''} · Calculado: ${mxn(q.total_cents)}`
          : 'La devolución debe ser después de la entrega.';
        [...f('vehicle_id').options].forEach(o => {
          if (!o.value) return;
          const v = state.vehicles.find(x => x.id === o.value);
          const free = q.free_vehicle_ids.includes(o.value);
          o.textContent = `${v.name}${free ? ' · libre' : ' · ocupada'}`;
        });
      } catch { /* se valida al guardar */ }
    }, 300);
  };
  ['starts_at', 'ends_at', 'daily', 'weekly', 'discount'].forEach(n => f(n).addEventListener('input', requote));
  f('manual').addEventListener('change', () => { f('total').readOnly = !f('manual').checked; if (!f('manual').checked) requote(); });
  requote();

  const search = $('#client-search', el);
  if (search) {
    let st;
    search.addEventListener('input', () => {
      clearTimeout(st);
      st = setTimeout(async () => {
        const box = $('#client-suggest', el);
        const q = search.value.trim();
        if (q.length < 2) { box.hidden = true; return; }
        const { data } = await api(`/ops/clients?q=${encodeURIComponent(q)}`);
        box.innerHTML = data.slice(0, 6).map((c, i) => `<button type="button" data-i="${i}"><strong>${esc(c.full_name)}</strong> · +${esc(c.phone)}${c.blocked ? ' · bloqueado' : ''}<br><small class="muted">${c.rentals} renta${c.rentals === 1 ? '' : 's'}</small></button>`).join('') || '<p class="muted" style="padding:10px;margin:0">Sin coincidencias: captura un cliente nuevo.</p>';
        box.hidden = false;
        $$('button', box).forEach(b => b.addEventListener('click', () => {
          const c = data[Number(b.dataset.i)];
          for (const k of ['full_name', 'phone', 'id_document', 'license_number', 'license_expires', 'email', 'address']) if (form.elements[k]) form.elements[k].value = c[k] ?? '';
          if (c.id_document || c.license_number) $('details', form).open = true;
          box.hidden = true; search.value = '';
          if (c.blocked) toast('Cliente bloqueado: revisa su ficha', true);
        }));
      }, 250);
    });
  }

  onSubmit(form, async d => {
    const body = {
      client: { full_name: d.full_name, phone: d.phone, email: d.email, id_document: d.id_document, license_number: d.license_number, license_expires: d.license_expires, address: d.address },
      vehicle_id: d.vehicle_id || null,
      starts_at: fromLocalInput(d.starts_at), ends_at: fromLocalInput(d.ends_at),
      status: d.status, pickup: d.pickup, notes: d.notes,
      daily_rate_cents: toCents(d.daily), weekly_rate_cents: toCents(d.weekly), discount_cents: toCents(d.discount),
      quote_cents: d.manual ? toCents(d.total) : null, guarantee_cents: toCents(d.guarantee),
    };
    const res = id
      ? await api(`/ops/reservations/${id}`, { method: 'PUT', body })
      : await api('/ops/reservations', { method: 'POST', body });
    toast(id ? 'Cambios guardados' : `Renta ${res.reservation.folio} creada`);
    location.hash = `#/reservas/${res.reservation.id}`;
  });
}

// ───────────────────────────── Calendario ─────────────────────────────
views.calendario = {
  async render(_id, params) {
    const month = params.m || thisMonth();
    const [y, m] = month.split('-').map(Number);
    const daysInMonth = new Date(Date.UTC(y, m, 0)).getUTCDate();
    const first = `${month}-01`;
    const last = `${month}-${String(daysInMonth).padStart(2, '0')}`;
    const { data } = await api(`/ops/reservations?from=${first}&to=${last}&status=new,quoted,hold,deposit_pending,confirmed,assigned,in_service,completed&limit=500`);
    const today = localISODate();
    const days = Array.from({ length: daysInMonth }, (_, i) => `${month}-${String(i + 1).padStart(2, '0')}`);
    const head = days.map(d => {
      const dow = new Date(`${d}T12:00:00Z`).getUTCDay();
      return `<th class="${d === today ? 'today' : ''} ${dow === 0 || dow === 6 ? 'weekend' : ''}">${'DLMMJVS'[dow]}<br>${Number(d.slice(8))}</th>`;
    }).join('');
    const rows = state.vehicles.filter(v => v.active).map(v => {
      const mine = data.filter(r => r.vehicle_id === v.id).map(r => ({ ...r, s: localISODate(new Date(r.starts_at)), e: localISODate(new Date(r.ends_at)) }));
      const cells = days.map(d => {
        const r = mine.find(x => x.s <= d && x.e >= d && x.status !== 'completed') ?? mine.find(x => x.s <= d && x.e >= d);
        if (!r) return `<td class="day" data-action="cal-new" data-vehicle="${v.id}" data-date="${d}" title="Libre · toca para crear renta"></td>`;
        const start = r.s === d || d === first, end = r.e === d || d === last;
        return `<td class="busy s-${r.status} ${start ? 'start' : ''} ${end ? 'end' : ''}" data-action="go" data-href="#/reservas/${r.id}" title="${esc(r.client_name)} · ${STATUS[r.status]}"><span>${start ? esc(r.client_name.split(' ')[0]) : '&nbsp;'}</span></td>`;
      }).join('');
      return `<tr><td class="unit-col">${esc(v.name)}</td>${cells}</tr>`;
    }).join('');
    const unassigned = data.filter(r => !r.vehicle_id && ['new', 'quoted'].includes(r.status));
    return `
      <div class="view-head"><h1>Calendario</h1>
        ${monthNav('calendario', month)}</div>
      <div class="cal"><table><thead><tr><th class="unit-col">Unidad</th>${head}</tr></thead><tbody>${rows}</tbody></table></div>
      <div class="legend" style="flex-wrap:wrap">
        <span><i style="background:#e8a33a"></i>Solicitud</span><span><i style="background:#3b7be0"></i>Confirmada</span>
        <span><i style="background:#6b4fd8"></i>En renta</span><span><i style="background:#6cbf92"></i>Terminada</span>
        <span>Toca un día libre para crear una renta.</span>
      </div>
      ${unassigned.length ? `<div class="section"><h2>Solicitudes sin unidad</h2><div class="list">${unassigned.map(reservationItem).join('')}</div></div>` : ''}`;
  },
};

// ───────────────────────────── Clientes ─────────────────────────────
views.clientes = {
  async render(id, params) {
    if (id) return clientDetail(id);
    const q = params.q || '';
    const { data } = await api(`/ops/clients${q ? `?q=${encodeURIComponent(q)}` : ''}`);
    return `
      <div class="view-head"><h1>Clientes</h1><span class="muted">${data.length} registrado${data.length === 1 ? '' : 's'}</span></div>
      <form id="csearch" style="margin-bottom:12px"><input name="q" type="search" placeholder="Buscar por nombre o teléfono" value="${esc(q)}"></form>
      <div class="list">${data.length ? data.map(c => `
        <a class="item" href="#/clientes/${c.id}">
          <div><strong>${esc(c.full_name)}</strong>${c.blocked ? ' <span class="pill bad">Bloqueado</span>' : ''}
            <div class="meta">+${esc(c.phone)}${c.last_rental ? ` · última renta ${fmtD(c.last_rental)}` : ''}</div></div>
          <div class="right"><div class="amount">${mxn(c.spent_cents)}</div><small class="muted">${c.rentals} renta${c.rentals === 1 ? '' : 's'}</small></div>
        </a>`).join('') : '<p class="empty">Sin clientes todavía. Se agregan solos al crear rentas.</p>'}</div>`;
  },
  after(el, id) {
    if (id) return bindClientDetail(el, id);
    const form = $('#csearch', el);
    form.addEventListener('submit', e => { e.preventDefault(); location.hash = `#/clientes?q=${encodeURIComponent(new FormData(form).get('q'))}`; });
  },
};

async function clientDetail(id) {
  const { client: c, reservations } = await api(`/ops/clients/${id}`);
  const done = reservations.filter(r => ['confirmed', 'assigned', 'in_service', 'completed'].includes(r.status));
  const spent = done.reduce((s, r) => s + (r.quote_cents ?? 0), 0);
  const owed = done.reduce((s, r) => s + Math.max(0, r.balance_cents), 0);
  return `
    <a class="back" href="#/clientes">${ic('left')}Clientes</a>
    <div class="view-head"><h1>${esc(c.full_name)}</h1>
      <div class="row"><a class="btn wa" target="_blank" rel="noopener" href="${wa(c.phone, `Hola ${c.full_name}, te escribimos de ${state.business.name || 'Turi Express'}.`)}">${ic('chat')}WhatsApp</a>
      <a class="btn primary" href="#/nueva?client=${c.id}">${ic('plus')}Rentar</a></div></div>
    <div class="kpis">
      <div class="kpi"><small>Rentas</small><strong>${done.length}</strong></div>
      <div class="kpi good"><small>Total rentado</small><strong>${mxn(spent)}</strong></div>
      <div class="kpi ${owed ? 'bad' : ''}"><small>Adeudo</small><strong>${mxn(owed)}</strong></div>
    </div>
    <form id="cform" class="stack section card">
      <h2>Ficha</h2>
      <div class="grid2">
        <label>Nombre<input name="full_name" required value="${esc(c.full_name)}"></label>
        <label>Teléfono<input name="phone" required value="${esc(c.phone)}"></label>
        <label>INE / pasaporte<input name="id_document" value="${esc(c.id_document ?? '')}"></label>
        <label>Licencia<input name="license_number" value="${esc(c.license_number ?? '')}"></label>
        <label>Vigencia licencia<input name="license_expires" type="date" value="${esc(c.license_expires ?? '')}"></label>
        <label>Correo<input name="email" type="email" value="${esc(c.email ?? '')}"></label>
      </div>
      <label>Domicilio<input name="address" value="${esc(c.address ?? '')}"></label>
      <label>Notas internas<textarea name="notes" placeholder="Ej. cliente frecuente, entrega siempre en hotel…">${esc(c.notes ?? '')}</textarea></label>
      <label class="check"><input type="checkbox" name="blocked" ${c.blocked ? 'checked' : ''}> Bloquear cliente (no volver a rentar)</label>
      ${c.license_expires && c.license_expires < localISODate() ? `<p class="form-error with-ic">${ic('alert')}La licencia registrada está vencida.</p>` : ''}
      <p class="form-error" hidden></p>
      <div><button class="btn primary" type="submit">Guardar ficha</button></div>
    </form>
    <div class="section"><h2>Historial de rentas</h2><div class="list">${reservations.length ? reservations.map(reservationItem).join('') : '<p class="empty">Sin rentas.</p>'}</div></div>`;
}

function bindClientDetail(el, id) {
  onSubmit($('#cform', el), async d => {
    await api(`/ops/clients/${id}`, { method: 'PUT', body: { ...d, blocked: Boolean(d.blocked) } });
    toast('Ficha guardada'); route();
  });
}

// ───────────────────────────── Gastos ─────────────────────────────
views.gastos = {
  async render(_id, params) {
    const month = params.m || thisMonth();
    const { data } = await api(`/ops/expenses?month=${month}`);
    const total = data.reduce((s, e) => s + e.amount_cents, 0);
    const byCat = Object.entries(data.reduce((acc, e) => ({ ...acc, [e.category]: (acc[e.category] ?? 0) + e.amount_cents }), {})).sort((a, b) => b[1] - a[1]);
    this.month = month;
    return `
      <div class="view-head"><h1>Gastos</h1>
        ${monthNav('gastos', month)}</div>
      <form id="eform" class="card stack">
        <h2>Registrar gasto</h2>
        <div class="grid2">
          <label>Concepto<select name="category">${Object.entries(EXPENSE_CAT).map(([k, v]) => `<option value="${k}">${v}</option>`).join('')}</select></label>
          <label>Unidad<select name="vehicle_id"><option value="">General (no es de una unidad)</option>${state.vehicles.map(v => `<option value="${v.id}">${esc(v.name)}</option>`).join('')}</select></label>
          <label>Monto (MXN)<input name="amount" type="number" inputmode="decimal" min="1" step="0.01" required></label>
          <label>Fecha<input name="spent_on" type="date" required value="${month === thisMonth() ? localISODate() : `${month}-01`}"></label>
        </div>
        <label>Descripción<input name="description" maxlength="300" placeholder="Ej. cambio de aceite, póliza anual…"></label>
        <p class="form-error" hidden></p>
        <div><button class="btn primary" type="submit">Agregar gasto</button></div>
      </form>
      <div class="kpis section">
        <div class="kpi bad"><small>Total del mes</small><strong>${mxn(total)}</strong></div>
        ${byCat.slice(0, 5).map(([k, v]) => `<div class="kpi"><small class="with-ic">${ic(EXPENSE_ICON[k])}${EXPENSE_CAT[k]}</small><strong>${mxn(v)}</strong></div>`).join('')}
      </div>
      <div class="section list">${data.length ? data.map(e => `
        <div class="item"><div><strong class="with-ic">${ic(EXPENSE_ICON[e.category])}${EXPENSE_CAT[e.category]}</strong>
          <div class="meta">${esc(e.vehicle_name ?? 'General')} · ${fmtD(e.spent_on)}${e.description ? ` · ${esc(e.description)}` : ''} · ${esc(e.created_by_name ?? '')}</div></div>
          <div class="right"><div class="amount">${mxn(e.amount_cents)}</div><button class="btn ghost sm" data-action="del-expense" data-id="${e.id}" aria-label="Eliminar gasto">${ic('trash')}</button></div></div>`).join('')
        : '<p class="empty">Sin gastos registrados este mes.</p>'}</div>`;
  },
  after(el) {
    onSubmit($('#eform', el), async d => {
      await api('/ops/expenses', { method: 'POST', body: { category: d.category, vehicle_id: d.vehicle_id || null, amount_cents: toCents(d.amount), spent_on: d.spent_on, description: d.description } });
      toast('Gasto registrado'); route();
    });
  },
};

// ───────────────────────────── Ajustes ─────────────────────────────
views.ajustes = {
  async render() {
    const admin = state.me.role === 'admin';
    const staff = admin ? (await api('/ops/staff')).data : [];
    const p = state.pricing, b = state.business;
    return `
      <div class="view-head"><h1>Ajustes</h1></div>
      ${updateCard()}
      ${admin ? `
      <form id="pricing" class="card section stack">
        <h2 class="with-ic">${ic('coin')}Tarifas</h2>
        <div class="grid3">
          <label>Por día (MXN)<input name="daily" type="number" min="0" step="0.01" inputmode="decimal" value="${pesos(p.daily_cents)}"></label>
          <label>Por semana (MXN)<input name="weekly" type="number" min="0" step="0.01" inputmode="decimal" value="${pesos(p.weekly_cents)}"></label>
          <label>Depósito en garantía<input name="deposit" type="number" min="0" step="0.01" inputmode="decimal" value="${pesos(p.deposit_cents)}"></label>
        </div>
        <p class="muted"><small>Se usan para cotizar en la web y para precargar rentas nuevas. Las rentas ya creadas conservan su precio.</small></p>
        <p class="form-error" hidden></p><div><button class="btn primary" type="submit">Guardar tarifas</button></div>
      </form>
      <form id="business" class="card section stack">
        <h2 class="with-ic">${ic('building')}Datos del negocio (contrato)</h2>
        <div class="grid2">
          <label>Nombre comercial<input name="name" required value="${esc(b.name ?? '')}"></label>
          <label>Razón social / responsable<input name="legal_name" value="${esc(b.legal_name ?? '')}"></label>
          <label>WhatsApp<input name="phone" value="${esc(b.phone ?? '')}"></label>
          <label>Ciudad<input name="city" value="${esc(b.city ?? '')}"></label>
        </div>
        <label>Domicilio<input name="address" value="${esc(b.address ?? '')}"></label>
        <p class="form-error" hidden></p><div><button class="btn primary" type="submit">Guardar datos</button></div>
      </form>
      <div class="card section stack">
        <h2 class="with-ic">${ic('van')}Unidades</h2>
        <div class="list">${state.vehicles.map(v => `<button class="item" data-action="edit-vehicle" data-id="${v.id}">
          <div><strong>${esc(v.name)}</strong> ${v.active ? '' : '<span class="pill bad">Inactiva</span>'}<div class="meta">${esc(v.plate || 'Sin placas')} · ${v.capacity} pasajeros${v.odometer_km ? ` · ${v.odometer_km.toLocaleString('es-MX')} km` : ''}</div></div><div class="right muted">${ic('edit')}</div></button>`).join('')}</div>
      </div>
      <div class="card section stack">
        <div class="row between"><h2 class="with-ic">${ic('users')}Usuarios del panel</h2><button class="btn sm primary" data-action="new-staff">${ic('plus')}Agregar</button></div>
        <div class="list">${staff.map(s => `<button class="item" data-action="edit-staff" data-id="${s.id}">
          <div><strong>${esc(s.full_name)}</strong> ${s.active ? '' : '<span class="pill bad">Sin acceso</span>'}<div class="meta">${esc(s.email)} · ${s.role === 'admin' ? 'Administrador' : 'Operador'} · ${s.devices} dispositivo${s.devices === 1 ? '' : 's'} con avisos</div>
          <div class="meta">${s.last_login_at ? `Último acceso ${fmtDT(s.last_login_at)}` : 'Nunca ha entrado'}</div></div><div class="right muted">${ic('edit')}</div></button>`).join('')}</div>
      </div>` : ''}
      <form id="password" class="card section stack">
        <h2 class="with-ic">${ic('key')}Cambiar mi contraseña</h2>
        <div class="grid2">
          <label>Contraseña actual<input name="current" type="password" autocomplete="current-password" required></label>
          <label>Nueva (mínimo 10 caracteres)<input name="next" type="password" autocomplete="new-password" minlength="10" required></label>
        </div>
        <p class="muted"><small>Al cambiarla se cierran tus sesiones en otros dispositivos.</small></p>
        <p class="form-error" hidden></p><div><button class="btn primary" type="submit">Cambiar contraseña</button></div>
      </form>
      <div class="section"><button class="btn danger block" data-action="logout">${ic('logout')}Cerrar sesión</button></div>`;
  },
  after(el) {
    const pricing = $('#pricing', el);
    if (pricing) onSubmit(pricing, async d => {
      const res = await api('/ops/settings/pricing', { method: 'PUT', body: { daily_cents: toCents(d.daily), weekly_cents: toCents(d.weekly), deposit_cents: toCents(d.deposit) } });
      state.pricing = res.pricing; toast('Tarifas guardadas');
    });
    const business = $('#business', el);
    if (business) onSubmit(business, async d => {
      const res = await api('/ops/settings/business', { method: 'PUT', body: d });
      state.business = res.business; toast('Datos guardados');
    });
    onSubmit($('#password', el), async (d, form) => {
      await api('/auth/password', { method: 'POST', body: d });
      form.reset(); toast('Contraseña actualizada');
    });
  },
};

function vehicleModal(id) {
  const v = state.vehicles.find(x => x.id === id);
  openModal(`<h2>Editar ${esc(v.name)}</h2><form id="mform" class="stack">
    <div class="grid2">
      <label>Nombre<input name="name" required value="${esc(v.name)}"></label>
      <label>Placas<input name="plate" value="${esc(v.plate ?? '')}"></label>
      <label>Pasajeros<input name="capacity" type="number" min="1" max="60" required value="${v.capacity}"></label>
      <label>Año<input name="model_year" type="number" min="1990" max="2100" value="${v.model_year ?? ''}"></label>
      <label>Color<input name="color" value="${esc(v.color ?? '')}"></label>
      <label>Kilometraje actual<input name="odometer_km" type="number" min="0" value="${v.odometer_km ?? ''}"></label>
    </div>
    <label>Notas<textarea name="notes">${esc(v.notes ?? '')}</textarea></label>
    <label class="check"><input type="checkbox" name="active" ${v.active ? 'checked' : ''}> Activa (disponible para rentar)</label>
    <p class="form-error" hidden></p>
    <div class="row"><button class="btn primary" type="submit">Guardar</button><button class="btn" type="button" data-action="close-modal">Cancelar</button></div></form>`,
  card => onSubmit($('#mform', card), async d => {
    const num = x => (x === '' ? null : Number(x));
    const { vehicle } = await api(`/ops/vehicles/${id}`, { method: 'PUT', body: {
      name: d.name, plate: d.plate, capacity: Number(d.capacity), model_year: num(d.model_year), color: d.color,
      odometer_km: num(d.odometer_km), notes: d.notes, active: Boolean(d.active),
    } });
    Object.assign(v, vehicle); closeModal(); toast('Unidad guardada'); route();
  }));
}

async function staffModal(id) {
  const s = id ? (await api('/ops/staff')).data.find(x => x.id === id) : null;
  openModal(`<h2>${s ? `Editar ${esc(s.full_name)}` : 'Nuevo usuario'}</h2><form id="mform" class="stack">
    <label>Nombre<input name="full_name" required value="${esc(s?.full_name ?? '')}"></label>
    ${s ? `<p class="muted">${esc(s.email)}</p>` : '<label>Correo<input name="email" type="email" required autocomplete="off"></label>'}
    <label>Rol<select name="role"><option value="operator" ${s?.role === 'operator' ? 'selected' : ''}>Operador (rentas, clientes, gastos)</option><option value="admin" ${s?.role === 'admin' ? 'selected' : ''}>Administrador (todo, incluye tarifas y usuarios)</option></select></label>
    <label>${s ? 'Nueva contraseña (dejar vacío para no cambiar)' : 'Contraseña inicial (mínimo 10)'}<input name="password" type="text" autocomplete="new-password" ${s ? '' : 'required minlength="10"'}></label>
    ${s ? `<label class="check"><input type="checkbox" name="active" ${s.active ? 'checked' : ''}> Con acceso al panel</label>` : ''}
    <p class="form-error" hidden></p>
    <div class="row"><button class="btn primary" type="submit">Guardar</button><button class="btn" type="button" data-action="close-modal">Cancelar</button></div></form>`,
  card => onSubmit($('#mform', card), async d => {
    if (s) await api(`/ops/staff/${id}`, { method: 'PUT', body: { full_name: d.full_name, role: d.role, active: Boolean(d.active), password: d.password } });
    else await api('/ops/staff', { method: 'POST', body: d });
    closeModal(); toast('Usuario guardado'); route();
  }));
}

// ───────────────────────────── Actualización ─────────────────────────────
// La app Android abre el panel con ?app=<versión>; se recuerda para mostrarla en Ajustes.
const IOS = /iphone|ipad|ipod/i.test(navigator.userAgent);
const STANDALONE = matchMedia('(display-mode: standalone)').matches || navigator.standalone === true;
const androidApp = (() => {
  const v = new URLSearchParams(location.search).get('app');
  try {
    if (v) localStorage.setItem('te_android_app', v);
    else if (document.referrer.startsWith('android-app://') && !localStorage.getItem('te_android_app')) localStorage.setItem('te_android_app', '1.0.1');
    return localStorage.getItem('te_android_app');
  } catch { return v; }
})();
const newer = (a, b) => {
  const pa = String(a).split('.').map(Number), pb = String(b).split('.').map(Number);
  for (let i = 0; i < 3; i++) if ((pa[i] || 0) !== (pb[i] || 0)) return (pa[i] || 0) > (pb[i] || 0);
  return false;
};

function updateCard() {
  const where = androidApp ? `App Android ${esc(androidApp)}` : STANDALONE ? (IOS ? 'App de iPhone' : 'App instalada') : 'Navegador';
  return `
    <div class="card section stack" id="update-card">
      <h2 class="with-ic">${ic('refresh')}Actualización de la app</h2>
      <dl class="dl">
        <div><dt>Versión del panel</dt><dd><strong>${APP_VERSION}</strong></dd></div>
        <div><dt>Instalada en</dt><dd>${where}</dd></div>
      </dl>
      <p id="update-status" class="muted">Toca el botón para buscar la versión más reciente.</p>
      ${!STANDALONE && IOS ? `<p class="banner info">Para instalarla en iPhone: en Safari toca <strong>Compartir</strong> y luego <strong>Agregar a inicio</strong>.</p>` : ''}
      <div class="actions" id="update-actions">
        <button class="btn primary" data-action="update-check">${ic('refresh')}Buscar actualización</button>
      </div>
    </div>`;
}

async function checkUpdate() {
  const status = $('#update-status'), actions = $('#update-actions');
  status.textContent = 'Buscando…';
  const reg = await navigator.serviceWorker?.getRegistration();
  await reg?.update().catch(() => {});
  const latest = await fetch('/version.json', { cache: 'no-store' }).then(r => r.json());
  const panelOld = newer(latest.panel, APP_VERSION);
  const apkOld = androidApp && latest.android && newer(latest.android.version, androidApp);
  if (!panelOld && !apkOld) {
    status.innerHTML = `${ic('check', 'ok')} Tienes la versión más reciente.`;
    return;
  }
  const parts = [];
  if (panelOld) parts.push(`Panel ${esc(latest.panel)} disponible.`);
  if (apkOld) parts.push(`App Android ${esc(latest.android.version)} disponible: descárgala e instálala encima (no se borran tus datos).`);
  status.textContent = parts.join(' ');
  actions.innerHTML = `${panelOld ? `<button class="btn primary" data-action="update-apply">${ic('refresh')}Actualizar ahora</button>` : ''}
    ${apkOld ? `<a class="btn ${panelOld ? '' : 'primary'}" href="${esc(latest.android.url)}" download>${ic('download')}Descargar app ${esc(latest.android.version)}</a>` : ''}`;
}

/** Borra el cascarón guardado y recarga: el service worker nuevo toma el control. */
async function applyUpdate() {
  const reg = await navigator.serviceWorker?.getRegistration();
  reg?.waiting?.postMessage({ type: 'skip-waiting' });
  if (window.caches) await Promise.all((await caches.keys()).map(k => caches.delete(k)));
  location.reload();
}

// ───────────────────────────── Notificaciones ─────────────────────────────
// Se activan solas al entrar: la app pide el permiso del sistema la primera vez.
// En iPhone el permiso solo se puede pedir tras un toque, por eso ahí se muestra un aviso en Inicio.
const b64ToBytes = b64 => {
  const pad = '='.repeat((4 - (b64.length % 4)) % 4);
  const raw = atob((b64 + pad).replace(/-/g, '+').replace(/_/g, '/'));
  return Uint8Array.from(raw, c => c.charCodeAt(0));
};
const pushSupported = () => 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;

async function ensurePush(ask) {
  if (!state.push.enabled || !pushSupported()) return 'unsupported';
  let perm = Notification.permission;
  if (perm === 'default' && ask) perm = await Notification.requestPermission();
  if (perm !== 'granted') return perm;
  const reg = await navigator.serviceWorker.ready;
  const sub = await reg.pushManager.getSubscription()
    ?? await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: b64ToBytes(state.push.publicKey) });
  await api('/ops/push/subscribe', { method: 'POST', body: sub.toJSON() });
  return 'granted';
}

function pushBanner() {
  if (!state.push.enabled || !pushSupported()) {
    return IOS && !STANDALONE ? `<div class="banner info"><span class="with-ic">${ic('bell')}Para recibir avisos en iPhone, agrega el panel a inicio desde Safari.</span></div>` : '';
  }
  if (Notification.permission === 'granted') return '';
  if (Notification.permission === 'denied') {
    return `<div class="banner"><span class="with-ic">${ic('bell')}Las notificaciones están bloqueadas. Actívalas en los ajustes del teléfono para esta app.</span></div>`;
  }
  return `<div class="banner info"><span class="with-ic">${ic('bell')}Activa los avisos de nuevas rentas en este dispositivo.</span><button class="btn sm primary" data-action="push-on">Activar</button></div>`;
}

// ───────────────────────────── acciones globales ─────────────────────────────
document.addEventListener('click', async e => {
  const el = e.target.closest('[data-action]');
  if (!el) return;
  const a = el.dataset.action;
  const run = async fn => { try { el.disabled = true; await fn(); } catch (error) { if (!error.expired) toast(error.message, true); } finally { el.disabled = false; } };
  switch (a) {
    case 'toggle-pw': {
      const i = el.previousElementSibling; const show = i.type === 'password';
      i.type = show ? 'text' : 'password'; el.innerHTML = ic(show ? 'eyeOff' : 'eye');
      el.setAttribute('aria-label', show ? 'Ocultar contraseña' : 'Mostrar contraseña'); break;
    }
    case 'reload': location.reload(); break;
    case 'reload-view': route(); break;
    case 'go': location.hash = el.dataset.href; break;
    case 'cal-new': location.hash = `#/nueva?vehicle=${el.dataset.vehicle}&date=${el.dataset.date}`; break;
    case 'status': run(() => changeStatus(el.dataset.status)); break;
    case 'add-payment': paymentModal(); break;
    case 'contract': run(() => contract(el.dataset.id, el.dataset.folio)); break;
    case 'guarantee': run(async () => {
      const { r } = views.detalle.data;
      await api(`/ops/reservations/${r.id}/status`, { method: 'POST', body: { status: r.status, guarantee_returned: true } });
      toast('Garantía marcada como devuelta'); route();
    }); break;
    case 'del-payment': if (confirm('¿Eliminar este pago?')) run(async () => { await api(`/ops/payments/${el.dataset.id}`, { method: 'DELETE' }); toast('Pago eliminado'); route(); }); break;
    case 'delete-reservation': if (confirm('¿Eliminar esta renta y sus pagos? No se puede deshacer. Si solo no procede, mejor cancélala.')) run(async () => { await api(`/ops/reservations/${el.dataset.id}`, { method: 'DELETE' }); toast('Renta eliminada'); location.hash = '#/reservas'; }); break;
    case 'del-expense': if (confirm('¿Eliminar este gasto?')) run(async () => { await api(`/ops/expenses/${el.dataset.id}`, { method: 'DELETE' }); toast('Gasto eliminado'); route(); }); break;
    case 'edit-vehicle': vehicleModal(el.dataset.id); break;
    case 'new-staff': staffModal(null); break;
    case 'edit-staff': run(() => staffModal(el.dataset.id)); break;
    case 'push-on': run(async () => {
      const r = await ensurePush(true);
      toast(r === 'granted' ? 'Notificaciones activadas' : 'No se concedió el permiso de notificaciones', r !== 'granted');
      $('#push-banner') && ($('#push-banner').innerHTML = pushBanner());
    }); break;
    case 'update-check': run(checkUpdate); break;
    case 'update-apply': run(applyUpdate); break;
    case 'logout': run(async () => { await api('/auth/logout', { method: 'POST' }); showLogin(); }); break;
  }
});

window.addEventListener('keydown', e => { if (e.key === 'Escape' && !$('#modal').hidden) closeModal(); });

if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('/sw.js').catch(() => {});
  navigator.serviceWorker.addEventListener('message', e => {
    if (e.data?.type === 'navigate') { const u = new URL(e.data.url); location.hash = u.hash || '#/inicio'; route(); }
  });
}
// Al volver a la app, refresca datos (p. ej. tras una notificación).
document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible' && state.me) refreshBadge(); });

hydrateIcons();
start();
