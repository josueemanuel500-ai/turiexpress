import { z } from 'zod';

export const env = z.object({
  DATABASE_URL: z.string().url(),
  JWT_SECRET: z.string().min(32),
  PORT: z.coerce.number().default(3000),
  PG_POOL_MAX: z.coerce.number().int().min(1).max(50).default(10),
  PUBLIC_ORIGIN: z.string().url(),
  // Origen extra permitido (p. ej. pruebas locales del sitio). Separados por coma.
  EXTRA_ORIGINS: z.string().optional(),
  ADMIN_EMAIL: z.string().email().optional(),
  ADMIN_PASSWORD: z.string().min(12).optional(),
  // Claves VAPID para notificaciones push. Se generan con `npx web-push generate-vapid-keys`.
  VAPID_PUBLIC_KEY: z.string().optional(),
  VAPID_PRIVATE_KEY: z.string().optional(),
  VAPID_SUBJECT: z.string().default('mailto:contacto@turiexpress.com.mx'),
  // Zona horaria del negocio para recordatorios y reportes.
  TZ_BUSINESS: z.string().default('America/Merida'),
  // En desarrollo local la cookie no puede ser Secure (http).
  COOKIE_SECURE: z.enum(['true', 'false']).default('true'),
  // Carpeta de fotos de revisión (por defecto server/uploads).
  UPLOAD_DIR: z.string().optional(),
  // Monitoreo (healthchecks.io u otro): la API manda una señal cada 5 min; si deja de llegar, te avisan.
  HEALTHCHECK_URL: z.string().url().optional(),
}).parse(process.env);

export const allowedOrigins = [
  env.PUBLIC_ORIGIN,
  'https://www.turiexpress.com.mx',
  ...(env.EXTRA_ORIGINS ? env.EXTRA_ORIGINS.split(',').map(s => s.trim()).filter(Boolean) : []),
];
