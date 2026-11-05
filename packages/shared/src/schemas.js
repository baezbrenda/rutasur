import { z } from 'zod';

export const ESTADOS = ['CREADO', 'INGRESADO_HUB', 'CLASIFICADO', 'EN_REPARTO', 'ENTREGADO', 'ENTREGA_FALLIDA'];
export const MOTIVOS = ['AUSENTE', 'DIRECCION_INCORRECTA', 'RECHAZADO', 'ZONA_INACCESIBLE'];

const comunes = {
  eventId: z.string().min(1),
  shipmentId: z.string().min(1),
  ocurridoEn: z.string().datetime(),
  secuencia: z.number().int().nonnegative(),
  hubId: z.string().min(1),
  zonaId: z.string().min(1),
  repartidorId: z.string().nullable(),
  version: z.literal(1),
};

// Evento de envios.estados
export const EstadoSchema = z
  .object({ ...comunes, tipo: z.enum(ESTADOS), motivo: z.enum(MOTIVOS).optional() })
  .superRefine((ev, ctx) => {
    if (ev.tipo === 'ENTREGA_FALLIDA' && !ev.motivo) {
      ctx.addIssue({ code: 'custom', path: ['motivo'], message: 'ENTREGA_FALLIDA requiere motivo' });
    }
  });

// Evento de envios.promesas
export const PromesaSchema = z.object({
  ...comunes,
  repartidorId: z.string().nullable().optional(),
  tipo: z.literal('PROMESA_DEFINIDA'),
  venceEn: z.string().datetime(),
});

export const TIPOS_REPROGRAMACION = ['REPROGRAMADO', 'RETENIDO', 'DEVOLUCION'];

// Evento de envios.reprogramaciones
export const ReprogramacionSchema = z
  .object({
    eventId: z.string().min(1),
    shipmentId: z.string().min(1),
    tipo: z.enum(TIPOS_REPROGRAMACION),
    motivo: z.enum(MOTIVOS),
    intentosFallidos: z.number().int().positive(),
    ocurridoEn: z.string().datetime(),
    hubId: z.string().min(1),
    zonaId: z.string().min(1),
    version: z.literal(1),
    proximoIntentoEn: z.string().datetime().optional(),
    franja: z.enum(['MANANA', 'TARDE']).optional(),
  })
  .superRefine((ev, ctx) => {
    if (ev.tipo === 'REPROGRAMADO' && !ev.proximoIntentoEn) {
      ctx.addIssue({ code: 'custom', path: ['proximoIntentoEn'], message: 'REPROGRAMADO requiere proximoIntentoEn' });
    }
  });

// Evento de notificaciones.enviadas (el envío real de mails/SMS está fuera de alcance: se registra)
export const NotificacionSchema = z.object({
  eventId: z.string().min(1),
  shipmentId: z.string().min(1),
  tipo: z.enum(['AVISO_ENTREGA_FALLIDA', 'AVISO_RETRASO']),
  canal: z.literal('EMAIL_SIMULADO'),
  motivo: z.enum(MOTIVOS).optional(),
  regla: z.string().optional(),
  mensaje: z.string(),
  opciones: z.array(z.string()),
  ocurridoEn: z.string().datetime(),
  hubId: z.string().min(1),
  zonaId: z.string().min(1),
  version: z.literal(1),
});

export const REGLAS_SLA = ['SIN_INGRESO', 'SIN_SALIDA', 'FALLO_DIA_LIMITE', 'VENCIDO'];

// Evento de alertas.sla: apertura y cierre de una alerta de riesgo de SLA
export const AlertaSchema = z.object({
  eventId: z.string().min(1),
  shipmentId: z.string().min(1),
  tipo: z.enum(['ALERTA_ABIERTA', 'ALERTA_CERRADA']),
  regla: z.enum(REGLAS_SLA),
  prioridad: z.enum(['MEDIA', 'ALTA', 'CRITICA']),
  causa: z.string(),
  ocurridoEn: z.string().datetime(), // reloj SIMULADO
  venceEn: z.string().datetime(),
  hubId: z.string().nullable(),
  zonaId: z.string().nullable(),
  version: z.literal(1),
});
