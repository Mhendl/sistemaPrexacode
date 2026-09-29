import { and, asc, desc, eq, sql, type SQL } from "drizzle-orm";
import type { FastifyPluginAsync } from "fastify";
import { z } from "zod";
import { clientes, oportunidades, presupuestos, usuarios, roles } from "../db/schema.js";
import { permisoPorMetodo } from "../lib/auth.js";
import { hoyAr } from "../lib/cuentas.js";
import { badRequest, edicionConcurrente, notFound, parse } from "../lib/errors.js";
import { notificarUsuario } from "../lib/notificaciones.js";
import { versionSchema, fechaValida } from "../lib/validation.js";

export const ETAPAS = ["Nuevo", "Contactado", "Propuesta", "Negociación", "Ganada", "Perdida"] as const;
export type Etapa = (typeof ETAPAS)[number];
const CERRADAS: Etapa[] = ["Ganada", "Perdida"];

const fechaIso = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Fecha inválida").refine(fechaValida, "Esa fecha no existe");
const idSchema = z.object({ id: z.string().uuid("Id inválido") });
const texto = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .optional()
    .nullable()
    .transform((v) => v || null);
const etapaSchema = z.enum(ETAPAS, { errorMap: () => ({ message: "Etapa inválida" }) });

const oportunidadSchema = z
  .object({
    titulo: z.string().trim().min(2, "Poné un título").max(150),
    clienteId: z.string().uuid().optional().nullable().transform((v) => v || null),
    prospecto: texto(200),
    contacto: texto(200),
    etapa: etapaSchema.default("Nuevo"),
    monto: z.coerce.number({ invalid_type_error: "Monto inválido" }).min(0, "No puede ser negativo").max(999_999_999_999).default(0),
    responsableId: z.string().uuid().optional().nullable().transform((v) => v || null),
    cierreEstimado: fechaIso.optional().nullable().transform((v) => v || null),
    motivoPerdida: texto(300),
    notas: texto(4000),
  })
  .refine((o) => o.clienteId || o.prospecto, { message: "Elegí un cliente o escribí el nombre del prospecto", path: ["clienteId"] });

const cambioEtapaSchema = z.object({ etapa: etapaSchema, motivoPerdida: texto(300) });

const listaSchema = z.object({
  clienteId: z.string().uuid().optional(),
  responsableId: z.string().uuid().optional(),
});

/** Al cerrarla (ganada o perdida) queda la fecha; si se reabre, se limpia */
function datosDeCierre(etapa: Etapa, anterior: { etapa: string; fechaCierre: string | null } | undefined, motivo: string | null) {
  const cerrada = CERRADAS.includes(etapa);
  const yaCerradaIgual = anterior?.etapa === etapa && anterior.fechaCierre;
  return {
    fechaCierre: cerrada ? (yaCerradaIgual ? anterior!.fechaCierre : hoyAr()) : null,
    motivoPerdida: etapa === "Perdida" ? motivo : null,
  };
}

/** Puede ser responsable de una oportunidad quien ve el embudo de ventas */
const puedeVender = (u: { esAdmin: boolean | null; permisos: string[] | null }) => !!u.esAdmin || (u.permisos ?? []).includes("oportunidades.ver");

