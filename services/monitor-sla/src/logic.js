import { diaLocal } from '@rutasur/shared';

const H = 3600_000;

export function nuevoEstado(shipmentId) {
  return { shipmentId, estado: null, ultimaSecuencia: -1, venceEn: null, hubId: null, zonaId: null, alertas: {}, cerrado: false };
}

// Un evento con secuencia <= a la ya aplicada (duplicado o rezagado) no cambia nada.
export function aplicarEstado(st, ev) {
  if (ev.secuencia <= st.ultimaSecuencia) return { st, cambio: false };
  return {
    cambio: true,
    st: { ...st, estado: ev.tipo, ultimaSecuencia: ev.secuencia, hubId: ev.hubId, zonaId: ev.zonaId, cerrado: ev.tipo === 'ENTREGADO' },
  };
}

export function aplicarPromesa(st, ev) {
  return { ...st, venceEn: ev.venceEn, hubId: st.hubId ?? ev.hubId, zonaId: st.zonaId ?? ev.zonaId };
}

export function reglasQueAplican(st, ahora) {
  if (st.cerrado || !st.venceEn) return [];
  const vence = Date.parse(st.venceEn);
  const resta = vence - ahora;
  const out = [];

  if (resta > 0 && resta < 10 * H && st.estado === 'CREADO') {
    out.push({ regla: 'SIN_INGRESO', prioridad: 'MEDIA', causa: 'Faltan menos de 10 h para el vencimiento y no ingresó al hub' });
  }
  if (resta > 0 && resta < 4 * H && st.estado !== 'EN_REPARTO') {
    out.push({ regla: 'SIN_SALIDA', prioridad: 'ALTA', causa: 'Faltan menos de 4 h para el vencimiento y no está en reparto' });
  }
  if (st.estado === 'ENTREGA_FALLIDA' && diaLocal(vence) === diaLocal(ahora)) {
    out.push({ regla: 'FALLO_DIA_LIMITE', prioridad: 'ALTA', causa: 'Entrega fallida y la promesa vence hoy' });
  }
  if (ahora > vence) {
    out.push({ regla: 'VENCIDO', prioridad: 'CRITICA', causa: 'Pasó el vencimiento sin ENTREGADO' });
  }
  return out.filter((r) => !st.alertas[r.regla]);
}

export function armarAlerta(st, { regla, prioridad, causa }, tipo, ahora) {
  return {
    eventId: tipo === 'ALERTA_ABIERTA' ? `${st.shipmentId}-${regla}` : `${st.shipmentId}-${regla}-cierre`,
    shipmentId: st.shipmentId,
    tipo,
    regla,
    prioridad,
    causa,
    ocurridoEn: new Date(ahora).toISOString(),
    venceEn: st.venceEn,
    hubId: st.hubId,
    zonaId: st.zonaId,
    version: 1,
  };
}
