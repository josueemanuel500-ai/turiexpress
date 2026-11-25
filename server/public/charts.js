// Gráficas del dashboard en SVG puro (sin librerías). Se dibujan al ancho real del contenedor
// para que el texto no se deforme, y se redibujan si cambia el tamaño.
// Paleta categórica validada (colorblind-safe en pares adyacentes); el texto siempre en tinta, no en color de serie.
export const SERIES = ['#2a78d6', '#eb6834', '#1baf7a', '#eda100', '#e87ba4'];
export const OTHER = '#9aa5a6';
const INK = '#102426', MUTED = '#5a7274', GRID = '#e6eeee', AXIS = '#c9d6d6', SURFACE = '#ffffff';

const esc = v => String(v ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const short = cents => {
  const v = cents / 100;
  if (Math.abs(v) >= 1e6) return `$${(v / 1e6).toFixed(1).replace('.0', '')}M`;
  if (Math.abs(v) >= 1e3) return `$${(v / 1e3).toFixed(v >= 1e4 ? 0 : 1).replace('.0', '')}k`;
  return `$${Math.round(v)}`;
};
const niceMax = v => {
  if (v <= 0) return 100000; // $1,000 cuando no hay datos
  const p = 10 ** Math.floor(Math.log10(v));
  return [1, 2, 2.5, 5, 10].map(m => m * p).find(m => m >= v);
};

// ───────── Tooltip compartido ─────────
let tip;
function tooltip() {
  if (!tip) { tip = document.createElement('div'); tip.className = 'chart-tip'; tip.hidden = true; document.body.append(tip); }
  return tip;
}
function showTip(html, x, y) {
  const t = tooltip();
  t.innerHTML = html; t.hidden = false;
  const w = t.offsetWidth, h = t.offsetHeight;
  const left = Math.min(Math.max(8, x - w / 2), innerWidth - w - 8);
  const top = y - h - 12 < 8 ? y + 16 : y - h - 12;
  t.style.left = `${left}px`; t.style.top = `${top}px`;
}
export const hideTip = () => { if (tip) tip.hidden = true; };
addEventListener('scroll', hideTip, { passive: true });

// ───────── Línea: cobrado vs gastos por mes ─────────
function drawLine(host, data) {
  const { months, series, current, money } = data;
  const W = Math.max(280, host.clientWidth), H = 220;
  const m = { t: 14, r: 64, b: 28, l: 46 };
  const iw = W - m.l - m.r, ih = H - m.t - m.b;
  const max = niceMax(Math.max(...series.flatMap(s => s.values)));
  const x = i => m.l + (months.length === 1 ? iw / 2 : (i * iw) / (months.length - 1));
  const y = v => m.t + ih - (v / max) * ih;
  const ticks = [0, 0.25, 0.5, 0.75, 1].map(f => f * max);
  const ci = months.findIndex(mo => mo.key === current);

  // Etiquetas directas al final de cada línea, separadas para que no choquen.
  const ends = series.map((s, k) => ({ k, y: y(s.values.at(-1)) })).sort((a, b) => a.y - b.y);
  for (let i = 1; i < ends.length; i++) if (ends[i].y - ends[i - 1].y < 16) ends[i].y = ends[i - 1].y + 16;

  host.innerHTML = `<svg width="${W}" height="${H}" role="img" aria-label="Cobrado y gastos de los últimos ${months.length} meses">
    ${ci >= 0 ? `<rect x="${x(ci) - Math.min(28, iw / months.length / 2)}" y="${m.t}" width="${Math.min(56, iw / months.length)}" height="${ih}" rx="8" fill="#f1f8f8"/>` : ''}
    ${ticks.map(t => `<line x1="${m.l}" x2="${W - m.r}" y1="${y(t)}" y2="${y(t)}" stroke="${t ? GRID : AXIS}" stroke-width="1"/>
      <text x="${m.l - 8}" y="${y(t) + 4}" text-anchor="end" font-size="11" fill="${MUTED}">${short(t)}</text>`).join('')}
    ${months.map((mo, i) => `<text x="${x(i)}" y="${H - 8}" text-anchor="middle" font-size="11.5" fill="${i === ci ? INK : MUTED}" font-weight="${i === ci ? 700 : 500}">${esc(mo.label)}</text>`).join('')}
    ${series.map(s => `<polyline points="${s.values.map((v, i) => `${x(i)},${y(v)}`).join(' ')}" fill="none" stroke="${s.color}" stroke-width="2" stroke-linejoin="round" stroke-linecap="round"/>`).join('')}
    ${series.map(s => s.values.map((v, i) => `<circle cx="${x(i)}" cy="${y(v)}" r="4" fill="${s.color}" stroke="${SURFACE}" stroke-width="2"/>`).join('')).join('')}
    ${ends.map(e => `<text x="${W - m.r + 8}" y="${e.y + 4}" font-size="11.5" font-weight="600" fill="${INK}">${esc(series[e.k].name)}</text>`).join('')}
    <line class="crosshair" x1="0" x2="0" y1="${m.t}" y2="${m.t + ih}" stroke="${MUTED}" stroke-width="1" stroke-dasharray="3 3" visibility="hidden"/>
    <rect class="hit" x="${m.l - 10}" y="0" width="${iw + 20}" height="${H}" fill="transparent"/>
  </svg>`;

  const svg = host.firstElementChild, cross = svg.querySelector('.crosshair');
  const onMove = e => {
    const r = svg.getBoundingClientRect();
    const px = e.clientX - r.left;
    const i = Math.max(0, Math.min(months.length - 1, Math.round(((px - m.l) / iw) * (months.length - 1))));
    cross.setAttribute('x1', x(i)); cross.setAttribute('x2', x(i)); cross.setAttribute('visibility', 'visible');
    const rows = series.map(s => `<div class="tip-row"><i style="background:${s.color}"></i>${esc(s.name)}<b>${money(s.values[i])}</b></div>`).join('');
    const profit = series[0].values[i] - series[1].values[i];
    showTip(`<strong>${esc(months[i].long)}</strong>${rows}<div class="tip-row total">Utilidad<b>${money(profit)}</b></div>`, r.left + x(i), r.top + m.t);
  };
  const hit = svg.querySelector('.hit');
  hit.addEventListener('pointermove', onMove);
  hit.addEventListener('pointerdown', onMove);
  hit.addEventListener('pointerleave', () => { cross.setAttribute('visibility', 'hidden'); hideTip(); });
}

// ───────── Anillo (dona) ─────────
// segments: [{ name, value, color }]. Con un solo segmento + "resto" funciona como medidor.
function drawDonut(host, data) {
  const { segments, center, sub, money, track = false } = data;
  const S = 168, R = 70, T = 18, C = 2 * Math.PI * R;
  const total = segments.reduce((s, x) => s + x.value, 0);
  const gap = segments.filter(s => s.value > 0).length > 1 ? 3 : 0; // separación del color de la superficie
  let acc = 0;
  const arcs = total > 0 ? segments.filter(s => s.value > 0).map((s, i) => {
    const len = (s.value / total) * C;
    const dash = Math.max(0.01, len - gap);
    const el = `<circle class="seg" data-i="${segments.indexOf(s)}" cx="${S / 2}" cy="${S / 2}" r="${R}" fill="none" stroke="${s.color}" stroke-width="${T}"
      stroke-dasharray="${dash} ${C - dash}" stroke-dashoffset="${-acc}" transform="rotate(-90 ${S / 2} ${S / 2})"/>`;
    acc += len;
    return el;
  }).join('') : '';
  host.innerHTML = `<svg width="${S}" height="${S}" viewBox="0 0 ${S} ${S}" role="img" aria-label="${esc(center)} ${esc(sub)}">
    <circle cx="${S / 2}" cy="${S / 2}" r="${R}" fill="none" stroke="${track || !total ? '#e9f1f1' : 'transparent'}" stroke-width="${T}"/>
    ${arcs}
    <text x="${S / 2}" y="${S / 2 + 2}" text-anchor="middle" font-size="26" font-weight="800" fill="${INK}">${esc(center)}</text>
    <text x="${S / 2}" y="${S / 2 + 22}" text-anchor="middle" font-size="11.5" fill="${MUTED}">${esc(sub)}</text>
  </svg>`;
  host.querySelectorAll('.seg').forEach(seg => {
    const s = segments[Number(seg.dataset.i)];
    const show = e => showTip(`<div class="tip-row"><i style="background:${s.color}"></i>${esc(s.name)}<b>${money ? money(s.value) : esc(s.label ?? s.value)}</b></div>
      <div class="tip-row muted">${Math.round((s.value / total) * 100)}% del total</div>`, e.clientX, e.clientY);
    seg.addEventListener('pointermove', show);
    seg.addEventListener('pointerdown', show);
    seg.addEventListener('pointerleave', hideTip);
  });
}

const drawers = { line: drawLine, donut: drawDonut };

/** Dibuja todas las gráficas [data-chart] dentro de root. `registry` guarda los datos por id. */
export function mountCharts(root, registry) {
  root.querySelectorAll('[data-chart]').forEach(host => {
    const data = registry[host.dataset.chart];
    const draw = drawers[data?.type];
    if (!draw) return;
    draw(host, data);
    if (data.type === 'line' && 'ResizeObserver' in window) {
      let w = host.clientWidth;
      new ResizeObserver(() => { if (host.isConnected && host.clientWidth !== w) { w = host.clientWidth; draw(host, data); } }).observe(host);
    }
  });
}
