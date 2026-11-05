const OPCIONES = {
  AUSENTE: ['REPROGRAMAR_MANANA', 'REPROGRAMAR_TARDE', 'RETIRAR_EN_HUB'],
  DIRECCION_INCORRECTA: ['CORREGIR_DIRECCION'],
  RECHAZADO: [],
  ZONA_INACCESIBLE: ['RETIRAR_EN_HUB'],
};
const TEXTO = {
  AUSENTE: 'no había nadie para recibirlo',
  DIRECCION_INCORRECTA: 'la dirección es incorrecta',
  RECHAZADO: 'fue rechazado en la entrega',
  ZONA_INACCESIBLE: 'la zona no fue accesible',
};

// Arma el aviso al destinatario a partir de un ENTREGA_FALLIDA (lógica pura).
export function armarAviso(ev) {
  return {
    eventId: `${ev.shipmentId}-s${ev.secuencia}-notif`,
    shipmentId: ev.shipmentId,
    tipo: 'AVISO_ENTREGA_FALLIDA',
    canal: 'EMAIL_SIMULADO',
    motivo: ev.motivo,
    mensaje: `Tu envío ${ev.shipmentId} no pudo entregarse: ${TEXTO[ev.motivo]}.`,
    opciones: OPCIONES[ev.motivo],
    ocurridoEn: ev.ocurridoEn,
    hubId: ev.hubId,
    zonaId: ev.zonaId,
    version: 1,
  };
}

const MENSAJE_ALERTA = {
  SIN_INGRESO: 'Tu envío todavía no ingresó al centro de distribución y podría demorarse.',
  SIN_SALIDA: 'Tu envío aún no salió a reparto y podría llegar con demora.',
  FALLO_DIA_LIMITE: 'La entrega falló y la fecha prometida vence hoy.',
  VENCIDO: 'Tu envío superó la fecha de entrega prometida. Estamos trabajando para resolverlo.',
};

// Aviso de retraso a partir de una ALERTA_ABIERTA de alertas.sla (tipo distinto al del fallo de entrega).
export function armarAvisoAlerta(ev) {
  return {
    eventId: `${ev.eventId}-notif`,
    shipmentId: ev.shipmentId,
    tipo: 'AVISO_RETRASO',
    canal: 'EMAIL_SIMULADO',
    regla: ev.regla,
    mensaje: MENSAJE_ALERTA[ev.regla],
    opciones: [],
    ocurridoEn: ev.ocurridoEn,
    hubId: ev.hubId ?? 'SIN_HUB',
    zonaId: ev.zonaId ?? 'SIN_ZONA',
    version: 1,
  };
}
