import { diaLocal } from '@rutasur/shared';

export async function procesarEventoAnalitica(colMetricas, ev) {
  const fecha = diaLocal(Date.parse(ev.ocurridoEn));
  const zonaId = ev.zonaId ?? 'GENERAL';
  const hubId = ev.hubId ?? 'GENERAL';
  const franja = 'GENERAL';

  const filtro = { fecha, zonaId, hubId, franja };
  let updateQuery = { $inc: { totalEventos: 1 } };

  if (ev.tipo === 'ENTREGADO') {
    updateQuery.$inc.entregados = 1;
    updateQuery.$inc.primerIntentoExitoso = 1;
  } else if (ev.tipo === 'ENTREGA_FALLIDA') {
    updateQuery.$inc.fallidos = 1;
    if (ev.motivo) {
      updateQuery.$inc[`motivos.${ev.motivo}`] = 1;
    }
  }

  await colMetricas.updateOne(filtro, updateQuery, { upsert: true });
}