export const oportunidadesRoutes: FastifyPluginAsync = async (app) => {
  app.addHook("preHandler", permisoPorMetodo("oportunidades.ver", "oportunidades.editar"));

  const detalle = (filtros: SQL[]) =>
    app.db
      .select({
        o: oportunidades,
        clienteRazonSocial: clientes.razonSocial,
        responsableNombre: usuarios.nombre,
        presupuestoNumero: presupuestos.numero,
        presupuestoEstado: presupuestos.estado,
      })
      .from(oportunidades)
      .leftJoin(clientes, eq(clientes.id, oportunidades.clienteId))
      .leftJoin(usuarios, eq(usuarios.id, oportunidades.responsableId))
      .leftJoin(presupuestos, eq(presupuestos.id, oportunidades.presupuestoId))
      .where(and(...filtros));

  type Fila = Awaited<ReturnType<typeof detalle>>[number];
  const plano = (r: Fila) => ({
    ...r.o,
    clienteRazonSocial: r.clienteRazonSocial,
    responsableNombre: r.responsableNombre,
    presupuesto: r.o.presupuestoId ? { id: r.o.presupuestoId, numero: r.presupuestoNumero, estado: r.presupuestoEstado } : null,
  });

  const buscar = async (empresaId: string, id: string) => {
    const [r] = await detalle([eq(oportunidades.id, id), eq(oportunidades.empresaId, empresaId)]);
    if (!r) throw notFound("Oportunidad no encontrada");
    return plano(r);
  };

  /** Cliente y responsable tienen que ser de la misma empresa (el responsable, activo y con acceso a ventas) */
  async function validar(empresaId: string, d: { clienteId: string | null; responsableId: string | null }, responsableAnterior?: string | null) {
    if (d.clienteId) {
      const [c] = await app.db.select({ id: clientes.id }).from(clientes).where(and(eq(clientes.id, d.clienteId), eq(clientes.empresaId, empresaId)));
      if (!c) throw badRequest("El cliente no existe", { clienteId: "Inválido" });
    }
    if (d.responsableId && d.responsableId !== responsableAnterior) {
      const [u] = await app.db
        .select({ nombre: usuarios.nombre, estado: usuarios.estado, esAdmin: roles.esAdmin, permisos: roles.permisos })
        .from(usuarios)
        .leftJoin(roles, eq(roles.id, usuarios.rolId))
        .where(and(eq(usuarios.id, d.responsableId), eq(usuarios.empresaId, empresaId)));
      if (!u) throw badRequest("El responsable no existe", { responsableId: "Inválido" });
      if (u.estado !== "Activo" || !puedeVender(u)) throw badRequest(`${u.nombre} no puede ser responsable de ventas`, { responsableId: "Sin acceso a ventas" });
    }
  }

  async function avisarAsignacion(empresaId: string, quien: string, responsableId: string | null, o: { id: string; titulo: string; monto: number }) {
    if (!responsableId || responsableId === quien) return;
    await notificarUsuario(app.db, empresaId, responsableId, {
      tipo: "oportunidad_asignada",
      titulo: "Te asignaron una oportunidad",
      detalle: `${o.titulo} · $ ${o.monto.toLocaleString("es-AR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`,
      link: `/oportunidades?id=${o.id}`,
    });
  }

  /** Quiénes pueden ser responsables (Ventas no tiene acceso a la lista completa de usuarios) */
  app.get("/responsables", async (req) =>
    (
      await app.db
        .select({ id: usuarios.id, nombre: usuarios.nombre, esAdmin: roles.esAdmin, permisos: roles.permisos })
        .from(usuarios)
        .leftJoin(roles, eq(roles.id, usuarios.rolId))
        .where(and(eq(usuarios.empresaId, req.user.empresaId), eq(usuarios.estado, "Activo")))
        .orderBy(asc(usuarios.nombre))
    )
      .filter(puedeVender)
      .map(({ id, nombre }) => ({ id, nombre })),
  );

  app.get("/", async (req) => {
    const q = parse(listaSchema, req.query);
    const filtros: SQL[] = [eq(oportunidades.empresaId, req.user.empresaId)];
    if (q.clienteId) filtros.push(eq(oportunidades.clienteId, q.clienteId));
    if (q.responsableId) filtros.push(eq(oportunidades.responsableId, q.responsableId));
    const rows = await detalle(filtros).orderBy(desc(oportunidades.updatedAt));
    return rows.map(plano);
  });

  app.get("/:id", async (req) => {
    const { id } = parse(idSchema, req.params);
    return buscar(req.user.empresaId, id);
  });

  app.post("/", async (req, reply) => {
    const d = parse(oportunidadSchema, req.body);
    const empresaId = req.user.empresaId;
    await validar(empresaId, d);
    const [o] = await app.db
      .insert(oportunidades)
      .values({ ...d, ...datosDeCierre(d.etapa, undefined, d.motivoPerdida), prospecto: d.clienteId ? null : d.prospecto, empresaId, usuarioId: req.user.sub })
      .returning();
    await avisarAsignacion(empresaId, req.user.sub, o!.responsableId, o!);
    return reply.status(201).send(await buscar(empresaId, o!.id));
  });

  app.put("/:id", async (req) => {
    const { id } = parse(idSchema, req.params);
    const d = parse(oportunidadSchema, req.body);
    const { version } = parse(versionSchema, req.body);
    const empresaId = req.user.empresaId;
    const [actual] = await app.db.select().from(oportunidades).where(and(eq(oportunidades.id, id), eq(oportunidades.empresaId, empresaId)));
    if (!actual) throw notFound("Oportunidad no encontrada");
    if (version && version !== actual.version) throw edicionConcurrente("esta oportunidad");
    await validar(empresaId, d, actual.responsableId);

    const filtros: SQL[] = [eq(oportunidades.id, id), eq(oportunidades.empresaId, empresaId)];
    if (version) filtros.push(eq(oportunidades.version, version));
    const [o] = await app.db
      .update(oportunidades)
      .set({ ...d, ...datosDeCierre(d.etapa, actual, d.motivoPerdida), prospecto: d.clienteId ? null : d.prospecto, version: sql`${oportunidades.version} + 1`, updatedAt: new Date() })
      .where(and(...filtros))
      .returning();
    if (!o) throw edicionConcurrente("esta oportunidad");
    if (o.responsableId !== actual.responsableId) await avisarAsignacion(empresaId, req.user.sub, o.responsableId, o);
    return buscar(empresaId, id);
  });

  /** Mover de etapa (arrastrar en el tablero) */
  app.post("/:id/etapa", async (req) => {
    const { id } = parse(idSchema, req.params);
    const { etapa, motivoPerdida } = parse(cambioEtapaSchema, req.body);
    const empresaId = req.user.empresaId;
    const [actual] = await app.db.select().from(oportunidades).where(and(eq(oportunidades.id, id), eq(oportunidades.empresaId, empresaId)));
    if (!actual) throw notFound("Oportunidad no encontrada");
    await app.db
      .update(oportunidades)
      .set({ etapa, ...datosDeCierre(etapa, actual, motivoPerdida ?? actual.motivoPerdida), version: sql`${oportunidades.version} + 1`, updatedAt: new Date() })
      .where(eq(oportunidades.id, id));
    return buscar(empresaId, id);
  });

  app.delete("/:id", async (req, reply) => {
    const { id } = parse(idSchema, req.params);
    const [o] = await app.db.delete(oportunidades).where(and(eq(oportunidades.id, id), eq(oportunidades.empresaId, req.user.empresaId))).returning({ id: oportunidades.id });
    if (!o) throw notFound("Oportunidad no encontrada");
    return reply.status(204).send();
  });
};
