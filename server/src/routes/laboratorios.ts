import { and, asc, desc, eq, isNull, sql } from "drizzle-orm";
import type { FastifyPluginAsync, FastifyRequest } from "fastify";
import { z } from "zod";
import { gastos, laboratorios, pacientes, trabajosLaboratorio, usuarios } from "../db/schema.js";
import { r2 } from "../lib/arca/montos.js";
import { requireAuth, requirePermiso, tienePermiso } from "../lib/auth.js";
import { hoyAr } from "../lib/cuentas.js";
import { exigirCajaAbierta, MEDIOS_DENTAL } from "../lib/cuentasDental.js";
import { PIEZAS } from "../lib/dental.js";
import { badRequest, conflict, forbidden, notFound, parse } from "../lib/errors.js";
import { productoDeEmpresa } from "../lib/productos.js";
import { fechaValida, MAX_IMPORTE } from "../lib/validation.js";

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
const importe = z.coerce.number({ invalid_type_error: "Importe inválido" }).min(0, "No puede ser negativo").max(MAX_IMPORTE, "Importe demasiado grande");

const esDuplicado = (e: unknown) => {
  const err = e as { code?: string; cause?: { code?: string } };
  return err?.code === "23505" || err?.cause?.code === "23505";
};

/** Laboratorios dentales: trabajos encargados, cuándo vuelven y cuánto se les debe (CoreDental) */
export const laboratoriosRoutes: FastifyPluginAsync = async (app) => {
  app.addHook("preHandler", async (req, reply) => {
    await requireAuth(req, reply);
    if ((await productoDeEmpresa(app.db, req.user.empresaId)) !== "dental") throw notFound("Esta sección es de CoreDental");
  });
  const ver = requirePermiso("laboratorios.ver");
  const editar = requirePermiso("laboratorios.editar");

  const autorDe = async (req: FastifyRequest) => {
    const [u] = await app.db.select({ nombre: usuarios.nombre }).from(usuarios).where(eq(usuarios.id, req.user.sub));
    return u?.nombre ?? "Usuario";
  };

  /** Lo que se le debe a cada laboratorio: trabajos (no cancelados) menos pagos (gastos no anulados) */
  async function saldos(empresaId: string) {
    const [trabajos, pagos] = await Promise.all([
      app.db
        .select({ id: trabajosLaboratorio.laboratorioId, t: sql<number>`sum(${trabajosLaboratorio.importe})::float`, pendientes: sql<number>`count(*) filter (where ${trabajosLaboratorio.estado} = 'Enviado')::int` })
        .from(trabajosLaboratorio)
        .where(and(eq(trabajosLaboratorio.empresaId, empresaId), sql`${trabajosLaboratorio.estado} <> 'Cancelado'`))
        .groupBy(trabajosLaboratorio.laboratorioId),
      app.db
        .select({ id: gastos.laboratorioId, t: sql<number>`sum(${gastos.importe})::float` })
        .from(gastos)
        .where(and(eq(gastos.empresaId, empresaId), isNull(gastos.anuladoEn), sql`${gastos.laboratorioId} is not null`))
        .groupBy(gastos.laboratorioId),
    ]);
    return {
      trabajos: new Map(trabajos.map((t) => [t.id, { total: Number(t.t), pendientes: Number(t.pendientes) }])),
      pagado: new Map(pagos.map((p) => [p.id!, Number(p.t)])),
    };
  }

  const labDe = async (empresaId: string, id: string) => {
    const [l] = await app.db.select().from(laboratorios).where(and(eq(laboratorios.id, id), eq(laboratorios.empresaId, empresaId)));
    if (!l) throw notFound("Laboratorio no encontrado");
    return l;
  };

  app.get("/", { preHandler: ver }, async (req) => {
    const lista = await app.db.select().from(laboratorios).where(eq(laboratorios.empresaId, req.user.empresaId)).orderBy(asc(laboratorios.nombre));
    const s = await saldos(req.user.empresaId);
    return lista.map((l) => {
      const trabajos = r2(s.trabajos.get(l.id)?.total ?? 0);
      const pagado = r2(s.pagado.get(l.id) ?? 0);
      return { ...l, trabajos, pagado, saldo: r2(trabajos - pagado), pendientes: s.trabajos.get(l.id)?.pendientes ?? 0 };
    });
  });

  const labSchema = z.object({ nombre: z.string().trim().min(2, "Poné el nombre").max(120), telefono: texto(40), email: z.union([z.string().trim().email("Email inválido"), z.literal(""), z.null()]).optional().transform((v) => v || null), notas: texto(500), activo: z.boolean().optional() });

  app.post("/", { preHandler: editar }, async (req, reply) => {
    const d = parse(labSchema, req.body);
    try {
      const [l] = await app.db.insert(laboratorios).values({ ...d, empresaId: req.user.empresaId }).returning();
      return reply.status(201).send(l);
    } catch (e) {
      if (esDuplicado(e)) throw conflict("Ya hay un laboratorio con ese nombre", { nombre: "Ya existe" });
      throw e;
    }
  });

  app.put("/:id", { preHandler: editar }, async (req) => {
    const { id } = parse(idSchema, req.params);
    const d = parse(labSchema, req.body);
    await labDe(req.user.empresaId, id);
    try {
      const [l] = await app.db.update(laboratorios).set({ ...d, version: sql`${laboratorios.version} + 1` }).where(eq(laboratorios.id, id)).returning();
      return l;
    } catch (e) {
      if (esDuplicado(e)) throw conflict("Ya hay un laboratorio con ese nombre", { nombre: "Ya existe" });
      throw e;
    }
  });

  /** Un laboratorio con sus trabajos, sus pagos y el saldo */
  app.get("/:id", { preHandler: ver }, async (req) => {
    const { id } = parse(idSchema, req.params);
    const l = await labDe(req.user.empresaId, id);
    const [trabajos, pagos] = await Promise.all([
      app.db
        .select({ t: trabajosLaboratorio, paciente: sql<string | null>`case when ${pacientes.id} is null then null else ${pacientes.apellido} || ', ' || ${pacientes.nombre} end` })
        .from(trabajosLaboratorio)
        .leftJoin(pacientes, eq(pacientes.id, trabajosLaboratorio.pacienteId))
        .where(eq(trabajosLaboratorio.laboratorioId, id))
        .orderBy(desc(trabajosLaboratorio.fechaEnvio), desc(trabajosLaboratorio.createdAt)),
      app.db.select().from(gastos).where(and(eq(gastos.laboratorioId, id), eq(gastos.empresaId, req.user.empresaId))).orderBy(desc(gastos.fecha), desc(gastos.createdAt)),
    ]);
    const deuda = trabajos.filter((x) => x.t.estado !== "Cancelado").reduce((a, x) => a + x.t.importe, 0);
    const pagado = pagos.filter((p) => !p.anuladoEn).reduce((a, p) => a + p.importe, 0);
    return { ...l, trabajos: trabajos.map((x) => ({ ...x.t, paciente: x.paciente })), pagos, totalTrabajos: r2(deuda), pagado: r2(pagado), saldo: r2(deuda - pagado) };
  });

  /** Encargar un trabajo */
  app.post("/:id/trabajos", { preHandler: editar }, async (req, reply) => {
    const { id } = parse(idSchema, req.params);
    const d = parse(
      z
        .object({
          descripcion: z.string().trim().min(2, "Contá qué trabajo es").max(300),
          pacienteId: z.string().uuid().optional().nullable().transform((v) => v || null),
          pieza: z.number().int().refine((p) => PIEZAS.includes(p), "Pieza inválida").optional().nullable(),
          fechaEnvio: fechaIso.optional(),
          fechaPrevista: z.union([fechaIso, z.literal(""), z.null()]).optional().transform((v) => v || null),
          importe,
          notas: texto(500),
        })
        .refine((x) => !x.fechaPrevista || !x.fechaEnvio || x.fechaPrevista >= x.fechaEnvio, { message: "No puede volver antes de enviarse", path: ["fechaPrevista"] }),
      req.body,
    );
    const l = await labDe(req.user.empresaId, id);
    if (!l.activo) throw badRequest("El laboratorio está desactivado");
    if (d.pacienteId) {
      const [p] = await app.db.select({ id: pacientes.id }).from(pacientes).where(and(eq(pacientes.id, d.pacienteId), eq(pacientes.empresaId, req.user.empresaId)));
      if (!p) throw badRequest("El paciente no existe", { pacienteId: "Inválido" });
    }
    const [t] = await app.db
      .insert(trabajosLaboratorio)
      .values({ ...d, pieza: d.pieza ?? null, importe: r2(d.importe), fechaEnvio: d.fechaEnvio ?? hoyAr(), empresaId: req.user.empresaId, laboratorioId: id, profesional: await autorDe(req), usuarioId: req.user.sub })
      .returning();
    return reply.status(201).send(t);
  });

  const trabajoDe = async (empresaId: string, trabajoId: string) => {
    const [t] = await app.db.select().from(trabajosLaboratorio).where(and(eq(trabajosLaboratorio.id, trabajoId), eq(trabajosLaboratorio.empresaId, empresaId)));
    if (!t) throw notFound("Trabajo no encontrado");
    return t;
  };

  app.post("/trabajos/:trabajoId/recibir", { preHandler: editar }, async (req) => {
    const { trabajoId } = parse(z.object({ trabajoId: z.string().uuid() }), req.params);
    const t = await trabajoDe(req.user.empresaId, trabajoId);
    if (t.estado !== "Enviado") throw conflict(`El trabajo está ${t.estado.toLowerCase()}`);
    const [r] = await app.db.update(trabajosLaboratorio).set({ estado: "Recibido", fechaRecibido: hoyAr() }).where(and(eq(trabajosLaboratorio.id, trabajoId), eq(trabajosLaboratorio.estado, "Enviado"))).returning();
    return r;
  });

  app.post("/trabajos/:trabajoId/cancelar", { preHandler: editar }, async (req) => {
    const { trabajoId } = parse(z.object({ trabajoId: z.string().uuid() }), req.params);
    const { motivo } = parse(z.object({ motivo: z.string().trim().min(3, "Contá por qué se cancela").max(300) }), req.body);
    const t = await trabajoDe(req.user.empresaId, trabajoId);
    if (t.estado === "Cancelado") throw conflict("Ya estaba cancelado");
    const [r] = await app.db.update(trabajosLaboratorio).set({ estado: "Cancelado", notas: [t.notas, `Cancelado: ${motivo}`].filter(Boolean).join(" · ") }).where(eq(trabajosLaboratorio.id, trabajoId)).returning();
    return r;
  });

  /** Pago al laboratorio: queda como gasto de la categoría Laboratorio (pasa por la caja y el resultado) */
  app.post("/:id/pagos", { preHandler: editar }, async (req, reply) => {
    if (!tienePermiso(req, "cobranzas.cobrar")) throw forbidden("Para pagarle a un laboratorio hace falta el permiso de registrar cobros y pagos");
    const { id } = parse(idSchema, req.params);
    const d = parse(
      z.object({
        importe: importe.refine((v) => v > 0, "Tiene que ser mayor a cero"),
        medio: z.enum(MEDIOS_DENTAL, { errorMap: () => ({ message: "Elegí cómo se pagó" }) }),
        fecha: fechaIso.optional().refine((f) => !f || f <= hoyAr(), "La fecha no puede ser futura"),
        comprobante: texto(60),
      }),
      req.body,
    );
    const l = await labDe(req.user.empresaId, id);
    const fecha = d.fecha ?? hoyAr();
    await exigirCajaAbierta(app.db, req.user.empresaId, fecha, d.medio);
    const [g] = await app.db
      .insert(gastos)
      .values({ empresaId: req.user.empresaId, fecha, categoria: "Laboratorio", descripcion: `Pago a ${l.nombre}`, proveedor: l.nombre, importe: r2(d.importe), medio: d.medio, comprobante: d.comprobante, laboratorioId: l.id, usuarioId: req.user.sub, cargadoPor: await autorDe(req) })
      .returning();
    return reply.status(201).send(g);
  });

  /** Trabajos de un paciente (para su ficha) */
  app.get("/trabajos/paciente/:pacienteId", { preHandler: ver }, async (req) => {
    const { pacienteId } = parse(z.object({ pacienteId: z.string().uuid() }), req.params);
    return app.db
      .select({ t: trabajosLaboratorio, laboratorio: laboratorios.nombre })
      .from(trabajosLaboratorio)
      .innerJoin(laboratorios, eq(laboratorios.id, trabajosLaboratorio.laboratorioId))
      .where(and(eq(trabajosLaboratorio.pacienteId, pacienteId), eq(trabajosLaboratorio.empresaId, req.user.empresaId)))
      .orderBy(desc(trabajosLaboratorio.fechaEnvio))
      .then((f) => f.map((x) => ({ ...x.t, laboratorio: x.laboratorio })));
  });
};
