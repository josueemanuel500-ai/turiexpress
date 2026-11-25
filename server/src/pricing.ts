export type Pricing = { daily_cents: number; weekly_cents: number; deposit_cents: number };

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * Días cobrables entre entrega y devolución. Se cobra por bloque de 24 h,
 * con 2 h de tolerancia: entregar el lunes 9:00 y devolver el martes 10:30
 * es 1 día; devolver el martes 11:30 ya son 2.
 */
export function billableDays(startsAt: Date, endsAt: Date, graceHours = 2): number {
  const ms = endsAt.getTime() - startsAt.getTime();
  if (ms <= 0) return 0;
  return Math.max(1, Math.ceil((ms - graceHours * 60 * 60 * 1000) / DAY_MS));
}

/**
 * Semanas completas a tarifa semanal y días sueltos a tarifa diaria; los días
 * sueltos nunca cuestan más que otra semana (6 días × diaria > semanal → semana).
 */
export function quote(days: number, p: Pick<Pricing, 'daily_cents' | 'weekly_cents'>) {
  const weeks = Math.floor(days / 7);
  const rest = days % 7;
  const restCents = Math.min(rest * p.daily_cents, p.weekly_cents);
  return { days, weeks, rest_days: rest, total_cents: weeks * p.weekly_cents + restCents };
}

export type Season = { name: string; starts_on: string; ends_on: string; daily_cents: number; weekly_cents: number };
type Rates = { name: string | null; daily_cents: number; weekly_cents: number };

const OFFSET_MS = 6 * 60 * 60 * 1000; // Mérida, UTC-6 todo el año
const localDate = (t: number) => new Date(t - OFFSET_MS).toISOString().slice(0, 10);

/**
 * Cotización con temporadas. Cada día se cobra con la tarifa de su temporada (o la base).
 * La renta se parte en bloques de 7 días desde la entrega: un bloque completo cuesta la tarifa
 * semanal de la temporada que más días tiene en él; el bloque final incompleto cuesta sus tarifas
 * diarias, sin pasar de esa semanal. Sin temporadas da exactamente lo mismo que `quote()`.
 */
export function seasonalQuote(startsAt: Date, endsAt: Date, base: Pick<Pricing, 'daily_cents' | 'weekly_cents'>, seasons: Season[]) {
  const days = billableDays(startsAt, endsAt);
  const rateOf = (i: number): Rates => {
    const d = localDate(startsAt.getTime() + i * DAY_MS);
    const s = seasons.find(x => x.starts_on <= d && d <= x.ends_on);
    return s ? { name: s.name, daily_cents: s.daily_cents, weekly_cents: s.weekly_cents } : { name: null, ...base };
  };
  let total = 0;
  const used = new Set<string>();
  for (let start = 0; start < days; start += 7) {
    const block = Array.from({ length: Math.min(7, days - start) }, (_, k) => rateOf(start + k));
    block.forEach(r => r.name && used.add(r.name));
    // Temporada dominante del bloque (en empate, la de semana más cara).
    const counts = new Map<string, { n: number; r: Rates }>();
    for (const r of block) {
      const key = r.name ?? '';
      const c = counts.get(key) ?? { n: 0, r };
      c.n++; counts.set(key, c);
    }
    const main = [...counts.values()].sort((a, b) => b.n - a.n || b.r.weekly_cents - a.r.weekly_cents)[0].r;
    total += block.length === 7
      ? main.weekly_cents
      : Math.min(block.reduce((s, r) => s + r.daily_cents, 0), main.weekly_cents);
  }
  const first = rateOf(0);
  return {
    days, weeks: Math.floor(days / 7), rest_days: days % 7, total_cents: total,
    seasons: [...used], daily_cents: first.daily_cents, weekly_cents: first.weekly_cents,
  };
}
