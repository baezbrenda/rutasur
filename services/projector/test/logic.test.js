import { test } from 'node:test';
import assert from 'node:assert/strict';
import { planificarEstado } from '../src/logic.js';

const ev = (secuencia, tipo, extra = {}) => ({
  eventId: `e${secuencia}`, shipmentId: 'RS-1', tipo, secuencia, ocurridoEn: '2026-03-02T10:00:00.000Z',
  hubId: 'HUB-SUR', zonaId: 'Z5', repartidorId: 'REP-001', version: 1, ...extra,
});

test('primer evento se aplica', () => {
  assert.equal(planificarEstado(null, ev(1, 'CREADO')).accion, 'aplicar');
});

test('secuencia menor o igual a la aplicada se descarta (no retrocede el estado)', () => {
  assert.equal(planificarEstado({ ultimaSecuencia: 4 }, ev(3, 'CLASIFICADO')).razon, 'fuera_de_orden');
  assert.equal(planificarEstado({ ultimaSecuencia: 4 }, ev(4, 'EN_REPARTO')).accion, 'descartar');
});

test('ENTREGA_FALLIDA suma un intento fallido y guarda el motivo', () => {
  const p = planificarEstado({ ultimaSecuencia: 4 }, ev(5, 'ENTREGA_FALLIDA', { motivo: 'AUSENTE' }));
  assert.equal(p.update.$inc.intentosFallidos, 1);
  assert.equal(p.update.$set.ultimoMotivo, 'AUSENTE');
});

import { planificarReprogramacion } from '../src/logic.js';

test('EN_REPARTO y ENTREGADO limpian el próximo intento programado', () => {
  assert.deepEqual(planificarEstado({ ultimaSecuencia: 1 }, ev(2, 'EN_REPARTO')).update.$unset, { proximoIntento: '' });
  assert.equal(planificarEstado({ ultimaSecuencia: 1 }, ev(2, 'CLASIFICADO')).update.$unset, undefined);
});

test('reprogramación: REPROGRAMADO guarda el próximo intento; RETENIDO lo limpia', () => {
  const base = { eventId: 'x', shipmentId: 'RS-1', motivo: 'AUSENTE', intentosFallidos: 1, ocurridoEn: '2026-03-02T15:00:00.000Z' };
  const a = planificarReprogramacion({ ...base, tipo: 'REPROGRAMADO', franja: 'TARDE', proximoIntentoEn: '2026-03-03T18:00:00.000Z' });
  assert.equal(a.$set.disposicion, 'REPROGRAMADO');
  assert.equal(a.$set.proximoIntento.franja, 'TARDE');
  const r = planificarReprogramacion({ ...base, tipo: 'RETENIDO', motivo: 'DIRECCION_INCORRECTA' });
  assert.deepEqual(r.$unset, { proximoIntento: '' });
});
