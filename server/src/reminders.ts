import { pool } from './db.js';
import { notifyStaff } from './push.js';

const TZ = 'America/Merida';
const DAILY_HOUR = 8; // resumen diario a las 8:00 de Mérida

const localNow = () => {
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', hour12: false })
    .formatToParts(new Date());
  const get = (t: string) => parts.find(p => p.type === t)!.value;
  return { date: `${get('year')}-${get('month')}-${get('day')}`, hour: Number(get('hour')) % 24 };
};

const time = (d: Date) => d.toLocaleTimeString('es-MX', { timeZone: TZ, hour: '2-digit', minute: '2-digit' });

async function dailySummary(today: string, log: (m: string) => void) {
  // Marca atómica: solo un proceso envía el resumen del día.
  const claim = await pool.query(
    `INSERT INTO setting (key, value) VALUES ('last_daily_summary', to_jsonb($1::text))
     ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = now()
       WHERE setting.value IS DISTINCT FROM EXCLUDED.value
     RETURNING key`, [today]);
  if (!claim.rowCount) return;

  const { rows } = await pool.query(
    `SELECT
       (SELECT count(*)::int FROM reservation WHERE status IN ('confirmed','assigned','hold','deposit_pending')
          AND (starts_at AT TIME ZONE '${TZ}')::date = $1::date) AS pickups,
       (SELECT count(*)::int FROM reservation WHERE status IN ('in_service','confirmed','assigned')
          AND (ends_at AT TIME ZONE '${TZ}')::date = $1::date) AS returns,
       (SELECT count(*)::int FROM reservation WHERE status IN ('new','quoted')) AS pending`, [today]);
  const { pickups, returns, pending } = rows[0];
  if (!pickups && !returns && !pending) return;
  const parts = [
    pickups ? `${pickups} entrega${pickups > 1 ? 's' : ''}` : null,
    returns ? `${returns} devolución${returns > 1 ? 'es' : ''}` : null,
    pending ? `${pending} solicitud${pending > 1 ? 'es' : ''} por atender` : null,
  ].filter(Boolean);
  await notifyStaff({ title: 'Agenda de hoy', body: parts.join(' · '), url: '/#/inicio', tag: `daily-${today}` }, log);
}

/** Aviso 2 h antes de cada entrega/devolución y alerta de devoluciones atrasadas (una vez al día). */
async function perReservation(today: string, log: (m: string) => void) {
  const { rows } = await pool.query(
    `SELECT r.id, r.folio, r.client_name, r.starts_at, r.ends_at, r.status, v.name AS vehicle,
       CASE
         WHEN r.status IN ('confirmed','assigned') AND r.starts_at BETWEEN now() AND now() + interval '2 hours' THEN 'pickup_soon'
         WHEN r.status = 'in_service' AND r.ends_at BETWEEN now() AND now() + interval '2 hours' THEN 'return_soon'
         WHEN r.status = 'in_service' AND r.ends_at < now() - interval '1 hour' THEN 'overdue'
       END AS kind
       FROM reservation r LEFT JOIN vehicle v ON v.id = r.vehicle_id
      WHERE r.status IN ('confirmed','assigned','in_service')
        AND r.starts_at < now() + interval '2 hours'`);
  for (const r of rows) {
    if (!r.kind) continue;
    const claim = await pool.query(
      'INSERT INTO reminder_log (reservation_id, kind, sent_on) VALUES ($1,$2,$3) ON CONFLICT DO NOTHING', [r.id, r.kind, today]);
    if (!claim.rowCount) continue;
    const msg = r.kind === 'pickup_soon'
      ? { title: `Entrega a las ${time(r.starts_at)}`, body: `${r.client_name} · ${r.vehicle ?? 'sin unidad'} · ${r.folio}` }
      : r.kind === 'return_soon'
        ? { title: `Devolución a las ${time(r.ends_at)}`, body: `${r.client_name} · ${r.vehicle ?? ''} · ${r.folio}` }
        : { title: `Devolución atrasada ${r.folio}`, body: `${r.client_name} debía entregar ${r.vehicle ?? 'la unidad'} a las ${time(r.ends_at)}` };
    await notifyStaff({ ...msg, url: `/#/reservas/${r.id}`, tag: `${r.kind}-${r.id}` }, log);
  }
}

/**
 * Aviso de privacidad: los datos personales se eliminan 12 meses después de terminar la renta.
 * Se anonimiza la renta (se conservan fechas y montos para la contabilidad) y se borra la ficha
 * del cliente cuando ya no le quedan rentas recientes.
 */
async function purgeExpiredPersonalData(log: (m: string) => void) {
  const anon = await pool.query(
    `UPDATE reservation SET client_name='(dato eliminado)', client_phone='0', client_email=NULL, notes=NULL,
        pickup='—', destination=NULL, client_id=NULL
      WHERE ends_at < now() - interval '12 months' AND client_name <> '(dato eliminado)'`);
  const del = await pool.query(
    `DELETE FROM client c WHERE c.updated_at < now() - interval '12 months'
        AND NOT EXISTS (SELECT 1 FROM reservation r WHERE r.client_id = c.id)`);
  if (anon.rowCount || del.rowCount) log(`privacidad: ${anon.rowCount} rentas anonimizadas, ${del.rowCount} clientes eliminados`);
}

export function startReminders(log: (m: string) => void) {
  const tick = async () => {
    try {
      const { date, hour } = localNow();
      if (hour >= DAILY_HOUR) await dailySummary(date, log);
      await perReservation(date, log);
      if (hour === 3) await purgeExpiredPersonalData(log);
    } catch (error) {
      log(`recordatorios: ${(error as Error).message}`);
    }
  };
  setTimeout(tick, 15_000);
  return setInterval(tick, 5 * 60 * 1000);
}
