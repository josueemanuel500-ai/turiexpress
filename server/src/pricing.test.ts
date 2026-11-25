import { test } from 'node:test';
import assert from 'node:assert/strict';
import { billableDays, quote } from './pricing.js';

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
