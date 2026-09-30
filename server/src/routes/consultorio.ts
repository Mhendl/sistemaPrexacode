import { and, asc, desc, eq, gt, gte, isNull, lte, sql } from "drizzle-orm";
import type { FastifyPluginAsync, FastifyRequest } from "fastify";
import { z } from "zod";
import { cajas, cargosPaciente, gastos, ingresosCaja, obrasSociales, pacientes, pagosPaciente, prestaciones, usuarios } from "../db/schema.js";
import { r2 } from "../lib/arca/montos.js";
import { requireAuth, requirePermiso } from "../lib/auth.js";
import { diasEntre, hoyAr } from "../lib/cuentas.js";
import { CATEGORIAS_GASTO, exigirCajaAbierta, MEDIOS_DENTAL, resumenCaja } from "../lib/cuentasDental.js";
import { badRequest, conflict, notFound, parse } from "../lib/errors.js";
import { productoDeEmpresa } from "../lib/productos.js";
import { fechaValida, MAX_IMPORTE } from "../lib/validation.js";

const fechaIso = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Fecha inválida").refine(fechaValida, "Esa fecha no existe");
const noFutura = (f?: string) => !f || f <= hoyAr();
const importe = z.coerce.number({ invalid_type_error: "Importe inválido" }).min(0, "No puede ser negativo").max(MAX_IMPORTE, "Importe demasiado grande");
const texto = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .optional()
    .nullable()
    .transform((v) => v || null);
const periodoSchema = z
  .object({ desde: fechaIso, hasta: fechaIso })
  .refine((p) => p.hasta >= p.desde, { message: "El período está invertido", path: ["hasta"] })
  .refine((p) => diasEntre(p.desde, p.hasta) <= 400, { message: "El período puede ser de hasta un año", path: ["hasta"] });

