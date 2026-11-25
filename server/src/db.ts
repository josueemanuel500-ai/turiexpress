import pg from 'pg';
import { env } from './env.js';

// Devuelve las columnas `date` como texto 'YYYY-MM-DD' en vez de Date en UTC,
// para que un gasto del 5 de diciembre no aparezca como 4 por la zona horaria.
pg.types.setTypeParser(1082, (value: string) => value);
// bigint (sumas) como número: los montos en centavos caben de sobra.
pg.types.setTypeParser(20, (value: string) => Number(value));

export const pool = new pg.Pool({ connectionString: env.DATABASE_URL, max: env.PG_POOL_MAX });

export type Tx = pg.PoolClient;

export async function tx<T>(fn: (client: Tx) => Promise<T>): Promise<T> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const result = await fn(client);
    await client.query('COMMIT');
    return result;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

export async function getSetting<T>(key: string, fallback: T): Promise<T> {
  const { rows } = await pool.query('SELECT value FROM setting WHERE key=$1', [key]);
  return rows[0] ? { ...fallback, ...rows[0].value } : fallback;
}
