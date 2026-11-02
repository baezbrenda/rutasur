// Marcadores de "ya procesé esto" para servicios que publican eventos (reprogramación, notificaciones).
// La clave es de NEGOCIO (shipmentId:secuencia), no el eventId: un evento rezagado llega con otro eventId
// pero describe el mismo hecho, y no debe generar un segundo aviso.
export async function yaProcesado(db, consumidor, clave) {
  return !!(await db.collection('eventos_procesados').findOne({ consumidor, eventId: clave }, { projection: { _id: 1 } }));
}

export async function marcarProcesado(db, consumidor, clave) {
  try {
    await db.collection('eventos_procesados').insertOne({ consumidor, eventId: clave, createdAt: new Date() });
  } catch (e) {
    if (e.code !== 11000) throw e;
  }
}
