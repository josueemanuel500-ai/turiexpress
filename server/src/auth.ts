import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { randomBytes, scryptSync, timingSafeEqual } from 'node:crypto';
import { z } from 'zod';
import { pool } from './db.js';
import { env } from './env.js';

export const COOKIE = 'te_session';
const SESSION_DAYS = 30; // la app instalada no debe pedir login cada día
const MAX_FAILED = 5;
const LOCK_MINUTES = 15;

export type Staff = { id: string; email: string; full_name: string; role: 'admin' | 'operator' | 'dispatcher' | 'driver' };

declare module 'fastify' {
  interface FastifyRequest { staff?: Staff }
}

export const hashPassword = (value: string) => {
  const salt = randomBytes(16).toString('hex');
  return `${salt}:${scryptSync(value, salt, 64).toString('hex')}`;
};

export const validPassword = (value: string, saved: string) => {
  const [salt, hash] = saved.split(':');
  if (!salt || !hash) return false;
  const candidate = scryptSync(value, salt, 64);
  const target = Buffer.from(hash, 'hex');
  return candidate.length === target.length && timingSafeEqual(candidate, target);
};

// Hash de relleno para que un correo inexistente tarde lo mismo que uno real.
const DUMMY_HASH = hashPassword(randomBytes(12).toString('hex'));

export const passwordRule = z.string().min(10, 'La contraseña debe tener al menos 10 caracteres').max(200);

const cookieOptions = () => ({
  httpOnly: true,
  secure: env.COOKIE_SECURE === 'true',
  sameSite: 'strict' as const,
  path: '/',
  maxAge: SESSION_DAYS * 24 * 60 * 60,
});

export async function requireStaff(req: FastifyRequest, reply: FastifyReply) {
  const token = req.cookies[COOKIE];
  if (!token) return reply.code(401).send({ error: { message: 'Sesión requerida' } });
  try {
    const payload = req.server.jwt.verify<{ sub: string; v: number }>(token);
    const { rows } = await pool.query(
      'SELECT id,email,full_name,role,session_version FROM staff_user WHERE id=$1 AND active',
      [payload.sub],
    );
    const user = rows[0];
    if (!user || user.session_version !== payload.v) throw new Error('stale');
    req.staff = { id: user.id, email: user.email, full_name: user.full_name, role: user.role };
  } catch {
    reply.clearCookie(COOKIE, { path: '/' });
    return reply.code(401).send({ error: { message: 'Tu sesión expiró, vuelve a entrar' } });
  }
}

export async function requireAdmin(req: FastifyRequest, reply: FastifyReply) {
  await requireStaff(req, reply);
  if (reply.sent) return;
  if (req.staff?.role !== 'admin') return reply.code(403).send({ error: { message: 'Solo un administrador puede hacer esto' } });
}

export async function seedAdmin(log: (m: string) => void) {
  const { rows } = await pool.query('SELECT count(*)::int AS total FROM staff_user');
  if (!rows[0].total && env.ADMIN_EMAIL && env.ADMIN_PASSWORD) {
    await pool.query(
      "INSERT INTO staff_user (email,password_hash,full_name,role) VALUES ($1,$2,'Administrador','admin')",
      [env.ADMIN_EMAIL.toLowerCase(), hashPassword(env.ADMIN_PASSWORD)],
    );
    log('usuario administrador inicial creado');
  }
}

export async function authRoutes(app: FastifyInstance) {
  app.post('/v1/auth/login', { config: { rateLimit: { max: 10, timeWindow: '15 minutes' } } }, async (req, reply) => {
    const body = z.object({ email: z.string().trim().email(), password: z.string().min(1).max(200) }).parse(req.body);
    const { rows } = await pool.query(
      'SELECT id,email,password_hash,full_name,role,failed_logins,locked_until,session_version FROM staff_user WHERE email=$1 AND active',
      [body.email.toLowerCase()],
    );
    const user = rows[0];
    if (user?.locked_until && new Date(user.locked_until) > new Date()) {
      const minutes = Math.ceil((new Date(user.locked_until).getTime() - Date.now()) / 60000);
      return reply.code(423).send({ error: { message: `Cuenta bloqueada por intentos fallidos. Intenta en ${minutes} min.` } });
    }
    const ok = validPassword(body.password, user?.password_hash ?? DUMMY_HASH) && !!user;
    if (!ok) {
      if (user) {
        await pool.query(
          `UPDATE staff_user SET failed_logins = failed_logins + 1,
             locked_until = CASE WHEN failed_logins + 1 >= $2 THEN now() + make_interval(mins => $3) ELSE NULL END
           WHERE id=$1`,
          [user.id, MAX_FAILED, LOCK_MINUTES],
        );
      }
      return reply.code(401).send({ error: { message: 'Correo o contraseña incorrectos' } });
    }
    await pool.query('UPDATE staff_user SET failed_logins=0, locked_until=NULL, last_login_at=now() WHERE id=$1', [user.id]);
    const token = app.jwt.sign({ sub: user.id, v: user.session_version }, { expiresIn: `${SESSION_DAYS}d` });
    reply.setCookie(COOKIE, token, cookieOptions());
    return { user: { id: user.id, name: user.full_name, email: user.email, role: user.role } };
  });

  app.post('/v1/auth/logout', async (_req, reply) => {
    reply.clearCookie(COOKIE, { path: '/' });
    return { ok: true };
  });

  app.get('/v1/auth/me', { preHandler: requireStaff }, async req => ({
    user: { id: req.staff!.id, name: req.staff!.full_name, email: req.staff!.email, role: req.staff!.role },
  }));

  app.post('/v1/auth/password', { preHandler: requireStaff, config: { rateLimit: { max: 5, timeWindow: '15 minutes' } } }, async (req, reply) => {
    const body = z.object({ current: z.string().min(1), next: passwordRule }).parse(req.body);
    const { rows } = await pool.query('SELECT password_hash FROM staff_user WHERE id=$1', [req.staff!.id]);
    if (!validPassword(body.current, rows[0].password_hash)) {
      return reply.code(400).send({ error: { message: 'La contraseña actual no es correcta' } });
    }
    const { rows: updated } = await pool.query(
      'UPDATE staff_user SET password_hash=$2, session_version=session_version+1 WHERE id=$1 RETURNING session_version',
      [req.staff!.id, hashPassword(body.next)],
    );
    // Cierra las demás sesiones y mantiene abierta la actual con el nuevo número de versión.
    reply.setCookie(COOKIE, app.jwt.sign({ sub: req.staff!.id, v: updated[0].session_version }, { expiresIn: `${SESSION_DAYS}d` }), cookieOptions());
    return { ok: true };
  });
}
