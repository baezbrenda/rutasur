import { MongoClient } from 'mongodb';

export async function connectMongo() {
  const uri = process.env.MONGO_URI ?? 'mongodb://localhost:27017/?replicaSet=rs0&directConnection=true';
  const client = new MongoClient(uri);
  await client.connect();
  return { client, db: client.db(process.env.MONGO_DB ?? 'rutasur') };
}

// Índices definidos en el modelo de datos de la especificación.
export async function ensureIndexes(db) {
  await db.collection('envios').createIndexes([
    { key: { shipmentId: 1 }, unique: true },
    { key: { estado: 1, zonaId: 1 } },
    { key: { 'promesa.venceEn': 1 } },
  ]);
  await db.collection('alertas').createIndexes([
    { key: { estado: 1, prioridad: 1 } },
    { key: { shipmentId: 1 } },
    { key: { shipmentId: 1, regla: 1 }, unique: true },
  ]);
  await db.collection('notificaciones').createIndexes([
    { key: { shipmentId: 1 } },
    { key: { eventId: 1 }, unique: true },
  ]);
  // Estado propio del monitor de SLA (respaldo del estado en memoria).
  await db.collection('monitor_sla_estado').createIndex({ shipmentId: 1 }, { unique: true });
  // Estado propio del servicio de reprogramación: fallos ya contados por envío.
  await db.collection('reprogramacion_estado').createIndex({ shipmentId: 1 }, { unique: true });
  await db.collection('metricas_diarias').createIndex({ fecha: 1, zonaId: 1, franja: 1 }, { unique: true });
  await db.collection('eventos_procesados').createIndexes([
    { key: { consumidor: 1, eventId: 1 }, unique: true },
    { key: { createdAt: 1 }, expireAfterSeconds: 7 * 24 * 3600 },
  ]);
}
