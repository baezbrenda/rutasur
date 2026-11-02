import { TOPICS } from './topics.js';
import { log } from './log.js';

/**
 * Consumidor genérico: at-least-once con commit MANUAL después de procesar.
 * - Valida el esquema; si falla, manda el mensaje a la DLQ y sigue.
 * - Si el handler lanza una excepción NO se confirma el offset: el mensaje se reintenta.
 * - Cada mensaje se registra con eventId, partición y offset.
 */
export async function runConsumer({ kafka, service, groupId, topics, fromBeginning = false, schemas = {}, dlqProducer, handler }) {
  const consumer = kafka.consumer({ groupId });
  await consumer.connect();
  for (const topic of topics) await consumer.subscribe({ topic, fromBeginning });

  await consumer.run({
    autoCommit: false,
    eachMessage: async ({ topic, partition, message }) => {
      const offset = message.offset;
      const raw = message.value?.toString() ?? '';
      const base = { grupo: groupId, topic, partition, offset };

      let evento = null;
      let motivo = null;
      try {
        evento = JSON.parse(raw);
      } catch {
        motivo = 'JSON inválido';
      }
      if (!motivo && schemas[topic]) {
        const r = schemas[topic].safeParse(evento);
        if (r.success) evento = r.data;
        else motivo = r.error.issues.map((i) => `${i.path.join('.') || '(raíz)'}: ${i.message}`).join('; ');
      }

      if (motivo) {
        await dlqProducer.send({
          topic: TOPICS.DLQ,
          messages: [{
            key: message.key?.toString() ?? null,
            value: JSON.stringify({ motivo, origen: base, payload: raw, recibidoEn: new Date().toISOString() }),
          }],
        });
        log(service, { ...base, eventId: evento?.eventId ?? null, resultado: 'dlq', motivo });
      } else {
        const resultado = await handler({ evento, topic, partition, offset, timestamp: message.timestamp });
        log(service, { ...base, eventId: evento.eventId, shipmentId: evento.shipmentId, resultado: resultado ?? 'ok' });
      }

      // Commit manual DESPUÉS de escribir en MongoDB (o en la DLQ).
      await consumer.commitOffsets([{ topic, partition, offset: (BigInt(offset) + 1n).toString() }]);
    },
  });

  return { consumer, stop: () => consumer.disconnect() };
}
