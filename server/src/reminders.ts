import { pool } from './db.js';
import { env } from './env.js';
import { logEvent } from './common.js';
import { readFile, statfs } from 'node:fs/promises';
import { BACKUP_STATUS, purgeMedia, VEHICLE_COLUMNS, vehicleAlerts } from './operations.js';
import { notifyStaff } from './push.js';
import { refreshFx } from './fx.js';

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
       (SELECT count(*)::int FROM reservation WHERE status IN ('new','quoted','hold')) AS pending`, [today]);
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
        pickup='—', destination=NULL, client_id=NULL, checklist_out=NULL, checklist_in=NULL
      WHERE ends_at < now() - interval '12 months' AND client_name <> '(dato eliminado)' RETURNING id`);
  await purgeMedia(anon.rows.map(r => r.id));
  const del = await pool.query(
    `DELETE FROM client c WHERE c.updated_at < now() - interval '12 months'
        AND NOT EXISTS (SELECT 1 FROM reservation r WHERE r.client_id = c.id)`);
  if (anon.rowCount || del.rowCount) log(`privacidad: ${anon.rowCount} rentas anonimizadas, ${del.rowCount} clientes eliminados`);
}

/** Apartados de la web: aviso 1 h antes de vencer y liberación automática al vencer. */
async function expireHolds(today: string, log: (m: string) => void) {
  const soon = await pool.query(
    `SELECT id, folio, client_name FROM reservation
      WHERE status='hold' AND hold_until BETWEEN now() AND now() + interval '1 hour'`);
  for (const r of soon.rows) {
    const claim = await pool.query(
      'INSERT INTO reminder_log (reservation_id, kind, sent_on) VALUES ($1,$2,$3) ON CONFLICT DO NOTHING', [r.id, 'hold_expiring', today]);
    if (!claim.rowCount) continue;
    await notifyStaff({ title: `Apartado por vencer ${r.folio}`, body: `${r.client_name}: confírmalo o se libera en menos de 1 hora`, url: `/#/reservas/${r.id}`, tag: `hold-${r.id}`, urgent: true }, log);
  }
  const expired = await pool.query(
    `UPDATE reservation SET status='cancelled', hold_until=NULL, updated_at=now()
      WHERE status='hold' AND hold_until < now() RETURNING id, folio, client_name`);
  for (const r of expired.rows) {
    await logEvent(pool, r.id, null, 'hold_expired', {});
    await notifyStaff({ title: `Apartado vencido ${r.folio}`, body: `Se liberaron las fechas de ${r.client_name}`, url: `/#/reservas/${r.id}`, tag: `hold-${r.id}` }, log);
  }
}

/** Una vez al día: documentos por vencer y servicios pendientes de las unidades. */
async function maintenanceAlerts(today: string, log: (m: string) => void) {
  const claim = await pool.query(
    `INSERT INTO setting (key, value) VALUES ('last_maintenance_alert', to_jsonb($1::text))
     ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = now()
       WHERE setting.value IS DISTINCT FROM EXCLUDED.value
     RETURNING key`, [today]);
  if (!claim.rowCount) return;
  const { rows } = await pool.query(`SELECT ${VEHICLE_COLUMNS} FROM vehicle WHERE active ORDER BY code`);
  const lines = rows.flatMap(v => vehicleAlerts(v).filter(a => a.text !== 'Registra el último servicio').map(a => `${v.name}: ${a.text}`));
  if (!lines.length) return;
  await notifyStaff({ title: 'Mantenimiento de unidades', body: lines.slice(0, 4).join(' · ') + (lines.length > 4 ? ` · y ${lines.length - 4} más` : ''), url: '/#/ajustes', tag: `maint-${today}` }, log);
}

/** Una vez al día: avisa si el respaldo nocturno falló, no corrió, o si el disco se está llenando. */
async function systemAlerts(today: string, log: (m: string) => void) {
  const claim = await pool.query(
    `INSERT INTO setting (key, value) VALUES ('last_system_alert', to_jsonb($1::text))
     ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = now()
       WHERE setting.value IS DISTINCT FROM EXCLUDED.value
     RETURNING key`, [today]);
  if (!claim.rowCount) return;
  const problems: string[] = [];
  const backup = await readFile(BACKUP_STATUS, 'utf8').then(JSON.parse).catch(() => null);
  if (!backup) problems.push('No hay registro de respaldos');
  else if (!backup.ok) problems.push(backup.offsite === 'error' ? 'Falló la copia a Google Drive' : 'Falló el respaldo de la base de datos');
  else if (Date.now() - new Date(backup.at).getTime() > 30 * 3600_000) problems.push('El respaldo nocturno no corrió');
  const disk = await statfs('/').catch(() => null);
  if (disk) {
    const freePct = (disk.bavail / disk.blocks) * 100;
    if (freePct < 15) problems.push(`Disco casi lleno (${Math.round(freePct)}% libre)`);
  }
  if (!problems.length) return;
  await notifyStaff({ title: 'Revisar el servidor', body: problems.join(' · '), url: '/#/ajustes', tag: `system-${today}`, urgent: true }, log);
}

/** Señal de vida para el monitoreo externo: si deja de llegar, el servicio te avisa. */
async function heartbeat() {
  if (!env.HEALTHCHECK_URL) return;
  await pool.query('SELECT 1');
  await fetch(env.HEALTHCHECK_URL, { signal: AbortSignal.timeout(10_000) }).catch(() => {});
}

export function startReminders(log: (m: string) => void) {
  const tick = async () => {
    try {
      const { date, hour } = localNow();
      if (hour >= DAILY_HOUR) await dailySummary(date, log);
      await perReservation(date, log);
      await expireHolds(date, log);
      if (hour >= DAILY_HOUR) await maintenanceAlerts(date, log);
      if (hour >= DAILY_HOUR) await systemAlerts(date, log);
      await heartbeat();
      await refreshFx(log);
      if (hour === 3) await purgeExpiredPersonalData(log);
    } catch (error) {
      log(`recordatorios: ${(error as Error).message}`);
    }
  };
  setTimeout(tick, 15_000);
  return setInterval(tick, 5 * 60 * 1000);
}
