/**
 * Lógica pura del proyector (sin I/O, fácil de testear).
 * Dado el documento actual del envío y un evento de estado, decide qué hacer.
 */
export function planificarEstado(doc, ev) {
  if (doc && doc.ultimaSecuencia !== undefined && ev.secuencia <= doc.ultimaSecuencia) {
    return { accion: 'descartar', razon: 'fuera_de_orden' };
  }
  const ocurridoEn = new Date(ev.ocurridoEn);
  const entrada = { eventId: ev.eventId, tipo: ev.tipo, secuencia: ev.secuencia, ocurridoEn };
  if (ev.motivo) entrada.motivo = ev.motivo;

  const $set = {
    estado: ev.tipo,
    ultimaSecuencia: ev.secuencia,
    hubId: ev.hubId,
    zonaId: ev.zonaId,
    repartidorId: ev.repartidorId,
    ultimoEventoEn: ocurridoEn,
    actualizadoEn: new Date(),
  };
  if (ev.motivo) $set.ultimoMotivo = ev.motivo;

  const update = {
    $set,
    $push: { historial: entrada },
    $inc: { intentos: ev.tipo === 'EN_REPARTO' ? 1 : 0, intentosFallidos: ev.tipo === 'ENTREGA_FALLIDA' ? 1 : 0 },
  };
  // Al salir a reparto o entregarse, el "próximo intento" programado ya no aplica.
  if (ev.tipo === 'EN_REPARTO' || ev.tipo === 'ENTREGADO') update.$unset = { proximoIntento: '' };
  return { accion: 'aplicar', update };
}

// Refleja una decisión del servicio de reprogramación en el documento del envío.
export function planificarReprogramacion(ev) {
  const entrada = {
    eventId: ev.eventId,
    tipo: ev.tipo,
    motivo: ev.motivo,
    intentosFallidos: ev.intentosFallidos,
    ocurridoEn: new Date(ev.ocurridoEn),
  };
  const $set = { disposicion: ev.tipo, actualizadoEn: new Date() };
  const update = { $set, $push: { reprogramaciones: entrada } };
  if (ev.tipo === 'REPROGRAMADO') {
    entrada.proximoIntentoEn = new Date(ev.proximoIntentoEn);
    entrada.franja = ev.franja;
    $set.proximoIntento = { en: new Date(ev.proximoIntentoEn), franja: ev.franja };
  } else {
    update.$unset = { proximoIntento: '' };
  }
  return update;
}
