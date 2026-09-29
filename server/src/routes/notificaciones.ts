import { and, count, desc, eq } from "drizzle-orm";
import type { FastifyPluginAsync } from "fastify";
import { z } from "zod";
import { notificaciones, preferenciasNotificacion } from "../db/schema.js";
import { requireAuth, tienePermiso } from "../lib/auth.js";
import { badRequest, notFound, parse } from "../lib/errors.js";
import { revisarVencimientos, TIPOS_NOTIFICACION, tiposPara, type TipoNotificacion } from "../lib/notificaciones.js";

const idSchema = z.object({ id: z.string().uuid("Id inválido") });
const preferenciasSchema = z.array(
  z.object({
    tipo: z.string(),
    enSistema: z.boolean(),
  }),
);

/** Avisos y preferencias del usuario que está en sesión */
export const notificacionesRoutes: FastifyPluginAsync = async (app) => {
  app.addHook("preHandler", requireAuth);

  app.get("/", async (req) => {
    if (tienePermiso(req, "cobranzas.ver")) await revisarVencimientos(app.db, req.user.empresaId);
    const mias = and(eq(notificaciones.usuarioId, req.user.sub), eq(notificaciones.empresaId, req.user.empresaId));
    const items = await app.db.select().from(notificaciones).where(mias).orderBy(desc(notificaciones.createdAt)).limit(30);
    const [{ n }] = await app.db.select({ n: count() }).from(notificaciones).where(and(mias, eq(notificaciones.leida, false)));
    return { items, noLeidas: n };
  });

  app.post("/:id/leer", async (req, reply) => {
    const { id } = parse(idSchema, req.params);
    const [n] = await app.db
      .update(notificaciones)
      .set({ leida: true })
      .where(and(eq(notificaciones.id, id), eq(notificaciones.usuarioId, req.user.sub)))
      .returning({ id: notificaciones.id });
    if (!n) throw notFound("Notificación no encontrada");
    return reply.status(204).send();
  });

  app.post("/leer-todas", async (req, reply) => {
    await app.db.update(notificaciones).set({ leida: true }).where(eq(notificaciones.usuarioId, req.user.sub));
    return reply.status(204).send();
  });

  app.get("/preferencias", async (req) => {
    const guardadas = await app.db.select().from(preferenciasNotificacion).where(eq(preferenciasNotificacion.usuarioId, req.user.sub));
    return tiposPara(!!req.user.esAdmin, req.user.permisos ?? []).map((tipo) => {
      const def = TIPOS_NOTIFICACION[tipo];
      const g = guardadas.find((p) => p.tipo === tipo);
      return { tipo, nombre: def.nombre, descripcion: def.descripcion, disponible: def.disponible, enSistema: g?.enSistema ?? true };
    });
  });

  app.put("/preferencias", async (req, reply) => {
    const prefs = parse(preferenciasSchema, req.body);
    const permitidos = tiposPara(!!req.user.esAdmin, req.user.permisos ?? []) as string[];
    for (const p of prefs) {
      if (!permitidos.includes(p.tipo)) throw badRequest(`Aviso desconocido o no disponible para tu rol: ${p.tipo}`);
    }
    for (const p of prefs) {
      await app.db
        .insert(preferenciasNotificacion)
        .values({ usuarioId: req.user.sub, tipo: p.tipo as TipoNotificacion, enSistema: p.enSistema })
        .onConflictDoUpdate({ target: [preferenciasNotificacion.usuarioId, preferenciasNotificacion.tipo], set: { enSistema: p.enSistema } });
    }
    return reply.status(204).send();
  });
};
