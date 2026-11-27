// Herramientas de crecimiento: cupones de descuento y reporte anual (rentabilidad y ocupación).
import { z } from 'zod';
import type { Tx } from './db.js';
import { pool } from './db.js';
import { dateSchema } from './common.js';

const TZ = 'America/Merida';
/** Estados que cuentan como renta real (ocupan la unidad o ya se hicieron). */
const RENTED = `('hold','deposit_pending','confirmed','assigned','in_service','completed')`;

// ───────────────────────────── Cupones ─────────────────────────────
export const couponInput = z.object({
  code: z.string().trim().toUpperCase().regex(/^[A-Z0-9-]{3,20}$/, 'El código lleva de 3 a 20 letras, números o guiones'),
  kind: z.enum(['percent', 'amount']),
  value: z.number().int().min(1).max(100_000_000),
  min_days: z.number().int().min(1).max(60).default(1),
  starts_on: dateSchema.nullish().or(z.literal('')).transform(v => v || null),
  ends_on: dateSchema.nullish().or(z.literal('')).transform(v => v || null),
  max_uses: z.number().int().min(1).max(100_000).nullish(),
  on_website: z.boolean().default(true),
  active: z.boolean().default(true),
  note: z.string().trim().max(300).nullish().transform(v => v || null),
}).refine(c => c.kind !== 'percent' || c.value <= 90, { message: 'El porcentaje máximo es 90%', path: ['value'] })
  .refine(c => !c.starts_on || !c.ends_on || c.ends_on >= c.starts_on, { message: 'La fecha final debe ser después de la inicial', path: ['ends_on'] });

export type Coupon = { id: string; code: string; kind: 'percent' | 'amount'; value: number; min_days: number; starts_on: string | null;
  ends_on: string | null; max_uses: number | null; on_website: boolean; active: boolean };

export const couponDiscount = (c: Pick<Coupon, 'kind' | 'value'>, totalCents: number) =>
  Math.max(0, Math.min(totalCents, c.kind === 'percent' ? Math.round((totalCents * c.value) / 100) : c.value));

/**
 * Revisa si un cupón se puede usar hoy para una renta de `days` días y calcula el descuento.
 * La vigencia se mide con la fecha de hoy en Mérida (cuando se aparta), no con la del viaje.
 */
export async function checkCoupon(
  db: Tx | typeof pool, rawCode: string,
  o: { days: number; total_cents: number; channel: 'web' | 'staff'; exceptReservation?: string | null },
): Promise<{ ok: true; coupon: Coupon; discount_cents: number } | { ok: false; message: string }> {
  const code = rawCode.trim().toUpperCase();
  const { rows } = await db.query(
    `SELECT c.*, to_char(c.starts_on,'YYYY-MM-DD') AS starts_on, to_char(c.ends_on,'YYYY-MM-DD') AS ends_on,
            (now() AT TIME ZONE '${TZ}')::date::text AS today,
            (SELECT count(*)::int FROM reservation r WHERE r.coupon_id=c.id AND r.status NOT IN ('cancelled','no_show')
               AND ($2::uuid IS NULL OR r.id <> $2::uuid)) AS uses
       FROM coupon c WHERE c.code=$1`, [code, o.exceptReservation ?? null]);
  const c = rows[0];
  if (!c || !c.active || (o.channel === 'web' && !c.on_website)) return { ok: false, message: 'Ese cupón no existe o ya no está activo' };
  if (c.starts_on && c.today < c.starts_on) return { ok: false, message: 'Ese cupón todavía no está vigente' };
  if (c.ends_on && c.today > c.ends_on) return { ok: false, message: 'Ese cupón ya venció' };
  if (c.max_uses && c.uses >= c.max_uses) return { ok: false, message: 'Ese cupón ya se usó el máximo de veces' };
  if (o.days < c.min_days) return { ok: false, message: `Ese cupón aplica desde ${c.min_days} días de renta` };
  return { ok: true, coupon: c, discount_cents: couponDiscount(c, o.total_cents) };
}

export async function listCoupons() {
  const { rows } = await pool.query(
    `SELECT c.id, c.code, c.kind, c.value, c.min_days, to_char(c.starts_on,'YYYY-MM-DD') AS starts_on,
            to_char(c.ends_on,'YYYY-MM-DD') AS ends_on, c.max_uses, c.on_website, c.active, c.note,
            COALESCE(u.uses,0)::int AS uses, COALESCE(u.discount,0)::bigint AS discount_cents
       FROM coupon c
       LEFT JOIN LATERAL (SELECT count(*) AS uses, SUM(r.discount_cents) AS discount FROM reservation r
                           WHERE r.coupon_id=c.id AND r.status NOT IN ('cancelled','no_show')) u ON true
      ORDER BY c.active DESC, c.created_at DESC`);
  return rows;
}

