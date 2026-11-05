import { test } from 'node:test';
import assert from 'node:assert/strict';
import { AlertaSchema } from '@rutasur/shared';
import { nuevoEstado, aplicarEstado, aplicarPromesa, reglasQueAplican, armarAlerta } from '../src/logic.js';

const H = 3600_000;
const T0 = Date.parse('2026-03-02T15:00:00.000Z'); // 12:00 hora local
const st = (estado, venceEnMs, extra = {}) => ({ ...nuevoEstado('RS-1'), estado, venceEn: new Date(venceEnMs).toISOString(), hubId: 'HUB-SUR', zonaId: 'Z5', ...extra });
const reglas = (s, ahora = T0) => reglasQueAplican(s, ahora).map((r) => `${r.regla}:${r.prioridad}`);

test('SIN_INGRESO (media): < 10 h y no ingresó al hub', () => {
  assert.deepEqual(reglas(st('CREADO', T0 + 9 * H)), ['SIN_INGRESO:MEDIA']);
  assert.deepEqual(reglas(st('CREADO', T0 + 11 * H)), []);
  assert.deepEqual(reglas(st('INGRESADO_HUB', T0 + 9 * H)), []);
});

test('SIN_SALIDA (alta): < 4 h y no está en reparto', () => {
  assert.deepEqual(reglas(st('CLASIFICADO', T0 + 3 * H)), ['SIN_SALIDA:ALTA']);
  assert.deepEqual(reglas(st('EN_REPARTO', T0 + 3 * H)), []);
});

test('FALLO_DIA_LIMITE (alta): ENTREGA_FALLIDA y la promesa vence hoy', () => {
  assert.deepEqual(reglas(st('ENTREGA_FALLIDA', T0 + 5 * H)), ['FALLO_DIA_LIMITE:ALTA']); // vence 17:00 local, mismo día
  assert.deepEqual(reglas(st('ENTREGA_FALLIDA', T0 + 30 * H)), []);                        // vence mañana
});

test('VENCIDO (crítica): pasó el vencimiento sin ENTREGADO', () => {
  assert.deepEqual(reglas(st('EN_REPARTO', T0 - H)), ['VENCIDO:CRITICA']);
});

test('sin repetición: una regla ya alertada no se vuelve a emitir', () => {
  const s = st('CREADO', T0 + 9 * H, { alertas: { SIN_INGRESO: 'ABIERTA' } });
  assert.deepEqual(reglas(s), []);
});

test('ENTREGADO cierra el envío y deja de evaluarse', () => {
  const { st: s } = aplicarEstado(st('EN_REPARTO', T0 - H, { ultimaSecuencia: 4 }), { tipo: 'ENTREGADO', secuencia: 5, hubId: 'HUB-SUR', zonaId: 'Z5' });
  assert.equal(s.cerrado, true);
  assert.deepEqual(reglas(s), []);
});

test('eventos duplicados o rezagados (secuencia <= aplicada) se descartan', () => {
  const base = st('CLASIFICADO', T0 + H, { ultimaSecuencia: 3 });
  assert.equal(aplicarEstado(base, { tipo: 'CREADO', secuencia: 1, hubId: 'H', zonaId: 'Z' }).cambio, false);
  assert.equal(aplicarEstado(base, { tipo: 'CLASIFICADO', secuencia: 3, hubId: 'H', zonaId: 'Z' }).cambio, false);
});

test('sin promesa todavía no se evalúa; al llegar la promesa se completa el estado', () => {
  assert.deepEqual(reglasQueAplican(nuevoEstado('RS-1'), T0), []);
  const s = aplicarPromesa(nuevoEstado('RS-1'), { venceEn: '2026-03-03T00:00:00.000Z', hubId: 'HUB-SUR', zonaId: 'Z5' });
  assert.equal(s.venceEn, '2026-03-03T00:00:00.000Z');
});

test('las alertas armadas cumplen el esquema y su eventId es determinístico', () => {
  const s = st('CLASIFICADO', T0 + 3 * H);
  const [r] = reglasQueAplican(s, T0);
  const a = armarAlerta(s, r, 'ALERTA_ABIERTA', T0);
  const c = armarAlerta(s, r, 'ALERTA_CERRADA', T0);
  assert.ok(AlertaSchema.safeParse(a).success);
  assert.ok(AlertaSchema.safeParse(c).success);
  assert.equal(a.eventId, 'RS-1-SIN_SALIDA');
  assert.equal(c.eventId, 'RS-1-SIN_SALIDA-cierre');
});
