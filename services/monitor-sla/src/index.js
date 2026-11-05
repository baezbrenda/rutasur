import { createKafka, createProducer, runConsumer, connectMongo, ensureIndexes, TOPICS, EstadoSchema, PromesaSchema, log } from '@rutasur/shared';
import { nuevoEstado, aplicarEstado, aplicarPromesa, reglasQueAplican, armarAlerta } from './logic.js';

const SERVICE = 'monitor-sla';
const BARRIDO_MS = Number(process.env.BARRIDO_MS ?? 5000); // barrido periódico de todos los envíos abiertos

const { client, db } = await connectMongo();
await ensureIndexes(db);
const colEstado = db.collection('monitor_sla_estado');
const colMeta = db.collection('monitor_sla_meta');

// ---- Estado en memoria con respaldo en MongoDB (tolera reinicios) ----
const estados = new Map();
for await (const { _id, ...st } of colEstado.find()) estados.set(st.shipmentId, st);
let reloj = (await colMeta.findOne({ _id: 'reloj' }))?.simNow ?? 0; // reloj SIMULADO = mayor ocurridoEn visto
log(SERVICE, { arranque: true, enviosEnMemoria: estados.size, reloj: reloj ? new Date(reloj).toISOString() : null });

const persistir = (st) => colEstado.replaceOne({ shipmentId: st.shipmentId }, st, { upsert: true });

const kafka = createKafka(SERVICE);
const producer = createProducer(kafka);
await producer.connect();

const publicar = (alerta) =>
  producer.send({ topic: TOPICS.ALERTAS, messages: [{ key: alerta.shipmentId, value: JSON.stringify(alerta) }] });

// Evento y barrido comparten estado: se serializan para no emitir una alerta dos veces.
let cadena = Promise.resolve();
const exclusivo = (fn) => { const p = cadena.then(fn); cadena = p.catch(() => {}); return p; };

async function evaluar(st) {
  for (const r of reglasQueAplican(st, reloj)) {
    await publicar(armarAlerta(st, r, 'ALERTA_ABIERTA', reloj)); // 1) publicar (eventId determinístico)
    st.alertas[r.regla] = 'ABIERTA';
    await persistir(st);                                          // 2) recordar que ya se alertó
    log(SERVICE, { alerta: r.regla, prioridad: r.prioridad, shipmentId: st.shipmentId, reloj: new Date(reloj).toISOString() });
  }
}

async function cerrar(st) {
  for (const [regla, estado] of Object.entries(st.alertas)) {
    if (estado !== 'ABIERTA') continue;
    const base = { regla, prioridad: 'MEDIA', causa: 'Envío entregado' };
    await publicar(armarAlerta(st, base, 'ALERTA_CERRADA', reloj));
    st.alertas[regla] = 'CERRADA';
    await persistir(st);
    log(SERVICE, { cierre: regla, shipmentId: st.shipmentId });
  }
}

function handler({ evento, topic }) {
  return exclusivo(async () => {
    reloj = Math.max(reloj, Date.parse(evento.ocurridoEn));
    let st = estados.get(evento.shipmentId) ?? nuevoEstado(evento.shipmentId);
    let cambio = true;
    if (topic === TOPICS.PROMESAS) st = aplicarPromesa(st, evento);
    else ({ st, cambio } = aplicarEstado(st, evento));
    estados.set(evento.shipmentId, st);
    if (cambio) await persistir(st);
    if (st.cerrado) await cerrar(st);
    else await evaluar(st);
    return cambio ? 'aplicado' : 'descartado';
  });
}

// Barrido periódico: las alertas nacen de la AUSENCIA de eventos, no de un evento.
let ultimoBarrido = 0;
setInterval(() => {
  if (reloj === ultimoBarrido) return; // el reloj simulado no avanzó
  exclusivo(async () => {
    for (const st of estados.values()) {
      if (st.cerrado || st.alertas.VENCIDO) continue;
      await evaluar(st);
    }
    ultimoBarrido = reloj;
    await colMeta.updateOne({ _id: 'reloj' }, { $set: { simNow: reloj } }, { upsert: true });
  }).catch((e) => log(SERVICE, { error: e.message }));
}, BARRIDO_MS);

const { stop } = await runConsumer({
  kafka, service: SERVICE, groupId: 'monitor-sla', dlqProducer: producer, handler,
  topics: [TOPICS.ESTADOS, TOPICS.PROMESAS],
  schemas: { [TOPICS.ESTADOS]: EstadoSchema, [TOPICS.PROMESAS]: PromesaSchema },
});
log(SERVICE, { listo: true });

const apagar = async () => { await stop(); await producer.disconnect(); await client.close(); process.exit(0); };
process.on('SIGTERM', apagar);
process.on('SIGINT', apagar);
