import { test } from 'node:test';
import assert from 'node:assert/strict';
import { billableDays, quote, seasonalQuote } from './pricing.js';

const p = { daily_cents: 180000, weekly_cents: 1050000 };
const at = (s: string) => new Date(s);

test('días cobrables con tolerancia de 2 h', () => {
  assert.equal(billableDays(at('2026-12-01T09:00:00-06:00'), at('2026-12-02T10:30:00-06:00')), 1);
  assert.equal(billableDays(at('2026-12-01T09:00:00-06:00'), at('2026-12-02T11:30:00-06:00')), 2);
  assert.equal(billableDays(at('2026-12-01T09:00:00-06:00'), at('2026-12-01T18:00:00-06:00')), 1);
  assert.equal(billableDays(at('2026-12-01T09:00:00-06:00'), at('2026-12-08T09:00:00-06:00')), 7);
  assert.equal(billableDays(at('2026-12-02T09:00:00-06:00'), at('2026-12-01T09:00:00-06:00')), 0);
});

test('cotización día + semana', () => {
  assert.equal(quote(1, p).total_cents, 180000);
  assert.equal(quote(3, p).total_cents, 540000);
  assert.equal(quote(7, p).total_cents, 1050000);
  assert.equal(quote(8, p).total_cents, 1230000);
  // 6 días sueltos (10,800) superan la semana (10,500): se cobra semana.
  assert.equal(quote(6, p).total_cents, 1050000);
  assert.equal(quote(13, p).total_cents, 2100000);
});

test('temporadas: sin temporadas coincide con la cotización simple', () => {
  const base = { daily_cents: 180000, weekly_cents: 1050000 };
  for (const d of [1, 3, 6, 7, 8, 13, 14, 20]) {
    const s = new Date('2026-12-01T15:00:00Z');
    const e = new Date(s.getTime() + d * 86400000);
    assert.equal(seasonalQuote(s, e, base, []).total_cents, quote(d, base).total_cents);
  }
});

test('temporadas: los días de temporada alta cuestan su tarifa', () => {
  const base = { daily_cents: 100000, weekly_cents: 600000 };
  const alta = { name: 'Navidad', starts_on: '2026-12-20', ends_on: '2027-01-06', daily_cents: 150000, weekly_cents: 900000 };
  // 3 días: 18 y 19 base, 20 alta
  const s = new Date('2026-12-18T15:00:00Z');
  const q = seasonalQuote(s, new Date(s.getTime() + 3 * 86400000), base, [alta]);
  assert.equal(q.total_cents, 100000 * 2 + 150000);
  assert.deepEqual(q.seasons, ['Navidad']);
  // 7 días dentro de la temporada: semana alta
  const s2 = new Date('2026-12-21T15:00:00Z');
  assert.equal(seasonalQuote(s2, new Date(s2.getTime() + 7 * 86400000), base, [alta]).total_cents, 900000);
});
