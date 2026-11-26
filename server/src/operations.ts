// Operación diaria: temporadas, cargos extra, revisión con fotos, firma, mantenimiento y estado del sistema.
import type { FastifyInstance } from 'fastify';
import { randomBytes } from 'node:crypto';
import { mkdir, readFile, rm, stat, statfs, unlink, writeFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { z } from 'zod';
import { requireAdmin, requireStaff } from './auth.js';
import { dateSchema, logEvent } from './common.js';
import { getSetting, pool, type Tx } from './db.js';
import { env } from './env.js';
import type { Season } from './pricing.js';

const uuid = z.string().uuid();
const cents = z.number().int().min(0).max(100_000_000);

export const UPLOAD_DIR = env.UPLOAD_DIR ?? join(import.meta.dirname, '..', 'uploads');
export const BACKUP_STATUS = join(homedir(), 'backups', 'status.json');

// ───────────────────────── Ajustes de cargos y apartados ─────────────────────────
export const extrasSchema = z.object({
  hold_hours: z.number().int().min(1).max(168),
  late_grace_minutes: z.number().int().min(0).max(600),
  late_hour_cents: cents,
  fuel_quarter_cents: cents,
  delivery_cents: cents,
  driver_day_cents: cents,
  cleaning_cents: cents,
});
export type Extras = z.infer<typeof extrasSchema>;
export const DEFAULT_EXTRAS: Extras = {
  hold_hours: 24, late_grace_minutes: 60, late_hour_cents: 15000, fuel_quarter_cents: 40000,
  delivery_cents: 30000, driver_day_cents: 80000, cleaning_cents: 30000,
};
export const getExtras = async () => ({ ...DEFAULT_EXTRAS, ...(await getSetting('extras', DEFAULT_EXTRAS)) });

export async function getSeasons(): Promise<(Season & { id: string })[]> {
  const { rows } = await pool.query(
    `SELECT id, name, to_char(starts_on,'YYYY-MM-DD') AS starts_on, to_char(ends_on,'YYYY-MM-DD') AS ends_on, daily_cents, weekly_cents
       FROM season WHERE ends_on >= current_date - 400 ORDER BY starts_on`);
  return rows;
}

// ───────────────────────── Mantenimiento por unidad ─────────────────────────
const DAY = 86400000;
const today = () => new Date(Date.now() - 6 * 3600e3).toISOString().slice(0, 10);
const daysUntil = (d: string) => Math.round((new Date(`${d}T12:00:00Z`).getTime() - new Date(`${today()}T12:00:00Z`).getTime()) / DAY);

export type VehicleAlert = { level: 'due' | 'soon'; text: string };

/** Avisos de una unidad: documentos por vencer (30 días) y servicio por km o por tiempo. */
export function vehicleAlerts(v: any): VehicleAlert[] {
  const out: VehicleAlert[] = [];
  const docs: [string, string | null, boolean][] = [['Seguro', v.insurance_expires, false], ['Verificación', v.verification_expires, true], ['Tarjeta/tenencia', v.permit_expires, true]];
  for (const [label, date, fem] of docs) {
    if (!date) continue;
    const n = daysUntil(String(date).slice(0, 10));
    if (n < 0) out.push({ level: 'due', text: `${label} ${fem ? 'vencida' : 'vencido'}` });
    else if (n <= 30) out.push({ level: 'soon', text: `${label} vence en ${n} día${n === 1 ? '' : 's'}` });
  }
  if (v.odometer_km != null && v.last_service_km != null) {
    const left = v.last_service_km + v.service_every_km - v.odometer_km;
    if (left <= 0) out.push({ level: 'due', text: `Servicio atrasado ${Math.abs(left).toLocaleString('es-MX')} km` });
    else if (left <= 800) out.push({ level: 'soon', text: `Servicio en ${left.toLocaleString('es-MX')} km` });
  }
  if (v.last_service_on) {
    const next = new Date(`${String(v.last_service_on).slice(0, 10)}T12:00:00Z`);
    next.setUTCMonth(next.getUTCMonth() + v.service_every_months);
    const n = daysUntil(next.toISOString().slice(0, 10));
    if (n < 0) out.push({ level: 'due', text: 'Servicio por tiempo atrasado' });
    else if (n <= 15) out.push({ level: 'soon', text: `Servicio por tiempo en ${n} días` });
  }
  if (v.last_service_km == null && v.last_service_on == null) out.push({ level: 'soon', text: 'Registra el último servicio' });
  return out;
}

export const VEHICLE_COLUMNS = `id, code, name, plate, capacity, model_year, color, odometer_km, active, notes,
  to_char(insurance_expires,'YYYY-MM-DD') AS insurance_expires, to_char(verification_expires,'YYYY-MM-DD') AS verification_expires,
  to_char(permit_expires,'YYYY-MM-DD') AS permit_expires, service_every_km, service_every_months, last_service_km,
  to_char(last_service_on,'YYYY-MM-DD') AS last_service_on`;

// ───────────────────────── Archivos (fotos) ─────────────────────────
function decodeImage(dataUrl: string, mime: 'image/jpeg' | 'image/png') {
  const prefix = `data:${mime};base64,`;
  if (!dataUrl.startsWith(prefix)) throw Object.assign(new Error('Formato de imagen no válido'), { statusCode: 400 });
  const buf = Buffer.from(dataUrl.slice(prefix.length), 'base64');
  const ok = mime === 'image/jpeg' ? buf[0] === 0xff && buf[1] === 0xd8 : buf.subarray(1, 4).toString() === 'PNG';
  if (!ok) throw Object.assign(new Error('Formato de imagen no válido'), { statusCode: 400 });
  return buf;
}

/** Borra fotos y firma de rentas anonimizadas (aviso de privacidad). */
export async function purgeMedia(reservationIds: string[]) {
  if (!reservationIds.length) return;
  await pool.query('DELETE FROM inspection_photo WHERE reservation_id = ANY($1::uuid[])', [reservationIds]);
  await pool.query('DELETE FROM reservation_signature WHERE reservation_id = ANY($1::uuid[])', [reservationIds]);
  await Promise.all(reservationIds.map(id => rm(join(UPLOAD_DIR, id), { recursive: true, force: true })));
}

export async function operationsRoutes(app: FastifyInstance) {
  // Plugin aparte de opsRoutes: el hook de sesión no se hereda, así que se repite aquí.
  app.addHook('onRequest', async (req, reply) => {
    if (req.url.startsWith('/v1/ops/')) await requireStaff(req, reply);
  });

  // ───────── Temporadas ─────────
  app.get('/v1/ops/seasons', async () => ({ data: await getSeasons() }));

  const seasonInput = z.object({
    name: z.string().trim().min(2).max(60), starts_on: dateSchema, ends_on: dateSchema,
    daily_cents: cents, weekly_cents: cents,
  }).refine(s => s.ends_on >= s.starts_on, 'La temporada debe terminar después de empezar');

  app.post('/v1/ops/seasons', { preHandler: requireAdmin }, async (req, reply) => {
    const s = seasonInput.parse(req.body);
    const { rows } = await pool.query(
      'INSERT INTO season (name, starts_on, ends_on, daily_cents, weekly_cents) VALUES ($1,$2,$3,$4,$5) RETURNING id',
      [s.name, s.starts_on, s.ends_on, s.daily_cents, s.weekly_cents]);
    return reply.code(201).send({ id: rows[0].id });
  });
  app.put('/v1/ops/seasons/:id', { preHandler: requireAdmin }, async (req: any, reply) => {
    const s = seasonInput.parse(req.body);
    const { rowCount } = await pool.query(
      'UPDATE season SET name=$2, starts_on=$3, ends_on=$4, daily_cents=$5, weekly_cents=$6 WHERE id=$1',
      [uuid.parse(req.params.id), s.name, s.starts_on, s.ends_on, s.daily_cents, s.weekly_cents]);
    if (!rowCount) return reply.code(404).send({ error: { message: 'Temporada no encontrada' } });
    return { ok: true };
  });
  app.delete('/v1/ops/seasons/:id', { preHandler: requireAdmin }, async (req: any) => {
    await pool.query('DELETE FROM season WHERE id=$1', [uuid.parse(req.params.id)]);
    return { ok: true };
  });

  // ───────── Cargos extra ─────────
  app.post('/v1/ops/reservations/:id/charges', async (req: any, reply) => {
    const id = uuid.parse(req.params.id);
    const b = chargeInput.parse(req.body);
    const exists = await pool.query('SELECT 1 FROM reservation WHERE id=$1', [id]);
    if (!exists.rows[0]) return reply.code(404).send({ error: { message: 'Renta no encontrada' } });
    await insertCharges(pool, id, req.staff!.id, [b]);
    return reply.code(201).send({ ok: true });
  });
  app.delete('/v1/ops/charges/:id', async (req: any, reply) => {
    const { rows } = await pool.query('DELETE FROM charge WHERE id=$1 RETURNING reservation_id, kind, amount_cents', [uuid.parse(req.params.id)]);
    if (!rows[0]) return reply.code(404).send({ error: { message: 'Cargo no encontrado' } });
    await logEvent(pool, rows[0].reservation_id, req.staff!.id, 'charge:deleted', { kind: rows[0].kind, amount_cents: rows[0].amount_cents });
    return { ok: true };
  });

  // ───────── Fotos de revisión ─────────
  app.post('/v1/ops/reservations/:id/photos', { bodyLimit: 4 * 1024 * 1024 }, async (req: any, reply) => {
    const id = uuid.parse(req.params.id);
    const b = z.object({
      stage: z.enum(['out', 'in']),
      slot: z.string().regex(/^[a-z_]{2,20}$/),
      data: z.string().max(4_000_000),
    }).parse(req.body);
    const exists = await pool.query('SELECT 1 FROM reservation WHERE id=$1', [id]);
    if (!exists.rows[0]) return reply.code(404).send({ error: { message: 'Renta no encontrada' } });
    const buf = decodeImage(b.data, 'image/jpeg');
    const dir = join(UPLOAD_DIR, id);
    await mkdir(dir, { recursive: true });
    const file = `${b.stage}-${b.slot}-${randomBytes(6).toString('hex')}.jpg`;
    await writeFile(join(dir, file), buf);
    const { rows } = await pool.query(
      `INSERT INTO inspection_photo (reservation_id, stage, slot, file, created_by) VALUES ($1,$2,$3,$4,$5)
       ON CONFLICT (reservation_id, stage, slot) DO UPDATE SET file=EXCLUDED.file, created_by=EXCLUDED.created_by, created_at=now()
       RETURNING id, (SELECT file FROM inspection_photo WHERE reservation_id=$1 AND stage=$2 AND slot=$3) AS old_file`,
      [id, b.stage, b.slot, file, req.staff!.id]);
    if (rows[0].old_file && rows[0].old_file !== file) await unlink(join(dir, rows[0].old_file)).catch(() => {});
    return reply.code(201).send({ id: rows[0].id });
  });

  app.get('/v1/ops/photos/:id', async (req: any, reply) => {
    const { rows } = await pool.query('SELECT reservation_id, file FROM inspection_photo WHERE id=$1', [uuid.parse(req.params.id)]);
    if (!rows[0]) return reply.code(404).send({ error: { message: 'Foto no encontrada' } });
    const buf = await readFile(join(UPLOAD_DIR, rows[0].reservation_id, rows[0].file)).catch(() => null);
    if (!buf) return reply.code(404).send({ error: { message: 'Foto no encontrada' } });
    return reply.type('image/jpeg').header('cache-control', 'private, max-age=86400').send(buf);
  });

  app.delete('/v1/ops/photos/:id', async (req: any, reply) => {
    const { rows } = await pool.query('DELETE FROM inspection_photo WHERE id=$1 RETURNING reservation_id, file', [uuid.parse(req.params.id)]);
    if (!rows[0]) return reply.code(404).send({ error: { message: 'Foto no encontrada' } });
    await unlink(join(UPLOAD_DIR, rows[0].reservation_id, rows[0].file)).catch(() => {});
    return { ok: true };
  });

  // ───────── Firma del contrato ─────────
  app.post('/v1/ops/reservations/:id/signature', { bodyLimit: 1024 * 1024 }, async (req: any, reply) => {
    const id = uuid.parse(req.params.id);
    const b = z.object({ name: z.string().trim().min(3).max(150), data: z.string().max(900_000) }).parse(req.body);
    decodeImage(b.data, 'image/png');
    const exists = await pool.query('SELECT 1 FROM reservation WHERE id=$1', [id]);
    if (!exists.rows[0]) return reply.code(404).send({ error: { message: 'Renta no encontrada' } });
    await pool.query(
      `INSERT INTO reservation_signature (reservation_id, png, signed_name) VALUES ($1,$2,$3)
       ON CONFLICT (reservation_id) DO UPDATE SET png=EXCLUDED.png, signed_name=EXCLUDED.signed_name, signed_at=now()`,
      [id, b.data, b.name]);
    await logEvent(pool, id, req.staff!.id, 'signed', { name: b.name });
    return { ok: true };
  });
  app.delete('/v1/ops/reservations/:id/signature', async (req: any) => {
    const id = uuid.parse(req.params.id);
    await pool.query('DELETE FROM reservation_signature WHERE reservation_id=$1', [id]);
    await logEvent(pool, id, req.staff!.id, 'signature:deleted', {});
    return { ok: true };
  });

  // ───────── Mantenimiento ─────────
  app.post('/v1/ops/vehicles/:id/service', async (req: any, reply) => {
    const id = uuid.parse(req.params.id);
    const b = z.object({
      km: z.number().int().min(0).max(2_000_000), date: dateSchema,
      cost_cents: cents.optional(), description: z.string().trim().max(300).optional(),
    }).parse(req.body);
    const { rows } = await pool.query(
      `UPDATE vehicle SET last_service_km=$2, last_service_on=$3, odometer_km=GREATEST(COALESCE(odometer_km,0),$2)
        WHERE id=$1 RETURNING ${VEHICLE_COLUMNS}`, [id, b.km, b.date]);
    if (!rows[0]) return reply.code(404).send({ error: { message: 'Unidad no encontrada' } });
    if (b.cost_cents) {
      await pool.query(
        `INSERT INTO expense (category, vehicle_id, amount_cents, spent_on, description, created_by)
         VALUES ('maintenance',$1,$2,$3,$4,$5)`,
        [id, b.cost_cents, b.date, b.description || `Servicio a los ${b.km.toLocaleString('es-MX')} km`, req.staff!.id]);
    }
    return { vehicle: { ...rows[0], alerts: vehicleAlerts(rows[0]) } };
  });

  // ───────── Estado del sistema y respaldos ─────────
  app.get('/v1/ops/system', { preHandler: requireAdmin }, async () => {
    const backup = await readFile(BACKUP_STATUS, 'utf8').then(JSON.parse).catch(() => null);
    const uploads = await stat(UPLOAD_DIR).then(() => true).catch(() => false);
    const db = await pool.query('SELECT now() AS now, pg_database_size(current_database())::bigint AS size').then(r => r.rows[0]).catch(() => null);
    const fs = await statfs('/').catch(() => null);
    return {
      uptime_s: Math.round(process.uptime()), db_ok: Boolean(db), db_size: db?.size ?? null, uploads,
      disk: fs ? { free: fs.bavail * fs.bsize, total: fs.blocks * fs.bsize } : null,
      monitor: Boolean(env.HEALTHCHECK_URL), backup,
    };
  });
}

export const chargeInput = z.object({
  kind: z.enum(['late', 'fuel', 'delivery', 'driver', 'cleaning', 'damage', 'other']),
  description: z.string().trim().max(300).nullish().transform(v => v || null),
  amount_cents: z.number().int().min(1).max(100_000_000),
});

export async function insertCharges(db: Tx | typeof pool, reservationId: string, staffId: string, charges: z.infer<typeof chargeInput>[]) {
  for (const c of charges) {
    await db.query('INSERT INTO charge (reservation_id, kind, description, amount_cents, created_by) VALUES ($1,$2,$3,$4,$5)',
      [reservationId, c.kind, c.description, c.amount_cents, staffId]);
    await logEvent(db, reservationId, staffId, `charge:${c.kind}`, { amount_cents: c.amount_cents, description: c.description });
  }
}
