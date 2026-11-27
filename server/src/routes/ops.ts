import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { hashPassword, passwordRule, requireAdmin, requireStaff } from '../auth.js';
import { dateSchema, freeVehicles, isoDateTime, logEvent, phoneSchema, upsertClient } from '../common.js';
import { buildContract } from '../contract.js';
import { getSetting, pool, tx } from '../db.js';
import { env } from '../env.js';
import { billableDays, quote, seasonalQuote, type Pricing } from '../pricing.js';
import { fxManualSchema, getFx, setManualRate } from '../fx.js';
import { chargeInput, extrasSchema, getExtras, getSeasons, insertCharges, VEHICLE_COLUMNS, vehicleAlerts } from '../operations.js';
import { notifyStaff, pushEnabled } from '../push.js';
import { blockedMatches, checkCoupon, couponInput, listCoupons, yearReport } from '../growth.js';

const TZ = 'America/Merida';
const STATUSES = ['new', 'quoted', 'hold', 'deposit_pending', 'confirmed', 'assigned', 'in_service', 'completed', 'cancelled', 'no_show'] as const;
const DEFAULT_PRICING: Pricing = { daily_cents: 0, weekly_cents: 0, deposit_cents: 0 };
const cents = z.number().int().min(0).max(100_000_000);
const optText = (max: number) => z.string().trim().max(max).nullish().transform(v => v || null);
const uuid = z.string().uuid();

const RESERVATION_SELECT = `
  SELECT r.*, v.name AS vehicle_name, v.code AS vehicle_code, v.plate AS vehicle_plate,
         COALESCE(p.paid, 0) AS paid_cents,
         COALESCE(ch.total, 0) AS charges_cents,
         COALESCE(r.quote_cents, 0) + COALESCE(ch.total, 0) - COALESCE(p.paid, 0) AS balance_cents,
         sg.signed_name, sg.signed_at, cp.code AS coupon_code
    FROM reservation r
    LEFT JOIN vehicle v ON v.id = r.vehicle_id
    LEFT JOIN coupon cp ON cp.id = r.coupon_id
    LEFT JOIN reservation_signature sg ON sg.reservation_id = r.id
    LEFT JOIN LATERAL (
      SELECT SUM(CASE WHEN kind = 'refund' THEN -amount_cents ELSE amount_cents END) AS paid
        FROM payment WHERE reservation_id = r.id) p ON true
    LEFT JOIN LATERAL (SELECT SUM(amount_cents)::bigint AS total FROM charge WHERE reservation_id = r.id) ch ON true`;

const clientInput = z.object({
  full_name: z.string().trim().min(3).max(150),
  phone: phoneSchema,
  email: z.string().trim().email().nullish().or(z.literal('')).transform(v => v || null),
  id_document: optText(60),
  license_number: optText(60),
  license_expires: dateSchema.nullish().or(z.literal('')).transform(v => v || null),
  address: optText(300),
});

const reservationInput = z.object({
  client: clientInput,
  vehicle_id: uuid.nullable(),
  starts_at: isoDateTime,
  ends_at: isoDateTime,
  status: z.enum(STATUSES).default('confirmed'),
  pickup: optText(300),
  destination: optText(300),
  notes: optText(2000),
  daily_rate_cents: cents.optional(),
  weekly_rate_cents: cents.optional(),
  discount_cents: cents.default(0),
  quote_cents: cents.nullish(),        // total acordado manualmente (si se omite se calcula)
  guarantee_cents: cents.optional(),
  // auto = tarifas y temporadas vigentes · rates = tarifa personalizada · manual = total acordado
  price_mode: z.enum(['auto', 'rates', 'manual']).optional(),
  coupon_code: z.string().trim().max(20).nullish().transform(v => v ? v.toUpperCase() : null),
});

type ReservationInput = z.infer<typeof reservationInput>;

function computeTotal(i: { starts_at: string; ends_at: string; daily_rate_cents: number; weekly_rate_cents: number; discount_cents: number }) {
  const days = billableDays(new Date(i.starts_at), new Date(i.ends_at));
  const q = quote(days, { daily_cents: i.daily_rate_cents, weekly_cents: i.weekly_rate_cents });
  return { ...q, total_cents: Math.max(0, q.total_cents - i.discount_cents) };
}

function conflict(error: any) {
  if (error?.code === '23P01') return 'Esa unidad ya está rentada o apartada en parte de esas fechas';
  if (error?.code === '23514') return 'Revisa las fechas: la devolución debe ser después de la entrega';
  return null;
}

/** Precio de una renta según su modo: temporadas (auto), tarifa fija (rates) o total acordado (manual). */
async function priceFor(i: { starts_at: string; ends_at: string; discount_cents: number; daily_rate_cents?: number; weekly_rate_cents?: number; quote_cents?: number | null; price_mode?: string; vehicle_id?: string | null }) {
  const mode = i.price_mode ?? (i.quote_cents != null ? 'manual' : i.daily_rate_cents != null ? 'rates' : 'auto');
  let pricing = await getSetting('pricing', DEFAULT_PRICING);
  // Una unidad con tarifa propia (otro tipo de vehículo) cobra esa tarifa, sin temporadas.
  const own = i.vehicle_id
    ? (await pool.query('SELECT daily_rate_cents, weekly_rate_cents FROM vehicle WHERE id=$1', [i.vehicle_id])).rows[0]
    : null;
  if (own?.daily_rate_cents != null) {
    pricing = { ...pricing, daily_cents: own.daily_rate_cents, weekly_cents: own.weekly_rate_cents ?? own.daily_rate_cents * 7 };
    if (mode === 'auto') {
      const q = computeTotal({ ...i, daily_rate_cents: pricing.daily_cents, weekly_rate_cents: pricing.weekly_cents });
      return { mode, ...q, seasons: [] as string[], daily_cents: pricing.daily_cents, weekly_cents: pricing.weekly_cents };
    }
  }
  if (mode === 'auto') {
    const q = seasonalQuote(new Date(i.starts_at), new Date(i.ends_at), pricing, await getSeasons());
    return { mode, ...q, total_cents: Math.max(0, q.total_cents - i.discount_cents) };
  }
  const daily = i.daily_rate_cents ?? pricing.daily_cents, weekly = i.weekly_rate_cents ?? pricing.weekly_cents;
  const q = computeTotal({ ...i, daily_rate_cents: daily, weekly_rate_cents: weekly });
  return { mode, ...q, seasons: [] as string[], daily_cents: daily, weekly_cents: weekly,
    total_cents: mode === 'manual' && i.quote_cents != null ? i.quote_cents : q.total_cents };
}

