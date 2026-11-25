import { readdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { pool } from './db.js';

const dir = join(import.meta.dirname, '..', 'migrations');

/** Aplica, en orden y una sola vez, los archivos de `migrations/`. */
export async function migrate(log: (msg: string) => void = console.log) {
  await pool.query(`CREATE TABLE IF NOT EXISTS schema_migration (
    name text PRIMARY KEY, applied_at timestamptz NOT NULL DEFAULT now())`);

  // 001 se aplicó a mano antes de existir este registro.
  const legacy = await pool.query(`SELECT to_regclass('public.reservation') IS NOT NULL AS present`);
  if (legacy.rows[0].present) {
    await pool.query(`INSERT INTO schema_migration (name) VALUES ('001_reservations.sql') ON CONFLICT DO NOTHING`);
  }

  const done = new Set((await pool.query('SELECT name FROM schema_migration')).rows.map(r => r.name));
  const files = (await readdir(dir)).filter(f => f.endsWith('.sql')).sort();
  for (const file of files) {
    if (done.has(file)) continue;
    const sql = await readFile(join(dir, file), 'utf8');
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      await client.query(sql);
      await client.query('INSERT INTO schema_migration (name) VALUES ($1)', [file]);
      await client.query('COMMIT');
      log(`migración aplicada: ${file}`);
    } catch (error) {
      await client.query('ROLLBACK');
      throw new Error(`Falló la migración ${file}: ${(error as Error).message}`);
    } finally {
      client.release();
    }
  }
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  migrate().then(() => pool.end()).catch(error => { console.error(error); process.exit(1); });
}
