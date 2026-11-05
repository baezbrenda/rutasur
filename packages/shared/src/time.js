// Zona horaria fija UTC-3 (Argentina/Uruguay). Todo el sistema trabaja con tiempo SIMULADO que viaja en los eventos.
const OFFSET_MS = -3 * 3600_000;
const local = (iso) => new Date(Date.parse(iso) + OFFSET_MS); // usar getUTC* sobre el resultado

export function franjaDe(iso) {
  return local(iso).getUTCHours() < 13 ? 'MANANA' : 'TARDE';
}

// Próximo día hábil (lunes a viernes) a las 9:00 (MANANA) o 15:00 (TARDE), hora local. Devuelve ISO en UTC.
export function proximoDiaHabil(iso, franja) {
  const l = local(iso);
  let dia = Date.UTC(l.getUTCFullYear(), l.getUTCMonth(), l.getUTCDate() + 1);
  while ([0, 6].includes(new Date(dia).getUTCDay())) dia += 86400_000;
  const hora = franja === 'MANANA' ? 9 : 15;
  return new Date(dia + hora * 3600_000 - OFFSET_MS).toISOString();
}

// Día calendario local (YYYY-MM-DD) de un instante (ms o ISO).
export function diaLocal(x) {
  const ms = typeof x === 'number' ? x : Date.parse(x);
  return new Date(ms + OFFSET_MS).toISOString().slice(0, 10);
}
