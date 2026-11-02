import { createKafka, createProducer, runConsumer, connectMongo, ensureIndexes, yaProcesado, marcarProcesado, TOPICS, EstadoSchema, log } from '@rutasur/shared';
import { decidirReprogramacion } from './logic.js';

const SERVICE = 'reprogramacion';
const { client, db } = await connectMongo();
await ensureIndexes(db);
const estado = db.collection('reprogramacion_estado'); // estado propio: secuencias de los fallos vistos por envío

const kafka = createKafka(SERVICE);
const producer = createProducer(kafka);
await producer.connect();

async function handler({ evento }) {
  if (evento.tipo !== 'ENTREGA_FALLIDA') return 'ignorado';

  const clave = `${evento.shipmentId}:${evento.secuencia}`;
  if (await yaProcesado(db, SERVICE, clave)) return 'duplicado';

  // $addToSet es idempotente. El número de intento = cuántos fallos hay con secuencia <= a esta,
  // así el resultado es el mismo aunque se reprocese el histórico.
  const doc = await estado.findOneAndUpdate(
    { shipmentId: evento.shipmentId },
    { $addToSet: { secuencias: evento.secuencia } },
    { upsert: true, returnDocument: 'after' },
  );
  const nro = doc.secuencias.filter((s) => s <= evento.secuencia).length;

  const decision = decidirReprogramacion({ motivo: evento.motivo, nro, ocurridoEn: evento.ocurridoEn });
  const salida = {
    eventId: `${evento.shipmentId}-s${evento.secuencia}-rep`, // determinístico: si se reintenta, el proyector lo descarta
    shipmentId: evento.shipmentId,
    motivo: evento.motivo,
    intentosFallidos: nro,
    ocurridoEn: evento.ocurridoEn,
    hubId: evento.hubId,
    zonaId: evento.zonaId,
    version: 1,
    ...decision,
  };

  // Orden: publicar -> marcar. Si se cae entre medio, se republica el MISMO eventId (at-least-once + idempotencia aguas abajo).
  await producer.send({ topic: TOPICS.REPROGRAMACIONES, messages: [{ key: salida.shipmentId, value: JSON.stringify(salida) }] });
  await marcarProcesado(db, SERVICE, clave);
  return `emitido:${decision.tipo}`;
}

const { stop } = await runConsumer({
  kafka, service: SERVICE, groupId: 'reprogramacion', dlqProducer: producer, handler,
  topics: [TOPICS.ESTADOS],
  schemas: { [TOPICS.ESTADOS]: EstadoSchema },
});
log(SERVICE, { listo: true });

const apagar = async () => { await stop(); await producer.disconnect(); await client.close(); process.exit(0); };
process.on('SIGTERM', apagar);
process.on('SIGINT', apagar);
