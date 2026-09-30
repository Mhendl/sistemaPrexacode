import { and, asc, eq, gte, isNull, lte, ne, sql } from "drizzle-orm";
import type { FastifyPluginAsync } from "fastify";
import { z } from "zod";
import { cargosPaciente, gastos, honorariosConfig, pacientes, prestaciones, trabajosLaboratorio, usuarios } from "../db/schema.js";
import { r2 } from "../lib/arca/montos.js";
import { requireAuth, requirePermiso } from "../lib/auth.js";
import { hoyAr } from "../lib/cuentas.js";
import { exigirCajaAbierta, MEDIOS_DENTAL } from "../lib/cuentasDental.js";
import { badRequest, conflict, edicionConcurrente, notFound, parse } from "../lib/errors.js";
import { productoDeEmpresa } from "../lib/productos.js";
import { fechaValida, MAX_IMPORTE } from "../lib/validation.js";

const MESES = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"];
const mesSchema = z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/, "Mes inválido (aaaa-mm)");
const fechaIso = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Fecha inválida").refine(fechaValida, "Esa fecha no existe");
const idSchema = z.object({ usuarioId: z.string().uuid("Id inválido") });

/** Primer y último día del mes */
export function rangoDelMes(mes: string) {
  const [a, m] = mes.split("-").map(Number) as [number, number];
  const ultimo = new Date(Date.UTC(a, m, 0)).getUTCDate();
  return { desde: `${mes}-01`, hasta: `${mes}-${String(ultimo).padStart(2, "0")}` };
}
export const nombreDelMes = (mes: string) => `${MESES[Number(mes.slice(5, 7)) - 1]} ${mes.slice(0, 4)}`;

/**
 * Honorarios por porcentaje (CoreDental): a cada profesional le corresponde un porcentaje de lo que produjo en el mes
 * (las prestaciones que registró como realizadas: lo que paga el paciente más lo que paga la obra social),
 * descontando, si así se acordó, los trabajos de laboratorio que encargó. Los pagos quedan en Gastos.
 */
