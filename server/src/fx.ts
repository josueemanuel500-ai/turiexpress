// Tipo de cambio USD → MXN para mostrar precios aproximados en dólares en el sitio público.
// El cobro siempre es en pesos; el dólar es solo una referencia para el cliente.
// Fuente automática: Frankfurter (tipos de referencia del Banco Central Europeo, gratis y sin clave),
// actualizada una vez al día. El administrador puede fijar un tipo manual en Ajustes.
import { z } from 'zod';
import { getSetting, pool } from './db.js';

export type Fx = { auto_rate: number | null; auto_date: string | null; manual_rate: number | null };
const DEFAULT_FX: Fx = { auto_rate: null, auto_date: null, manual_rate: null };

export const fxManualSchema = z.object({ manual_rate: z.number().min(5).max(100).nullable() });

export const getFx = () => getSetting<Fx>('fx', DEFAULT_FX);

/** Pesos por dólar que se usan para mostrar precios, o null si no hay tipo de cambio. */
export async function usdRate(): Promise<number | null> {
  const fx = await getFx();
  return fx.manual_rate || fx.auto_rate || null;
}

async function saveFx(fx: Fx) {
  await pool.query(
    `INSERT INTO setting (key, value, updated_at) VALUES ('fx', $1, now())
     ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = now()`, [JSON.stringify(fx)]);
}

export async function setManualRate(manual_rate: number | null) {
  const fx = { ...(await getFx()), manual_rate };
  await saveFx(fx);
  return fx;
}

/** Actualiza el tipo automático si tiene más de 20 horas. Si la fuente falla se conserva el último valor. */
export async function refreshFx(log: (m: string) => void) {
  const fx = await getFx();
  const updatedAt = await pool.query(`SELECT updated_at FROM setting WHERE key='fx'`).then(r => r.rows[0]?.updated_at as Date | undefined);
  if (fx.auto_rate && updatedAt && Date.now() - updatedAt.getTime() < 20 * 3600_000) return;
  try {
    const res = await fetch('https://api.frankfurter.dev/v1/latest?from=USD&to=MXN', { signal: AbortSignal.timeout(10_000) });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const body = await res.json() as { date?: string; rates?: { MXN?: number } };
    const rate = body.rates?.MXN;
    if (!rate || rate < 5 || rate > 100) throw new Error('respuesta inválida');
    await saveFx({ ...fx, auto_rate: Math.round(rate * 10000) / 10000, auto_date: body.date ?? null });
  } catch (error) {
    log(`tipo de cambio: ${(error as Error).message}`);
  }
}
