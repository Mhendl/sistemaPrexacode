import { randomBytes } from "node:crypto";
import { and, asc, desc, eq, gte, lte, ne, sql, type SQL } from "drizzle-orm";
import type { FastifyPluginAsync } from "fastify";
import { z } from "zod";
import type { Db } from "../db/client.js";
import { agendaBloqueos, agendaRecursos, clientes, configAgenda, eventos, pacientes, usuarios } from "../db/schema.js";
import { permisoPorMetodo, requirePermiso } from "../lib/auth.js";
import { diasEntre, hoyAr } from "../lib/cuentas.js";
import { badRequest, conflict, edicionConcurrente, esReferenciado, HttpError, notFound, parse } from "../lib/errors.js";
import { notificarUsuario } from "../lib/notificaciones.js";
import { bloqueoQueCae, dentroDeHorario, errorEnFranjas, textoHorario, turnosLibres, type Bloqueo } from "../lib/horarios.js";
import { ahoraAr, datosDelTurno, enviarEmailTurno, textoWhatsappTurno } from "../lib/turnos.js";
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
/** Ausente: el paciente no vino (CoreDental). Como Cancelado, deja el horario libre */
export const ESTADOS_EVENTO = ["Pendiente", "Confirmado", "Realizado", "Ausente", "Cancelado"] as const;
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
    /** CoreDental: avisos por email al paciente */
    recordatorioEmail: z.boolean().optional(),
    recordatorioHoras: z.coerce.number().int().min(1, "Entre 1 y 72 horas").max(72, "Entre 1 y 72 horas").optional(),
    avisoAlAgendar: z.boolean().optional(),
    /** CoreDental: turnos online */
    reservaOnline: z.boolean().optional(),
    reservaAnticipacionHoras: z.coerce.number().int().min(0, "Entre 0 y 168 horas").max(168, "Entre 0 y 168 horas").optional(),
    reservaDiasMax: z.coerce.number().int().min(1, "Entre 1 y 180 días").max(180, "Entre 1 y 180 días").optional(),
    reservaMensaje: z.string().trim().max(300).optional().nullable().transform((v) => (v === undefined ? undefined : v || null)),
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

const horariosSchema = z.object({
  horarios: z
    .array(z.object({ dia: z.number().int().min(0).max(6), desde: hora, hasta: z.string().regex(/^(([01]\d|2[0-3]):[0-5]\d|24:00)$/, "Hora inválida (HH:MM)") }))
    .max(21, "Hasta 3 franjas por día"),
  duracionTurno: z.coerce.number().int().min(5, "Entre 5 y 240 minutos").max(240, "Entre 5 y 240 minutos"),
  version: z.number().int().positive().max(2_000_000_000).optional(),
});

const bloqueoSchema = z
  .object({
    recursoId: z.string().uuid().optional().nullable().transform((v) => v || null),
    desde: fechaIso,
    hasta: fechaIso,
    horaDesde: hora.optional().nullable().transform((v) => v || null),
    horaHasta: z
      .string()
      .regex(/^(([01]\d|2[0-3]):[0-5]\d|24:00)$/, "Hora inválida (HH:MM)")
      .optional()
      .nullable()
      .transform((v) => v || null),
    motivo: z.string().trim().min(2, "Contá el motivo (vacaciones, congreso…)").max(120),
  })
  .refine((b) => b.hasta >= b.desde, { message: "Termina antes de empezar", path: ["hasta"] })
  .refine((b) => diasEntre(b.desde, b.hasta) <= 366, { message: "Hasta un año", path: ["hasta"] })
  .refine((b) => !b.horaDesde === !b.horaHasta, { message: "Poné las dos horas, o ninguna para el día completo", path: ["horaHasta"] })
  .refine((b) => !b.horaDesde || !b.horaHasta || b.horaHasta > b.horaDesde, { message: "Tiene que terminar después de empezar", path: ["horaHasta"] });

const eventoSchema = z
  .object({
    /** Con paciente puede venir vacío: se titula con su nombre */
    titulo: z.string().trim().max(150).default(""),
    tipo: textoOpcional(60),
    recursoId: z.string({ required_error: "Elegí a quién se asigna" }).uuid("Elegí a quién se asigna"),
    clienteId: z.string().uuid().optional().nullable().transform((v) => v || null),
    pacienteId: z.string().uuid().optional().nullable().transform((v) => v || null),
    fecha: fechaIso,
    inicio: hora,
    fin: hora,
    estado: z.enum(ESTADOS_EVENTO).default("Pendiente"),
    lugar: textoOpcional(200),
    notas: textoOpcional(2000),
    /** Si se sabe que se superpone y se quiere agendar igual (ej. sobreturno) */
    permitirSuperposicion: z.boolean().default(false),
  })
  .refine((e) => e.fin > e.inicio, { message: "Tiene que terminar después de empezar", path: ["fin"] })
  .refine((e) => e.titulo.length >= 2 || !!e.pacienteId, { message: "Poné un título", path: ["titulo"] });

