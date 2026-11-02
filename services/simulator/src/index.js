import http from 'node:http';
import { createKafka, createProducer, TOPICS, log } from '@rutasur/shared';
import { config as cfg } from './config.js';
import { mulberry32 } from './rng.js';
import { planificarEnvio } from './plan.js';

const SERVICE = 'simulator';
const rngPlan = mulberry32(cfg.seed);       // decide el contenido de los envíos
const rngRuido = mulberry32(cfg.seed + 1);  // decide duplicados / rezagados / malformados

const realStart = Date.now();
const simStartMs = Date.parse(cfg.simStart);
const simNow = () => simStartMs + (Date.now() - realStart) * cfg.factor;

// Cola ordenada de mayor a menor simMs: se extrae con pop() desde el final.
const cola = [];
function encolar(items) {
  for (const it of items) {
    let lo = 0, hi = cola.length;
    while (lo < hi) { const mid = (lo + hi) >> 1; if (cola[mid].simMs > it.simMs) lo = mid + 1; else hi = mid; }
    cola.splice(lo, 0, it);
  }
}

let contador = 0;
function crearEnvio(opts = {}) {
  const id = `RS-${String(++contador).padStart(6, '0')}`;
  const { eventos } = planificarEnvio(rngPlan, cfg, { id, creadoSim: simNow(), ...opts });
  encolar(eventos);
  return id;
}

const kafka = createKafka(SERVICE);
const producer = createProducer(kafka);
await producer.connect();

const ultimoPorEnvio = new Map();
const msg = (value) => ({ key: value.shipmentId ?? null, value: JSON.stringify(value) });

function malformar(ev) {
  const copia = { ...ev, eventId: `${ev.eventId}-x` };
  const variante = Math.floor(rngRuido() * 3);
  if (variante === 0) delete copia.tipo;
  else if (variante === 1) copia.tipo = 'TELETRANSPORTADO';
  else copia.secuencia = 'uno';
  return copia;
}

async function publicar(items) {
  const porTopic = new Map();
  const add = (topic, m) => { if (!porTopic.has(topic)) porTopic.set(topic, []); porTopic.get(topic).push(m); };
  for (const { topic, value } of items) {
    add(topic, msg(value));
    if (topic !== TOPICS.ESTADOS) continue;
    if (rngRuido() < cfg.probDuplicado) add(topic, msg(value));                       // duplicado exacto
    if (rngRuido() < cfg.probMalformado) add(topic, msg(malformar(value)));           // evento inválido (a la DLQ)
    const previo = ultimoPorEnvio.get(value.shipmentId);
    if (previo && rngRuido() < cfg.probRezagado) add(topic, msg({ ...previo, eventId: `${previo.eventId}-r` })); // llega tarde: secuencia vieja
    ultimoPorEnvio.set(value.shipmentId, value);
  }
  await producer.sendBatch({ topicMessages: [...porTopic].map(([topic, messages]) => ({ topic, messages })) });
}

let ocupado = false;
setInterval(async () => {
  if (ocupado) return;
  ocupado = true;
  try {
    const ahora = simNow();
    const lote = [];
    while (cola.length && cola[cola.length - 1].simMs <= ahora) lote.push(cola.pop());
    if (lote.length) await publicar(lote);
  } catch (e) {
    log(SERVICE, { error: e.message });
  } finally { ocupado = false; }
}, 100);

setInterval(() => crearEnvio(), 60_000 / cfg.enviosPorMinuto);

// ---- Escenarios a pedido (panel de demo) ----
const escenarios = {
  feliz: () => [crearEnvio({ resultados: ['OK'], demora: false })],
  ausente: () => [crearEnvio({ resultados: ['AUSENTE', 'OK'], demora: false })],
  demorado: () => [crearEnvio({ detenerEn: 'INGRESADO_HUB', demora: false })],
  'tercer-fallo': () => [crearEnvio({ resultados: ['AUSENTE', 'AUSENTE', 'AUSENTE'], demora: false })],
  direccion: () => [crearEnvio({ resultados: ['DIRECCION_INCORRECTA'], demora: false })],
  rechazado: () => [crearEnvio({ resultados: ['RECHAZADO'], demora: false })],
  rafaga: () => Array.from({ length: 500 }, () => crearEnvio()),
};

const server = http.createServer((req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
  const json = (code, body) => { res.writeHead(code, { 'Content-Type': 'application/json' }); res.end(JSON.stringify(body)); };
  if (req.method === 'OPTIONS') return json(204, {});
  const url = new URL(req.url, 'http://x');
  if (req.method === 'GET' && url.pathname === '/health') return json(200, { ok: true });
  if (req.method === 'GET' && url.pathname === '/config') return json(200, { ...cfg, simNow: new Date(simNow()).toISOString(), pendientes: cola.length });
  const m = url.pathname.match(/^\/escenarios\/([\w-]+)$/);
  if (req.method === 'POST' && m && escenarios[m[1]]) {
    const ids = escenarios[m[1]]();
    log(SERVICE, { escenario: m[1], envios: ids.length });
    return json(202, { escenario: m[1], shipmentIds: ids.slice(0, 5), total: ids.length });
  }
  json(404, { error: 'no encontrado', escenarios: Object.keys(escenarios) });
});
server.listen(cfg.puerto, () => log(SERVICE, { listo: true, puerto: cfg.puerto, factor: cfg.factor, seed: cfg.seed }));

process.on('SIGTERM', async () => { await producer.disconnect(); process.exit(0); });
