const num = (k, d) => (process.env[k] !== undefined ? Number(process.env[k]) : d);

export const config = {
  enviosPorMinuto: num('ENVIOS_POR_MINUTO', 20),
  factor: num('FACTOR_ACELERACION', 120), // 1 h simulada = 30 s reales
  seed: num('SEED', 42),
  simStart: process.env.SIM_START ?? '2026-03-02T09:00:00.000Z',
  probDemoraHub: num('PROB_DEMORA_HUB', 0.1),
  probDuplicado: num('PROB_DUPLICADO', 0.02),
  probRezagado: num('PROB_FUERA_DE_ORDEN', 0.02),
  probMalformado: num('PROB_MALFORMADO', 0.01),
  repartidores: 120,
  puerto: num('SIM_PORT', 4000),
  motivos: [['AUSENTE', 60], ['DIRECCION_INCORRECTA', 20], ['RECHAZADO', 15], ['ZONA_INACCESIBLE', 5]],
  zonas: [
    { id: 'Z1', hub: 'HUB-NORTE', fallo: 0.05 },
    { id: 'Z2', hub: 'HUB-NORTE', fallo: 0.12 },
    { id: 'Z3', hub: 'HUB-CENTRO', fallo: 0.18 },
    { id: 'Z4', hub: 'HUB-CENTRO', fallo: 0.08 },
    { id: 'Z5', hub: 'HUB-SUR', fallo: 0.3 },
    { id: 'Z6', hub: 'HUB-SUR', fallo: 0.22 },
  ],
};
