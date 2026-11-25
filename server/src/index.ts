import Fastify from 'fastify';
import cookie from '@fastify/cookie';
import cors from '@fastify/cors';
import helmet from '@fastify/helmet';
import jwt from '@fastify/jwt';
import rateLimit from '@fastify/rate-limit';
import fastifyStatic from '@fastify/static';
import { join } from 'node:path';
import { ZodError } from 'zod';
import { authRoutes, seedAdmin } from './auth.js';
import { pool } from './db.js';
import { allowedOrigins, env } from './env.js';
import { migrate } from './migrate.js';
import { startReminders } from './reminders.js';
import { opsRoutes } from './routes/ops.js';
import { publicRoutes } from './routes/public.js';

// Detrás del túnel de Cloudflare: la IP real del visitante viene en cabeceras.
const app = Fastify({ logger: true, trustProxy: true, bodyLimit: 64 * 1024 });

await migrate(m => app.log.info(m));
await seedAdmin(m => app.log.info(m));

await app.register(helmet, {
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'"],
      imgSrc: ["'self'", 'data:'],
      connectSrc: ["'self'"],
      frameSrc: ["'self'"],
      objectSrc: ["'none'"],
      baseUri: ["'self'"],
      frameAncestors: ["'none'"],
      formAction: ["'self'"],
    },
  },
  crossOriginResourcePolicy: { policy: 'cross-origin' },
});
// Solo el sitio público puede llamar a la API desde otro dominio, y solo a rutas públicas (sin cookies).
await app.register(cors, {
  origin: (origin, cb) => cb(null, !origin || allowedOrigins.includes(origin)),
  credentials: false,
});
await app.register(rateLimit, {
  global: true, max: 300, timeWindow: '1 minute',
  keyGenerator: req => String(req.headers['cf-connecting-ip'] ?? req.ip),
});
await app.register(cookie);
await app.register(jwt, { secret: env.JWT_SECRET });

app.setErrorHandler((error: any, req, reply) => {
  if (error instanceof ZodError) {
    const first = error.issues[0];
    return reply.code(400).send({ error: { message: first ? `${first.path.join('.') || 'dato'}: ${first.message}` : 'Datos inválidos', issues: error.issues } });
  }
  if (error.statusCode && error.statusCode < 500) {
    return reply.code(error.statusCode).send({ error: { message: error.message } });
  }
  req.log.error(error);
  return reply.code(500).send({ error: { message: 'Error interno, intenta de nuevo' } });
});

await app.register(fastifyStatic, {
  root: join(import.meta.dirname, '..', 'public'),
  prefix: '/',
  setHeaders: (res, path) => {
    // El service worker y el HTML deben revalidarse siempre para que las actualizaciones lleguen.
    if (/(sw\.js|index\.html|manifest\.webmanifest)$/.test(path)) res.header('cache-control', 'no-cache');
    if (path.endsWith('assetlinks.json')) res.header('content-type', 'application/json');
  },
});
await app.register(authRoutes);
await app.register(publicRoutes);
await app.register(opsRoutes);

app.setNotFoundHandler((req, reply) => {
  if (req.url.startsWith('/v1/')) return reply.code(404).send({ error: { message: 'Ruta no encontrada' } });
  return reply.sendFile('index.html');
});

const timer = startReminders(m => app.log.warn(m));

const shutdown = async () => {
  clearInterval(timer);
  await app.close();
  await pool.end();
  process.exit(0);
};
process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);

await app.listen({ host: '127.0.0.1', port: env.PORT });
