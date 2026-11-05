import { createKafka, createProducer, runConsumer, connectMongo, ensureIndexes, TOPICS, EstadoSchema, PromesaSchema, ReprogramacionSchema, NotificacionSchema, AlertaSchema, log } from '@rutasur/shared';
import { planificarEstado, planificarReprogramacion, planificarAlerta } from './logic.js';

const SERVICE = 'proyector';
const { client, db } = await connectMongo();
await ensureIndexes(db);

const envios = db.collection('envios');
const notificaciones = db.collection('notificaciones');
const alertas = db.collection('alertas');
const procesados = db.collection('eventos_procesados');

// Idempotencia + escritura en una sola transacción (MongoDB corre como replica set):
// o se aplica el evento Y se marca como procesado, o no pasa nada.
async function aplicar(ev, topic, session) {
  const ya = await procesados.findOne({ consumidor: SERVICE, eventId: ev.eventId }, { session });
  if (ya) return 'duplicado';

  let resultado = 'aplicado';
  switch (topic) {
    case TOPICS.PROMESAS:
      await envios.updateOne({ shipmentId: ev.shipmentId }, { $set: { promesa: { venceEn: new Date(ev.venceEn) } } }, { upsert: true, session });
      break;
    case TOPICS.ESTADOS: {
      const doc = await envios.findOne({ shipmentId: ev.shipmentId }, { session, projection: { ultimaSecuencia: 1 } });
      const plan = planificarEstado(doc, ev);
      if (plan.accion === 'descartar') resultado = plan.razon;
      else await envios.updateOne({ shipmentId: ev.shipmentId }, plan.update, { upsert: true, session });
      break;
    }
    case TOPICS.REPROGRAMACIONES:
      await envios.updateOne({ shipmentId: ev.shipmentId }, planificarReprogramacion(ev), { upsert: true, session });
      break;
    case TOPICS.ALERTAS:
      await alertas.updateOne({ shipmentId: ev.shipmentId, regla: ev.regla }, planificarAlerta(ev), { upsert: ev.tipo === 'ALERTA_ABIERTA', session });
      break;
    case TOPICS.NOTIFICACIONES: {
      const { ocurridoEn, ...resto } = ev;
      await notificaciones.updateOne({ eventId: ev.eventId }, { $setOnInsert: { ...resto, enviadaEn: new Date(ocurridoEn) } }, { upsert: true, session });
      break;
    }
  }
  await procesados.insertOne({ consumidor: SERVICE, eventId: ev.eventId, createdAt: new Date() }, { session });
  return resultado;
}

async function handler({ evento, topic }) {
  const session = client.startSession();
  try {
    let resultado;
    await session.withTransaction(async () => { resultado = await aplicar(evento, topic, session); });
    return resultado;
  } finally {
    await session.endSession();
  }
}

const kafka = createKafka(SERVICE);
const dlqProducer = createProducer(kafka);
await dlqProducer.connect();

// Consume los 5 topics que alimentan las vistas de lectura.
const { stop } = await runConsumer({
  kafka, service: SERVICE, groupId: 'proyector', dlqProducer, handler,
  topics: [TOPICS.ESTADOS, TOPICS.PROMESAS, TOPICS.REPROGRAMACIONES, TOPICS.NOTIFICACIONES, TOPICS.ALERTAS],
  schemas: {
    [TOPICS.ESTADOS]: EstadoSchema,
    [TOPICS.PROMESAS]: PromesaSchema,
    [TOPICS.REPROGRAMACIONES]: ReprogramacionSchema,
    [TOPICS.NOTIFICACIONES]: NotificacionSchema,
    [TOPICS.ALERTAS]: AlertaSchema,
  },
});
log(SERVICE, { listo: true });

const apagar = async () => { await stop(); await dlqProducer.disconnect(); await client.close(); process.exit(0); };
process.on('SIGTERM', apagar);
process.on('SIGINT', apagar);
