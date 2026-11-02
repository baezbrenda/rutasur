import { createKafka, createProducer, runConsumer, connectMongo, ensureIndexes, yaProcesado, marcarProcesado, TOPICS, EstadoSchema, log } from '@rutasur/shared';
import { armarAviso } from './logic.js';

const SERVICE = 'notificaciones';
const { client, db } = await connectMongo();
await ensureIndexes(db);

const kafka = createKafka(SERVICE);
const producer = createProducer(kafka);
await producer.connect();

async function handler({ evento }) {
  if (evento.tipo !== 'ENTREGA_FALLIDA') return 'ignorado';

  const clave = `${evento.shipmentId}:${evento.secuencia}`;
  if (await yaProcesado(db, SERVICE, clave)) return 'duplicado';

  const aviso = armarAviso(evento);
  await producer.send({ topic: TOPICS.NOTIFICACIONES, messages: [{ key: aviso.shipmentId, value: JSON.stringify(aviso) }] });
  await marcarProcesado(db, SERVICE, clave);
  return 'emitido';
}

// FASE 3 sumará alertas.sla a los topics de este servicio.
const { stop } = await runConsumer({
  kafka, service: SERVICE, groupId: 'notificaciones', dlqProducer: producer, handler,
  topics: [TOPICS.ESTADOS],
  schemas: { [TOPICS.ESTADOS]: EstadoSchema },
});
log(SERVICE, { listo: true });

const apagar = async () => { await stop(); await producer.disconnect(); await client.close(); process.exit(0); };
process.on('SIGTERM', apagar);
process.on('SIGINT', apagar);