class HttpError extends Error { constructor(public status: number, message: string) { super(message); } }

async function loadReservation(id: string) {
  const { rows } = await pool.query(`${RESERVATION_SELECT} WHERE r.id = $1`, [id]);
  return rows[0];
}

export async function opsRoutes(app: FastifyInstance) {
  // Todo lo que está bajo /v1/ops requiere sesión de personal.
  app.addHook('onRequest', async (req, reply) => {
    if (req.url.startsWith('/v1/ops/')) await requireStaff(req, reply);
  });

  // ───────────────────────── Catálogo y cotizador ─────────────────────────
  app.get('/v1/ops/bootstrap', async req => {
    const [vehicles, pricing, business, seasons, extras] = await Promise.all([
      pool.query(`SELECT ${VEHICLE_COLUMNS} FROM vehicle ORDER BY code`),
      getSetting('pricing', DEFAULT_PRICING),
      getSetting('business', {}),
      getSeasons(),
      getExtras(),
    ]);
    const fx = await getFx();
    return {
      user: { id: req.staff!.id, name: req.staff!.full_name, email: req.staff!.email, role: req.staff!.role },
      vehicles: vehicles.rows.map(v => ({ ...v, alerts: vehicleAlerts(v) })), pricing, business, seasons, extras, fx,
      push: { enabled: pushEnabled, publicKey: env.VAPID_PUBLIC_KEY ?? null },
    };
  });

  app.get('/v1/ops/quote', async req => {
    const q = z.object({
      starts_at: isoDateTime, ends_at: isoDateTime, exclude: uuid.optional(), vehicle_id: uuid.optional(),
      daily_rate_cents: z.coerce.number().int().min(0).optional(),
      weekly_rate_cents: z.coerce.number().int().min(0).optional(),
      discount_cents: z.coerce.number().int().min(0).default(0),
    }).parse(req.query);
    const total = await priceFor({
      starts_at: q.starts_at, ends_at: q.ends_at, discount_cents: q.discount_cents,
      daily_rate_cents: q.daily_rate_cents, weekly_rate_cents: q.weekly_rate_cents, vehicle_id: q.vehicle_id,
    });
    const free = new Date(q.ends_at) > new Date(q.starts_at) ? await freeVehicles(pool, q.starts_at, q.ends_at, q.exclude) : [];
    return { ...total, free_vehicle_ids: free.map(v => v.id) };
  });

  // ───────────────────────────── Resumen ─────────────────────────────
  app.get('/v1/ops/dashboard', async req => {
    const q = z.object({ month: z.string().regex(/^\d{4}-\d{2}$/).optional() }).parse(req.query);
    const month = q.month ?? new Date().toLocaleDateString('en-CA', { timeZone: TZ }).slice(0, 7);
    const range = `(($1 || '-01')::timestamp AT TIME ZONE '${TZ}')`;
    const rangeEnd = `((($1 || '-01')::date + interval '1 month')::timestamp AT TIME ZONE '${TZ}')`;

    const [money, perVehicle, fleet, agenda, series, pending, outstanding, byCategory] = await Promise.all([
      pool.query(
        `SELECT
           (SELECT COALESCE(SUM(CASE WHEN kind='refund' THEN -amount_cents ELSE amount_cents END),0)
              FROM payment WHERE paid_at >= ${range} AND paid_at < ${rangeEnd}) AS income_cents,
           (SELECT COALESCE(SUM(amount_cents),0) FROM expense
              WHERE spent_on >= ($1 || '-01')::date AND spent_on < ($1 || '-01')::date + interval '1 month') AS expense_cents,
           (SELECT COALESCE(SUM(quote_cents),0) FROM reservation
              WHERE status IN ('confirmed','assigned','hold','deposit_pending','in_service','completed')
                AND starts_at >= ${range} AND starts_at < ${rangeEnd}) AS billed_cents,
           (SELECT count(*)::int FROM reservation
              WHERE status IN ('confirmed','assigned','hold','deposit_pending','in_service','completed')
                AND starts_at >= ${range} AND starts_at < ${rangeEnd}) AS rentals,
           EXTRACT(day FROM (($1 || '-01')::date + interval '1 month' - interval '1 day'))::int AS days_in_month`,
        [month],
      ),
      pool.query(
        `SELECT v.id, v.name, v.code,
           COALESCE((SELECT SUM(CASE WHEN p.kind='refund' THEN -p.amount_cents ELSE p.amount_cents END)
              FROM payment p JOIN reservation r ON r.id=p.reservation_id
             WHERE r.vehicle_id=v.id AND p.paid_at >= ${range} AND p.paid_at < ${rangeEnd}),0) AS income_cents,
           COALESCE((SELECT SUM(e.amount_cents) FROM expense e WHERE e.vehicle_id=v.id
              AND e.spent_on >= ($1 || '-01')::date AND e.spent_on < ($1 || '-01')::date + interval '1 month'),0) AS expense_cents,
           COALESCE((SELECT SUM(EXTRACT(epoch FROM (LEAST(r.ends_at, ${rangeEnd}) - GREATEST(r.starts_at, ${range}))) / 86400)
              FROM reservation r WHERE r.vehicle_id=v.id
               AND r.status IN ('confirmed','assigned','hold','deposit_pending','in_service','completed')
               AND r.starts_at < ${rangeEnd} AND r.ends_at > ${range}),0)::float AS rented_days
         FROM vehicle v WHERE v.active ORDER BY v.code`,
        [month],
      ),
      pool.query(
        `SELECT v.id, v.name, v.code, v.plate,
           cur.id AS current_id, cur.folio AS current_folio, cur.client_name AS current_client, cur.client_phone AS current_phone,
           cur.status AS current_status, cur.starts_at AS current_starts, cur.ends_at AS current_ends,
           nxt.id AS next_id, nxt.folio AS next_folio, nxt.client_name AS next_client, nxt.starts_at AS next_starts
         FROM vehicle v
         LEFT JOIN LATERAL (SELECT * FROM reservation r WHERE r.vehicle_id=v.id
             AND (r.status='in_service' OR (r.status IN ('confirmed','assigned','hold','deposit_pending') AND r.starts_at <= now() AND r.ends_at > now()))
             ORDER BY (r.status='in_service') DESC, r.starts_at LIMIT 1) cur ON true
         LEFT JOIN LATERAL (SELECT * FROM reservation r WHERE r.vehicle_id=v.id
             AND r.status IN ('confirmed','assigned','hold','deposit_pending') AND r.starts_at > now()
             ORDER BY r.starts_at LIMIT 1) nxt ON true
         WHERE v.active ORDER BY v.code`,
      ),
      pool.query(
        `SELECT 'pickup' AS kind, r.id, r.folio, r.client_name, r.client_phone, r.starts_at AS at, v.name AS vehicle_name, r.status
           FROM reservation r LEFT JOIN vehicle v ON v.id=r.vehicle_id
          WHERE r.status IN ('new','confirmed','assigned','hold','deposit_pending')
            AND r.starts_at >= (current_date::timestamp AT TIME ZONE '${TZ}') - interval '1 day'
            AND r.starts_at < ((current_date + 3)::timestamp AT TIME ZONE '${TZ}')
         UNION ALL
         SELECT 'return', r.id, r.folio, r.client_name, r.client_phone, r.ends_at, v.name, r.status
           FROM reservation r LEFT JOIN vehicle v ON v.id=r.vehicle_id
          WHERE r.status IN ('in_service','confirmed','assigned')
            AND r.ends_at < ((current_date + 3)::timestamp AT TIME ZONE '${TZ}')
         ORDER BY at LIMIT 30`,
      ),
      pool.query(
        `SELECT to_char(m, 'YYYY-MM') AS month,
           COALESCE((SELECT SUM(CASE WHEN kind='refund' THEN -amount_cents ELSE amount_cents END) FROM payment
              WHERE paid_at >= (m::timestamp AT TIME ZONE '${TZ}') AND paid_at < ((m + interval '1 month')::timestamp AT TIME ZONE '${TZ}')),0) AS income_cents,
           COALESCE((SELECT SUM(amount_cents) FROM expense WHERE spent_on >= m::date AND spent_on < (m + interval '1 month')::date),0) AS expense_cents
         FROM generate_series(($1 || '-01')::date - interval '5 months', ($1 || '-01')::date, interval '1 month') m
         ORDER BY m`,
        [month],
      ),
      pool.query(`SELECT count(*)::int AS total FROM reservation WHERE status IN ('new','quoted','hold')`),
      pool.query(
        `SELECT COALESCE(SUM(GREATEST(balance, 0)),0)::bigint AS total FROM (
           SELECT COALESCE(r.quote_cents,0) + COALESCE((SELECT SUM(amount_cents) FROM charge WHERE reservation_id=r.id),0)
                  - COALESCE((SELECT SUM(CASE WHEN kind='refund' THEN -amount_cents ELSE amount_cents END) FROM payment WHERE reservation_id=r.id),0) AS balance
             FROM reservation r WHERE r.status IN ('confirmed','assigned','hold','deposit_pending','in_service','completed')) x`,
      ),
      pool.query(
        `SELECT category, SUM(amount_cents)::bigint AS amount_cents FROM expense
          WHERE spent_on >= ($1 || '-01')::date AND spent_on < ($1 || '-01')::date + interval '1 month'
          GROUP BY category ORDER BY 2 DESC`,
        [month],
      ),
    ]);
    const m = money.rows[0];
    const maint = await pool.query(`SELECT ${VEHICLE_COLUMNS} FROM vehicle WHERE active`);
    const alertsById = new Map(maint.rows.map(v => [v.id, vehicleAlerts(v)]));
    const fleetDays = perVehicle.rows.length * m.days_in_month;
    const rentedDays = perVehicle.rows.reduce((s, v) => s + Number(v.rented_days), 0);
    return {
      month,
      income_cents: m.income_cents,
      expense_cents: m.expense_cents,
      profit_cents: m.income_cents - m.expense_cents,
      billed_cents: m.billed_cents,
      rentals: m.rentals,
      days_in_month: m.days_in_month,
      expense_by_category: byCategory.rows,
      occupancy: fleetDays ? Math.min(1, rentedDays / fleetDays) : 0,
      outstanding_cents: outstanding.rows[0].total,
      pending_requests: pending.rows[0].total,
      per_vehicle: perVehicle.rows,
      fleet: fleet.rows.map(v => ({ ...v, alerts: alertsById.get(v.id) ?? [] })),
      agenda: agenda.rows,
      series: series.rows,
    };
  });

  // ───────────────────────────── Reservas ─────────────────────────────
  app.get('/v1/ops/reservations', async req => {
    const q = z.object({
      from: dateSchema.optional(), to: dateSchema.optional(),
      status: z.string().optional(), // lista separada por coma
      vehicle_id: uuid.optional(), q: z.string().trim().max(100).optional(),
      limit: z.coerce.number().int().min(1).max(500).default(200),
    }).parse(req.query);
    const statuses = q.status ? q.status.split(',').filter(s => (STATUSES as readonly string[]).includes(s)) : null;
    const { rows } = await pool.query(
      `${RESERVATION_SELECT}
       WHERE ($1::date IS NULL OR r.ends_at >= ($1::date::timestamp AT TIME ZONE '${TZ}'))
         AND ($2::date IS NULL OR r.starts_at < (($2::date + 1)::timestamp AT TIME ZONE '${TZ}'))
         AND ($3::reservation_status[] IS NULL OR r.status = ANY($3::reservation_status[]))
         AND ($4::uuid IS NULL OR r.vehicle_id = $4)
         AND ($5::text IS NULL OR r.client_name ILIKE '%' || $5 || '%' OR r.client_phone LIKE '%' || $5 || '%' OR r.folio ILIKE '%' || $5 || '%')
       ORDER BY r.starts_at DESC LIMIT $6`,
      [q.from ?? null, q.to ?? null, statuses, q.vehicle_id ?? null, q.q || null, q.limit],
    );
    return { data: rows };
  });

  app.get('/v1/ops/reservations/:id', async (req: any, reply) => {
    const id = uuid.parse(req.params.id);
    const reservation = await loadReservation(id);
    if (!reservation) return reply.code(404).send({ error: { message: 'Reserva no encontrada' } });
    const [payments, events, client, charges, photos] = await Promise.all([
      pool.query(`SELECT p.*, s.full_name AS created_by_name FROM payment p LEFT JOIN staff_user s ON s.id=p.created_by
                   WHERE p.reservation_id=$1 ORDER BY p.paid_at`, [id]),
      pool.query(`SELECT e.event, e.detail, e.occurred_at, COALESCE(s.full_name,'Sitio web') AS actor
                    FROM reservation_event e LEFT JOIN staff_user s ON s.id=e.actor_id
                   WHERE e.reservation_id=$1 ORDER BY e.occurred_at DESC LIMIT 50`, [id]),
      reservation.client_id ? pool.query('SELECT * FROM client WHERE id=$1', [reservation.client_id]) : Promise.resolve({ rows: [] }),
      pool.query('SELECT id, kind, description, amount_cents, created_at FROM charge WHERE reservation_id=$1 ORDER BY created_at', [id]),
      pool.query('SELECT id, stage, slot, created_at FROM inspection_photo WHERE reservation_id=$1 ORDER BY created_at', [id]),
    ]);
    const c = client.rows[0] ?? null;
    return { reservation, payments: payments.rows, events: events.rows, client: c, charges: charges.rows, photos: photos.rows,
      blocked_matches: c ? await blockedMatches(c) : [] };
  });

  async function saveReservation(staffId: string, input: ReservationInput, id?: string) {
    const pricing = await getSetting('pricing', DEFAULT_PRICING);
    let couponId: string | null = null;
    if (input.coupon_code) {
      // El cupón sustituye al descuento manual y no aplica a un total acordado a mano.
      if (input.price_mode === 'manual') throw new HttpError(422, 'El cupón no aplica cuando el total es acordado a mano');
      const base = await priceFor({ ...input, discount_cents: 0 });
      const c = await checkCoupon(pool, input.coupon_code, { days: base.days, total_cents: base.total_cents, channel: 'staff', exceptReservation: id });
      if (!c.ok) throw new HttpError(422, c.message);
      couponId = c.coupon.id;
      input = { ...input, discount_cents: c.discount_cents };
    }
    const price = await priceFor(input);
    const daily = price.daily_cents, weekly = price.weekly_cents;
    const total = price.total_cents;
    return tx(async db => {
      const client = await upsertClient(db, input.client, true);
      const values = [
        input.status, input.starts_at, input.ends_at, input.pickup ?? 'Oficina', input.destination, input.client.full_name,
        input.client.phone, input.client.email, input.notes, client.id, input.vehicle_id, daily, weekly,
        input.discount_cents, total, input.guarantee_cents ?? pricing.deposit_cents, staffId, price.mode, couponId,
      ];
      if (id) {
        const { rows } = await db.query(
          `UPDATE reservation SET status=$1, starts_at=$2, ends_at=$3, pickup=$4, destination=$5, client_name=$6,
             client_phone=$7, client_email=$8, notes=$9, client_id=$10, vehicle_id=$11, daily_rate_cents=$12,
             weekly_rate_cents=$13, discount_cents=$14, quote_cents=$15, guarantee_cents=$16, updated_by=$17, updated_at=now(),
             price_mode=$18, coupon_id=$19, hold_until = CASE WHEN $1::reservation_status = 'hold' THEN hold_until ELSE NULL END
           WHERE id=$20 RETURNING id`, [...values, id]);
        if (!rows[0]) return null;
        await logEvent(db, id, staffId, 'updated', { status: input.status, total_cents: total });
        return id;
      }
      const { rows } = await db.query(
        `INSERT INTO reservation (status, starts_at, ends_at, pickup, destination, client_name, client_phone, client_email,
            notes, client_id, vehicle_id, daily_rate_cents, weekly_rate_cents, discount_cents, quote_cents, guarantee_cents,
            created_by, updated_by, service, passengers, source, price_mode, coupon_id)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$17,'rental',1,'staff',$18,$19) RETURNING id`, values);
      await logEvent(db, rows[0].id, staffId, 'created', { status: input.status, total_cents: total });
      return rows[0].id as string;
    });
  }

  app.post('/v1/ops/reservations', async (req, reply) => {
    const input = reservationInput.parse(req.body);
    try {
      const id = await saveReservation(req.staff!.id, input);
      return reply.code(201).send({ reservation: await loadReservation(id!) });
    } catch (error) {
      if (error instanceof HttpError) return reply.code(error.status).send({ error: { message: error.message } });
      const msg = conflict(error); if (msg) return reply.code(409).send({ error: { message: msg } });
      throw error;
    }
  });

  app.put('/v1/ops/reservations/:id', async (req: any, reply) => {
    const id = uuid.parse(req.params.id);
    const input = reservationInput.parse(req.body);
    try {
      const saved = await saveReservation(req.staff!.id, input, id);
      if (!saved) return reply.code(404).send({ error: { message: 'Reserva no encontrada' } });
      return { reservation: await loadReservation(id) };
    } catch (error) {
      if (error instanceof HttpError) return reply.code(error.status).send({ error: { message: error.message } });
      const msg = conflict(error); if (msg) return reply.code(409).send({ error: { message: msg } });
      throw error;
    }
  });

  /** Cambios de estado rápidos: confirmar, entregar, recibir, cancelar. */
  app.post('/v1/ops/reservations/:id/status', async (req: any, reply) => {
    const id = uuid.parse(req.params.id);
    const b = z.object({
      status: z.enum(STATUSES),
      vehicle_id: uuid.optional(),
      km: z.number().int().min(0).max(2_000_000).optional(),
      fuel: z.string().trim().max(20).optional(),
      guarantee_returned: z.boolean().optional(),
      hold_hours: z.number().int().min(1).max(168).optional(),   // apartar / extender el apartado
      checklist: z.object({
        items: z.record(z.string().max(30), z.boolean()).optional(),
        damages: z.string().trim().max(1000).optional(),
      }).optional(),
      charges: z.array(chargeInput).max(10).optional(),
    }).parse(req.body);
    try {
      const updated = await tx(async db => {
        const { rows } = await db.query('SELECT id, vehicle_id FROM reservation WHERE id=$1 FOR UPDATE', [id]);
        if (!rows[0]) return null;
        const vehicleId = b.vehicle_id ?? rows[0].vehicle_id;
        if (['confirmed', 'in_service'].includes(b.status) && !vehicleId) throw Object.assign(new Error('Asigna una unidad antes de confirmar'), { statusCode: 422 });
        await db.query(
          `UPDATE reservation SET status=$2, vehicle_id=$3, updated_by=$4, updated_at=now(),
             delivered_at = CASE WHEN $8='in_service' THEN COALESCE(delivered_at, now()) ELSE delivered_at END,
             km_out = CASE WHEN $8='in_service' THEN COALESCE($5, km_out) ELSE km_out END,
             fuel_out = CASE WHEN $8='in_service' THEN COALESCE($6, fuel_out) ELSE fuel_out END,
             returned_at = CASE WHEN $8='completed' THEN COALESCE(returned_at, now()) ELSE returned_at END,
             km_in = CASE WHEN $8='completed' THEN COALESCE($5, km_in) ELSE km_in END,
             fuel_in = CASE WHEN $8='completed' THEN COALESCE($6, fuel_in) ELSE fuel_in END,
             guarantee_returned = COALESCE($7, guarantee_returned),
             hold_until = CASE WHEN $8='hold' THEN COALESCE(now() + make_interval(hours => $9::int), hold_until) ELSE NULL END,
             checklist_out = CASE WHEN $8='in_service' THEN COALESCE($10::jsonb, checklist_out) ELSE checklist_out END,
             checklist_in = CASE WHEN $8='completed' THEN COALESCE($10::jsonb, checklist_in) ELSE checklist_in END
           WHERE id=$1`,
          [id, b.status, vehicleId, req.staff!.id, b.km ?? null, b.fuel ?? null, b.guarantee_returned ?? null, String(b.status),
            b.hold_hours ?? null, b.checklist ? JSON.stringify(b.checklist) : null],
        );
        if (b.charges?.length) await insertCharges(db, id, req.staff!.id, b.charges);
        if (b.km !== undefined && vehicleId) {
          await db.query('UPDATE vehicle SET odometer_km = GREATEST(COALESCE(odometer_km,0), $2) WHERE id=$1', [vehicleId, b.km]);
        }
        await logEvent(db, id, req.staff!.id, `status:${b.status}`, { km: b.km, fuel: b.fuel, hold_hours: b.hold_hours });
        return true;
      });
      if (!updated) return reply.code(404).send({ error: { message: 'Reserva no encontrada' } });
      return { reservation: await loadReservation(id) };
    } catch (error: any) {
      if (error instanceof HttpError) return reply.code(error.status).send({ error: { message: error.message } });
      const msg = conflict(error); if (msg) return reply.code(409).send({ error: { message: msg } });
      throw error;
    }
  });

  app.delete('/v1/ops/reservations/:id', { preHandler: requireAdmin }, async (req: any, reply) => {
    const id = uuid.parse(req.params.id);
    const { rowCount } = await pool.query('DELETE FROM reservation WHERE id=$1', [id]);
    if (!rowCount) return reply.code(404).send({ error: { message: 'Reserva no encontrada' } });
    return { ok: true };
  });

  app.get('/v1/ops/reservations/:id/contract.pdf', async (req: any, reply) => {
    const id = uuid.parse(req.params.id);
    const reservation = await loadReservation(id);
    if (!reservation) return reply.code(404).send({ error: { message: 'Reserva no encontrada' } });
    const [client, payments, business, charges, signature] = await Promise.all([
      reservation.client_id ? pool.query('SELECT * FROM client WHERE id=$1', [reservation.client_id]) : Promise.resolve({ rows: [] }),
      pool.query('SELECT * FROM payment WHERE reservation_id=$1 ORDER BY paid_at', [id]),
      getSetting('business', { name: 'Turi Express MX', phone: '', city: 'Mérida, Yucatán', legal_name: '', address: '' }),
      pool.query('SELECT kind, description, amount_cents FROM charge WHERE reservation_id=$1 ORDER BY created_at', [id]),
      pool.query('SELECT png, signed_name, signed_at FROM reservation_signature WHERE reservation_id=$1', [id]),
    ]);
    const pdf = await buildContract({ reservation, client: client.rows[0] ?? null, payments: payments.rows, business,
      charges: charges.rows, signature: signature.rows[0] ?? null });
    return reply
      .type('application/pdf')
      .header('content-disposition', `inline; filename="contrato-${reservation.folio}.pdf"`)
      .header('cache-control', 'private, no-store')
      .send(pdf);
  });

  // ───────────────────────────── Pagos ─────────────────────────────
  app.post('/v1/ops/reservations/:id/payments', async (req: any, reply) => {
    const id = uuid.parse(req.params.id);
    const b = z.object({
      kind: z.enum(['deposit', 'payment', 'refund']),
      method: z.enum(['cash', 'transfer', 'card', 'other']),
      amount_cents: z.number().int().min(1).max(100_000_000),
      paid_at: isoDateTime.optional(),
      note: optText(300),
    }).parse(req.body);
    const exists = await pool.query('SELECT 1 FROM reservation WHERE id=$1', [id]);
    if (!exists.rows[0]) return reply.code(404).send({ error: { message: 'Reserva no encontrada' } });
    await pool.query(
      `INSERT INTO payment (reservation_id, kind, method, amount_cents, paid_at, note, created_by)
       VALUES ($1,$2,$3,$4,COALESCE($5::timestamptz, now()),$6,$7)`,
      [id, b.kind, b.method, b.amount_cents, b.paid_at ?? null, b.note, req.staff!.id],
    );
    await logEvent(pool, id, req.staff!.id, `payment:${b.kind}`, { amount_cents: b.amount_cents, method: b.method });
    return reply.code(201).send({ reservation: await loadReservation(id) });
  });

  app.delete('/v1/ops/payments/:id', { preHandler: requireAdmin }, async (req: any, reply) => {
    const id = uuid.parse(req.params.id);
    const { rows } = await pool.query('DELETE FROM payment WHERE id=$1 RETURNING reservation_id, amount_cents, kind', [id]);
    if (!rows[0]) return reply.code(404).send({ error: { message: 'Pago no encontrado' } });
    await logEvent(pool, rows[0].reservation_id, req.staff!.id, 'payment:deleted', rows[0]);
    return { ok: true };
  });

  // ───────────────────────────── Clientes ─────────────────────────────
  app.get('/v1/ops/clients', async req => {
    const q = z.object({ q: z.string().trim().max(100).optional() }).parse(req.query);
    const { rows } = await pool.query(
      `SELECT c.*, COALESCE(s.rentals,0)::int AS rentals, COALESCE(s.spent,0) AS spent_cents, s.last_rental
         FROM client c
         LEFT JOIN LATERAL (
           SELECT count(*) FILTER (WHERE r.status IN ('confirmed','assigned','in_service','completed')) AS rentals,
                  SUM(r.quote_cents) FILTER (WHERE r.status IN ('confirmed','assigned','in_service','completed')) AS spent,
                  MAX(r.starts_at) AS last_rental
             FROM reservation r WHERE r.client_id=c.id) s ON true
        WHERE ($1::text IS NULL OR c.full_name ILIKE '%' || $1 || '%' OR c.phone LIKE '%' || $1 || '%')
        ORDER BY s.last_rental DESC NULLS LAST, c.created_at DESC LIMIT 200`,
      [q.q || null],
    );
    return { data: rows };
  });

  app.get('/v1/ops/clients/:id', async (req: any, reply) => {
    const id = uuid.parse(req.params.id);
    const { rows } = await pool.query('SELECT * FROM client WHERE id=$1', [id]);
    if (!rows[0]) return reply.code(404).send({ error: { message: 'Cliente no encontrado' } });
    const reservations = await pool.query(`${RESERVATION_SELECT} WHERE r.client_id=$1 ORDER BY r.starts_at DESC`, [id]);
    return { client: rows[0], reservations: reservations.rows, blocked_matches: await blockedMatches(rows[0]) };
  });

  app.put('/v1/ops/clients/:id', async (req: any, reply) => {
    const id = uuid.parse(req.params.id);
    const b = clientInput.extend({ notes: optText(2000), blocked: z.boolean().default(false), blocked_reason: optText(300) }).parse(req.body);
    try {
      const { rows } = await pool.query(
        `UPDATE client SET full_name=$2, phone=$3, email=$4, id_document=$5, license_number=$6, license_expires=$7,
           address=$8, notes=$9, blocked=$10, blocked_reason=$11, updated_at=now() WHERE id=$1 RETURNING *`,
        [id, b.full_name, b.phone, b.email, b.id_document, b.license_number, b.license_expires, b.address, b.notes, b.blocked, b.blocked ? b.blocked_reason : null],
      );
      if (!rows[0]) return reply.code(404).send({ error: { message: 'Cliente no encontrado' } });
      return { client: rows[0] };
    } catch (error: any) {
      if (error?.code === '23505') return reply.code(409).send({ error: { message: 'Ya existe otro cliente con ese teléfono' } });
      throw error;
    }
  });

  // ───────────────────────────── Gastos ─────────────────────────────
  app.get('/v1/ops/expenses', async req => {
    const q = z.object({ month: z.string().regex(/^\d{4}-\d{2}$/) }).parse(req.query);
    const { rows } = await pool.query(
      `SELECT e.*, v.name AS vehicle_name, s.full_name AS created_by_name FROM expense e
         LEFT JOIN vehicle v ON v.id=e.vehicle_id LEFT JOIN staff_user s ON s.id=e.created_by
        WHERE e.spent_on >= ($1 || '-01')::date AND e.spent_on < ($1 || '-01')::date + interval '1 month'
        ORDER BY e.spent_on DESC, e.created_at DESC`,
      [q.month],
    );
    return { data: rows };
  });

  app.post('/v1/ops/expenses', async (req, reply) => {
    const b = z.object({
      vehicle_id: uuid.nullable(),
      category: z.enum(['fuel', 'maintenance', 'insurance', 'repair', 'cleaning', 'tolls', 'taxes', 'salary', 'other']),
      amount_cents: z.number().int().min(1).max(100_000_000),
      spent_on: dateSchema,
      description: optText(300),
    }).parse(req.body);
    const { rows } = await pool.query(
      `INSERT INTO expense (vehicle_id, category, amount_cents, spent_on, description, created_by)
       VALUES ($1,$2,$3,$4,$5,$6) RETURNING *`,
      [b.vehicle_id, b.category, b.amount_cents, b.spent_on, b.description, req.staff!.id],
    );
    return reply.code(201).send({ expense: rows[0] });
  });

  app.delete('/v1/ops/expenses/:id', async (req: any, reply) => {
    const id = uuid.parse(req.params.id);
    const { rowCount } = await pool.query('DELETE FROM expense WHERE id=$1', [id]);
    if (!rowCount) return reply.code(404).send({ error: { message: 'Gasto no encontrado' } });
    return { ok: true };
  });

  // ─────────────────────────── Unidades y ajustes ───────────────────────────
  const vehicleInput = z.object({
    name: z.string().trim().min(2).max(80),
    plate: optText(20),
    capacity: z.number().int().min(1).max(60),
    model_year: z.number().int().min(1990).max(2100).nullish(),
    color: optText(40),
    odometer_km: z.number().int().min(0).max(2_000_000).nullish(),
    active: z.boolean(),
    notes: optText(1000),
    insurance_expires: dateSchema.nullish(),
    verification_expires: dateSchema.nullish(),
    permit_expires: dateSchema.nullish(),
    service_every_km: z.number().int().min(500).max(100_000).default(10000),
    service_every_months: z.number().int().min(1).max(36).default(6),
    vehicle_type: z.string().trim().min(2).max(60).default('Nissan Urvan'),
    daily_rate_cents: cents.nullish(),
    weekly_rate_cents: cents.nullish(),
    on_website: z.boolean().default(true),
    gps_url: z.string().trim().max(500).nullish().or(z.literal('')).transform(v => v || null)
      .refine(u => u == null || /^https:\/\/\S+$/.test(u), 'El enlace del GPS debe empezar con https://'),
  });
  const vehicleValues = (b: z.infer<typeof vehicleInput>) => [b.name, b.plate, b.capacity, b.model_year ?? null, b.color,
    b.odometer_km ?? null, b.active, b.notes, b.insurance_expires ?? null, b.verification_expires ?? null, b.permit_expires ?? null,
    b.service_every_km, b.service_every_months, b.vehicle_type, b.daily_rate_cents ?? null,
    b.daily_rate_cents != null ? (b.weekly_rate_cents ?? null) : null, b.on_website, b.gps_url];
  const plateTaken = (error: any) => error?.code === '23505' ? 'Ya hay otra unidad con esas placas' : null;

  app.put('/v1/ops/vehicles/:id', { preHandler: requireAdmin }, async (req: any, reply) => {
    const id = uuid.parse(req.params.id);
    const b = vehicleInput.parse(req.body);
    try {
      const { rows } = await pool.query(
        `UPDATE vehicle SET name=$2, plate=$3, capacity=$4, model_year=$5, color=$6, odometer_km=$7, active=$8, notes=$9,
            insurance_expires=$10, verification_expires=$11, permit_expires=$12, service_every_km=$13, service_every_months=$14,
            vehicle_type=$15, daily_rate_cents=$16, weekly_rate_cents=$17, on_website=$18, gps_url=$19
          WHERE id=$1 RETURNING ${VEHICLE_COLUMNS}`, [id, ...vehicleValues(b)]);
      if (!rows[0]) return reply.code(404).send({ error: { message: 'Unidad no encontrada' } });
      return { vehicle: { ...rows[0], alerts: vehicleAlerts(rows[0]) } };
    } catch (error) {
      const msg = plateTaken(error); if (msg) return reply.code(409).send({ error: { message: msg } });
      throw error;
    }
  });

  /** Alta de una unidad nueva (otra Urvan u otro tipo de vehículo). Código consecutivo VEH-04, VEH-05… */
  app.post('/v1/ops/vehicles', { preHandler: requireAdmin }, async (req: any, reply) => {
    const b = vehicleInput.parse(req.body);
    try {
      const { rows } = await pool.query(
        `INSERT INTO vehicle (code, name, plate, capacity, model_year, color, odometer_km, active, notes, insurance_expires,
            verification_expires, permit_expires, service_every_km, service_every_months, vehicle_type, daily_rate_cents,
            weekly_rate_cents, on_website, gps_url)
         VALUES ('VEH-' || lpad(((SELECT count(*) FROM vehicle) + 1)::text, 2, '0'),
            $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18) RETURNING ${VEHICLE_COLUMNS}`, vehicleValues(b));
      return reply.code(201).send({ vehicle: { ...rows[0], alerts: vehicleAlerts(rows[0]) } });
    } catch (error) {
      const msg = plateTaken(error); if (msg) return reply.code(409).send({ error: { message: msg } });
      throw error;
    }
  });

  // ───────────────────────────── Cupones ─────────────────────────────
  app.get('/v1/ops/coupons', async () => ({ data: await listCoupons() }));

  /** Revisa un cupón desde el formulario de renta y devuelve el descuento que daría. */
  app.get('/v1/ops/coupons/check', async req => {
    const q = z.object({
      code: z.string().trim().min(1).max(20), starts_at: isoDateTime, ends_at: isoDateTime,
      vehicle_id: uuid.optional(), reservation_id: uuid.optional(),
      daily_rate_cents: z.coerce.number().int().min(0).optional(), weekly_rate_cents: z.coerce.number().int().min(0).optional(),
      price_mode: z.enum(['auto', 'rates', 'manual']).optional(),
    }).parse(req.query);
    if (q.price_mode === 'manual') return { ok: false, message: 'El cupón no aplica cuando el total es acordado a mano' };
    const base = await priceFor({ ...q, discount_cents: 0 });
    const c = await checkCoupon(pool, q.code, { days: base.days, total_cents: base.total_cents, channel: 'staff', exceptReservation: q.reservation_id });
    return c.ok ? { ok: true, code: c.coupon.code, discount_cents: c.discount_cents, total_cents: base.total_cents - c.discount_cents } : c;
  });

  const couponValues = (b: z.infer<typeof couponInput>) => [b.code, b.kind, b.value, b.min_days, b.starts_on, b.ends_on,
    b.max_uses ?? null, b.on_website, b.active, b.note];
  const couponTaken = (error: any) => error?.code === '23505' ? 'Ya existe un cupón con ese código' : null;

  app.post('/v1/ops/coupons', { preHandler: requireAdmin }, async (req, reply) => {
    const b = couponInput.parse(req.body);
    try {
      const { rows } = await pool.query(
        `INSERT INTO coupon (code, kind, value, min_days, starts_on, ends_on, max_uses, on_website, active, note)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING id`, couponValues(b));
      return reply.code(201).send({ id: rows[0].id });
    } catch (error) {
      const msg = couponTaken(error); if (msg) return reply.code(409).send({ error: { message: msg } });
      throw error;
    }
  });

  app.put('/v1/ops/coupons/:id', { preHandler: requireAdmin }, async (req: any, reply) => {
    const id = uuid.parse(req.params.id);
    const b = couponInput.parse(req.body);
    try {
      const { rowCount } = await pool.query(
        `UPDATE coupon SET code=$1, kind=$2, value=$3, min_days=$4, starts_on=$5, ends_on=$6, max_uses=$7, on_website=$8,
            active=$9, note=$10 WHERE id=$11`, [...couponValues(b), id]);
      if (!rowCount) return reply.code(404).send({ error: { message: 'Cupón no encontrado' } });
      return { ok: true };
    } catch (error) {
      const msg = couponTaken(error); if (msg) return reply.code(409).send({ error: { message: msg } });
      throw error;
    }
  });

  // ───────────────────────────── Reportes ─────────────────────────────
  app.get('/v1/ops/reports', { preHandler: requireAdmin }, async req => {
    const q = z.object({ year: z.coerce.number().int().min(2020).max(2100).optional() }).parse(req.query);
    return yearReport(q.year ?? Number(new Date().toLocaleDateString('en-CA', { timeZone: TZ }).slice(0, 4)));
  });

  app.put('/v1/ops/settings/fx', { preHandler: requireAdmin }, async (req: any) => {
    const { manual_rate } = fxManualSchema.parse(req.body);
    return { fx: await setManualRate(manual_rate) };
  });

  app.put('/v1/ops/settings/:key', { preHandler: requireAdmin }, async (req: any) => {
    const key = z.enum(['pricing', 'business', 'extras']).parse(req.params.key);
    const value = key === 'pricing'
      ? z.object({ daily_cents: cents, weekly_cents: cents, deposit_cents: cents }).parse(req.body)
      : key === 'extras' ? extrasSchema.parse(req.body)
      : z.object({
        name: z.string().trim().min(2).max(120), phone: z.string().trim().max(25), city: z.string().trim().max(120),
        legal_name: z.string().trim().max(200), address: z.string().trim().max(300),
      }).parse(req.body);
    await pool.query(
      `INSERT INTO setting (key, value, updated_at) VALUES ($1,$2,now())
       ON CONFLICT (key) DO UPDATE SET value=EXCLUDED.value, updated_at=now()`,
      [key, JSON.stringify(value)],
    );
    return { [key]: value };
  });

  // ───────────────────────────── Personal ─────────────────────────────
  app.get('/v1/ops/staff', { preHandler: requireAdmin }, async () => {
    const { rows } = await pool.query(
      `SELECT s.id, s.email, s.full_name, s.role, s.active, s.last_login_at, s.created_at,
              (SELECT count(*)::int FROM push_subscription p WHERE p.staff_id=s.id) AS devices
         FROM staff_user s ORDER BY s.created_at`);
    return { data: rows };
  });

  app.post('/v1/ops/staff', { preHandler: requireAdmin }, async (req, reply) => {
    const b = z.object({
      email: z.string().trim().email(), full_name: z.string().trim().min(2).max(120),
      role: z.enum(['admin', 'operator']), password: passwordRule,
    }).parse(req.body);
    try {
      const { rows } = await pool.query(
        `INSERT INTO staff_user (email, password_hash, full_name, role) VALUES ($1,$2,$3,$4)
         RETURNING id, email, full_name, role, active`,
        [b.email.toLowerCase(), hashPassword(b.password), b.full_name, b.role],
      );
      return reply.code(201).send({ staff: rows[0] });
    } catch (error: any) {
      if (error?.code === '23505') return reply.code(409).send({ error: { message: 'Ya existe un usuario con ese correo' } });
      throw error;
    }
  });

  app.put('/v1/ops/staff/:id', { preHandler: requireAdmin }, async (req: any, reply) => {
    const id = uuid.parse(req.params.id);
    const b = z.object({
      full_name: z.string().trim().min(2).max(120), role: z.enum(['admin', 'operator']),
      active: z.boolean(), password: passwordRule.optional().or(z.literal('')),
    }).parse(req.body);
    if (id === req.staff!.id && (!b.active || b.role !== 'admin')) {
      return reply.code(422).send({ error: { message: 'No puedes quitarte tu propio acceso de administrador' } });
    }
    const { rows } = await pool.query(
      `UPDATE staff_user SET full_name=$2, role=$3, active=$4,
         password_hash = COALESCE($5, password_hash),
         session_version = session_version + CASE WHEN $5 IS NOT NULL OR NOT $4 THEN 1 ELSE 0 END,
         failed_logins = 0, locked_until = NULL
       WHERE id=$1 RETURNING id, email, full_name, role, active`,
      [id, b.full_name, b.role, b.active, b.password ? hashPassword(b.password) : null],
    );
    if (!rows[0]) return reply.code(404).send({ error: { message: 'Usuario no encontrado' } });
    return { staff: rows[0] };
  });

  // ─────────────────────────── Notificaciones push ───────────────────────────
  app.post('/v1/ops/push/subscribe', async (req, reply) => {
    const b = z.object({
      endpoint: z.string().url().max(1000),
      keys: z.object({ p256dh: z.string().max(200), auth: z.string().max(100) }),
    }).parse(req.body);
    await pool.query(
      `INSERT INTO push_subscription (staff_id, endpoint, p256dh, auth, user_agent) VALUES ($1,$2,$3,$4,$5)
       ON CONFLICT (endpoint) DO UPDATE SET staff_id=EXCLUDED.staff_id, p256dh=EXCLUDED.p256dh, auth=EXCLUDED.auth`,
      [req.staff!.id, b.endpoint, b.keys.p256dh, b.keys.auth, String(req.headers['user-agent'] ?? '').slice(0, 300)],
    );
    return reply.code(201).send({ ok: true });
  });

  app.post('/v1/ops/push/unsubscribe', async req => {
    const b = z.object({ endpoint: z.string().url().max(1000) }).parse(req.body);
    await pool.query('DELETE FROM push_subscription WHERE endpoint=$1 AND staff_id=$2', [b.endpoint, req.staff!.id]);
    return { ok: true };
  });

  app.post('/v1/ops/push/test', { config: { rateLimit: { max: 5, timeWindow: '10 minutes' } } }, async req => {
    await notifyStaff({ title: 'Turi Express', body: `Prueba de notificación enviada por ${req.staff!.full_name}`, url: '/', tag: 'test' }, m => app.log.warn(m));
    return { ok: true };
  });
}
