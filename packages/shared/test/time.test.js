import { test } from 'node:test';
import assert from 'node:assert/strict';
import { franjaDe, proximoDiaHabil } from '../src/time.js';

test('franja según hora local (UTC-3)', () => {
  assert.equal(franjaDe('2026-03-06T15:00:00.000Z'), 'MANANA'); // 12:00 local
  assert.equal(franjaDe('2026-03-06T16:00:00.000Z'), 'TARDE');  // 13:00 local
});

test('próximo día hábil: de viernes salta a lunes', () => {
  assert.equal(proximoDiaHabil('2026-03-06T15:00:00.000Z', 'TARDE'), '2026-03-09T18:00:00.000Z');
  assert.equal(proximoDiaHabil('2026-03-06T20:00:00.000Z', 'MANANA'), '2026-03-09T12:00:00.000Z');
});

test('de lunes a martes', () => {
  assert.equal(proximoDiaHabil('2026-03-02T15:00:00.000Z', 'MANANA'), '2026-03-03T12:00:00.000Z');
});