/** Caja diaria, gastos, deudores y liquidación a obras sociales (CoreDental) */
export const consultorioRoutes: FastifyPluginAsync = async (app) => {
  app.addHook("preHandler", async (req, reply) => {
    await requireAuth(req, reply);
    if ((await productoDeEmpresa(app.db, req.user.empresaId)) !== "dental") throw notFound("Esta sección es de CoreDental");
  });
  const ver = requirePermiso("cobranzas.ver");
  const operar = requirePermiso("cobranzas.cobrar");
  const anular = requirePermiso("cobranzas.anular");

  const autorDe = async (req: FastifyRequest) => {
    const [u] = await app.db.select({ nombre: usuarios.nombre }).from(usuarios).where(eq(usuarios.id, req.user.sub));
    return u?.nombre ?? "Usuario";
  };

  // ---------------------------------------------------------------- caja diaria

  app.get("/caja", { preHandler: ver }, async (req) => {
    const { fecha } = parse(z.object({ fecha: fechaIso.optional() }), req.query);
    return resumenCaja(app.db, req.user.empresaId, fecha ?? hoyAr());
  });

  app.post("/caja/abrir", { preHandler: operar }, async (req, reply) => {
    const d = parse(z.object({ fecha: fechaIso.optional().refine(noFutura, "No se abre una caja futura"), aperturaEfectivo: importe }), req.body);
    const fecha = d.fecha ?? hoyAr();
    const [c] = await app.db.insert(cajas).values({ empresaId: req.user.empresaId, fecha, aperturaEfectivo: r2(d.aperturaEfectivo), abiertaPor: await autorDe(req) }).onConflictDoNothing().returning();
    if (!c) throw conflict("La caja de ese día ya estaba abierta");
    return reply.status(201).send(await resumenCaja(app.db, req.user.empresaId, fecha));
  });

  /** Cierre con arqueo: se cuenta el efectivo y queda la diferencia con lo que tenía que haber */
  app.post("/caja/cerrar", { preHandler: operar }, async (req) => {
    const d = parse(z.object({ fecha: fechaIso.optional(), contadoEfectivo: importe, notas: texto(500) }), req.body);
    const fecha = d.fecha ?? hoyAr();
    const r = await resumenCaja(app.db, req.user.empresaId, fecha);
    if (!r.caja) throw conflict("La caja de ese día no se abrió");
    if (r.caja.cerradaEn) throw conflict("La caja de ese día ya está cerrada");
    const [c] = await app.db
      .update(cajas)
      .set({ esperadoEfectivo: r.esperadoEfectivo, contadoEfectivo: r2(d.contadoEfectivo), diferencia: r2(d.contadoEfectivo - r.esperadoEfectivo), cerradaPor: await autorDe(req), cerradaEn: new Date(), notas: d.notas, version: sql`${cajas.version} + 1` })
      .where(and(eq(cajas.id, r.caja.id), isNull(cajas.cerradaEn)))
      .returning();
    if (!c) throw conflict("Otra persona la cerró recién. Actualizá la pantalla.");
    return resumenCaja(app.db, req.user.empresaId, fecha);
  });

  /** Solo el administrador reabre una caja cerrada (por ejemplo, para corregir un cobro) */
  app.post("/caja/reabrir", { preHandler: requirePermiso("configuracion") }, async (req) => {
    const { fecha } = parse(z.object({ fecha: fechaIso }), req.body);
    if (!req.user.esAdmin) throw badRequest("Solo un administrador puede reabrir la caja");
    const [c] = await app.db
      .update(cajas)
      .set({ esperadoEfectivo: null, contadoEfectivo: null, diferencia: null, cerradaPor: null, cerradaEn: null, version: sql`${cajas.version} + 1` })
      .where(and(eq(cajas.empresaId, req.user.empresaId), eq(cajas.fecha, fecha)))
      .returning();
    if (!c) throw notFound("No hay caja ese día");
    return resumenCaja(app.db, req.user.empresaId, fecha);
  });

  app.post("/ingresos", { preHandler: operar }, async (req, reply) => {
    const d = parse(
      z.object({
        concepto: z.string().trim().min(2, "Poné el concepto").max(200),
        importe: importe.refine((v) => v > 0, "Tiene que ser mayor a cero"),
        medio: z.enum(MEDIOS_DENTAL, { errorMap: () => ({ message: "Elegí el medio" }) }),
        fecha: fechaIso.optional().refine(noFutura, "La fecha no puede ser futura"),
      }),
      req.body,
    );
    const fecha = d.fecha ?? hoyAr();
    await exigirCajaAbierta(app.db, req.user.empresaId, fecha, d.medio);
    const [i] = await app.db.insert(ingresosCaja).values({ empresaId: req.user.empresaId, fecha, concepto: d.concepto, importe: r2(d.importe), medio: d.medio, usuarioId: req.user.sub, cargadoPor: await autorDe(req) }).returning();
    return reply.status(201).send(i);
  });

  app.post("/ingresos/:id/anular", { preHandler: anular }, async (req) => {
    const { id } = parse(z.object({ id: z.string().uuid() }), req.params);
    const [i] = await app.db.select().from(ingresosCaja).where(and(eq(ingresosCaja.id, id), eq(ingresosCaja.empresaId, req.user.empresaId)));
    if (!i) throw notFound("Ingreso no encontrado");
    if (i.anuladoEn) throw conflict("Ya estaba anulado");
    await exigirCajaAbierta(app.db, req.user.empresaId, i.fecha, i.medio);
    const [r] = await app.db.update(ingresosCaja).set({ anuladoEn: new Date() }).where(eq(ingresosCaja.id, id)).returning();
    return r;
  });

  // ---------------------------------------------------------------- gastos

  app.get("/gastos", { preHandler: ver }, async (req) => {
    const p = parse(periodoSchema, req.query);
    const lista = await app.db
      .select()
      .from(gastos)
      .where(and(eq(gastos.empresaId, req.user.empresaId), gte(gastos.fecha, p.desde), lte(gastos.fecha, p.hasta)))
      .orderBy(desc(gastos.fecha), desc(gastos.createdAt));
    const vigentes = lista.filter((g) => !g.anuladoEn);
    const porCategoria = CATEGORIAS_GASTO.map((c) => ({ categoria: c, total: r2(vigentes.filter((g) => g.categoria === c).reduce((a, g) => a + g.importe, 0)) })).filter((c) => c.total > 0);
    return { gastos: lista, total: r2(vigentes.reduce((a, g) => a + g.importe, 0)), porCategoria };
  });

  app.post("/gastos", { preHandler: operar }, async (req, reply) => {
    const d = parse(
      z.object({
        fecha: fechaIso.optional().refine(noFutura, "La fecha no puede ser futura"),
        categoria: z.enum(CATEGORIAS_GASTO, { errorMap: () => ({ message: "Elegí la categoría" }) }),
        descripcion: z.string().trim().min(2, "Contá qué se pagó").max(300),
        proveedor: texto(120),
        importe: importe.refine((v) => v > 0, "Tiene que ser mayor a cero"),
        medio: z.enum(MEDIOS_DENTAL, { errorMap: () => ({ message: "Elegí cómo se pagó" }) }),
        comprobante: texto(60),
      }),
      req.body,
    );
    const fecha = d.fecha ?? hoyAr();
    await exigirCajaAbierta(app.db, req.user.empresaId, fecha, d.medio);
    const [g] = await app.db.insert(gastos).values({ ...d, fecha, importe: r2(d.importe), empresaId: req.user.empresaId, usuarioId: req.user.sub, cargadoPor: await autorDe(req) }).returning();
    return reply.status(201).send(g);
  });

  app.post("/gastos/:id/anular", { preHandler: anular }, async (req) => {
    const { id } = parse(z.object({ id: z.string().uuid() }), req.params);
    const { motivo } = parse(z.object({ motivo: z.string().trim().min(3, "Contá por qué se anula").max(300) }), req.body);
    const [g] = await app.db.select().from(gastos).where(and(eq(gastos.id, id), eq(gastos.empresaId, req.user.empresaId)));
    if (!g) throw notFound("Gasto no encontrado");
    if (g.anuladoEn) throw conflict("Ya estaba anulado");
    await exigirCajaAbierta(app.db, req.user.empresaId, g.fecha, g.medio);
    const [r] = await app.db.update(gastos).set({ anuladoEn: new Date(), anuladoPor: await autorDe(req), motivoAnulacion: motivo }).where(and(eq(gastos.id, id), isNull(gastos.anuladoEn))).returning();
    return r;
  });

  // ---------------------------------------------------------------- deudores y resumen

  /** Pacientes que deben (o tienen saldo a favor), y los últimos pagos */
  app.get("/cobros", { preHandler: ver }, async (req) => {
    const empresaId = req.user.empresaId;
    const [lista, cargos, pagos] = await Promise.all([
      app.db.select({ id: pacientes.id, nombre: pacientes.nombre, apellido: pacientes.apellido, telefono: pacientes.telefono }).from(pacientes).where(eq(pacientes.empresaId, empresaId)),
      app.db
        .select({ id: cargosPaciente.pacienteId, t: sql<number>`sum(${cargosPaciente.importePaciente})::float` })
        .from(cargosPaciente)
        .where(and(eq(cargosPaciente.empresaId, empresaId), isNull(cargosPaciente.anuladoEn)))
        .groupBy(cargosPaciente.pacienteId),
      app.db
        .select({ id: pagosPaciente.pacienteId, t: sql<number>`sum(${pagosPaciente.importe})::float` })
        .from(pagosPaciente)
        .where(and(eq(pagosPaciente.empresaId, empresaId), isNull(pagosPaciente.anuladoEn)))
        .groupBy(pagosPaciente.pacienteId),
    ]);
    const c = new Map(cargos.map((x) => [x.id, Number(x.t)]));
    const g = new Map(pagos.map((x) => [x.id, Number(x.t)]));
    const filas = lista.map((p) => ({ ...p, cargos: r2(c.get(p.id) ?? 0), pagos: r2(g.get(p.id) ?? 0) }));
    const conSaldo = filas.map((f) => ({ ...f, saldo: r2(Number(f.cargos) - Number(f.pagos)) })).filter((f) => f.saldo !== 0);
    const ultimos = await app.db
      .select({ pago: pagosPaciente, paciente: sql<string>`${pacientes.apellido} || ', ' || ${pacientes.nombre}` })
      .from(pagosPaciente)
      .innerJoin(pacientes, eq(pacientes.id, pagosPaciente.pacienteId))
      .where(eq(pagosPaciente.empresaId, empresaId))
      .orderBy(desc(pagosPaciente.createdAt))
      .limit(30);
    const deudores = conSaldo.filter((f) => f.saldo > 0).sort((a, b) => b.saldo - a.saldo);
    return {
      deudores,
      aFavor: conSaldo.filter((f) => f.saldo < 0),
      totalAdeudado: r2(deudores.reduce((a, f) => a + f.saldo, 0)),
      ultimosPagos: ultimos.map((u) => ({ ...u.pago, paciente: u.paciente })),
    };
  });

  /** Resultado del período: lo cobrado a pacientes, lo que falta liquidar a obras sociales y lo gastado */
  app.get("/resumen", { preHandler: ver }, async (req) => {
    const p = parse(periodoSchema, req.query);
    const empresaId = req.user.empresaId;
    const [[cobrado], [otros], [gastado], [realizado]] = await Promise.all([
      app.db.select({ t: sql<number>`coalesce(sum(${pagosPaciente.importe}), 0)::float` }).from(pagosPaciente).where(and(eq(pagosPaciente.empresaId, empresaId), isNull(pagosPaciente.anuladoEn), gte(pagosPaciente.fecha, p.desde), lte(pagosPaciente.fecha, p.hasta))),
      app.db.select({ t: sql<number>`coalesce(sum(${ingresosCaja.importe}), 0)::float` }).from(ingresosCaja).where(and(eq(ingresosCaja.empresaId, empresaId), isNull(ingresosCaja.anuladoEn), gte(ingresosCaja.fecha, p.desde), lte(ingresosCaja.fecha, p.hasta))),
      app.db.select({ t: sql<number>`coalesce(sum(${gastos.importe}), 0)::float` }).from(gastos).where(and(eq(gastos.empresaId, empresaId), isNull(gastos.anuladoEn), gte(gastos.fecha, p.desde), lte(gastos.fecha, p.hasta))),
      app.db
        .select({ paciente: sql<number>`coalesce(sum(${cargosPaciente.importePaciente}), 0)::float`, obraSocial: sql<number>`coalesce(sum(${cargosPaciente.importeObraSocial}), 0)::float`, n: sql<number>`count(*)::int` })
        .from(cargosPaciente)
        .where(and(eq(cargosPaciente.empresaId, empresaId), isNull(cargosPaciente.anuladoEn), gte(cargosPaciente.fecha, p.desde), lte(cargosPaciente.fecha, p.hasta))),
    ]);
    const ingresos = r2(Number(cobrado?.t ?? 0) + Number(otros?.t ?? 0));
    return {
      ...p,
      cobradoPacientes: r2(Number(cobrado?.t ?? 0)),
      otrosIngresos: r2(Number(otros?.t ?? 0)),
      gastos: r2(Number(gastado?.t ?? 0)),
      resultado: r2(ingresos - Number(gastado?.t ?? 0)),
      prestaciones: Number(realizado?.n ?? 0),
      facturadoPacientes: r2(Number(realizado?.paciente ?? 0)),
      aLiquidarObrasSociales: r2(Number(realizado?.obraSocial ?? 0)),
    };
  });

  // ---------------------------------------------------------------- liquidación a obras sociales

  /** Prestaciones realizadas a afiliados de una obra social en el período, con lo que hay que facturarle */
  app.get("/liquidacion", { preHandler: requirePermiso("reportes.ver") }, async (req) => {
    const q = parse(periodoSchema.and(z.object({ obraSocialId: z.string().uuid("Elegí la obra social") })), req.query);
    const [os] = await app.db.select().from(obrasSociales).where(and(eq(obrasSociales.id, q.obraSocialId), eq(obrasSociales.empresaId, req.user.empresaId)));
    if (!os) throw badRequest("La obra social no existe", { obraSocialId: "Inválida" });
    const filas = await app.db
      .select({
        id: cargosPaciente.id,
        fecha: cargosPaciente.fecha,
        paciente: sql<string>`${pacientes.apellido} || ', ' || ${pacientes.nombre}`,
        dni: pacientes.dni,
        plan: cargosPaciente.plan,
        numeroAfiliado: cargosPaciente.numeroAfiliado,
        codigo: prestaciones.codigo,
        prestacion: prestaciones.nombre,
        pieza: cargosPaciente.pieza,
        caras: cargosPaciente.caras,
        profesional: cargosPaciente.profesional,
        importeObraSocial: cargosPaciente.importeObraSocial,
        importePaciente: cargosPaciente.importePaciente,
      })
      .from(cargosPaciente)
      .innerJoin(pacientes, eq(pacientes.id, cargosPaciente.pacienteId))
      .innerJoin(prestaciones, eq(prestaciones.id, cargosPaciente.prestacionId))
      .where(
        and(
          eq(cargosPaciente.empresaId, req.user.empresaId),
          eq(cargosPaciente.obraSocialId, q.obraSocialId),
          isNull(cargosPaciente.anuladoEn),
          gte(cargosPaciente.fecha, q.desde),
          lte(cargosPaciente.fecha, q.hasta),
          gt(cargosPaciente.importeObraSocial, 0),
        ),
      )
      .orderBy(asc(cargosPaciente.fecha), asc(pacientes.apellido));
    return { obraSocial: os.nombre, desde: q.desde, hasta: q.hasta, prestaciones: filas, total: r2(filas.reduce((a, f) => a + f.importeObraSocial, 0)), pacientes: new Set(filas.map((f) => f.dni ?? f.paciente)).size };
  });
};
