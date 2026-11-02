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
