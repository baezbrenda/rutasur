import { TOPICS } from '@rutasur/shared';
import { pick, weighted } from './rng.js';

const H = 3600_000;

/**
 * Planifica TODA la vida de un envío como una lista de eventos con su instante simulado.
 * opts.resultados: lista forzada por intento, p.ej. ['AUSENTE','OK'] (para los escenarios)
 * opts.demora:     fuerza (true/false) la demora en hub; undefined => se sortea
 * opts.detenerEn:  'INGRESADO_HUB' => el paquete queda detenido en el hub
 */
export function planificarEnvio(rng, cfg, { id, creadoSim, resultados, demora, detenerEn }) {
  const zona = pick(rng, cfg.zonas);
  const repartidorId = `REP-${String(1 + Math.floor(rng() * cfg.repartidores)).padStart(3, '0')}`;
  const hayDemora = demora ?? rng() < cfg.probDemoraHub;
  const eventos = [];
  let t = creadoSim;
  let seq = 0;
  const comun = { shipmentId: id, hubId: zona.hub, zonaId: zona.id, version: 1 };

  // Promesa de entrega: 24 h simuladas desde la creación.
  eventos.push({
    simMs: creadoSim,
    topic: TOPICS.PROMESAS,
    value: {
      ...comun, eventId: `${id}-p`, tipo: 'PROMESA_DEFINIDA', secuencia: 0, repartidorId: null,
      ocurridoEn: new Date(creadoSim).toISOString(), venceEn: new Date(creadoSim + 24 * H).toISOString(),
    },
  });

  const emitir = (tipo, offsetMs, extra = {}, conRepartidor = true) => {
    t += offsetMs;
    seq += 1;
    eventos.push({
      simMs: t,
      topic: TOPICS.ESTADOS,
      value: {
        ...comun, eventId: `${id}-e${seq}`, tipo, secuencia: seq, ocurridoEn: new Date(t).toISOString(),
        repartidorId: conRepartidor ? repartidorId : null, ...extra,
      },
    });
  };

  emitir('CREADO', 0, {}, false);
  emitir('INGRESADO_HUB', H + (hayDemora ? 15 * H : 0), {}, false);
  if (detenerEn === 'INGRESADO_HUB') return { zona, eventos };
  emitir('CLASIFICADO', H);

  for (let intento = 0; intento < 3; intento++) {
    emitir('EN_REPARTO', 2 * H);
    const forzado = resultados?.[intento];
    const falla = forzado !== undefined ? forzado !== 'OK' : rng() < zona.fallo;
    if (!falla) { emitir('ENTREGADO', 3 * H); break; }
    const motivo = forzado && forzado !== 'OK' ? forzado : weighted(rng, cfg.motivos);
    emitir('ENTREGA_FALLIDA', 3 * H, { motivo });
    if (motivo !== 'AUSENTE' || intento === 2) break; // dirección/rechazo/tercer fallo: sale del circuito
    emitir('CLASIFICADO', 24 * H); // reprogramado: vuelve al circuito al día siguiente
  }
  return { zona, eventos };
}
