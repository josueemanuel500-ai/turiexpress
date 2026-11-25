import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { BLOCKING, BUSINESS_OFFSET, dateSchema, freeVehicles, logEvent, money, phoneSchema, upsertClient } from '../common.js';
import { getSetting, pool, tx } from '../db.js';
import { billableDays, quote, type Pricing } from '../pricing.js';
import { notifyStaff } from '../push.js';

const DEFAULT_PRICING: Pricing = { daily_cents: 0, weekly_cents: 0, deposit_cents: 0 };

export async function publicRoutes(app: FastifyInstance) {
  app.get('/v1/health', async () => ({ ok: true }));

  app.get('/v1/public/pricing', async () => {
    const p = await getSetting('pricing', DEFAULT_PRICING);
    return { daily_cents: p.daily_cents, weekly_cents: p.weekly_cents, deposit_cents: p.deposit_cents };
  });

  /** Ocupación pública: solo rangos de fechas por unidad, nunca datos del cliente. */
  app.get('/v1/public/availability', async req => {
    const q = z.object({ from: dateSchema, to: dateSchema }).parse(req.query);
    const [vehicles, busy] = await Promise.all([
      pool.query('SELECT id, name FROM vehicle WHERE active ORDER BY code'),
      pool.query(
        `SELECT vehicle_id, starts_at, ends_at FROM reservation
          WHERE vehicle_id IS NOT NULL AND status = ANY($3::reservation_status[])
            AND starts_at < (($2::date + 1)::timestamp AT TIME ZONE 'America/Merida')
            AND ends_at > ($1::date::timestamp AT TIME ZONE 'America/Merida')`,
        [q.from, q.to, BLOCKING],
      ),
    ]);
    return { vehicles: vehicles.rows, busy: busy.rows };
  });

  const request = z.object({
    start_date: dateSchema,
    end_date: dateSchema,
    start_time: z.string().regex(/^\d{2}:\d{2}$/).default('09:00'),
    client_name: z.string().trim().min(3).max(150),
    client_phone: phoneSchema,
    pickup: z.string().trim().max(300).optional(),
    notes: z.string().trim().max(1000).optional(),
    // Campo trampa: los bots lo llenan, las personas no lo ven.
    website: z.string().max(0).optional(),
  });

  app.post('/v1/public/reservations', { config: { rateLimit: { max: 6, timeWindow: '1 hour' } } }, async (req, reply) => {
    const b = request.parse(req.body);
    const startsAt = `${b.start_date}T${b.start_time}:00${BUSINESS_OFFSET}`;
    // La renta termina el último día a la misma hora de entrega (bloques de 24 h).
    const endsAt = `${b.end_date}T${b.start_time}:00${BUSINESS_OFFSET}`;
    if (new Date(startsAt) < new Date(Date.now() - 60 * 60 * 1000)) {
      return reply.code(422).send({ error: { message: 'La fecha de inicio ya pasó' } });
    }
    if (new Date(endsAt) <= new Date(startsAt)) {
      return reply.code(422).send({ error: { message: 'La devolución debe ser al menos un día después de la entrega' } });
    }

    const pricing = await getSetting('pricing', DEFAULT_PRICING);
    const days = billableDays(new Date(startsAt), new Date(endsAt));
    const q = quote(days, pricing);

    const result = await tx(async db => {
      const free = await freeVehicles(db, startsAt, endsAt);
      if (!free.length) return null;
      const client = await upsertClient(db, { full_name: b.client_name, phone: b.client_phone }, false);
      const { rows } = await db.query(
        `INSERT INTO reservation (service,status,starts_at,ends_at,pickup,passengers,client_name,client_phone,notes,
            client_id,vehicle_id,daily_rate_cents,weekly_rate_cents,quote_cents,guarantee_cents,source)
         VALUES ('rental','new',$1,$2,$3,1,$4,$5,$6,$7,$8,$9,$10,$11,$12,'website')
         RETURNING id, folio`,
        [startsAt, endsAt, b.pickup || 'Por confirmar', b.client_name, b.client_phone, b.notes ?? null,
          client.id, free[0].id, pricing.daily_cents, pricing.weekly_cents, q.total_cents, pricing.deposit_cents],
      );
      await logEvent(db, rows[0].id, null, 'created_public', { source: 'website' });
      return { ...rows[0], vehicle: free[0].name, blocked: client.blocked };
    });

    if (!result) {
      return reply.code(409).send({ error: { message: 'No hay unidades libres en esas fechas. Escríbenos por WhatsApp y te buscamos opción.' } });
    }

    notifyStaff({
      title: `Nueva solicitud ${result.folio}`,
      body: `${b.client_name} · ${b.start_date} → ${b.end_date} (${days} día${days === 1 ? '' : 's'}) · ${money(q.total_cents)}${result.blocked ? ' · ⚠ cliente bloqueado' : ''}`,
      url: `/#/reservas/${result.id}`,
      tag: `reservation-${result.id}`,
    }, m => app.log.warn(m)).catch(error => app.log.error(error));

    return reply.code(201).send({
      reservation: { folio: result.folio, days, total_cents: q.total_cents, guarantee_cents: pricing.deposit_cents },
    });
  });
}