const listaSchema = z.object({
  desde: fechaIso.optional(),
  hasta: fechaIso.optional(),
  recursoId: z.string().uuid().optional(),
  clienteId: z.string().uuid().optional(),
  pacienteId: z.string().uuid().optional(),
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
/** Código del link de turnos online: difícil de adivinar */
const nuevoCodigo = () => randomBytes(6).toString("hex");

export const agendaRoutes: FastifyPluginAsync = async (app) => {
  // Todos los roles usan la agenda; la configuración y los recursos los maneja el administrador
  // Consultar la agenda pide "ver"; agendar o mover, "editar" (la configuración, además, "configuracion")
  app.addHook("preHandler", permisoPorMetodo("agenda.ver", "agenda.editar", { "/config": "configuracion", "/config/reserva/nuevo-link": "configuracion", "/recursos": "configuracion", "/recursos/:id": "configuracion", "/recursos/:id/horarios": "configuracion", "/recursos/:id/reserva": "configuracion" }));

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
      .set({
        nombreEvento: d.nombreEvento,
        nombreRecurso: d.nombreRecurso,
        horaInicio: aMin(d.horaInicio),
        horaFin: aMin(d.horaFin),
        tiposEvento: tipos,
        ...(d.recordatorioEmail !== undefined ? { recordatorioEmail: d.recordatorioEmail } : {}),
        ...(d.recordatorioHoras !== undefined ? { recordatorioHoras: d.recordatorioHoras } : {}),
        ...(d.avisoAlAgendar !== undefined ? { avisoAlAgendar: d.avisoAlAgendar } : {}),
        ...(d.reservaOnline !== undefined ? { reservaOnline: d.reservaOnline } : {}),
        ...(d.reservaOnline ? { reservaCodigo: sql`coalesce(${configAgenda.reservaCodigo}, ${nuevoCodigo()})` } : {}),
        ...(d.reservaAnticipacionHoras !== undefined ? { reservaAnticipacionHoras: d.reservaAnticipacionHoras } : {}),
        ...(d.reservaDiasMax !== undefined ? { reservaDiasMax: d.reservaDiasMax } : {}),
        ...(d.reservaMensaje !== undefined ? { reservaMensaje: d.reservaMensaje } : {}),
        version: sql`${configAgenda.version} + 1`,
      })
      .where(and(...filtros))
      .returning();
    if (!c) throw edicionConcurrente("la configuración de la agenda");
    return configApi(c);
  });

  /** Link nuevo para los turnos online (el anterior deja de funcionar) */
  app.post("/config/reserva/nuevo-link", { preHandler: soloAdmin }, async (req) => {
    await asegurarConfig(app.db, req.user.empresaId);
    const [c] = await app.db
      .update(configAgenda)
      .set({ reservaCodigo: nuevoCodigo(), version: sql`${configAgenda.version} + 1` })
      .where(eq(configAgenda.empresaId, req.user.empresaId))
      .returning();
    return configApi(c!);
  });

  /** Si el profesional aparece en los turnos online */
  app.put("/recursos/:id/reserva", { preHandler: soloAdmin }, async (req) => {
    const { id } = parse(idSchema, req.params);
    const { reservaOnline } = parse(z.object({ reservaOnline: z.boolean() }), req.body);
    const [r] = await app.db
      .update(agendaRecursos)
      .set({ reservaOnline, version: sql`${agendaRecursos.version} + 1` })
      .where(and(eq(agendaRecursos.id, id), eq(agendaRecursos.empresaId, req.user.empresaId)))
      .returning();
    if (!r) throw notFound("No encontrado");
    return r;
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

  /** Días y horarios de atención, y cuánto dura un turno */
  app.put("/recursos/:id/horarios", { preHandler: soloAdmin }, async (req) => {
    const { id } = parse(idSchema, req.params);
    const { version, ...d } = parse(horariosSchema, req.body);
    const error = errorEnFranjas(d.horarios);
    if (error) throw badRequest(error, { horarios: error });
    const filtros: SQL[] = [eq(agendaRecursos.id, id), eq(agendaRecursos.empresaId, req.user.empresaId)];
    const [actual] = await app.db.select().from(agendaRecursos).where(and(...filtros));
    if (!actual) throw notFound("No encontrado");
    if (version) filtros.push(eq(agendaRecursos.version, version));
    const horarios = [...d.horarios].sort((a, b) => a.dia - b.dia || a.desde.localeCompare(b.desde));
    const [r] = await app.db
      .update(agendaRecursos)
      .set({ horarios, duracionTurno: d.duracionTurno, version: sql`${agendaRecursos.version} + 1` })
      .where(and(...filtros))
      .returning();
    if (!r) throw edicionConcurrente(actual.nombre);
    return r;
  });

  // ---------------------------------------------------------------- bloqueos (vacaciones, congresos, feriados)

  const bloqueosEntre = (empresaId: string, desde: string, hasta: string) =>
    app.db
      .select()
      .from(agendaBloqueos)
      .where(and(eq(agendaBloqueos.empresaId, empresaId), lte(agendaBloqueos.desde, hasta), gte(agendaBloqueos.hasta, desde)))
      .orderBy(asc(agendaBloqueos.desde));

  app.get("/bloqueos", async (req) => {
    const q = parse(z.object({ desde: fechaIso, hasta: fechaIso }), req.query);
    if (diasEntre(q.desde, q.hasta) > 400) throw badRequest("El período puede ser de hasta un año", { hasta: "Período demasiado largo" });
    return bloqueosEntre(req.user.empresaId, q.desde, q.hasta);
  });

  app.post("/bloqueos", async (req, reply) => {
    const d = parse(bloqueoSchema, req.body);
    if (d.recursoId) {
      const [r] = await app.db.select({ id: agendaRecursos.id }).from(agendaRecursos).where(and(eq(agendaRecursos.id, d.recursoId), eq(agendaRecursos.empresaId, req.user.empresaId)));
      if (!r) throw badRequest("Elegí a quién se bloquea", { recursoId: "Inválido" });
    }
    const [u] = await app.db.select({ nombre: usuarios.nombre }).from(usuarios).where(eq(usuarios.id, req.user.sub));
    const [b] = await app.db
      .insert(agendaBloqueos)
      .values({ ...d, empresaId: req.user.empresaId, creadoPor: u?.nombre ?? "Usuario" })
      .returning();
    // Turnos que ya estaban dados en ese período: se avisan para reprogramarlos (no se cancelan solos)
    const filtros: SQL[] = [eq(eventos.empresaId, req.user.empresaId), gte(eventos.fecha, d.desde), lte(eventos.fecha, d.hasta), ne(eventos.estado, "Cancelado"), ne(eventos.estado, "Ausente")];
    if (d.recursoId) filtros.push(eq(eventos.recursoId, d.recursoId));
    const previos = (await app.db.select().from(eventos).where(and(...filtros))).filter((e) => bloqueoQueCae([b!], e.recursoId, e.fecha, e.inicio, e.fin));
    return reply.status(201).send({ ...b, turnosAfectados: previos.map((e) => ({ id: e.id, titulo: e.titulo, fecha: e.fecha, inicio: e.inicio, fin: e.fin })) });
  });

  app.delete("/bloqueos/:id", async (req, reply) => {
    const { id } = parse(idSchema, req.params);
    const [b] = await app.db.delete(agendaBloqueos).where(and(eq(agendaBloqueos.id, id), eq(agendaBloqueos.empresaId, req.user.empresaId))).returning();
    if (!b) throw notFound("Bloqueo no encontrado");
    return reply.status(204).send();
  });

  /** Horarios libres de un profesional en un día, para dar un turno rápido */
  app.get("/disponibles", async (req) => {
    const q = parse(z.object({ recursoId: z.string().uuid("Elegí a quién"), fecha: fechaIso, duracion: z.coerce.number().int().min(5).max(240).optional() }), req.query);
    const [r] = await app.db.select().from(agendaRecursos).where(and(eq(agendaRecursos.id, q.recursoId), eq(agendaRecursos.empresaId, req.user.empresaId)));
    if (!r) throw notFound("No encontrado");
    return disponibles(req.user.empresaId, r, q.fecha, q.duracion);
  });

  async function disponibles(empresaId: string, r: typeof agendaRecursos.$inferSelect, fecha: string, duracion?: number) {
    const cfg = await asegurarConfig(app.db, empresaId);
    const [ocupados, bloqueos] = await Promise.all([
      app.db
        .select({ inicio: eventos.inicio, fin: eventos.fin })
        .from(eventos)
        .where(and(eq(eventos.recursoId, r.id), eq(eventos.fecha, fecha), ne(eventos.estado, "Cancelado"), ne(eventos.estado, "Ausente"))),
      bloqueosEntre(empresaId, fecha, fecha),
    ]);
    const ahora = ahoraAr();
    const hoy = ahora.slice(0, 10);
    const libres =
      fecha < hoy
        ? []
        : turnosLibres({
            horarios: r.horarios,
            franjaGeneral: { desde: aHora(cfg.horaInicio), hasta: aHora(cfg.horaFin) },
            duracion: duracion ?? r.duracionTurno,
            fecha,
            recursoId: r.id,
            ocupados,
            bloqueos,
            desdeMin: fecha === hoy ? aMin(ahora.slice(11, 16)) : undefined,
          });
    const bloqueoDia = bloqueos.find((b) => (!b.recursoId || b.recursoId === r.id) && !b.horaDesde);
    return {
      duracion: duracion ?? r.duracionTurno,
      conHorarios: r.horarios.length > 0,
      horario: r.horarios.length ? textoHorario(r.horarios, fecha) : null,
      bloqueo: bloqueoDia?.motivo ?? null,
      libres,
    };
  }

  /**
   * Fuera de su horario de atención o en un horario bloqueado: se avisa, y se puede agendar igual (sobreturno).
   * Solo si cambió el día, el horario o a quién se asigna (editar las notas de un turno viejo no molesta).
   */
  async function controlarHorario(empresaId: string, d: z.infer<typeof eventoSchema>, recurso: typeof agendaRecursos.$inferSelect, actual?: typeof eventos.$inferSelect) {
    if (d.estado === "Cancelado" || d.estado === "Ausente" || d.permitirSuperposicion) return;
    if (actual && actual.fecha === d.fecha && actual.inicio === d.inicio && actual.fin === d.fin && actual.recursoId === d.recursoId) return;
    const [b] = (await bloqueosEntre(empresaId, d.fecha, d.fecha)).filter((x) => bloqueoQueCae([x as Bloqueo], recurso.id, d.fecha, d.inicio, d.fin));
    if (b) {
      const quien = b.recursoId ? recurso.nombre : "La agenda";
      const periodo = b.desde === b.hasta ? `el ${ddmm(b.desde)}` : `del ${ddmm(b.desde)} al ${ddmm(b.hasta)}`;
      throw new HttpError(409, `${quien} tiene bloqueado ${periodo}${b.horaDesde ? ` de ${b.horaDesde} a ${b.horaHasta}` : ""}: ${b.motivo}.`, { inicio: "Bloqueado" }, "BLOQUEADO");
    }
    if (!dentroDeHorario(recurso.horarios, d.fecha, d.inicio, d.fin)) {
      throw new HttpError(409, `Está fuera del horario de ${recurso.nombre}: ${textoHorario(recurso.horarios, d.fecha)}.`, { inicio: "Fuera de horario" }, "FUERA_DE_HORARIO");
    }
  }

  // ---------------------------------------------------------------- eventos

  const conCliente = (filtros: SQL[]) =>
    app.db
      .select({
        evento: eventos,
        clienteRazonSocial: clientes.razonSocial,
        pacienteNombre: sql<string | null>`case when ${pacientes.id} is null then null else ${pacientes.apellido} || ', ' || ${pacientes.nombre} end`,
        pacienteTelefono: pacientes.telefono,
        pacienteDatosPendientes: pacientes.datosPendientes,
      })
      .from(eventos)
      .leftJoin(clientes, eq(clientes.id, eventos.clienteId))
      .leftJoin(pacientes, eq(pacientes.id, eventos.pacienteId))
      .where(and(...filtros));

  const plano = (r: { evento: typeof eventos.$inferSelect; clienteRazonSocial: string | null; pacienteNombre: string | null; pacienteTelefono: string | null; pacienteDatosPendientes: boolean | null }) => ({
    ...r.evento,
    clienteRazonSocial: r.clienteRazonSocial,
    pacienteNombre: r.pacienteNombre,
    pacienteTelefono: r.pacienteTelefono,
    pacienteDatosPendientes: !!r.pacienteDatosPendientes,
  });

  app.get("/eventos", async (req) => {
    const q = parse(listaSchema, req.query);
    const filtros: SQL[] = [eq(eventos.empresaId, req.user.empresaId)];
    if (q.recursoId) filtros.push(eq(eventos.recursoId, q.recursoId));
    if (q.pacienteId) filtros.push(eq(eventos.pacienteId, q.pacienteId));
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
    if (d.pacienteId) {
      const [p] = await app.db.select({ nombre: pacientes.nombre, apellido: pacientes.apellido }).from(pacientes).where(and(eq(pacientes.id, d.pacienteId), eq(pacientes.empresaId, empresaId)));
      if (!p) throw badRequest("El paciente no existe", { pacienteId: "Inválido" });
      if (d.titulo.length < 2) d.titulo = `${p.apellido}, ${p.nombre}`;
    }
    return r;
  }

  /** Otro evento del mismo recurso en el mismo horario (los cancelados no cuentan) */
  async function superposicion(empresaId: string, d: z.infer<typeof eventoSchema>, recurso: typeof agendaRecursos.$inferSelect, excluir?: string) {
    if (d.estado === "Cancelado" || d.estado === "Ausente" || d.permitirSuperposicion) return;
    const filtros: SQL[] = [
      eq(eventos.empresaId, empresaId),
      eq(eventos.recursoId, d.recursoId),
      eq(eventos.fecha, d.fecha),
      ne(eventos.estado, "Cancelado"),
      ne(eventos.estado, "Ausente"),
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
    d.titulo = datos.titulo;
    await controlarHorario(empresaId, datos, recurso);
    await superposicion(empresaId, datos, recurso);
    const [ev] = await app.db.insert(eventos).values({ ...d, empresaId, usuarioId: req.user.sub }).returning();
    await avisar(empresaId, req.user.sub, recurso, "Te agendaron algo nuevo", ev!);
    // CoreDental: si el consultorio lo activó, el paciente recibe su turno por email (no frena el alta)
    if (ev!.pacienteId) {
      const [cfg] = await app.db.select({ aviso: configAgenda.avisoAlAgendar }).from(configAgenda).where(eq(configAgenda.empresaId, empresaId));
      if (cfg?.aviso) void enviarEmailTurno(app, ev!.id, "agendado", req.user.sub).catch((e) => app.log.warn(e, "No se pudo avisar el turno"));
    }
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
    d.titulo = datos.titulo;
    await controlarHorario(empresaId, datos, recurso, actual);
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
    const libre = (e: string) => e === "Cancelado" || e === "Ausente";
    if (libre(actual.estado) && !libre(estado)) {
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

  // ---------------------------------------------------------------- avisos al paciente (CoreDental)

  /** Turnos de un día con paciente, para mandar los recordatorios (WhatsApp con un clic, o email) */
  app.get("/recordatorios", async (req) => {
    const { fecha } = parse(z.object({ fecha: fechaIso }), req.query);
    const filas = await conCliente([eq(eventos.empresaId, req.user.empresaId), eq(eventos.fecha, fecha), sql`${eventos.pacienteId} is not null`]).orderBy(asc(eventos.inicio));
    const recursos = new Map((await recursosDe(req.user.empresaId)).map((r) => [r.id, r.nombre]));
    return Promise.all(
      filas.map(async (f) => {
        const [p] = await app.db.select({ email: pacientes.email }).from(pacientes).where(eq(pacientes.id, f.evento.pacienteId!));
        return { ...plano(f), profesional: recursos.get(f.evento.recursoId) ?? "", pacienteEmail: p?.email ?? null };
      }),
    );
  });

  const eventoDeEmpresa = async (empresaId: string, id: string) => {
    const [ev] = await app.db.select().from(eventos).where(and(eq(eventos.id, id), eq(eventos.empresaId, empresaId)));
    if (!ev) throw notFound("Turno no encontrado");
    if (!ev.pacienteId) throw badRequest("Este evento no tiene paciente");
    return ev;
  };

  /** Arma el mensaje de WhatsApp (con el link para confirmar) y lo deja marcado como avisado */
  app.post("/eventos/:id/whatsapp", async (req) => {
    const { id } = parse(idSchema, req.params);
    await eventoDeEmpresa(req.user.empresaId, id);
    const t = await datosDelTurno(app, id);
    const w = await textoWhatsappTurno(app, t!);
    await app.db.update(eventos).set({ avisadoWhatsappEn: new Date() }).where(eq(eventos.id, id));
    return w;
  });

  /** Manda ahora el email del turno al paciente */
  app.post("/eventos/:id/email", async (req) => {
    const { id } = parse(idSchema, req.params);
    const ev = await eventoDeEmpresa(req.user.empresaId, id);
    if (["Cancelado", "Ausente", "Realizado"].includes(ev.estado)) throw conflict(`El turno está ${ev.estado.toLowerCase()}`);
    const r = await enviarEmailTurno(app, id, "recordatorio", req.user.sub);
    if (!r) throw badRequest("El paciente no tiene email cargado");
    if (r.estado === "Error") throw new HttpError(502, `No se pudo enviar: ${r.error}`);
    return r;
  });
};
