import { and, asc, eq, gte, inArray, lte, ne, sql } from "drizzle-orm";
import type { FastifyPluginAsync } from "fastify";
import { z } from "zod";
import { agendaBloqueos, agendaRecursos, configAgenda, empresas, eventos, pacientes } from "../db/schema.js";
import { badRequest, conflict, notFound, parse } from "../lib/errors.js";
import { aHora, aMin, turnosLibres } from "../lib/horarios.js";
import { notificar } from "../lib/notificaciones.js";
import { estadoDe, obtenerSuscripcion } from "../lib/suscripcion.js";
import { ahoraAr, cuandoEs, enviarEmailTurno, tokenDeTurno } from "../lib/turnos.js";
import { fechaValida } from "../lib/validation.js";

const codigoSchema = z.object({ codigo: z.string().regex(/^[0-9a-f]{12}$/, "Link inválido") });
const fechaIso = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Fecha inválida").refine(fechaValida, "Esa fecha no existe");
const sumarDias = (f: string, n: number) => new Date(Date.parse(`${f}T12:00:00Z`) + n * 86_400_000).toISOString().slice(0, 10);
const soloDigitos = (v: string) => v.replace(/\D/g, "");

const reservaSchema = z.object({
  recursoId: z.string().uuid("Elegí el profesional"),
  fecha: fechaIso,
  inicio: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, "Elegí el horario"),
  nombre: z.string().trim().min(2, "Poné tu nombre").max(60),
  apellido: z.string().trim().min(2, "Poné tu apellido").max(60),
  dni: z
    .string()
    .transform(soloDigitos)
    .refine((v) => v.length >= 7 && v.length <= 8, "El DNI tiene 7 u 8 números"),
  telefono: z
    .string()
    .trim()
    .max(30)
    .refine((v) => soloDigitos(v).length >= 8, "Poné un teléfono (con característica)"),
  email: z.string().trim().toLowerCase().email("Email inválido").max(120).optional().or(z.literal("")).transform((v) => v || null),
  motivo: z.string().trim().max(300).optional().transform((v) => v || null),
  /** Campo trampa para robots: una persona no lo ve ni lo completa */
  sitio: z.string().max(0, "No se pudo reservar").optional(),
});

/**
 * Turnos online (CoreDental): el paciente elige profesional, día y horario libre desde un link público,
 * deja sus datos y el turno queda en la agenda. Se busca al paciente por DNI; si no existe se lo da de alta
 * (con los datos por completar). No devuelve datos de ningún paciente.
 */
