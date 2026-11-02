import { franjaDe, proximoDiaHabil } from '@rutasur/shared';

/**
 * Reglas de reprogramación de la spec (lógica pura).
 * nro = número de entrega fallida de este envío (1, 2, 3...).
 *  - Tercer fallo, cualquier motivo  -> DEVOLUCION
 *  - AUSENTE                         -> REPROGRAMADO: día hábil siguiente, franja opuesta a la del fallo
 *  - DIRECCION_INCORRECTA            -> RETENIDO hasta una corrección
 *  - RECHAZADO                       -> DEVOLUCION
 *  - ZONA_INACCESIBLE                -> RETENIDO (la spec no define regla: supuesto a confirmar con el docente)
 */
export function decidirReprogramacion({ motivo, nro, ocurridoEn }) {
  if (nro >= 3) return { tipo: 'DEVOLUCION' };
  switch (motivo) {
    case 'AUSENTE': {
      const franja = franjaDe(ocurridoEn) === 'MANANA' ? 'TARDE' : 'MANANA';
      return { tipo: 'REPROGRAMADO', franja, proximoIntentoEn: proximoDiaHabil(ocurridoEn, franja) };
    }
    case 'RECHAZADO':
      return { tipo: 'DEVOLUCION' };
    default: // DIRECCION_INCORRECTA, ZONA_INACCESIBLE
      return { tipo: 'RETENIDO' };
  }
}
