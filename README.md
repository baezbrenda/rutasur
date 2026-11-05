# RutaSur – Logística orientada a eventos

TP de Programación Avanzada 2026 (FCyT). Plataforma de seguimiento de envíos en tiempo real con
Kafka + Node.js + MongoDB + Next.js, todo en local con Docker Compose.

## Arranque

```bash
docker compose up --build      # o: npm run up
```

Requiere Docker. Para tests locales: `npm install && npm test` (Node 20+).

## Estructura

```
infra/                 script de creación de topics
packages/shared/       topics, esquemas (zod), consumidor genérico, Mongo
services/simulator/    genera eventos + API de escenarios (puerto 4000)
services/projector/    CU1: mantiene `envios`, `notificaciones` (y más adelante `alertas`)
services/notificaciones/  CU2: registra el aviso al destinatario ante ENTREGA_FALLIDA
services/reprogramacion/  CU2: decide el próximo intento según el motivo
services/monitor-sla/     CU3: evalúa las 4 reglas de SLA con el reloj simulado y emite alertas
(próximas fases: analitica, web)
```

## Estado

- [x] Fase 1: infraestructura, shared, simulador, proyector (CU1)
- [x] Fase 2: notificaciones + reprogramación (CU2)
- [x] Fase 3: monitor de SLA (CU3)
- [ ] Fase 4: analítica + reprocesamiento (CU4)
- [ ] Fase 5: Next.js (torre de control, tracking, analítica, demo)

## Probar la fase 1

```bash
curl -X POST localhost:4001/escenarios/feliz        # devuelve el shipmentId
curl -X POST localhost:4001/escenarios/ausente        # también: direccion, rechazado, tercer-fallo, demorado, fallo-dia-limite
curl -X POST localhost:4001/escenarios/rafaga
curl localhost:4001/config                          # reloj simulado y pendientes

# Ver el documento proyectado
docker compose exec mongo mongosh rutasur --eval 'db.envios.findOne({shipmentId:"RS-000001"})'
# Ver la DLQ
docker compose exec kafka /opt/kafka/bin/kafka-console-consumer.sh --bootstrap-server kafka:9092 --topic envios.estados.dlq --from-beginning --max-messages 3
# Lag de cada grupo
npm run lag
```

## Decisiones clave

- **At-least-once + idempotencia**: commit manual del offset después de escribir en Mongo; el
  proyector aplica el evento y registra `eventos_procesados` en una *misma transacción*.
- **Orden**: clave de partición = `shipmentId`; además se descarta `secuencia <= ultimaSecuencia`.
- **Reloj simulado**: `ocurridoEn` viaja en los eventos (1 h simulada = 30 s). Los servicios con
  lógica temporal usan ese reloj, no el de la máquina.
- **Ruido del simulador** (semilla fija): duplicados (mismo `eventId`), rezagados (copia de un
  evento anterior con `secuencia` vieja) y malformados (copia rota extra, va a la DLQ).
- El proyector también consume `envios.promesas` para completar `promesa.venceEn` en `envios`.

## CU2: entrega fallida (fase 2)

Un `ENTREGA_FALLIDA` es consumido en paralelo por tres grupos que no se conocen entre sí
(`notificaciones`, `reprogramacion` y, cuando exista, `analitica`). El proyector refleja los resultados.

| Motivo | Resultado |
|---|---|
| AUSENTE | `REPROGRAMADO`: día hábil siguiente, franja opuesta |
| DIRECCION_INCORRECTA | `RETENIDO` |
| RECHAZADO | `DEVOLUCION` |
| 3.er fallo (cualquiera) | `DEVOLUCION` |
| ZONA_INACCESIBLE | `RETENIDO` (la spec no define regla; supuesto a confirmar) |

**Exactamente una notificación y una reprogramación:** los eventos de salida tienen `eventId`
determinístico (`<envío>-s<secuencia>-rep|notif`) y los servicios deduplican por clave de negocio
(`shipmentId:secuencia`), así un evento duplicado o rezagado no genera un segundo aviso. El servicio
publica *antes* de marcar como procesado: si se cae en el medio republica el mismo `eventId` y el
proyector lo descarta.

Ver el resultado de un envío:

```bash
docker compose exec mongo mongosh rutasur --quiet --eval 'printjson(db.envios.findOne({shipmentId:"RS-000001"},{_id:0,estado:1,disposicion:1,proximoIntento:1,reprogramaciones:1}))'
docker compose exec mongo mongosh rutasur --quiet --eval 'printjson(db.notificaciones.find({shipmentId:"RS-000001"}).toArray())'
```

## Corridas limpias

El log de Kafka es la fuente de verdad y MongoDB solo guarda vistas derivadas. Como el simulador usa
semilla fija, cada arranque repite los mismos `eventId`; si MongoDB conserva datos de una corrida
anterior, el proyector los descarta como duplicados. Para empezar de cero **siempre**:

```bash
docker compose down -v && docker compose up --build
```

## CU3: riesgo de SLA (fase 3)

El monitor (`monitor-sla`) cruza `envios.estados` con `envios.promesas` y emite a `alertas.sla`.

| Regla | Condición | Prioridad |
|---|---|---|
| SIN_INGRESO | faltan < 10 h y no ingresó al hub | Media |
| SIN_SALIDA | faltan < 4 h y no está en reparto | Alta |
| FALLO_DIA_LIMITE | ENTREGA_FALLIDA y la promesa vence hoy | Alta |
| VENCIDO | pasó el vencimiento sin ENTREGADO | Crítica |

- **Reloj simulado:** el monitor usa el mayor `ocurridoEn` visto (no el reloj de la máquina). Si el
  simulador se detiene, el tiempo del monitor también.
- **Evaluación:** al recibir cada evento y, además, con un barrido periódico de todos los envíos abiertos
  (`BARRIDO_MS`, 5 s reales por defecto ≈ 10 min simulados; la spec dice "cada minuto").
- **Sin repetición:** cada regla se alerta una sola vez por envío (`alertas` en su estado interno).
- **Cierre:** al llegar ENTREGADO emite `ALERTA_CERRADA` por cada alerta abierta.
- **Reinicios:** el estado por envío y el reloj se respaldan en `monitor_sla_estado` / `monitor_sla_meta`.
  Las alertas tienen `eventId` determinístico (`<envío>-<regla>`): si se reemite tras un reinicio, el proyector la descarta.
- El proyector las escribe en `alertas` (clave `shipmentId + regla`) y `notificaciones` suma un
  `AVISO_RETRASO` (tipo distinto del aviso por fallo) por cada alerta abierta.

Probar las reglas:

```bash
curl -X POST localhost:4001/escenarios/demorado           # SIN_SALIDA (alta) ~10 min, luego VENCIDO
curl -X POST localhost:4001/escenarios/fallo-dia-limite   # dispara las 4 reglas en ~4 min
docker compose exec mongo mongosh rutasur --quiet --eval 'printjson(db.alertas.find({shipmentId:"RS-XXXXXX"},{_id:0,regla:1,prioridad:1,estado:1}).toArray())'
```