export const honorariosRoutes: FastifyPluginAsync = async (app) => {
  app.addHook("preHandler", async (req, reply) => {
    await requireAuth(req, reply);
    if ((await productoDeEmpresa(app.db, req.user.empresaId)) !== "dental") throw notFound("Esta sección es de CoreDental");
  });
  const ver = requirePermiso("empleados.ver");
  const editar = requirePermiso("empleados.editar");

  /** Lo producido, el laboratorio y lo pagado de cada profesional en el mes */
  async function liquidar(empresaId: string, mes: string) {
    const { desde, hasta } = rangoDelMes(mes);
    const [us, cfgs, prod, lab, pag] = await Promise.all([
      app.db.select({ id: usuarios.id, nombre: usuarios.nombre, estado: usuarios.estado }).from(usuarios).where(eq(usuarios.empresaId, empresaId)).orderBy(asc(usuarios.nombre)),
      app.db.select().from(honorariosConfig).where(eq(honorariosConfig.empresaId, empresaId)),
      app.db
        .select({ id: cargosPaciente.usuarioId, n: sql<number>`count(*)::int`, t: sql<number>`coalesce(sum(${cargosPaciente.importePaciente} + ${cargosPaciente.importeObraSocial}), 0)::float` })
        .from(cargosPaciente)
        .where(and(eq(cargosPaciente.empresaId, empresaId), isNull(cargosPaciente.anuladoEn), gte(cargosPaciente.fecha, desde), lte(cargosPaciente.fecha, hasta)))
        .groupBy(cargosPaciente.usuarioId),
      app.db
        .select({ id: trabajosLaboratorio.usuarioId, t: sql<number>`coalesce(sum(${trabajosLaboratorio.importe}), 0)::float` })
        .from(trabajosLaboratorio)
        .where(and(eq(trabajosLaboratorio.empresaId, empresaId), ne(trabajosLaboratorio.estado, "Cancelado"), gte(trabajosLaboratorio.fechaEnvio, desde), lte(trabajosLaboratorio.fechaEnvio, hasta)))
        .groupBy(trabajosLaboratorio.usuarioId),
      app.db
        .select({ id: gastos.honorariosUsuarioId, t: sql<number>`coalesce(sum(${gastos.importe}), 0)::float` })
        .from(gastos)
        .where(and(eq(gastos.empresaId, empresaId), isNull(gastos.anuladoEn), eq(gastos.honorariosMes, mes)))
        .groupBy(gastos.honorariosUsuarioId),
    ]);
    const mapa = <T extends { id: string | null; t: number }>(xs: T[]) => new Map(xs.map((x) => [x.id, x]));
    const [p, l, g] = [mapa(prod), mapa(lab), mapa(pag)];
    const c = new Map(cfgs.map((x) => [x.usuarioId, x]));
    const profesionales = us
      .filter((u) => c.has(u.id) || p.has(u.id) || g.has(u.id))
      .map((u) => {
        const cfg = c.get(u.id);
        const producido = r2(Number(p.get(u.id)?.t ?? 0));
        const laboratorio = r2(Number(l.get(u.id)?.t ?? 0));
        const descuento = cfg?.descontarLaboratorio ? laboratorio : 0;
        const base = r2(Math.max(0, producido - descuento));
        const corresponde = cfg ? r2((base * cfg.porcentaje) / 100) : 0;
        const pagado = r2(Number(g.get(u.id)?.t ?? 0));
        return {
          usuarioId: u.id,
          nombre: u.nombre,
          porcentaje: cfg?.porcentaje ?? null,
          descontarLaboratorio: cfg?.descontarLaboratorio ?? true,
          version: cfg?.version ?? null,
          prestaciones: Number(p.get(u.id)?.n ?? 0),
          producido,
          laboratorio,
          base,
          corresponde,
          pagado,
          saldo: r2(corresponde - pagado),
        };
      });
    const suma = (k: "producido" | "corresponde" | "pagado" | "saldo") => r2(profesionales.reduce((a, x) => a + x[k], 0));
    return {
      mes,
      nombreMes: nombreDelMes(mes),
      desde,
      hasta,
      profesionales,
      totales: { producido: suma("producido"), corresponde: suma("corresponde"), pagado: suma("pagado"), saldo: suma("saldo") },
      usuarios: us.filter((u) => u.estado === "Activo").map((u) => ({ id: u.id, nombre: u.nombre })),
    };
  }

  app.get("/", { preHandler: ver }, async (req) => {
    const { mes } = parse(z.object({ mes: mesSchema.optional() }), req.query);
    return liquidar(req.user.empresaId, mes ?? hoyAr().slice(0, 7));
  });

  /** El porcentaje acordado con el profesional (y si se le descuenta el laboratorio) */
  app.put("/:usuarioId/config", { preHandler: editar }, async (req) => {
    const { usuarioId } = parse(idSchema, req.params);
    const d = parse(
      z.object({
        porcentaje: z.coerce.number({ invalid_type_error: "Porcentaje inválido" }).min(0, "Entre 0 y 100").max(100, "Entre 0 y 100"),
        descontarLaboratorio: z.boolean().default(true),
        version: z.number().int().positive().max(2_000_000_000).optional().nullable(),
      }),
      req.body,
    );
    const [u] = await app.db.select({ id: usuarios.id }).from(usuarios).where(and(eq(usuarios.id, usuarioId), eq(usuarios.empresaId, req.user.empresaId)));
    if (!u) throw notFound("Usuario no encontrado");
    const porcentaje = Math.round(d.porcentaje * 100) / 100;
    const [actual] = await app.db.select().from(honorariosConfig).where(and(eq(honorariosConfig.empresaId, req.user.empresaId), eq(honorariosConfig.usuarioId, usuarioId)));
    if (!actual) {
      const [nuevo] = await app.db.insert(honorariosConfig).values({ empresaId: req.user.empresaId, usuarioId, porcentaje, descontarLaboratorio: d.descontarLaboratorio }).onConflictDoNothing().returning();
      if (!nuevo) throw edicionConcurrente("el porcentaje");
      return nuevo;
    }
    if (d.version && d.version !== actual.version) throw edicionConcurrente("el porcentaje");
    const [r] = await app.db
      .update(honorariosConfig)
      .set({ porcentaje, descontarLaboratorio: d.descontarLaboratorio, version: sql`${honorariosConfig.version} + 1` })
      .where(and(eq(honorariosConfig.empresaId, req.user.empresaId), eq(honorariosConfig.usuarioId, usuarioId), eq(honorariosConfig.version, actual.version)))
      .returning();
    if (!r) throw edicionConcurrente("el porcentaje");
    return r;
  });

  /** El detalle: cada prestación, cada trabajo de laboratorio y cada pago del mes */
  app.get("/:usuarioId", { preHandler: ver }, async (req) => {
    const { usuarioId } = parse(idSchema, req.params);
    const { mes: m } = parse(z.object({ mes: mesSchema.optional() }), req.query);
    const mes = m ?? hoyAr().slice(0, 7);
    const empresaId = req.user.empresaId;
    const liq = await liquidar(empresaId, mes);
    const fila = liq.profesionales.find((x) => x.usuarioId === usuarioId);
    if (!fila) {
      const [u] = await app.db.select({ id: usuarios.id }).from(usuarios).where(and(eq(usuarios.id, usuarioId), eq(usuarios.empresaId, empresaId)));
      if (!u) throw notFound("Usuario no encontrado");
    }
    const { desde, hasta } = rangoDelMes(mes);
    const [detalle, trabajos, pagos] = await Promise.all([
      app.db
        .select({
          id: cargosPaciente.id,
          fecha: cargosPaciente.fecha,
          paciente: sql<string>`${pacientes.apellido} || ', ' || ${pacientes.nombre}`,
          prestacion: prestaciones.nombre,
          codigo: prestaciones.codigo,
          pieza: cargosPaciente.pieza,
          obraSocial: cargosPaciente.obraSocial,
          importe: sql<number>`(${cargosPaciente.importePaciente} + ${cargosPaciente.importeObraSocial})::float`,
        })
        .from(cargosPaciente)
        .innerJoin(pacientes, eq(pacientes.id, cargosPaciente.pacienteId))
        .innerJoin(prestaciones, eq(prestaciones.id, cargosPaciente.prestacionId))
        .where(and(eq(cargosPaciente.empresaId, empresaId), eq(cargosPaciente.usuarioId, usuarioId), isNull(cargosPaciente.anuladoEn), gte(cargosPaciente.fecha, desde), lte(cargosPaciente.fecha, hasta)))
        .orderBy(asc(cargosPaciente.fecha), asc(cargosPaciente.createdAt)),
      app.db
        .select({ id: trabajosLaboratorio.id, fecha: trabajosLaboratorio.fechaEnvio, descripcion: trabajosLaboratorio.descripcion, importe: trabajosLaboratorio.importe, estado: trabajosLaboratorio.estado })
        .from(trabajosLaboratorio)
        .where(and(eq(trabajosLaboratorio.empresaId, empresaId), eq(trabajosLaboratorio.usuarioId, usuarioId), ne(trabajosLaboratorio.estado, "Cancelado"), gte(trabajosLaboratorio.fechaEnvio, desde), lte(trabajosLaboratorio.fechaEnvio, hasta)))
        .orderBy(asc(trabajosLaboratorio.fechaEnvio)),
      app.db
        .select()
        .from(gastos)
        .where(and(eq(gastos.empresaId, empresaId), eq(gastos.honorariosUsuarioId, usuarioId), eq(gastos.honorariosMes, mes)))
        .orderBy(asc(gastos.fecha), asc(gastos.createdAt)),
    ]);
    return { ...liq, profesional: fila ?? null, detalle: detalle.map((x) => ({ ...x, importe: r2(Number(x.importe)) })), trabajos, pagos };
  });

  /** Pago de honorarios del mes (total o parcial): queda en Gastos como "Sueldos y honorarios" */
  app.post("/:usuarioId/pagos", { preHandler: editar }, async (req, reply) => {
    const { usuarioId } = parse(idSchema, req.params);
    const d = parse(
      z.object({
        mes: mesSchema,
        importe: z.coerce.number({ invalid_type_error: "Importe inválido" }).positive("Tiene que ser mayor a cero").max(MAX_IMPORTE, "Importe demasiado grande"),
        medio: z.enum(MEDIOS_DENTAL, { errorMap: () => ({ message: "Elegí cómo se pagó" }) }),
        fecha: fechaIso.optional().refine((f) => !f || f <= hoyAr(), "La fecha no puede ser futura"),
      }),
      req.body,
    );
    if (d.mes > hoyAr().slice(0, 7)) throw badRequest("Ese mes todavía no empezó", { mes: "Mes futuro" });
    const liq = await liquidar(req.user.empresaId, d.mes);
    const fila = liq.profesionales.find((x) => x.usuarioId === usuarioId);
    if (!fila || fila.porcentaje === null) throw badRequest("Primero cargá el porcentaje que le corresponde");
    const importe = r2(d.importe);
    if (importe > fila.saldo + 0.001) throw conflict(`Supera lo que le queda por cobrar de ${liq.nombreMes}: $ ${fila.saldo.toLocaleString("es-AR", { minimumFractionDigits: 2 })}`);
    const fecha = d.fecha ?? hoyAr();
    await exigirCajaAbierta(app.db, req.user.empresaId, fecha, d.medio);
    const [autor] = await app.db.select({ nombre: usuarios.nombre }).from(usuarios).where(eq(usuarios.id, req.user.sub));
    const [g] = await app.db
      .insert(gastos)
      .values({
        empresaId: req.user.empresaId,
        fecha,
        categoria: "Sueldos y honorarios",
        descripcion: `Honorarios de ${fila.nombre} · ${liq.nombreMes}`,
        proveedor: fila.nombre,
        importe,
        medio: d.medio,
        honorariosUsuarioId: usuarioId,
        honorariosMes: d.mes,
        usuarioId: req.user.sub,
        cargadoPor: autor?.nombre ?? "Usuario",
      })
      .returning();
    return reply.status(201).send(g);
  });
};
