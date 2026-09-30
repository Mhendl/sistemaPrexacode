import { and, eq, inArray, sql } from "drizzle-orm";
import type { FastifyPluginAsync } from "fastify";
import { z } from "zod";
import { agendaRecursos, eventos } from "../db/schema.js";
import { conflict, notFound, parse } from "../lib/errors.js";
import { notificarUsuario } from "../lib/notificaciones.js";
import { ahoraAr, cuandoEs, datosDelTurno } from "../lib/turnos.js";

const tokenSchema = z.object({ token: z.string().min(10).max(60) });

/** El paciente confirma o cancela su turno desde el link del email o del WhatsApp, sin usuario */
export const turnosPublicosRoutes: FastifyPluginAsync = async (app) => {
  const turnoDe = async (token: string) => {
    const [ev] = await app.db.select({ id: eventos.id }).from(eventos).where(eq(eventos.confirmacionToken, token));
    if (!ev) throw notFound("El link no es válido o el turno ya no existe");
    return (await datosDelTurno(app, ev.id))!;
  };

  app.get("/:token", { config: { rateLimit: { max: 60, timeWindow: "1 minute" } } }, async (req) => {
    const { token } = parse(tokenSchema, req.params);
    const t = await turnoDe(token);
    return {
      consultorio: t.consultorio.nombreFantasia || t.consultorio.razonSocial,
      direccion: [t.consultorio.domicilio, t.consultorio.localidad].filter(Boolean).join(", ") || null,
      telefono: t.consultorio.telefono,
      paciente: t.paciente?.nombre ?? null,
      profesional: t.profesional,
      fecha: t.fecha,
      inicio: t.inicio,
      cuando: cuandoEs(t.fecha, t.inicio),
      estado: t.estado,
      /** Ya pasó: no se puede responder */
      pasado: `${t.fecha}T${t.inicio}` <= ahoraAr(),
    };
  });

  const responder = (accion: "confirmar" | "cancelar") =>
    app.post(`/:token/${accion}`, { config: { rateLimit: { max: 20, timeWindow: "1 minute" } } }, async (req) => {
      const { token } = parse(tokenSchema, req.params);
      const t = await turnoDe(token);
      if (`${t.fecha}T${t.inicio}` <= ahoraAr()) throw conflict("Ese turno ya pasó");
      const nuevo = accion === "confirmar" ? "Confirmado" : "Cancelado";
      if (t.estado === nuevo) return { estado: nuevo };
      const [ev] = await app.db
        .update(eventos)
        .set({ estado: nuevo, respuestaPacienteEn: new Date(), version: sql`${eventos.version} + 1`, updatedAt: new Date() })
        .where(and(eq(eventos.id, t.id), inArray(eventos.estado, ["Pendiente", "Confirmado"])))
        .returning();
      if (!ev) throw conflict(`El turno está ${t.estado.toLowerCase()}: llamá al consultorio`);
      // Le avisa al profesional del turno
      const [r] = await app.db.select({ usuarioId: agendaRecursos.usuarioId }).from(agendaRecursos).where(eq(agendaRecursos.id, ev.recursoId));
      if (r?.usuarioId) {
        await notificarUsuario(app.db, ev.empresaId, r.usuarioId, {
          tipo: "agenda_asignacion",
          titulo: accion === "confirmar" ? "Un paciente confirmó su turno" : "Un paciente canceló su turno",
          detalle: `${t.paciente ? `${t.paciente.apellido}, ${t.paciente.nombre}` : ev.titulo} · ${cuandoEs(ev.fecha, ev.inicio)}`,
          link: `/agenda?fecha=${ev.fecha}&evento=${ev.id}`,
        });
      }
      return { estado: nuevo };
    });
  responder("confirmar");
  responder("cancelar");
};
