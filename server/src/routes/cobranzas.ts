import { and, desc, eq, inArray } from "drizzle-orm";
import type { FastifyPluginAsync } from "fastify";
import { z } from "zod";
import { clientes, comprobantes, imputaciones, reciboMedios, recibos } from "../db/schema.js";
import { describirTipo } from "../lib/arca/codigos.js";
import { r2 } from "../lib/arca/montos.js";
import { permisoPorMetodo, requirePermiso } from "../lib/auth.js";
import { aCuentaPorCliente, hoyAr, saldosFacturas, TIPOS_FACTURA, TIPOS_NC } from "../lib/cuentas.js";
import { badRequest, conflict, notFound, parse } from "../lib/errors.js";
import { formatNumero } from "../lib/numeracion.js";
import { crearRecibo, MEDIOS_PAGO } from "../lib/recibos.js";
import { fechaValida } from "../lib/validation.js";

const fechaIso = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Fecha inválida").refine(fechaValida, "Esa fecha no existe");
const idSchema = z.object({ id: z.string().uuid("Id inválido") });

const reciboSchema = z.object({
  clienteId: z.string({ required_error: "Elegí un cliente" }).uuid("Elegí un cliente"),
  fecha: fechaIso.optional(),
  medios: z
    .array(
      z.object({
        medio: z.enum(MEDIOS_PAGO, { errorMap: () => ({ message: "Medio de pago inválido" }) }),
        importe: z.coerce.number({ invalid_type_error: "Importe inválido" }).positive("El importe tiene que ser mayor a cero").max(99_999_999_999, "El importe es demasiado grande"),
        referencia: z
          .string()
          .trim()
          .max(120)
          .optional()
          .nullable()
          .transform((v) => v || null),
      }),
    )
    .min(1, "Cargá al menos un medio de pago")
    .max(20),
  imputaciones: z
    .array(z.object({ comprobanteId: z.string().uuid("Factura inválida"), importe: z.coerce.number().positive("El importe tiene que ser mayor a cero").max(99_999_999_999, "El importe es demasiado grande") }))
    .max(200)
    .default([]),
  observaciones: z
    .string()
    .trim()
    .max(1000)
    .optional()
    .nullable()
    .transform((v) => v || null),
});

const tramo = (dias: number) => (dias === 0 ? "alDia" : dias <= 30 ? "d1a30" : dias <= 60 ? "d31a60" : dias <= 90 ? "d61a90" : "mas90");
const nombreComp = (tipoCbte: number, pv: number, numero: number | null) => `${describirTipo(tipoCbte).nombre} ${numero ? formatNumero(pv, numero) : ""}`.trim();

