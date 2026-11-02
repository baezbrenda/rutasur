import { Kafka, Partitioners, logLevel } from 'kafkajs';

export function createKafka(clientId) {
  const brokers = (process.env.KAFKA_BROKERS ?? 'localhost:29092').split(',');
  return new Kafka({ clientId, brokers, logLevel: logLevel.WARN, retry: { retries: 15 } });
}

export function createProducer(kafka) {
  return kafka.producer({ createPartitioner: Partitioners.DefaultPartitioner, allowAutoTopicCreation: false });
}
