import { createKafka, createProducer, runConsumer, connectMongo, ensureIndexes, yaProcesado, marcarProcesado, TOPICS, EstadoSchema, AlertaSchema, log } from '@rutasur/shared';
import { armarAviso, armarAvisoAlerta } from './logic.js';

const SERVICE = 'notificaciones';
const { client, db } = await connectMongo();
await ensureIndexes(db);

const kafka = createKafka(SERVICE);
const producer = createProducer(kafka);
await producer.connect();

async function handler({ evento, topic }) {
  let clave, aviso;
  if (topic === TOPICS.ALERTAS) {
    if (evento.tipo !== 'ALERTA_ABIERTA') return 'ignorado';
    clave = evento.eventId;
    aviso = armarAvisoAlerta(evento);
  } else {
    if (evento.tipo !== 'ENTREGA_FALLIDA') return 'ignorado';
    clave = `${evento.shipmentId}:${evento.secuencia}`;
    aviso = armarAviso(evento);
  }

  if (await yaProcesado(db, SERVICE, clave)) return 'duplicado';
  await producer.send({ topic: TOPICS.NOTIFICACIONES, messages: [{ key: aviso.shipmentId, value: JSON.stringify(aviso) }] });
  await marcarProcesado(db, SERVICE, clave);
  return 'emitido';
}

const { stop } = await runConsumer({
  kafka, service: SERVICE, groupId: 'notificaciones', dlqProducer: producer, handler,
  topics: [TOPICS.ESTADOS, TOPICS.ALERTAS],
  schemas: { [TOPICS.ESTADOS]: EstadoSchema, [TOPICS.ALERTAS]: AlertaSchema },
});
log(SERVICE, { listo: true });

const apagar = async () => { await stop(); await producer.disconnect(); await client.close(); process.exit(0); };
process.on('SIGTERM', apagar);
process.on('SIGINT', apagar);
