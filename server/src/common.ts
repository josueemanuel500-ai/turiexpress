import { z } from 'zod';
import type { Tx } from './db.js';
import { pool } from './db.js';

/** Mérida no tiene horario de verano: UTC-6 todo el año. */
export const BUSINESS_OFFSET = '-06:00';

export const BLOCKING = ['hold', 'deposit_pending', 'confirmed', 'assigned', 'in_service'] as const;

export const STATUS_LABEL: Record<string, string> = {
  new: 'Solicitud nueva', quoted: 'Cotizada', hold: 'Apartada', deposit_pending: 'Esperando anticipo',
  confirmed: 'Confirmada', assigned: 'Asignada', in_service: 'En renta', completed: 'Terminada',
  cancelled: 'Cancelada', no_show: 'No se presentó',
};

/** Deja solo dígitos y antepone 52 a números mexicanos de 10 dígitos. */
export function normalizePhone(raw: string): string {
  let digits = raw.replace(/\D/g, '');
  if (digits.length === 10) digits = `52${digits}`;
  if (digits.length === 13 && digits.startsWith('521')) digits = `52${digits.slice(3)}`;
  return digits;
}

export const phoneSchema = z.string().trim().min(10).max(25)
  .transform(normalizePhone)
  .refine(v => v.length >= 11 && v.length <= 15, 'Teléfono inválido');

export const dateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Fecha inválida (AAAA-MM-DD)');

export const isoDateTime = z.string().datetime({ offset: true });

export const money = (cents: number | null | undefined) =>
  `$${((cents ?? 0) / 100).toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

export async function logEvent(db: Tx | typeof pool, reservationId: string, actorId: string | null, event: string, detail?: unknown) {
  await db.query(
    'INSERT INTO reservation_event (reservation_id,actor_id,event,detail) VALUES ($1,$2,$3,$4)',
    [reservationId, actorId, event, detail === undefined ? null : JSON.stringify(detail)],
  );
}

/** Busca la ficha del cliente por teléfono o la crea. Con `overwrite` actualiza los datos capturados. */
export async function upsertClient(
  db: Tx,
  c: { full_name: string; phone: string; email?: string | null; id_document?: string | null; license_number?: string | null; license_expires?: string | null; address?: string | null },
  overwrite: boolean,
): Promise<{ id: string; blocked: boolean }> {
  const existing = await db.query('SELECT id, blocked FROM client WHERE phone=$1', [c.phone]);
  if (existing.rows[0]) {
    if (overwrite) {
      await db.query(
        `UPDATE client SET full_name=$2, email=COALESCE($3,email), id_document=COALESCE($4,id_document),
           license_number=COALESCE($5,license_number), license_expires=COALESCE($6,license_expires),
           address=COALESCE($7,address), updated_at=now() WHERE id=$1`,
        [existing.rows[0].id, c.full_name, c.email || null, c.id_document || null, c.license_number || null, c.license_expires || null, c.address || null],
      );
    }
    return existing.rows[0];
  }
  const { rows } = await db.query(
    `INSERT INTO client (full_name,phone,email,id_document,license_number,license_expires,address)
     VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING id, blocked`,
    [c.full_name, c.phone, c.email || null, c.id_document || null, c.license_number || null, c.license_expires || null, c.address || null],
  );
  return rows[0];
}

/** Unidades activas sin reserva bloqueante en el rango [desde, hasta). */
export async function freeVehicles(db: Tx | typeof pool, startsAt: string, endsAt: string, exceptReservation?: string) {
  const { rows } = await db.query(
    `SELECT v.id, v.code, v.name FROM vehicle v
      WHERE v.active AND NOT EXISTS (
        SELECT 1 FROM reservation r WHERE r.vehicle_id=v.id
          AND r.status = ANY($3::reservation_status[])
          AND tstzrange(r.starts_at, r.ends_at, '[)') && tstzrange($1::timestamptz, $2::timestamptz, '[)')
          AND ($4::uuid IS NULL OR r.id <> $4::uuid))
      ORDER BY v.code`,
    [startsAt, endsAt, BLOCKING, exceptReservation ?? null],
  );
  return rows as { id: string; code: string; name: string }[];
}
