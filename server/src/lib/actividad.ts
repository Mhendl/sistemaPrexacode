/**
 * Actividad de los usuarios: cada pedido de un usuario se suma en memoria y se guarda en la base una vez por minuto
 * (un total por usuario y por día), así no agrega una escritura por cada click.
 */
import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { sql } from "drizzle-orm";
import { actividadUsuarios } from "../db/schema.js";
import { ahoraAr } from "./turnos.js";

interface Pendiente {
  usuarioId: string;
  empresaId: string;
  fecha: string;
  pedidos: number;
  cambios: number;
  ultimaVez: Date;
}
export type BufferActividad = Map<string, Pendiente>;

/** Lo que la pantalla pide sola de fondo (no es que alguien esté usando el sistema) */
const AUTOMATICOS = /^\/api\/(notificaciones|health)(\/|\?|$)/;

/** onResponse: anota el pedido de un usuario de una empresa */
export function anotarActividad(req: FastifyRequest, reply: FastifyReply) {
  const u = req.user;
  if (!u?.autenticado || !u.empresaId || u.tipo === "plataforma") return;
  if (req.method === "GET" && AUTOMATICOS.test(req.url)) return;
  const fecha = ahoraAr().slice(0, 10);
  const clave = `${u.sub}|${fecha}`;
  const p = req.server.actividad.get(clave) ?? { usuarioId: u.sub, empresaId: u.empresaId, fecha, pedidos: 0, cambios: 0, ultimaVez: new Date() };
  p.pedidos++;
  if (req.method !== "GET" && reply.statusCode < 400) p.cambios++;
  p.ultimaVez = new Date();
  req.server.actividad.set(clave, p);
}

/** Guarda lo anotado (corre cada minuto, al cerrar y antes de mostrarlo en el panel) */
export async function guardarActividad(app: FastifyInstance) {
  if (!app.actividad.size) return;
  const lote = [...app.actividad.values()];
  app.actividad.clear();
  try {
    await app.db
      .insert(actividadUsuarios)
      .values(lote)
      .onConflictDoUpdate({
        target: [actividadUsuarios.usuarioId, actividadUsuarios.fecha],
        set: {
          pedidos: sql`${actividadUsuarios.pedidos} + excluded.pedidos`,
          cambios: sql`${actividadUsuarios.cambios} + excluded.cambios`,
          ultimaVez: sql`greatest(${actividadUsuarios.ultimaVez}, excluded.ultima_vez)`,
        },
      });
  } catch (e) {
    // Un usuario borrado entre medio (o la base caída): se pierde ese minuto de actividad, no es grave
    app.log.warn(e, "No se pudo guardar la actividad de los usuarios");
  }
}