export const cobranzasRoutes: FastifyPluginAsync = async (app) => {
  app.addHook("preHandler", requirePermiso("cobranzas.ver"));

  /** Deuda de todos los clientes, con antigüedad */
  app.get("/resumen", async (req) => {
    const empresaId = req.user.empresaId;
    const saldos = (await saldosFacturas(app.db, empresaId)).filter((s) => s.saldo > 0);
    const aCuenta = await aCuentaPorCliente(app.db, empresaId);
    const ids = [...new Set([...saldos.map((s) => s.clienteId), ...[...aCuenta.entries()].filter(([, v]) => v > 0).map(([k]) => k)])];
    const cls = ids.length ? await app.db.select().from(clientes).where(inArray(clientes.id, ids)) : [];
    const ultimos = ids.length
      ? await app.db.select({ clienteId: recibos.clienteId, fecha: recibos.fecha }).from(recibos).where(and(eq(recibos.empresaId, empresaId), eq(recibos.estado, "Emitido"))).orderBy(desc(recibos.fecha))
      : [];

    const filas = cls.map((c) => {
      const propias = saldos.filter((s) => s.clienteId === c.id);
      const tramos = { alDia: 0, d1a30: 0, d31a60: 0, d61a90: 0, mas90: 0 };
      for (const s of propias) tramos[tramo(s.diasVencida)] = r2(tramos[tramo(s.diasVencida)] + s.saldo);
      const deuda = r2(propias.reduce((a, s) => a + s.saldo, 0));
      const favor = aCuenta.get(c.id) ?? 0;
      return {
        clienteId: c.id,
        razonSocial: c.razonSocial,
        cuit: c.cuit,
        deuda,
        vencido: r2(deuda - tramos.alDia),
        aCuenta: favor,
        saldo: r2(deuda - favor),
        tramos,
        facturasPendientes: propias.length,
        diasMaxAtraso: Math.max(0, ...propias.map((s) => s.diasVencida)),
        ultimoCobro: ultimos.find((u) => u.clienteId === c.id)?.fecha ?? null,
      };
    });
    filas.sort((a, b) => b.vencido - a.vencido || b.deuda - a.deuda);
    return {
      totales: {
        porCobrar: r2(filas.reduce((a, f) => a + f.deuda, 0)),
        vencido: r2(filas.reduce((a, f) => a + f.vencido, 0)),
        aCuenta: r2(filas.reduce((a, f) => a + f.aCuenta, 0)),
        clientesConDeuda: filas.filter((f) => f.deuda > 0).length,
        facturasVencidas: saldos.filter((s) => s.diasVencida > 0).length,
      },
      clientes: filas,
    };
  });

  /** Facturas con saldo (para elegir a cuáles aplicar un cobro, o ver las vencidas) */
  app.get("/pendientes", async (req) => {
    const { clienteId, soloVencidas } = parse(z.object({ clienteId: z.string().uuid().optional(), soloVencidas: z.coerce.boolean().optional() }), req.query);
    const saldos = (await saldosFacturas(app.db, req.user.empresaId, { clienteId })).filter((s) => s.saldo > 0 && (!soloVencidas || s.diasVencida > 0));
    const ids = [...new Set(saldos.map((s) => s.clienteId))];
    const cls = ids.length ? await app.db.select({ id: clientes.id, razonSocial: clientes.razonSocial }).from(clientes).where(inArray(clientes.id, ids)) : [];
    return saldos
      .map((s) => ({ ...s, comprobante: nombreComp(s.tipoCbte, s.puntoVenta, s.numero), clienteRazonSocial: cls.find((c) => c.id === s.clienteId)?.razonSocial ?? "" }))
      .sort((a, b) => a.vencimiento.localeCompare(b.vencimiento) || a.numero - b.numero);
  });

  /** Cuenta corriente: facturas (debe), notas de crédito y recibos (haber), con saldo acumulado */
  app.get("/cuenta-corriente/:id", async (req) => {
    const { id } = parse(idSchema, req.params);
    const empresaId = req.user.empresaId;
    const [cliente] = await app.db.select().from(clientes).where(and(eq(clientes.id, id), eq(clientes.empresaId, empresaId)));
    if (!cliente) throw notFound("Cliente no encontrado");

    const comps = await app.db
      .select()
      .from(comprobantes)
      .where(and(eq(comprobantes.empresaId, empresaId), eq(comprobantes.clienteId, id), eq(comprobantes.estado, "Autorizado")));
    const recs = await app.db.select().from(recibos).where(and(eq(recibos.empresaId, empresaId), eq(recibos.clienteId, id), eq(recibos.estado, "Emitido")));

    const movs = [
      ...comps.map((c) => {
        const esFactura = TIPOS_FACTURA.includes(c.tipoCbte);
        return { fecha: c.fecha, orden: c.createdAt.getTime(), tipo: esFactura ? "Factura" : "Nota de crédito", descripcion: nombreComp(c.tipoCbte, c.puntoVenta, c.numero), debe: esFactura ? c.total : 0, haber: TIPOS_NC.includes(c.tipoCbte) ? c.total : 0, link: `/facturacion/${c.id}` };
      }),
      ...recs.map((r) => ({ fecha: r.fecha, orden: r.createdAt.getTime(), tipo: "Recibo", descripcion: `Recibo ${formatNumero(1, r.numero)}`, debe: 0, haber: r.total, link: `/cobranzas/recibos/${r.id}` })),
    ].sort((a, b) => a.fecha.localeCompare(b.fecha) || a.orden - b.orden);

    let saldo = 0;
    const movimientos = movs.map(({ orden: _o, ...m }) => {
      saldo = r2(saldo + m.debe - m.haber);
      return { ...m, saldo };
    });
    const aCuenta = (await aCuentaPorCliente(app.db, empresaId, id)).get(id) ?? 0;
    return { saldo, aCuenta, movimientos };
  });
};

