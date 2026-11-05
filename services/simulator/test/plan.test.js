import { test } from 'node:test';
import assert from 'node:assert/strict';
import { EstadoSchema, PromesaSchema, TOPICS } from '@rutasur/shared';
import { mulberry32 } from '../src/rng.js';
import { planificarEnvio } from '../src/plan.js';
import { config } from '../src/config.js';

const plan = (seed, opts = {}) =>
  planificarEnvio(mulberry32(seed), config, { id: 'RS-000001', creadoSim: Date.parse(config.simStart), ...opts });

test('misma semilla => misma planificación', () => {
  assert.deepEqual(plan(42), plan(42));
});

test('todos los eventos cumplen el esquema', () => {
  for (let s = 1; s <= 200; s++) {
    for (const e of plan(s).eventos) {
      const schema = e.topic === TOPICS.PROMESAS ? PromesaSchema : EstadoSchema;
      assert.ok(schema.safeParse(e.value).success, JSON.stringify(e.value));
    }
  }
});

test('la secuencia crece y el tiempo no retrocede', () => {
  const ev = plan(7, { resultados: ['AUSENTE', 'OK'] }).eventos.filter((e) => e.topic === TOPICS.ESTADOS);
  ev.forEach((e, i) => { if (i) { assert.equal(e.value.secuencia, ev[i - 1].value.secuencia + 1); assert.ok(e.simMs >= ev[i - 1].simMs); } });
});

test('escenarios: feliz termina ENTREGADO; tercer fallo termina en ENTREGA_FALLIDA tras 3 intentos', () => {
  const tipos = (o) => plan(1, o).eventos.filter((e) => e.topic === TOPICS.ESTADOS).map((e) => e.value.tipo);
  assert.equal(tipos({ resultados: ['OK'], demora: false }).at(-1), 'ENTREGADO');
  const t = tipos({ resultados: ['AUSENTE', 'AUSENTE', 'AUSENTE'], demora: false });
  assert.equal(t.at(-1), 'ENTREGA_FALLIDA');
  assert.equal(t.filter((x) => x === 'EN_REPARTO').length, 3);
});

test('demorado queda detenido en el hub', () => {
  const t = plan(1, { detenerEn: 'INGRESADO_HUB' }).eventos.filter((e) => e.topic === TOPICS.ESTADOS).map((e) => e.value.tipo);
  assert.deepEqual(t, ['CREADO', 'INGRESADO_HUB']);
});

test('promesaHoras ajusta el vencimiento de la promesa', () => {
  const p = plan(1, { promesaHoras: 7.5 }).eventos.find((e) => e.topic === TOPICS.PROMESAS).value;
  assert.equal(Date.parse(p.venceEn) - Date.parse(p.ocurridoEn), 7.5 * 3600_000);
});
