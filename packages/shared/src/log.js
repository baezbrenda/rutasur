// Log estructurado en una línea JSON: sirve para observabilidad (eventId, partición, offset).
export function log(service, data) {
  console.log(JSON.stringify({ t: new Date().toISOString(), service, ...data }));
}
