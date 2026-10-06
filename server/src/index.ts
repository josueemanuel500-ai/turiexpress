import Fastify from 'fastify';
import cors from '@fastify/cors';
import helmet from '@fastify/helmet';
import jwt from '@fastify/jwt';
import rateLimit from '@fastify/rate-limit';
import { Pool } from 'pg';
import { z } from 'zod';

const env = z.object({ DATABASE_URL: z.string().url(), JWT_SECRET: z.string().min(32), PORT: z.coerce.number().default(3000), PUBLIC_ORIGIN: z.string().url() }).parse(process.env);
const pool = new Pool({ connectionString: env.DATABASE_URL, max: 10 });
const app = Fastify({ logger: true });
await app.register(helmet, { contentSecurityPolicy: false });
await app.register(cors, { origin: [env.PUBLIC_ORIGIN, 'https://operacion.turiexpress.mx'], credentials: true });
await app.register(rateLimit, { global: true, max: 150, timeWindow: '1 minute' });
await app.register(jwt, { secret: env.JWT_SECRET });
app.get('/v1/health', async () => ({ ok: true }));

const publicRequest = z.object({ service: z.enum(['rental','airport_transfer','private_transfer','tour','other']), starts_at: z.string().datetime(), ends_at: z.string().datetime(), pickup: z.string().min(3).max(300), destination: z.string().max(300).optional(), passengers: z.number().int().min(1).max(60), client_name: z.string().min(3).max(150), client_phone: z.string().min(10).max(25), client_email: z.string().email().optional(), flight_number: z.string().max(30).optional(), notes: z.string().max(1000).optional() });
app.get('/v1/public/availability', async (req) => { const q = z.object({ from: z.string().datetime(), to: z.string().datetime() }).parse(req.query); const { rows } = await pool.query(`SELECT v.id,v.code,v.name,v.capacity, r.starts_at,r.ends_at FROM vehicle v LEFT JOIN reservation r ON r.vehicle_id=v.id AND r.status IN ('hold','deposit_pending','confirmed','assigned','in_service') AND r.starts_at < $2 AND r.ends_at > $1 WHERE v.active ORDER BY v.code`, [q.from, q.to]); return { data: rows }; });
app.post('/v1/public/reservations', { config: { rateLimit: { max: 8, timeWindow: '1 hour' } } }, async (req, reply) => { const b = publicRequest.parse(req.body); if (new Date(b.starts_at) < new Date()) return reply.code(422).send({ error: { message: 'La fecha debe ser futura' } }); const { rows } = await pool.query(`INSERT INTO reservation (service,starts_at,ends_at,pickup,destination,passengers,client_name,client_phone,client_email,flight_number,notes) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) RETURNING id,folio,status`, [b.service,b.starts_at,b.ends_at,b.pickup,b.destination ?? null,b.passengers,b.client_name,b.client_phone,b.client_email ?? null,b.flight_number ?? null,b.notes ?? null]); await pool.query(`INSERT INTO reservation_event (reservation_id,event,detail) VALUES ($1,'created_public',$2)`, [rows[0].id, JSON.stringify({ source: 'website' })]); return reply.code(201).send({ reservation: rows[0] }); });
app.get('/v1/operations/reservations', async (req, reply) => { try { await req.jwtVerify(); } catch { return reply.code(401).send({ error: { message: 'Sesión requerida' } }); } const q = z.object({ from: z.string().datetime(), to: z.string().datetime(), status: z.string().optional() }).parse(req.query); const { rows } = await pool.query(`SELECT r.*,v.code AS vehicle_code,d.full_name AS driver_name FROM reservation r LEFT JOIN vehicle v ON v.id=r.vehicle_id LEFT JOIN driver d ON d.id=r.driver_id WHERE r.starts_at < $2 AND r.ends_at > $1 AND ($3::reservation_status IS NULL OR r.status=$3::reservation_status) ORDER BY r.starts_at`, [q.from,q.to,q.status ?? null]); return { data: rows }; });
await app.listen({ host: '127.0.0.1', port: env.PORT });