export const recibosRoutes: FastifyPluginAsync = async (app) => {
  app.addHook("preHandler", permisoPorMetodo("cobranzas.ver", "cobranzas.cobrar", { "/:id/anular": "cobranzas.anular" }));

  app.get("/", async (req) => {
    const { clienteId } = parse(z.object({ clienteId: z.string().uuid().optional() }), req.query);
    const cond = [eq(recibos.empresaId, req.user.empresaId)];
    if (clienteId) cond.push(eq(recibos.clienteId, clienteId));
    return app.db
      .select({ id: recibos.id, numero: recibos.numero, fecha: recibos.fecha, total: recibos.total, estado: recibos.estado, clienteId: recibos.clienteId, clienteRazonSocial: clientes.razonSocial })
      .from(recibos)
      .innerJoin(clientes, eq(clientes.id, recibos.clienteId))
      .where(and(...cond))
      .orderBy(desc(recibos.numero))
      .limit(1000);
  });

  app.get("/:id", async (req) => {
    const { id } = parse(idSchema, req.params);
    const [r] = await app.db.select().from(recibos).where(and(eq(recibos.id, id), eq(recibos.empresaId, req.user.empresaId)));
    if (!r) throw notFound("Recibo no encontrado");
    const [cliente] = await app.db.select().from(clientes).where(eq(clientes.id, r.clienteId));
    const medios = await app.db.select().from(reciboMedios).where(eq(reciboMedios.reciboId, r.id));
    const imps = await app.db
      .select({ comprobanteId: imputaciones.comprobanteId, importe: imputaciones.importe, tipoCbte: comprobantes.tipoCbte, puntoVenta: comprobantes.puntoVenta, numero: comprobantes.numero, fecha: comprobantes.fecha, total: comprobantes.total })
      .from(imputaciones)
      .innerJoin(comprobantes, eq(comprobantes.id, imputaciones.comprobanteId))
      .where(eq(imputaciones.reciboId, r.id));
    const aplicado = r2(imps.reduce((a, i) => a + i.importe, 0));
    return {
      ...r,
      cliente,
      medios,
      imputaciones: imps.map((i) => ({ ...i, comprobante: nombreComp(i.tipoCbte, i.puntoVenta, i.numero) })),
      aplicado,
      aCuenta: r2(r.total - aplicado),
    };
  });

  app.post("/", async (req, reply) => {
    const d = parse(reciboSchema, req.body);
    const empresaId = req.user.empresaId;
    const [cliente] = await app.db.select({ id: clientes.id }).from(clientes).where(and(eq(clientes.id, d.clienteId), eq(clientes.empresaId, empresaId)));
    if (!cliente) throw badRequest("El cliente no existe", { clienteId: "Elegí un cliente" });
    const recibo = await app.db.transaction((tx) => crearRecibo(tx, { ...d, empresaId, fecha: d.fecha ?? hoyAr(), usuarioId: req.user.sub }));
    return reply.status(201).send(recibo);
  });

  /** Anular un recibo: lo cobrado deja de aplicarse y las facturas vuelven a quedar con saldo */
  app.post("/:id/anular", async (req) => {
    const { id } = parse(idSchema, req.params);
    const { motivo } = parse(z.object({ motivo: z.string().trim().min(3, "Indicá el motivo de la anulación").max(300) }), req.body);
    return app.db.transaction(async (tx) => {
      const [r] = await tx.select().from(recibos).where(and(eq(recibos.id, id), eq(recibos.empresaId, req.user.empresaId))).for("update");
      if (!r) throw notFound("Recibo no encontrado");
      if (r.estado === "Anulado") throw conflict("El recibo ya está anulado");
      const [anulado] = await tx.update(recibos).set({ estado: "Anulado", motivoAnulacion: motivo, anuladoEn: new Date() }).where(eq(recibos.id, r.id)).returning();
      return anulado;
    });
  });
};
