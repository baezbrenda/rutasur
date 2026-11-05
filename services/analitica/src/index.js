import { createKafka, runConsumer, connectMongo, ensureIndexes, TOPICS, EstadoSchema, log } from '@rutasur/shared';
import { procesarEventoAnalitica } from './logic.js';

const SERVICE = 'analitica';

const { client, db } = await connectMongo();
await ensureIndexes(db);
const colMetricas = db.collection('metricas_diarias');

const kafka = createKafka(SERVICE);

async function handler({ evento, topic }) {
  if (topic !== TOPICS.ESTADOS) return 'descartado';
  
  await procesarEventoAnalitica(colMetricas, evento);
  log(SERVICE, { procesado: evento.tipo, shipmentId: evento.shipmentId });
  return 'aplicado';
}

const { stop } = await runConsumer({
  kafka, service: SERVICE, groupId: 'analitica', dlqProducer: null, handler,
  topics: [TOPICS.ESTADOS],
  schemas: { [TOPICS.ESTADOS]: EstadoSchema },
});

log(SERVICE, { listo: true });

const apagar = async () => { await stop(); await client.close(); process.exit(0); };
process.on('SIGTERM', apagar);
process.on('SIGINT', apagar);