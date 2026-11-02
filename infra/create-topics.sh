#!/bin/bash
set -e
KT=/opt/kafka/bin/kafka-topics.sh
BS=kafka:9092
D30=2592000000
D7=604800000
crear() { $KT --bootstrap-server $BS --create --if-not-exists --topic "$1" --partitions 3 --replication-factor 1 "${@:2}"; }

crear envios.estados            --config retention.ms=$D30
crear envios.promesas           --config cleanup.policy=compact
crear envios.reprogramaciones   --config retention.ms=$D30
crear alertas.sla               --config retention.ms=$D7
crear notificaciones.enviadas   --config retention.ms=$D7
crear envios.estados.dlq        --config retention.ms=$D30
echo "Topics listos"