// ───────────────────────── Clientes bloqueados ─────────────────────────
/** Otros clientes bloqueados con la misma INE/pasaporte o licencia (alguien que regresa con otro teléfono). */
export async function blockedMatches(c: { id?: string | null; id_document?: string | null; license_number?: string | null }) {
  if (!c.id_document && !c.license_number) return [];
  const { rows } = await pool.query(
    `SELECT id, full_name, phone, blocked_reason FROM client
      WHERE blocked AND ($1::uuid IS NULL OR id <> $1::uuid)
        AND ((upper($2) IS NOT NULL AND upper(id_document) = upper($2)) OR (upper($3) IS NOT NULL AND upper(license_number) = upper($3)))
      LIMIT 5`,
    [c.id ?? null, c.id_document || null, c.license_number || null]);
  return rows;
}

// ───────────────────────────── Reporte anual ─────────────────────────────
/**
 * Rentabilidad y ocupación de un año: por unidad, por mes y por día de la semana.
 * Para el año en curso, la ocupación se mide hasta hoy (no contra días que aún no pasan).
 */
export async function yearReport(year: number) {
  const from = `${year}-01-01`, to = `${year + 1}-01-01`;
  const start = `('${from}'::timestamp AT TIME ZONE '${TZ}')`;
  const end = `('${to}'::timestamp AT TIME ZONE '${TZ}')`;
  const [daysRow, vehicles, months, weekdays, sources, outcomes, clients, coupons] = await Promise.all([
    pool.query(`SELECT GREATEST(0, LEAST('${to}'::date, (now() AT TIME ZONE '${TZ}')::date + 1) - '${from}'::date)::int AS elapsed,
                       ('${to}'::date - '${from}'::date)::int AS total`),
    pool.query(
      `SELECT v.id, v.code, v.name, v.vehicle_type, v.active, v.odometer_km,
         COALESCE((SELECT SUM(CASE WHEN p.kind='refund' THEN -p.amount_cents ELSE p.amount_cents END)
            FROM payment p JOIN reservation r ON r.id=p.reservation_id
           WHERE r.vehicle_id=v.id AND p.paid_at >= ${start} AND p.paid_at < ${end}),0)::bigint AS income_cents,
         COALESCE((SELECT SUM(e.amount_cents) FROM expense e WHERE e.vehicle_id=v.id AND e.spent_on >= '${from}' AND e.spent_on < '${to}'),0)::bigint AS expense_cents,
         COALESCE((SELECT SUM(EXTRACT(epoch FROM (LEAST(r.ends_at, ${end}) - GREATEST(r.starts_at, ${start}))) / 86400)
            FROM reservation r WHERE r.vehicle_id=v.id AND r.status IN ${RENTED}
             AND r.starts_at < ${end} AND r.ends_at > ${start}),0)::float AS rented_days,
         (SELECT count(*)::int FROM reservation r WHERE r.vehicle_id=v.id AND r.status IN ${RENTED}
             AND r.starts_at >= ${start} AND r.starts_at < ${end}) AS rentals,
         COALESCE((SELECT SUM(r.km_in - r.km_out) FROM reservation r WHERE r.vehicle_id=v.id
             AND r.km_in IS NOT NULL AND r.km_out IS NOT NULL AND r.km_in >= r.km_out
             AND r.starts_at >= ${start} AND r.starts_at < ${end}),0)::int AS km
       FROM vehicle v
      WHERE v.active OR EXISTS (SELECT 1 FROM reservation r WHERE r.vehicle_id=v.id AND r.starts_at >= ${start} AND r.starts_at < ${end})
      ORDER BY v.code`),
    pool.query(
      `SELECT to_char(m, 'YYYY-MM') AS month,
         EXTRACT(day FROM (m + interval '1 month' - interval '1 day'))::int AS days,
         COALESCE((SELECT SUM(CASE WHEN kind='refund' THEN -amount_cents ELSE amount_cents END) FROM payment
            WHERE paid_at >= (m::timestamp AT TIME ZONE '${TZ}') AND paid_at < ((m + interval '1 month')::timestamp AT TIME ZONE '${TZ}')),0)::bigint AS income_cents,
         COALESCE((SELECT SUM(amount_cents) FROM expense WHERE spent_on >= m::date AND spent_on < (m + interval '1 month')::date),0)::bigint AS expense_cents,
         COALESCE((SELECT SUM(EXTRACT(epoch FROM (LEAST(r.ends_at, (m + interval '1 month')::timestamp AT TIME ZONE '${TZ}')
                                  - GREATEST(r.starts_at, m::timestamp AT TIME ZONE '${TZ}'))) / 86400)
            FROM reservation r WHERE r.vehicle_id IS NOT NULL AND r.status IN ${RENTED}
             AND r.starts_at < ((m + interval '1 month')::timestamp AT TIME ZONE '${TZ}') AND r.ends_at > (m::timestamp AT TIME ZONE '${TZ}')),0)::float AS rented_days,
         (SELECT count(*)::int FROM reservation r WHERE r.status IN ${RENTED}
             AND r.starts_at >= (m::timestamp AT TIME ZONE '${TZ}') AND r.starts_at < ((m + interval '1 month')::timestamp AT TIME ZONE '${TZ}')) AS rentals
       FROM generate_series('${from}'::date, '${year}-12-01'::date, interval '1 month') m ORDER BY m`),
    pool.query(
      `SELECT EXTRACT(isodow FROM r.starts_at AT TIME ZONE '${TZ}')::int AS dow, count(*)::int AS rentals,
              AVG(EXTRACT(epoch FROM (r.ends_at - r.starts_at)) / 86400)::float AS avg_days
         FROM reservation r WHERE r.status IN ${RENTED} AND r.starts_at >= ${start} AND r.starts_at < ${end}
        GROUP BY 1 ORDER BY 1`),
    pool.query(
      `SELECT r.source, count(*)::int AS rentals, COALESCE(SUM(r.quote_cents),0)::bigint AS billed_cents
         FROM reservation r WHERE r.status IN ${RENTED} AND r.starts_at >= ${start} AND r.starts_at < ${end}
        GROUP BY 1 ORDER BY 2 DESC`),
    pool.query(
      `SELECT count(*) FILTER (WHERE status IN ${RENTED})::int AS rented,
              count(*) FILTER (WHERE status='cancelled')::int AS cancelled,
              count(*) FILTER (WHERE status='no_show')::int AS no_show,
              AVG(EXTRACT(epoch FROM (ends_at - starts_at)) / 86400) FILTER (WHERE status IN ${RENTED})::float AS avg_days,
              AVG(EXTRACT(epoch FROM (starts_at - created_at)) / 86400) FILTER (WHERE status IN ${RENTED} AND starts_at > created_at)::float AS lead_days
         FROM reservation WHERE starts_at >= ${start} AND starts_at < ${end}`),
    pool.query(
      `SELECT c.id, c.full_name, count(*)::int AS rentals, COALESCE(SUM(r.quote_cents),0)::bigint AS billed_cents
         FROM reservation r JOIN client c ON c.id=r.client_id
        WHERE r.status IN ${RENTED} AND r.starts_at >= ${start} AND r.starts_at < ${end}
        GROUP BY c.id ORDER BY billed_cents DESC LIMIT 5`),
    pool.query(
      `SELECT c.code, count(*)::int AS uses, COALESCE(SUM(r.discount_cents),0)::bigint AS discount_cents,
              COALESCE(SUM(r.quote_cents),0)::bigint AS billed_cents
         FROM reservation r JOIN coupon c ON c.id=r.coupon_id
        WHERE r.status IN ${RENTED} AND r.starts_at >= ${start} AND r.starts_at < ${end}
        GROUP BY c.code ORDER BY uses DESC`),
  ]);
  const { elapsed, total } = daysRow.rows[0];
  const basis = elapsed || total; // año futuro: contra el año completo
  const per = vehicles.rows.map(v => {
    const income = Number(v.income_cents), expense = Number(v.expense_cents);
    return {
      ...v, income_cents: income, expense_cents: expense, profit_cents: income - expense,
      occupancy: basis ? Math.min(1, v.rented_days / basis) : 0,
      income_per_day_cents: v.rented_days >= 1 ? Math.round(income / v.rented_days) : null,
      cost_per_km_cents: v.km > 0 ? Math.round(expense / v.km) : null,
      margin: income > 0 ? (income - expense) / income : null,
    };
  });
  const fleetSize = vehicles.rows.filter(v => v.active).length || vehicles.rows.length;
  const general = await pool.query(`SELECT COALESCE(SUM(amount_cents),0)::bigint AS cents FROM expense WHERE vehicle_id IS NULL AND spent_on >= '${from}' AND spent_on < '${to}'`);
  return {
    year, days_elapsed: elapsed, days_total: total,
    vehicles: per,
    general_expense_cents: Number(general.rows[0].cents),
    months: months.rows.map(m => ({ ...m, occupancy: fleetSize ? Math.min(1, m.rented_days / (fleetSize * m.days)) : 0 })),
    weekdays: weekdays.rows,
    sources: sources.rows,
    outcomes: outcomes.rows[0],
    top_clients: clients.rows,
    coupons: coupons.rows,
  };
}
