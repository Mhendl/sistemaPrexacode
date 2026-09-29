import { and, asc, desc, eq, inArray } from "drizzle-orm";
import type { FastifyPluginAsync } from "fastify";
import { z } from "zod";
import { empleadoNovedades, empleadoPagos, empleados } from "../db/schema.js";
import { permisoPorMetodo } from "../lib/auth.js";
import { hoyAr } from "../lib/cuentas.js";
import { esCuitValido, soloDigitos } from "../lib/cuit.js";
import { badRequest, conflict, edicionConcurrente, notFound, parse } from "../lib/errors.js";
import { siguienteNumero } from "../lib/numeracion.js";
import { fechaValida, MAX_IMPORTE } from "../lib/validation.js";

export const TIPOS_PAGO = ["Sueldo", "Adelanto", "Aguinaldo", "Vacaciones", "Bono", "Otro"] as const;
export const TIPOS_NOVEDAD = ["Vacaciones", "Licencia", "Enfermedad", "Ausencia", "Otro"] as const;
export const MEDIOS_PAGO_SUELDO = ["Transferencia", "Efectivo", "Cheque", "Otro"] as const;

const r2 = (n: number) => Math.round(n * 100) / 100;
const fecha = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Fecha inválida").refine(fechaValida, "Esa fecha no existe");
const periodoSchema = z
  .string()
  .regex(/^\d{4}-(0[1-9]|1[0-2])$/, "Mes inválido")
  .refine((p) => p >= "2000-01" && p <= "2100-12", "Mes inválido");
const texto = (max = 200) =>
  z
    .string()
    .trim()
    .max(max)
    .optional()
    .nullable()
    .transform((v) => (v ? v : null));
const importe = z.coerce.number({ invalid_type_error: "Importe inválido" }).max(MAX_IMPORTE, "El importe es demasiado grande");

const empleadoSchema = z.object({
  nombre: z.string().trim().min(2, "El nombre es obligatorio").max(80),
  apellido: z.string().trim().min(2, "El apellido es obligatorio").max(80),
  cuil: z
    .string()
    .optional()
    .nullable()
    .transform((v) => (v ? soloDigitos(v) : null))
    .refine((v) => v === null || esCuitValido(v), "El CUIL no es válido"),
  puesto: texto(80),
  fechaIngreso: fecha,
  modalidad: z.enum(["Mensual", "Quincenal", "Semanal", "Por hora"], { errorMap: () => ({ message: "Modalidad inválida" }) }).default("Mensual"),
  sueldo: importe.min(0, "No puede ser negativo"),
  telefono: texto(40),
  email: z
    .union([z.string().trim().toLowerCase().email("Email inválido"), z.literal(""), z.null()])
    .optional()
    .transform((v) => (v ? v : null)),
  domicilio: texto(),
  cbu: z
    .string()
    .optional()
    .nullable()
    .transform((v) => (v ? v.replace(/\s/g, "") : null))
    .refine((v) => v === null || /^\d{22}$/.test(v) || /^[a-zA-Z0-9.-]{6,20}$/.test(v), "El CBU tiene 22 números (o poné el alias)"),
  obraSocial: texto(80),
  notas: texto(2000),
});
const idSchema = z.object({ id: z.string().uuid("Id inválido") });

/** Días corridos entre dos fechas, las dos incluidas */
const diasEntre = (desde: string, hasta: string) => Math.round((Date.parse(`${hasta}T00:00:00Z`) - Date.parse(`${desde}T00:00:00Z`)) / 86_400_000) + 1;

/**
 * Vacaciones que corresponden en un año según la Ley de Contrato de Trabajo (art. 150 y 153):
 * por antigüedad al 31/12: hasta 5 años 14 días, hasta 10 años 21, hasta 20 años 28, más 35.
 * Si en el año trabajó menos de 6 meses: 1 día cada 20 trabajados.
 */
