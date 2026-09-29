import { and, asc, desc, eq, gte, lte, ne, sql, type SQL } from "drizzle-orm";
import type { FastifyPluginAsync } from "fastify";
import { z } from "zod";
import type { Db } from "../db/client.js";
import { agendaRecursos, clientes, configAgenda, eventos, usuarios } from "../db/schema.js";
import { permisoPorMetodo, requirePermiso } from "../lib/auth.js";
import { diasEntre, hoyAr } from "../lib/cuentas.js";
import { badRequest, conflict, edicionConcurrente, esReferenciado, HttpError, notFound, parse } from "../lib/errors.js";
import { notificarUsuario } from "../lib/notificaciones.js";
import { versionSchema, fechaValida } from "../lib/validation.js";

/** Paleta de colores para los recursos (se asignan en orden) */
export const COLORES_RECURSO = [
  "oklch(0.55 0.22 277)",
  "oklch(0.64 0.14 200)",
  "oklch(0.62 0.19 340)",
  "oklch(0.66 0.16 150)",
  "oklch(0.7 0.16 60)",
  "oklch(0.58 0.2 25)",
  "oklch(0.6 0.12 250)",
  "oklch(0.55 0.1 110)",
];
export const ESTADOS_EVENTO = ["Pendiente", "Confirmado", "Realizado", "Cancelado"] as const;
const TIPOS_INICIALES = ["Visita", "Reunión", "Llamada", "Tarea interna"];

const fechaIso = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Fecha inválida").refine(fechaValida, "Esa fecha no existe");
const hora = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, "Hora inválida (HH:MM)");
const idSchema = z.object({ id: z.string().uuid("Id inválido") });
const textoOpcional = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .optional()
    .nullable()
    .transform((v) => v || null);