export const reservasRoutes: FastifyPluginAsync = async (app) => {
  async function consultorioDe(codigo: string) {
    const [c] = await app.db
      .select({ cfg: configAgenda, empresa: empresas })
      .from(configAgenda)
      .innerJoin(empresas, eq(empresas.id, configAgenda.empresaId))
      .where(eq(configAgenda.reservaCodigo, codigo));
    const cerrado = () => notFound("Este link de turnos no está disponible. Comunicate con el consultorio.");
    if (!c || !c.cfg.reservaOnline || c.empresa.producto !== "dental" || c.empresa.suspendidaEn) throw cerrado();
    // Con la suscripción vencida no se cargan turnos nuevos
    if (estadoDe(await obtenerSuscripcion(app.db, c.empresa.id)).estado === "SoloLectura") throw cerrado();
    return c;
  }

  const profesionalesDe = async (empresaId: string) =>
    (
      await app.db
        .select()
        .from(agendaRecursos)
        .where(and(eq(agendaRecursos.empresaId, empresaId), eq(agendaRecursos.activo, true), eq(agendaRecursos.reservaOnline, true)))
        .orderBy(asc(agendaRecursos.createdAt))
    ).filter((r) => r.horarios.length > 0);

  async function profesional(empresaId: string, recursoId: string) {
    const r = (await profesionalesDe(empresaId)).find((x) => x.id === recursoId);
    if (!r) throw badRequest("Ese profesional no da turnos online", { recursoId: "Inválido" });
    return r;
  }

  /** Los horarios libres de cada día del período, respetando la anticipación mínima */
  async function libresPorDia(c: Awaited<ReturnType<typeof consultorioDe>>, r: typeof agendaRecursos.$inferSelect, desde: string, hasta: string) {
    const [ocupados, bloqueos] = await Promise.all([
      app.db
        .select({ fecha: eventos.fecha, inicio: eventos.inicio, fin: eventos.fin })
        .from(eventos)
        .where(and(eq(eventos.recursoId, r.id), gte(eventos.fecha, desde), lte(eventos.fecha, hasta), ne(eventos.estado, "Cancelado"), ne(eventos.estado, "Ausente"))),
      app.db
        .select()
        .from(agendaBloqueos)
        .where(and(eq(agendaBloqueos.empresaId, c.cfg.empresaId), lte(agendaBloqueos.desde, hasta), gte(agendaBloqueos.hasta, desde))),
    ]);
    // Lo más temprano que se puede reservar
    const minimo = ahoraAr(Date.now() + c.cfg.reservaAnticipacionHoras * 3600_000);
    const out: { fecha: string; libres: string[] }[] = [];
    for (let f = desde; f <= hasta; f = sumarDias(f, 1)) {
      if (f < minimo.slice(0, 10)) {
        out.push({ fecha: f, libres: [] });
        continue;
      }
      const libres = turnosLibres({
        horarios: r.horarios,
        franjaGeneral: { desde: aHora(c.cfg.horaInicio), hasta: aHora(c.cfg.horaFin) },
        duracion: r.duracionTurno,
        fecha: f,
        recursoId: r.id,
        ocupados: ocupados.filter((o) => o.fecha === f),
        bloqueos,
        desdeMin: f === minimo.slice(0, 10) ? aMin(minimo.slice(11, 16)) : undefined,
      });
      out.push({ fecha: f, libres });
    }
    return out;
  }

  const limite = (max: number) => ({ config: { rateLimit: { max, timeWindow: "1 minute" } } });

  app.get("/:codigo", limite(60), async (req) => {
    const { codigo } = parse(codigoSchema, req.params);
    const c = await consultorioDe(codigo);
    const e = c.empresa;
    return {
      consultorio: e.nombreFantasia || e.razonSocial,
      direccion: [e.domicilio, e.localidad].filter(Boolean).join(", ") || null,
      telefono: e.telefono,
      mensaje: c.cfg.reservaMensaje,
      diasMax: c.cfg.reservaDiasMax,
      profesionales: (await profesionalesDe(e.id)).map((r) => ({ id: r.id, nombre: r.nombre, duracion: r.duracionTurno })),
    };
  });

  /** Días del período con cuántos turnos libres tiene cada uno */
  app.get("/:codigo/dias", limite(60), async (req) => {
    const { codigo } = parse(codigoSchema, req.params);
    const { recursoId } = parse(z.object({ recursoId: z.string().uuid("Elegí el profesional") }), req.query);
    const c = await consultorioDe(codigo);
    const r = await profesional(c.cfg.empresaId, recursoId);
    const hoy = ahoraAr().slice(0, 10);
    const dias = await libresPorDia(c, r, hoy, sumarDias(hoy, c.cfg.reservaDiasMax));
    return dias.map((d) => ({ fecha: d.fecha, libres: d.libres.length }));
  });

  app.get("/:codigo/horarios", limite(60), async (req) => {
    const { codigo } = parse(codigoSchema, req.params);
    const q = parse(z.object({ recursoId: z.string().uuid("Elegí el profesional"), fecha: fechaIso }), req.query);
    const c = await consultorioDe(codigo);
    const r = await profesional(c.cfg.empresaId, q.recursoId);
    const hoy = ahoraAr().slice(0, 10);
    if (q.fecha < hoy || q.fecha > sumarDias(hoy, c.cfg.reservaDiasMax)) return { libres: [] };
    const [d] = await libresPorDia(c, r, q.fecha, q.fecha);
    return { libres: d!.libres };
  });

  app.post("/:codigo", { config: { rateLimit: { max: 5, timeWindow: "10 minutes" } } }, async (req, reply) => {
    const { codigo } = parse(codigoSchema, req.params);
    const d = parse(reservaSchema, req.body);
    const c = await consultorioDe(codigo);
    const empresaId = c.cfg.empresaId;
    const r = await profesional(empresaId, d.recursoId);
    const hoy = ahoraAr().slice(0, 10);
    if (d.fecha > sumarDias(hoy, c.cfg.reservaDiasMax)) throw badRequest("Esa fecha todavía no está disponible", { fecha: "Muy adelante" });
    const [dia] = await libresPorDia(c, r, d.fecha, d.fecha);
    if (!dia!.libres.includes(d.inicio)) throw conflict("Ese horario ya no está disponible. Elegí otro.");
    const fin = aHora(aMin(d.inicio) + r.duracionTurno);

    // El paciente: por DNI. Si ya existe, se completan el teléfono o el email que falten (no se pisa nada)
    const nombre = d.nombre.replace(/\s+/g, " ");
    const apellido = d.apellido.replace(/\s+/g, " ");
    let [p] = await app.db.select().from(pacientes).where(and(eq(pacientes.empresaId, empresaId), eq(pacientes.dni, d.dni)));
    if (p) {
      if (!p.telefono || (!p.email && d.email)) {
        await app.db
          .update(pacientes)
          .set({ telefono: p.telefono ?? d.telefono, email: p.email ?? d.email, updatedAt: new Date() })
          .where(eq(pacientes.id, p.id));
      }
      // Hasta dos turnos online pendientes por paciente
      const [{ n }] = await app.db
        .select({ n: sql<number>`count(*)::int` })
        .from(eventos)
        .where(and(eq(eventos.pacienteId, p.id), eq(eventos.reservadoOnline, true), gte(eventos.fecha, hoy), inArray(eventos.estado, ["Pendiente", "Confirmado"])));
      if (Number(n) >= 2) throw conflict("Ya tenés turnos reservados. Si querés cambiarlos, cancelalos desde el link que te llegó o comunicate con el consultorio.");
    } else {
      [p] = await app.db
        .insert(pacientes)
        .values({ empresaId, nombre, apellido, dni: d.dni, telefono: d.telefono, email: d.email, datosPendientes: true })
        .onConflictDoNothing()
        .returning();
      if (!p) throw conflict("No se pudo reservar. Probá de nuevo.");
    }

    const [ev] = await app.db
      .insert(eventos)
      .values({
        empresaId,
        titulo: `${p.apellido}, ${p.nombre}`,
        tipo: "Turno online",
        recursoId: r.id,
        pacienteId: p.id,
        fecha: d.fecha,
        inicio: d.inicio,
        fin,
        estado: "Pendiente",
        notas: d.motivo ? `Motivo (lo escribió el paciente): ${d.motivo}` : null,
        reservadoOnline: true,
      })
      .returning();
    // Dos personas reservando el mismo horario a la vez: se queda el primero
    const pisados = await app.db
      .select({ id: eventos.id, createdAt: eventos.createdAt })
      .from(eventos)
      .where(and(eq(eventos.recursoId, r.id), eq(eventos.fecha, d.fecha), ne(eventos.estado, "Cancelado"), ne(eventos.estado, "Ausente"), sql`${eventos.inicio} < ${fin}`, sql`${eventos.fin} > ${d.inicio}`, ne(eventos.id, ev!.id)));
    if (pisados.some((o) => o.createdAt < ev!.createdAt || (o.createdAt.getTime() === ev!.createdAt.getTime() && o.id < ev!.id))) {
      await app.db.delete(eventos).where(eq(eventos.id, ev!.id));
      throw conflict("Ese horario se acaba de ocupar. Elegí otro.");
    }

    const token = await tokenDeTurno(app, ev!.id);
    await notificar(app.db, empresaId, {
      tipo: "agenda_asignacion",
      titulo: "Nuevo turno online",
      detalle: `${ev!.titulo} · ${cuandoEs(ev!.fecha, ev!.inicio)} con ${r.nombre}`,
      link: `/agenda?fecha=${ev!.fecha}&evento=${ev!.id}`,
    });
    if (d.email || p.email) void enviarEmailTurno(app, ev!.id, "agendado", null).catch((e) => app.log.warn(e, "No se pudo mandar el email del turno online"));
    return reply.status(201).send({ profesional: r.nombre, fecha: ev!.fecha, inicio: ev!.inicio, fin: ev!.fin, cuando: cuandoEs(ev!.fecha, ev!.inicio), token });
  });
};
