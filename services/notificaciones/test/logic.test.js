import { test } from 'node:test';
import assert from 'node:assert/strict';
import { NotificacionSchema } from '@rutasur/shared';
import { armarAviso } from '../src/logic.js';

const fallo = (motivo) => ({
  shipmentId: 'RS-000001', secuencia: 5, tipo: 'ENTREGA_FALLIDA', motivo,
  ocurridoEn: '2026-03-02T15:00:00.000Z', hubId: 'HUB-SUR', zonaId: 'Z5',
});

test('el aviso es válido y su eventId es determinístico', () => {
  const a = armarAviso(fallo('AUSENTE'));
  assert.ok(NotificacionSchema.safeParse(a).success);
  assert.equal(a.eventId, 'RS-000001-s5-notif');
  assert.deepEqual(a, armarAviso(fallo('AUSENTE')));
});

test('las opciones dependen del motivo', () => {
  assert.ok(armarAviso(fallo('AUSENTE')).opciones.includes('REPROGRAMAR_TARDE'));
  assert.deepEqual(armarAviso(fallo('RECHAZADO')).opciones, []);
});

import { armarAvisoAlerta } from '../src/logic.js';

test('aviso por alerta: válido, de tipo AVISO_RETRASO y con eventId determinístico', () => {
  const a = armarAvisoAlerta({ eventId: 'RS-1-VENCIDO', shipmentId: 'RS-1', regla: 'VENCIDO', ocurridoEn: '2026-03-02T15:00:00.000Z', hubId: 'HUB-SUR', zonaId: 'Z5' });
  assert.ok(NotificacionSchema.safeParse(a).success);
  assert.equal(a.tipo, 'AVISO_RETRASO');
  assert.equal(a.eventId, 'RS-1-VENCIDO-notif');
});