const aMin = (h: string) => Number(h.slice(0, 2)) * 60 + Number(h.slice(3, 5));
const aHora = (m: number) => `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;
const ddmm = (f: string) => `${f.slice(8, 10)}/${f.slice(5, 7)}`;

const configSchema = z
  .object({
    nombreEvento: z.string().trim().min(2, "Poné un nombre").max(40),
    nombreRecurso: z.string().trim().min(2, "Poné un nombre").max(40),
    horaInicio: hora,
    horaFin: z.string().regex(/^(([01]\d|2[0-3]):[0-5]\d|24:00)$/, "Hora inválida (HH:MM)"),
    tiposEvento: z.array(z.string().trim().min(1).max(60)).max(40, "Hasta 40 tipos"),
    version: z.number().int().positive().max(2_000_000_000).optional(),
  })
  .refine((c) => aMin(c.horaFin) - aMin(c.horaInicio) >= 60, { message: "El horario tiene que abarcar al menos una hora", path: ["horaFin"] });

const recursoSchema = z.object({
  nombre: z.string().trim().min(2, "El nombre es obligatorio").max(60),
  color: z.string().regex(/^(#[0-9a-fA-F]{6}|oklch\([0-9. ]+\))$/, "Color inválido"),
  usuarioId: z.string().uuid().optional().nullable().transform((v) => v || null),
  activo: z.boolean().optional(),
  version: z.number().int().positive().max(2_000_000_000).optional(),
});

const eventoSchema = z
  .object({
    titulo: z.string().trim().min(2, "Poné un título").max(150),
    tipo: textoOpcional(60),
    recursoId: z.string({ required_error: "Elegí a quién se asigna" }).uuid("Elegí a quién se asigna"),
    clienteId: z.string().uuid().optional().nullable().transform((v) => v || null),
    fecha: fechaIso,
    inicio: hora,
    fin: hora,
    estado: z.enum(ESTADOS_EVENTO).default("Pendiente"),
    lugar: textoOpcional(200),
    notas: textoOpcional(2000),
    /** Si se sabe que se superpone y se quiere agendar igual (ej. sobreturno) */
    permitirSuperposicion: z.boolean().default(false),
  })
  .refine((e) => e.fin > e.inicio, { message: "Tiene que terminar después de empezar", path: ["fin"] });

const listaSchema = z.object({
  desde: fechaIso.optional(),
  hasta: fechaIso.optional(),
  recursoId: z.string().uuid().optional(),
  clienteId: z.string().uuid().optional(),
});

type Config = typeof configAgenda.$inferSelect;
const configApi = (c: Config) => ({ ...c, horaInicio: aHora(c.horaInicio), horaFin: aHora(c.horaFin) });

/** La primera vez se crea la configuración con un recurso por cada usuario activo */
async function asegurarConfig(db: Db, empresaId: string): Promise<Config> {
  const [nueva] = await db.insert(configAgenda).values({ empresaId, tiposEvento: TIPOS_INICIALES }).onConflictDoNothing().returning();
  if (nueva) {
    const us = await db
      .select({ id: usuarios.id, nombre: usuarios.nombre })
      .from(usuarios)
      .where(and(eq(usuarios.empresaId, empresaId), eq(usuarios.estado, "Activo")))
      .orderBy(asc(usuarios.createdAt));
    if (us.length) await db.insert(agendaRecursos).values(us.map((u, i) => ({ empresaId, nombre: u.nombre, usuarioId: u.id, color: COLORES_RECURSO[i % COLORES_RECURSO.length]! })));
    return nueva;
  }
  const [c] = await db.select().from(configAgenda).where(eq(configAgenda.empresaId, empresaId));
  return c!;
}

/**
 * Cada persona nueva del equipo aparece sola en la agenda (con un color libre), si la agenda ya estaba armada.
 * Si todavía no existe, se va a crear con todos los usuarios activos. El administrador lo puede desactivar.
 */
export async function sumarUsuarioALaAgenda(db: Db, empresaId: string, u: { id: string; nombre: string }) {
  const [cfg] = await db.select({ empresaId: configAgenda.empresaId }).from(configAgenda).where(eq(configAgenda.empresaId, empresaId));
  if (!cfg) return;
  const existentes = await db.select({ color: agendaRecursos.color, usuarioId: agendaRecursos.usuarioId }).from(agendaRecursos).where(eq(agendaRecursos.empresaId, empresaId));
  if (existentes.some((r) => r.usuarioId === u.id)) return;
  const usados = new Set(existentes.map((r) => r.color));
  const color = COLORES_RECURSO.find((c) => !usados.has(c)) ?? COLORES_RECURSO[existentes.length % COLORES_RECURSO.length]!;
  await db.insert(agendaRecursos).values({ empresaId, nombre: u.nombre, usuarioId: u.id, color });
}

const soloAdmin = requirePermiso("configuracion");

export const agendaRoutes: FastifyPluginAsync = async (app) => {
  // Todos los roles usan la agenda; la configuración y los recursos los maneja el administrador
  // Consultar la agenda pide "ver"; agendar o mover, "editar" (la configuración, además, "configuracion")
  app.addHook("preHandler", permisoPorMetodo("agenda.ver", "agenda.editar", { "/config": "configuracion", "/recursos": "configuracion", "/recursos/:id": "configuracion" }));

  const recursosDe = (empresaId: string) => app.db.select().from(agendaRecursos).where(eq(agendaRecursos.empresaId, empresaId)).orderBy(asc(agendaRecursos.createdAt));

  app.get("/config", async (req) => {
    const c = await asegurarConfig(app.db, req.user.empresaId);
    return { ...configApi(c), recursos: await recursosDe(req.user.empresaId), colores: COLORES_RECURSO };
  });

  app.put("/config", { preHandler: soloAdmin }, async (req) => {
    const { version, ...d } = parse(configSchema, req.body);
    await asegurarConfig(app.db, req.user.empresaId);
    // Sin repetidos (sin importar mayúsculas), respetando cómo se escribió la primera vez
    const tipos = d.tiposEvento.filter((t, i, todos) => todos.findIndex((x) => x.toLowerCase() === t.toLowerCase()) === i);
    const filtros: SQL[] = [eq(configAgenda.empresaId, req.user.empresaId)];
    if (version) filtros.push(eq(configAgenda.version, version));
    const [c] = await app.db
      .update(configAgenda)
      .set({ nombreEvento: d.nombreEvento, nombreRecurso: d.nombreRecurso, horaInicio: aMin(d.horaInicio), horaFin: aMin(d.horaFin), tiposEvento: tipos, version: sql`${configAgenda.version} + 1` })
      .where(and(...filtros))
      .returning();
    if (!c) throw edicionConcurrente("la configuración de la agenda");
    return configApi(c);
  });

  /** El usuario vinculado tiene que ser de la misma empresa */
  async function validarUsuario(empresaId: string, usuarioId: string | null) {
    if (!usuarioId) return;
    const [u] = await app.db.select({ id: usuarios.id }).from(usuarios).where(and(eq(usuarios.id, usuarioId), eq(usuarios.empresaId, empresaId)));
    if (!u) throw badRequest("El usuario no existe", { usuarioId: "Usuario inválido" });
  }

  app.post("/recursos", { preHandler: soloAdmin }, async (req, reply) => {
    const { version: _v, ...d } = parse(recursoSchema, req.body);
    await asegurarConfig(app.db, req.user.empresaId);
    await validarUsuario(req.user.empresaId, d.usuarioId);
    const [r] = await app.db.insert(agendaRecursos).values({ ...d, empresaId: req.user.empresaId }).returning();
    return reply.status(201).send(r);
  });

  app.put("/recursos/:id", { preHandler: soloAdmin }, async (req) => {
    const { id } = parse(idSchema, req.params);
    const { version, ...d } = parse(recursoSchema, req.body);
    await validarUsuario(req.user.empresaId, d.usuarioId);
    const filtros: SQL[] = [eq(agendaRecursos.id, id), eq(agendaRecursos.empresaId, req.user.empresaId)];
    const [actual] = await app.db.select().from(agendaRecursos).where(and(...filtros));
    if (!actual) throw notFound("No encontrado");
    if (version) filtros.push(eq(agendaRecursos.version, version));
    const [r] = await app.db
      .update(agendaRecursos)
      .set({ ...d, version: sql`${agendaRecursos.version} + 1` })
      .where(and(...filtros))
      .returning();
    if (!r) throw edicionConcurrente(actual.nombre);
    return r;
  });

  app.delete("/recursos/:id", { preHandler: soloAdmin }, async (req, reply) => {
    const { id } = parse(idSchema, req.params);
    const [r] = await app.db.select().from(agendaRecursos).where(and(eq(agendaRecursos.id, id), eq(agendaRecursos.empresaId, req.user.empresaId)));
    if (!r) throw notFound("No encontrado");
    try {
      await app.db.delete(agendaRecursos).where(eq(agendaRecursos.id, id));
    } catch (e) {
      if (esReferenciado(e)) throw conflict(`${r.nombre} tiene eventos en la agenda. Desactivalo en lugar de eliminarlo: sus eventos quedan en el historial.`);
      throw e;
    }
    return reply.status(204).send();
  });

  // ---------------------------------------------------------------- eventos

  const conCliente = (filtros: SQL[]) =>
    app.db
      .select({ evento: eventos, clienteRazonSocial: clientes.razonSocial })
      .from(eventos)
      .leftJoin(clientes, eq(clientes.id, eventos.clienteId))
      .where(and(...filtros));

  const plano = (r: { evento: typeof eventos.$inferSelect; clienteRazonSocial: string | null }) => ({ ...r.evento, clienteRazonSocial: r.clienteRazonSocial });

  app.get("/eventos", async (req) => {
    const q = parse(listaSchema, req.query);
    const filtros: SQL[] = [eq(eventos.empresaId, req.user.empresaId)];
    if (q.recursoId) filtros.push(eq(eventos.recursoId, q.recursoId));
    if (q.clienteId) {
      // Historial del cliente: los últimos y los próximos, sin necesidad de período
      filtros.push(eq(eventos.clienteId, q.clienteId));
      if (q.desde) filtros.push(gte(eventos.fecha, q.desde));
      if (q.hasta) filtros.push(lte(eventos.fecha, q.hasta));
      const rows = await conCliente(filtros).orderBy(desc(eventos.fecha), desc(eventos.inicio)).limit(100);
      return rows.map(plano);
    }
    if (!q.desde || !q.hasta) throw badRequest("Indicá el período", { desde: "Obligatorio" });
    if (q.hasta < q.desde) throw badRequest("El período está invertido", { hasta: "Anterior a la fecha desde" });
    if (diasEntre(q.desde, q.hasta) > 92) throw badRequest("El período puede ser de hasta 3 meses", { hasta: "Período demasiado largo" });
    filtros.push(gte(eventos.fecha, q.desde), lte(eventos.fecha, q.hasta));
    const rows = await conCliente(filtros).orderBy(asc(eventos.fecha), asc(eventos.inicio), asc(eventos.createdAt));
    return rows.map(plano);
  });

  app.get("/eventos/:id", async (req) => {
    const { id } = parse(idSchema, req.params);
    const [r] = await conCliente([eq(eventos.id, id), eq(eventos.empresaId, req.user.empresaId)]);
    if (!r) throw notFound("Evento no encontrado");
    return plano(r);
  });

  /** Recurso y cliente de la empresa; el recurso tiene que estar activo si se lo asigna ahora */
  async function validarReferencias(empresaId: string, d: z.infer<typeof eventoSchema>, recursoAnterior?: string) {
    const [r] = await app.db.select().from(agendaRecursos).where(and(eq(agendaRecursos.id, d.recursoId), eq(agendaRecursos.empresaId, empresaId)));
    if (!r) throw badRequest("Elegí a quién se asigna", { recursoId: "Inválido" });
    if (!r.activo && r.id !== recursoAnterior) throw badRequest(`${r.nombre} está desactivado`, { recursoId: "Desactivado" });
    if (d.clienteId) {
      const [c] = await app.db.select({ id: clientes.id }).from(clientes).where(and(eq(clientes.id, d.clienteId), eq(clientes.empresaId, empresaId)));
      if (!c) throw badRequest("El cliente no existe", { clienteId: "Inválido" });
    }
    return r;
  }

  /** Otro evento del mismo recurso en el mismo horario (los cancelados no cuentan) */
  async function superposicion(empresaId: string, d: z.infer<typeof eventoSchema>, recurso: typeof agendaRecursos.$inferSelect, excluir?: string) {
    if (d.estado === "Cancelado" || d.permitirSuperposicion) return;
    const filtros: SQL[] = [
      eq(eventos.empresaId, empresaId),
      eq(eventos.recursoId, d.recursoId),
      eq(eventos.fecha, d.fecha),
      ne(eventos.estado, "Cancelado"),
      sql`${eventos.inicio} < ${d.fin}`,
      sql`${eventos.fin} > ${d.inicio}`,
    ];
    if (excluir) filtros.push(ne(eventos.id, excluir));
    const [otro] = await app.db.select().from(eventos).where(and(...filtros)).orderBy(asc(eventos.inicio)).limit(1);
    if (otro) {
      throw new HttpError(409, `${recurso.nombre} ya tiene "${otro.titulo}" de ${otro.inicio} a ${otro.fin}.`, { inicio: "Se superpone" }, "SUPERPOSICION");
    }
  }

  /** Avisa al usuario vinculado al recurso, salvo que sea quien hizo el cambio */
  async function avisar(empresaId: string, quien: string, recurso: typeof agendaRecursos.$inferSelect | undefined, titulo: string, ev: typeof eventos.$inferSelect) {
    if (!recurso?.usuarioId || recurso.usuarioId === quien) return;
    await notificarUsuario(app.db, empresaId, recurso.usuarioId, {
      tipo: "agenda_asignacion",
      titulo,
      detalle: `${ev.titulo} · ${ddmm(ev.fecha)} de ${ev.inicio} a ${ev.fin}`,
      link: `/agenda?fecha=${ev.fecha}&evento=${ev.id}`,
    });
  }

  app.post("/eventos", async (req, reply) => {
    const datos = parse(eventoSchema, req.body);
    const { permitirSuperposicion: _p, ...d } = datos;
    const empresaId = req.user.empresaId;
    const recurso = await validarReferencias(empresaId, datos);
    await superposicion(empresaId, datos, recurso);
    const [ev] = await app.db.insert(eventos).values({ ...d, empresaId, usuarioId: req.user.sub }).returning();
    await avisar(empresaId, req.user.sub, recurso, "Te agendaron algo nuevo", ev!);
    return reply.status(201).send(ev);
  });

  app.put("/eventos/:id", async (req) => {
    const { id } = parse(idSchema, req.params);
    const datos = parse(eventoSchema, req.body);
    const { version } = parse(versionSchema, req.body);
    const { permitirSuperposicion: _p, ...d } = datos;
    const empresaId = req.user.empresaId;
    const [actual] = await app.db.select().from(eventos).where(and(eq(eventos.id, id), eq(eventos.empresaId, empresaId)));
    if (!actual) throw notFound("Evento no encontrado");
    if (version && version !== actual.version) throw edicionConcurrente("este evento");
    const recurso = await validarReferencias(empresaId, datos, actual.recursoId);
    await superposicion(empresaId, datos, recurso, id);

    const filtros: SQL[] = [eq(eventos.id, id), eq(eventos.empresaId, empresaId)];
    if (version) filtros.push(eq(eventos.version, version));
    const [ev] = await app.db
      .update(eventos)
      .set({ ...d, version: sql`${eventos.version} + 1`, updatedAt: new Date() })
      .where(and(...filtros))
      .returning();
    if (!ev) throw edicionConcurrente("este evento");

    if (ev.recursoId !== actual.recursoId) {
      await avisar(empresaId, req.user.sub, recurso, "Te asignaron algo de la agenda", ev);
      const [anterior] = await app.db.select().from(agendaRecursos).where(eq(agendaRecursos.id, actual.recursoId));
      await avisar(empresaId, req.user.sub, anterior, "Te sacaron algo de la agenda", ev);
    } else if (ev.estado === "Cancelado" && actual.estado !== "Cancelado") {
      await avisar(empresaId, req.user.sub, recurso, "Se canceló", ev);
    } else if (ev.fecha !== actual.fecha || ev.inicio !== actual.inicio || ev.fin !== actual.fin) {
      await avisar(empresaId, req.user.sub, recurso, "Cambió de día u horario", ev);
    }
    return ev;
  });

  /** Cambio rápido de estado (confirmar, marcar realizado, cancelar) */
  app.post("/eventos/:id/estado", async (req) => {
    const { id } = parse(idSchema, req.params);
    const { estado } = parse(z.object({ estado: z.enum(ESTADOS_EVENTO, { errorMap: () => ({ message: "Estado inválido" }) }) }), req.body);
    const empresaId = req.user.empresaId;
    const [actual] = await app.db.select().from(eventos).where(and(eq(eventos.id, id), eq(eventos.empresaId, empresaId)));
    if (!actual) throw notFound("Evento no encontrado");
    // Reactivar uno cancelado vuelve a ocupar el horario: se controla superposición
    if (actual.estado === "Cancelado" && estado !== "Cancelado") {
      const [recurso] = await app.db.select().from(agendaRecursos).where(eq(agendaRecursos.id, actual.recursoId));
      await superposicion(empresaId, { ...actual, estado, permitirSuperposicion: false }, recurso!, id);
    }
    const [ev] = await app.db
      .update(eventos)
      .set({ estado, version: sql`${eventos.version} + 1`, updatedAt: new Date() })
      .where(eq(eventos.id, id))
      .returning();
    if (estado === "Cancelado" && actual.estado !== "Cancelado") {
      const [recurso] = await app.db.select().from(agendaRecursos).where(eq(agendaRecursos.id, actual.recursoId));
      await avisar(empresaId, req.user.sub, recurso, "Se canceló", ev!);
    }
    return ev;
  });

  app.delete("/eventos/:id", async (req, reply) => {
    const { id } = parse(idSchema, req.params);
    const empresaId = req.user.empresaId;
    const [ev] = await app.db.delete(eventos).where(and(eq(eventos.id, id), eq(eventos.empresaId, empresaId))).returning();
    if (!ev) throw notFound("Evento no encontrado");
    if (ev.fecha >= hoyAr() && ev.estado !== "Cancelado") {
      const [recurso] = await app.db.select().from(agendaRecursos).where(eq(agendaRecursos.id, ev.recursoId));
      await avisar(empresaId, req.user.sub, recurso, "Se quitó de la agenda", ev);
    }
    return reply.status(204).send();
  });
};
