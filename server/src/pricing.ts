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
