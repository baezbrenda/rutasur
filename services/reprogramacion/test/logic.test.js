import { test } from 'node:test';
import assert from 'node:assert/strict';
import { decidirReprogramacion as d } from '../src/logic.js';

const viernesMediodia = '2026-03-06T15:00:00.000Z'; // 12:00 local => franja MANANA
const viernesTarde = '2026-03-06T20:00:00.000Z';    // 17:00 local => franja TARDE

test('AUSENTE: día hábil siguiente en la franja opuesta', () => {
  assert.deepEqual(d({ motivo: 'AUSENTE', nro: 1, ocurridoEn: viernesMediodia }),
    { tipo: 'REPROGRAMADO', franja: 'TARDE', proximoIntentoEn: '2026-03-09T18:00:00.000Z' });
  assert.deepEqual(d({ motivo: 'AUSENTE', nro: 2, ocurridoEn: viernesTarde }),
    { tipo: 'REPROGRAMADO', franja: 'MANANA', proximoIntentoEn: '2026-03-09T12:00:00.000Z' });
});

test('DIRECCION_INCORRECTA: queda retenido, no se reprograma solo', () => {
  assert.equal(d({ motivo: 'DIRECCION_INCORRECTA', nro: 1, ocurridoEn: viernesTarde }).tipo, 'RETENIDO');
});

test('RECHAZADO: devolución al comercio', () => {
  assert.equal(d({ motivo: 'RECHAZADO', nro: 1, ocurridoEn: viernesTarde }).tipo, 'DEVOLUCION');
});

test('tercer fallo: devolución, cualquiera sea el motivo', () => {
  for (const motivo of ['AUSENTE', 'DIRECCION_INCORRECTA', 'RECHAZADO', 'ZONA_INACCESIBLE']) {
    assert.equal(d({ motivo, nro: 3, ocurridoEn: viernesTarde }).tipo, 'DEVOLUCION');
  }
});