export function vacacionesQueCorresponden(fechaIngreso: string, anio: number) {
  const fin = `${anio}-12-31`;
  if (fechaIngreso > fin) return 0;
  const desdeEnAnio = fechaIngreso > `${anio}-01-01` ? fechaIngreso : `${anio}-01-01`;
  const trabajados = diasEntre(desdeEnAnio, fin);
  if (fechaIngreso > `${anio}-06-30`) return Math.floor(trabajados / 20);
  // "Excede N años" de antigüedad al 31/12: entró antes del 31/12 de hace N años
  const excede = (n: number) => fechaIngreso < `${anio - n}-12-31`;
  if (!excede(5)) return 14;
  if (!excede(10)) return 21;
  if (!excede(20)) return 28;
  return 35;
}

export const empleadosRoutes: FastifyPluginAsync = async (app) => {
  app.addHook("preHandler", permisoPorMetodo("empleados.ver", "empleados.editar"));

  async function empleadoDe(empresaId: string, id: string) {
    const [e] = await app.db.select().from(empleados).where(and(eq(empleados.id, id), eq(empleados.empresaId, empresaId)));
    if (!e) throw notFound("Empleado no encontrado");
    return e;
  }

  app.get("/", async (req) => {
    const empresaId = req.user.empresaId;
    const lista = await app.db.select().from(empleados).where(eq(empleados.empresaId, empresaId)).orderBy(asc(empleados.apellido), asc(empleados.nombre));
    const mes = hoyAr().slice(0, 7);
    const pagosMes = lista.length
      ? await app.db
          .select()
          .from(empleadoPagos)
          .where(and(eq(empleadoPagos.empresaId, empresaId), eq(empleadoPagos.periodo, mes), eq(empleadoPagos.estado, "Emitido")))
      : [];
    const filas = lista.map((e) => {
      const propios = pagosMes.filter((p) => p.empleadoId === e.id);
      return {
        ...e,
        sueldoPagado: propios.some((p) => p.tipo === "Sueldo"),
        adelantosMes: r2(propios.filter((p) => p.tipo === "Adelanto").reduce((a, p) => a + p.total, 0)),
        pagadoMes: r2(propios.reduce((a, p) => a + p.total, 0)),
      };
    });
    const activos = filas.filter((e) => e.estado === "Activo");
    return {
      empleados: filas,
      resumen: {
        activos: activos.length,
        /** Suma de los sueldos básicos mensuales de los activos (los por hora no entran) */
        sueldosMensuales: r2(activos.filter((e) => e.modalidad !== "Por hora").reduce((a, e) => a + e.sueldo * (e.modalidad === "Quincenal" ? 2 : e.modalidad === "Semanal" ? 52 / 12 : 1), 0)),
        pagadoMes: r2(pagosMes.reduce((a, p) => a + p.total, 0)),
        sueldosPendientes: activos.filter((e) => !e.sueldoPagado && e.fechaIngreso.slice(0, 7) <= mes).length,
        mes,
      },
    };
  });

  app.post("/", async (req, reply) => {
    const d = parse(empleadoSchema, req.body);
    const [e] = await app.db.insert(empleados).values({ ...d, empresaId: req.user.empresaId }).returning();
    return reply.status(201).send(e);
  });

  app.get("/:id", async (req) => {
    const { id } = parse(idSchema, req.params);
    const e = await empleadoDe(req.user.empresaId, id);
    const [pagos, novedades] = await Promise.all([
      app.db.select().from(empleadoPagos).where(eq(empleadoPagos.empleadoId, id)).orderBy(desc(empleadoPagos.periodo), desc(empleadoPagos.numero)),
      app.db.select().from(empleadoNovedades).where(eq(empleadoNovedades.empleadoId, id)).orderBy(desc(empleadoNovedades.desde)),
    ]);
    const anio = Number(hoyAr().slice(0, 4));
    const tomadas = novedades.filter((n) => n.tipo === "Vacaciones" && n.desde.startsWith(String(anio))).reduce((a, n) => a + n.dias, 0);
    const corresponden = vacacionesQueCorresponden(e.fechaIngreso, anio);
    return { ...e, pagos, novedades, vacaciones: { anio, corresponden, tomadas, quedan: Math.max(0, corresponden - tomadas) } };
  });

  app.put("/:id", async (req) => {
    const { id } = parse(idSchema, req.params);
    const d = parse(empleadoSchema, req.body);
    const { version } = parse(z.object({ version: z.number().int().positive().max(2_000_000_000).optional() }), req.body);
    const e = await empleadoDe(req.user.empresaId, id);
    if (version && version !== e.version) throw edicionConcurrente("el empleado");
    const [n] = await app.db.update(empleados).set({ ...d, version: e.version + 1 }).where(eq(empleados.id, id)).returning();
    return n;
  });

  /** Baja (renuncia, despido, fin de contrato): queda en el historial con sus pagos */
  app.post("/:id/baja", async (req) => {
    const { id } = parse(idSchema, req.params);
    const d = parse(z.object({ fecha: fecha, motivo: z.string().trim().min(2, "Indicá el motivo").max(200) }), req.body);
    const e = await empleadoDe(req.user.empresaId, id);
    if (e.estado === "Baja") throw badRequest("El empleado ya está dado de baja");
    if (d.fecha < e.fechaIngreso) throw badRequest("La baja no puede ser anterior al ingreso", { fecha: "Anterior al ingreso" });
    const [n] = await app.db.update(empleados).set({ estado: "Baja", fechaEgreso: d.fecha, motivoEgreso: d.motivo, version: e.version + 1 }).where(eq(empleados.id, id)).returning();
    return n;
  });

  app.post("/:id/reactivar", async (req) => {
    const { id } = parse(idSchema, req.params);
    const e = await empleadoDe(req.user.empresaId, id);
    const [n] = await app.db.update(empleados).set({ estado: "Activo", fechaEgreso: null, motivoEgreso: null, version: e.version + 1 }).where(eq(empleados.id, id)).returning();
    return n;
  });

  app.delete("/:id", async (req, reply) => {
    const { id } = parse(idSchema, req.params);
    await empleadoDe(req.user.empresaId, id);
    const [pago] = await app.db.select({ id: empleadoPagos.id }).from(empleadoPagos).where(eq(empleadoPagos.empleadoId, id)).limit(1);
    if (pago) throw conflict("Tiene pagos registrados: dalo de baja en lugar de borrarlo (así queda el historial)");
    await app.db.delete(empleados).where(eq(empleados.id, id));
    return reply.status(204).send();
  });

  /** Lo que habría que pagarle de sueldo en un mes: básico menos los adelantos ya dados ese mes */
  app.get("/:id/liquidacion", async (req) => {
    const { id } = parse(idSchema, req.params);
    const periodo = parse(z.object({ periodo: periodoSchema.optional() }), req.query).periodo ?? hoyAr().slice(0, 7);
    const e = await empleadoDe(req.user.empresaId, id);
    const delMes = await app.db
      .select()
      .from(empleadoPagos)
      .where(and(eq(empleadoPagos.empleadoId, id), eq(empleadoPagos.periodo, periodo), eq(empleadoPagos.estado, "Emitido")));
    const adelantos = delMes.filter((p) => p.tipo === "Adelanto");
    return {
      periodo,
      basico: e.sueldo,
      modalidad: e.modalidad,
      adelantos: adelantos.map((a) => ({ id: a.id, numero: a.numero, fecha: a.fecha, total: a.total })),
      totalAdelantos: r2(adelantos.reduce((a, p) => a + p.total, 0)),
      sueldoYaPagado: delMes.find((p) => p.tipo === "Sueldo") ?? null,
    };
  });

  /**
   * Registrar un pago. En el sueldo, los adelantos de ese mes se descuentan solos
   * (y no se puede pagar dos veces el sueldo del mismo mes).
   */
  app.post("/:id/pagos", async (req, reply) => {
    const { id } = parse(idSchema, req.params);
    const d = parse(
      z.object({
        tipo: z.enum(TIPOS_PAGO, { errorMap: () => ({ message: "Tipo de pago inválido" }) }),
        periodo: periodoSchema,
        fecha: fecha.optional(),
        conceptos: z
          .array(z.object({ concepto: z.string().trim().min(2, "Indicá el concepto").max(80), importe: importe.refine((v) => v !== 0, "El importe no puede ser cero") }))
          .min(1, "Agregá al menos un concepto")
          .max(30),
        medio: z.enum(MEDIOS_PAGO_SUELDO, { errorMap: () => ({ message: "Medio de pago inválido" }) }),
        nota: texto(300),
      }),
      req.body,
    );
    const e = await empleadoDe(req.user.empresaId, id);
    if (e.estado === "Baja" && d.periodo > (e.fechaEgreso ?? "").slice(0, 7)) throw badRequest("El empleado está dado de baja: no se le pueden registrar pagos de meses posteriores");
    if (d.periodo < e.fechaIngreso.slice(0, 7)) throw badRequest("Ese mes es anterior al ingreso del empleado", { periodo: "Anterior al ingreso" });

    const pago = await app.db.transaction(async (tx) => {
      const delMes = await tx
        .select()
        .from(empleadoPagos)
        .where(and(eq(empleadoPagos.empleadoId, id), eq(empleadoPagos.periodo, d.periodo), eq(empleadoPagos.estado, "Emitido")))
        .for("update");
      const sueldo = delMes.find((p) => p.tipo === "Sueldo");
      const conceptos = [...d.conceptos];
      if (d.tipo === "Sueldo") {
        if (sueldo) throw conflict(`El sueldo de ese mes ya se pagó (comprobante N° ${sueldo.numero}). Si hay que corregirlo, anulalo y cargalo de nuevo.`);
        const adelantos = r2(delMes.filter((p) => p.tipo === "Adelanto").reduce((a, p) => a + p.total, 0));
        if (adelantos > 0) conceptos.push({ concepto: "Adelantos del mes", importe: -adelantos });
      }
      if (d.tipo === "Adelanto") {
        if (sueldo) throw badRequest("El sueldo de ese mes ya se pagó: cargá el adelanto a cuenta del mes siguiente", { periodo: "Sueldo ya pagado" });
        if (conceptos.some((c) => c.importe < 0)) throw badRequest("Un adelanto no lleva descuentos", { conceptos: "Solo importes positivos" });
      }
      const total = r2(conceptos.reduce((a, c) => a + c.importe, 0));
      if (total <= 0) throw badRequest(d.tipo === "Sueldo" ? "Con los adelantos y descuentos, no queda nada para pagar" : "El total tiene que ser mayor a cero", { conceptos: "Total en cero o negativo" });
      const numero = await siguienteNumero(tx, req.user.empresaId, "pago-sueldo");
      const [p] = await tx
        .insert(empleadoPagos)
        .values({ empresaId: req.user.empresaId, empleadoId: id, numero, tipo: d.tipo, periodo: d.periodo, fecha: d.fecha ?? hoyAr(), conceptos, total, medio: d.medio, nota: d.nota, usuarioId: req.user.sub })
        .returning();
      return p!;
    });
    return reply.status(201).send(pago);
  });

  app.post("/pagos/:id/anular", async (req) => {
    const { id } = parse(idSchema, req.params);
    const { motivo } = parse(z.object({ motivo: z.string().trim().min(3, "Indicá el motivo").max(200) }), req.body);
    const [p] = await app.db.select().from(empleadoPagos).where(and(eq(empleadoPagos.id, id), eq(empleadoPagos.empresaId, req.user.empresaId)));
    if (!p) throw notFound("Pago no encontrado");
    if (p.estado === "Anulado") throw badRequest("El pago ya está anulado");
    // Un adelanto ya descontado en el sueldo no se anula suelto: primero hay que anular el sueldo
    if (p.tipo === "Adelanto") {
      const [sueldo] = await app.db
        .select({ numero: empleadoPagos.numero })
        .from(empleadoPagos)
        .where(and(eq(empleadoPagos.empleadoId, p.empleadoId), eq(empleadoPagos.periodo, p.periodo), eq(empleadoPagos.tipo, "Sueldo"), eq(empleadoPagos.estado, "Emitido")));
      if (sueldo) throw badRequest(`Este adelanto ya se descontó en el sueldo (N° ${sueldo.numero}): anulá primero el sueldo`);
    }
    const [n] = await app.db.update(empleadoPagos).set({ estado: "Anulado", motivoAnulacion: motivo }).where(and(eq(empleadoPagos.id, id), eq(empleadoPagos.estado, "Emitido"))).returning();
    if (!n) throw badRequest("El pago ya está anulado");
    return n;
  });

  app.get("/pagos/:id", async (req) => {
    const { id } = parse(idSchema, req.params);
    const [p] = await app.db.select().from(empleadoPagos).where(and(eq(empleadoPagos.id, id), eq(empleadoPagos.empresaId, req.user.empresaId)));
    if (!p) throw notFound("Pago no encontrado");
    const e = await empleadoDe(req.user.empresaId, p.empleadoId);
    return { ...p, empleado: { id: e.id, nombre: e.nombre, apellido: e.apellido, cuil: e.cuil, puesto: e.puesto, fechaIngreso: e.fechaIngreso } };
  });

  /** Todos los pagos de un mes (para ver cuánto se pagó en sueldos) */
  app.get("/pagos", async (req) => {
    const periodo = parse(z.object({ periodo: periodoSchema.optional() }), req.query).periodo ?? hoyAr().slice(0, 7);
    const pagos = await app.db.select().from(empleadoPagos).where(and(eq(empleadoPagos.empresaId, req.user.empresaId), eq(empleadoPagos.periodo, periodo))).orderBy(asc(empleadoPagos.numero));
    const ids = [...new Set(pagos.map((p) => p.empleadoId))];
    const nombres = ids.length ? await app.db.select({ id: empleados.id, nombre: empleados.nombre, apellido: empleados.apellido }).from(empleados).where(inArray(empleados.id, ids)) : [];
    const porId = new Map(nombres.map((n) => [n.id, `${n.apellido}, ${n.nombre}`]));
    return pagos.map((p) => ({ ...p, empleado: porId.get(p.empleadoId) ?? "" }));
  });

  app.post("/:id/novedades", async (req, reply) => {
    const { id } = parse(idSchema, req.params);
    const d = parse(
      z.object({ tipo: z.enum(TIPOS_NOVEDAD, { errorMap: () => ({ message: "Tipo inválido" }) }), desde: fecha, hasta: fecha, nota: texto(300) }),
      req.body,
    );
    if (d.hasta < d.desde) throw badRequest("La fecha de fin es anterior a la de inicio", { hasta: "Anterior al inicio" });
    const dias = diasEntre(d.desde, d.hasta);
    if (dias > 366) throw badRequest("Como mucho un año por novedad", { hasta: "Demasiado largo" });
    const e = await empleadoDe(req.user.empresaId, id);
    if (d.desde < e.fechaIngreso) throw badRequest("Es anterior al ingreso del empleado", { desde: "Anterior al ingreso" });
    // No se superponen dos novedades del mismo empleado
    const previas = await app.db.select().from(empleadoNovedades).where(eq(empleadoNovedades.empleadoId, id));
    const pisa = previas.find((n) => n.desde <= d.hasta && d.desde <= n.hasta);
    if (pisa) throw conflict(`Se superpone con ${pisa.tipo.toLowerCase()} del ${pisa.desde.split("-").reverse().join("/")} al ${pisa.hasta.split("-").reverse().join("/")}`);
    const [n] = await app.db.insert(empleadoNovedades).values({ ...d, dias, empresaId: req.user.empresaId, empleadoId: id }).returning();
    return reply.status(201).send(n);
  });

  app.delete("/:id/novedades/:novedadId", async (req, reply) => {
    const { id, novedadId } = parse(z.object({ id: z.string().uuid(), novedadId: z.string().uuid("Id inválido") }), req.params);
    const [n] = await app.db
      .delete(empleadoNovedades)
      .where(and(eq(empleadoNovedades.id, novedadId), eq(empleadoNovedades.empleadoId, id), eq(empleadoNovedades.empresaId, req.user.empresaId)))
      .returning();
    if (!n) throw notFound("Novedad no encontrada");
    return reply.status(204).send();
  });
};
