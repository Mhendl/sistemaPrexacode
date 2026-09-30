import { and, asc, desc, eq, inArray, ne, notInArray, sql, type SQL } from "drizzle-orm";
import type { FastifyInstance, FastifyPluginAsync } from "fastify";
import { enviarDocumentoPorEmail } from "../lib/documentos.js";
import { obtenerConfigEmail } from "../lib/email/servicio.js";
import type { Db } from "../db/client.js";
import { z } from "zod";
import { clientes, comprobanteItems, comprobantes, empresas, movimientosStock, oportunidades, presupuestos, productos, puntosVenta } from "../db/schema.js";
import { permisoPorMetodo, requirePermiso } from "../lib/auth.js";
import { ErrorArca, type SolicitudCae } from "../lib/arca/cliente.js";
import { CONDICION_IVA_RECEPTOR, DOC_TIPO, ID_ALICUOTA, TIPO_CBTE, TOPE_CONSUMIDOR_SIN_IDENTIFICAR, describirTipo, letraSegun, type Concepto } from "../lib/arca/codigos.js";
import { clienteConsumidorFinal } from "../lib/consumidorFinal.js";
import { conectorPara, configuracionArca } from "../lib/arca/conector.js";
import { calcularTotales, r2 } from "../lib/arca/montos.js";
import { badRequest, conflict, HttpError, notFound, parse } from "../lib/errors.js";
import { alertasStock } from "../lib/notificaciones.js";
import { exigirCupo } from "../lib/suscripcion.js";
import { formatNumero, siguienteNumero } from "../lib/numeracion.js";
import { saldosFacturas } from "../lib/cuentas.js";
import { crearRecibo, MEDIOS_PAGO } from "../lib/recibos.js";
import { armarRenglones, itemSchema } from "../lib/items.js";
import { fechaValida } from "../lib/validation.js";

const fechaIso = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Fecha inválida").refine(fechaValida, "Esa fecha no existe");
const hoyAr = () => new Date(Date.now() - 3 * 3600_000).toISOString().slice(0, 10); // hora de Argentina
const sumarDias = (f: string, d: number) => {
  const x = new Date(`${f}T00:00:00Z`);
  x.setUTCDate(x.getUTCDate() + d);
  return x.toISOString().slice(0, 10);
};
const r3 = (n: number) => Math.round(n * 1000) / 1000;

const emitirSchema = z.object({
  clase: z.enum(["factura", "nota_credito"]).default("factura"),
  clienteId: z.string().uuid("Elegí un cliente").optional(),
  /** Venta de mostrador a un consumidor final sin identificar (en lugar de clienteId) */
  consumidorFinal: z.boolean().optional(),
  /** CoreDental: factura a un paciente (consumidor final con su nombre y, si lo tiene, su DNI) */
  paciente: z
    .object({
      nombre: z.string().trim().min(2).max(160),
      dni: z
        .string()
        .regex(/^\d{7,8}$/, "DNI inválido")
        .nullable()
        .optional()
        .transform((v) => v ?? null),
    })
    .optional(),
  puntoVenta: z.coerce.number().int().min(1).max(99998).default(1),
  fecha: fechaIso.optional(),
  condicionVenta: z.enum(["Contado", "Cuenta corriente"]).default("Contado"),
  vencimiento: fechaIso.optional(),
  fechaServicioDesde: fechaIso.optional(),
  fechaServicioHasta: fechaIso.optional(),
  observaciones: z
    .string()
    .trim()
    .max(1000)
    .optional()
    .nullable()
    .transform((v) => v || null),
  /** Factura: descuenta stock. Nota de crédito: lo devuelve (si la mercadería volvió) */
  moverStock: z.boolean().default(true),
  asociadoId: z.string().uuid().optional(),
  /** Si la factura sale de un presupuesto: queda vinculado y marcado como Facturado */
  presupuestoId: z.string().uuid().optional(),
  /** Factura de contado cobrada en el momento: genera el recibo automáticamente */
  cobro: z
    .object({
      medio: z.enum(MEDIOS_PAGO, { errorMap: () => ({ message: "Medio de pago inválido" }) }),
      referencia: z.string().trim().max(120).optional().nullable(),
    })
    .optional(),
  items: z.array(itemSchema).min(1, "Agregá al menos un ítem").max(200, "Hasta 200 ítems por comprobante"),
});

const idSchema = z.object({ id: z.string().uuid("Id inválido") });
const listaSchema = z.object({ clienteId: z.string().uuid().optional(), estado: z.enum(["Autorizado", "Rechazado"]).optional() });

type Comprobante = typeof comprobantes.$inferSelect;

/** Datos para el código QR que exige ARCA (RG 4892) */
export function urlQr(c: Comprobante, cuitEmisor: string) {
  if (c.estado !== "Autorizado" || !c.cae || !c.numero) return null;
  const datos = {
    ver: 1,
    fecha: c.fecha,
    cuit: Number(cuitEmisor),
    ptoVta: c.puntoVenta,
    tipoCmp: c.tipoCbte,
    nroCmp: c.numero,
    importe: c.total,
    moneda: "PES",
    ctz: 1,
    tipoDocRec: c.receptor.cuit ? DOC_TIPO.CUIT : c.receptor.dni ? DOC_TIPO.DNI : DOC_TIPO.SIN_IDENTIFICAR,
    nroDocRec: Number(c.receptor.cuit || c.receptor.dni || 0),
    tipoCodAut: "E",
    codAut: Number(c.cae),
  };
  return `https://www.afip.gob.ar/fe/qr/?p=${Buffer.from(JSON.stringify(datos)).toString("base64")}`;
}

const conNombre = (c: Comprobante) => {
  const t = describirTipo(c.tipoCbte);
  return { ...c, tipo: t.nombre, letra: t.letra, clase: t.clase };
};

/** Comprobante con ítems, QR, comprobante asociado y estado de cobro (pantalla interna y enlace público) */
export async function detalleComprobante(db: Db, empresaId: string, id: string) {
  const [c] = await db.select().from(comprobantes).where(and(eq(comprobantes.id, id), eq(comprobantes.empresaId, empresaId)));
  if (!c) return null;
  const items = await db.select().from(comprobanteItems).where(eq(comprobanteItems.comprobanteId, c.id)).orderBy(asc(comprobanteItems.orden));
  const [e] = await db.select({ cuit: empresas.cuit }).from(empresas).where(eq(empresas.id, empresaId));
  const asociado = c.asociadoId ? (await db.select().from(comprobantes).where(eq(comprobantes.id, c.asociadoId)))[0] : undefined;
  const [saldo] = await saldosFacturas(db, empresaId, { ids: [c.id] });
  return {
    ...conNombre(c),
    items,
    qr: urlQr(c, e!.cuit),
    asociado: asociado ? conNombre(asociado) : null,
    saldo: saldo?.saldo ?? null,
    estadoCobro: saldo?.estadoCobro ?? null,
    cobrado: saldo?.cobrado ?? 0,
    notasCredito: saldo?.notasCredito ?? 0,
  };
}

/**
 * Si la empresa lo activó, manda la factura por email al cliente apenas se emite.
 * No demora ni hace fallar la emisión: corre aparte y lo que pase queda en el historial de envíos.
 */
async function enviarFacturaAutomatica(app: FastifyInstance, empresaId: string, id: string, email: string | null) {
  try {
    if (!email) return;
    const c = await obtenerConfigEmail(app, empresaId);
    if (!c.enviarFacturaAlEmitir) return;
    await enviarDocumentoPorEmail(app, { empresaId, tipo: "comprobante", id, para: email, automatico: true });
  } catch (e) {
    app.log.error(e, "No se pudo enviar la factura automáticamente");
  }
}

export const comprobantesRoutes: FastifyPluginAsync = async (app) => {
  const porMetodo = permisoPorMetodo("facturacion.ver", "facturacion.emitir", { "/puntos-venta": "configuracion", "/puntos-venta/:id": "configuracion" });
  // La configuración (letra, puntos de venta) también la necesita quien arma presupuestos
  const verConfig = requirePermiso("facturacion.ver", "presupuestos.ver");
  app.addHook("preHandler", (req, reply) => (req.method === "GET" && req.routeOptions.url?.endsWith("/config") ? verConfig(req, reply) : porMetodo(req, reply)));

  app.get("/config", async (req) => {
    const cfg = await configuracionArca(app.db, req.user.empresaId);
    const pvs = await app.db.select().from(puntosVenta).where(eq(puntosVenta.empresaId, req.user.empresaId)).orderBy(asc(puntosVenta.numero));
    const [e] = await app.db.select({ condicionIva: empresas.condicionIva }).from(empresas).where(eq(empresas.id, req.user.empresaId));
    return { modo: cfg.modo, puntosVenta: pvs, condicionIvaEmisor: e!.condicionIva, certificadoVence: cfg.certificadoVence };
  });

  app.get("/", async (req) => {
    const { clienteId, estado } = parse(listaSchema, req.query);
    const filtros: SQL[] = [eq(comprobantes.empresaId, req.user.empresaId)];
    if (clienteId) filtros.push(eq(comprobantes.clienteId, clienteId));
    if (estado) filtros.push(eq(comprobantes.estado, estado));
    const rows = await app.db.select().from(comprobantes).where(and(...filtros)).orderBy(desc(comprobantes.createdAt)).limit(1000);
    const saldos = new Map((await saldosFacturas(app.db, req.user.empresaId, { clienteId })).map((s) => [s.id, s]));
    return rows.map((c) => ({ ...conNombre(c), saldo: saldos.get(c.id)?.saldo ?? null, estadoCobro: saldos.get(c.id)?.estadoCobro ?? null }));
  });

  app.get("/:id", async (req) => {
    const { id } = parse(idSchema, req.params);
    const d = await detalleComprobante(app.db, req.user.empresaId, id);
    if (!d) throw notFound("Comprobante no encontrado");
    return d;
  });

  app.post("/", async (req, reply) => {
    const d = parse(emitirSchema, req.body);
    const empresaId = req.user.empresaId;
    const hoy = hoyAr();
    const fecha = d.fecha ?? hoy;

    const [empresa] = await app.db.select().from(empresas).where(eq(empresas.id, empresaId));
    let cliente: typeof clientes.$inferSelect | undefined;
    if (d.consumidorFinal) cliente = await clienteConsumidorFinal(app.db, empresaId);
    else if (d.clienteId) [cliente] = await app.db.select().from(clientes).where(and(eq(clientes.id, d.clienteId), eq(clientes.empresaId, empresaId)));
    if (!cliente) throw badRequest(d.clienteId ? "El cliente no existe" : "Elegí un cliente", { clienteId: "Elegí un cliente" });

    await configuracionArca(app.db, empresaId);
    const [pv] = await app.db.select().from(puntosVenta).where(and(eq(puntosVenta.empresaId, empresaId), eq(puntosVenta.numero, d.puntoVenta)));
    if (!pv?.activo) throw badRequest("El punto de venta no existe o está inactivo", { puntoVenta: "Punto de venta inválido" });

    const letra = letraSegun(empresa!.condicionIva, cliente.condicionIva);

    // Nota de crédito: tiene que ajustar una factura autorizada del mismo cliente y la misma letra, sin pasarse del total
    let asociado: Comprobante | undefined;
    if (d.clase === "nota_credito") {
      if (!d.asociadoId) throw badRequest("Indicá qué factura ajusta la nota de crédito", { asociadoId: "Obligatorio" });
      [asociado] = await app.db.select().from(comprobantes).where(and(eq(comprobantes.id, d.asociadoId), eq(comprobantes.empresaId, empresaId)));
      if (!asociado || asociado.estado !== "Autorizado" || describirTipo(asociado.tipoCbte).clase !== "factura") {
        throw badRequest("La factura a ajustar no existe o no está autorizada", { asociadoId: "Factura inválida" });
      }
      if (asociado.clienteId !== cliente.id) throw badRequest("La nota de crédito tiene que ser al mismo cliente de la factura");
      if (describirTipo(asociado.tipoCbte).letra !== letra) throw badRequest("La letra de la nota de crédito tiene que ser la misma que la de la factura");
    }

    // Fechas: ARCA admite hasta 5 días antes o después (10 si hay servicios)
    const renglones = await armarRenglones(app.db, empresaId, d.items, { rechazarInactivos: d.clase === "factura" });

    const hayProductos = renglones.some((r) => r.esProducto);
    const hayServicios = renglones.some((r) => !r.esProducto);
    const concepto: Concepto = hayProductos && hayServicios ? 3 : hayServicios ? 2 : 1;
    const margen = concepto === 1 ? 5 : 10;
    if (fecha < sumarDias(hoy, -margen) || fecha > sumarDias(hoy, margen)) {
      throw badRequest(`La fecha tiene que estar entre ${margen} días antes y ${margen} días después de hoy`, { fecha: "Fecha fuera de rango" });
    }
    const vencimiento = d.vencimiento ?? (d.condicionVenta === "Contado" ? fecha : sumarDias(fecha, 30));
    if (vencimiento < fecha) throw badRequest("El vencimiento no puede ser anterior a la fecha", { vencimiento: "Anterior a la fecha" });

    const totales = calcularTotales(renglones, letra);
    if (totales.total <= 0) throw badRequest("El total tiene que ser mayor a cero");

    // A nombre de un paciente: consumidor final, identificado con DNI si lo tiene
    const paciente = cliente.sinIdentificar && d.paciente ? d.paciente : null;
    // Consumidor final sin identificar: venta de mostrador, se cobra en el momento y tiene un tope
    if (cliente.sinIdentificar && d.clase === "factura") {
      if (d.condicionVenta !== "Contado" || !d.cobro) {
        throw badRequest("La venta a un consumidor final sin identificar tiene que ser de contado y cobrada en el momento. Para venderle en cuenta corriente, cargalo como cliente.", { clienteId: "Solo de contado" });
      }
      if (totales.total >= TOPE_CONSUMIDOR_SIN_IDENTIFICAR && !paciente?.dni) {
        throw badRequest(
          `En ventas de $ ${TOPE_CONSUMIDOR_SIN_IDENTIFICAR.toLocaleString("es-AR")} o más ARCA pide identificar al comprador: cargalo como cliente con su CUIT o CUIL.`,
          { clienteId: "Hay que identificar al comprador" },
        );
      }
    }

    if (asociado) {
      const ncPrevias = await app.db
        .select({ total: sql<number>`coalesce(sum(${comprobantes.total}), 0)::float` })
        .from(comprobantes)
        .where(and(eq(comprobantes.asociadoId, asociado.id), eq(comprobantes.estado, "Autorizado")));
      const disponible = r2(asociado.total - (ncPrevias[0]?.total ?? 0));
      if (totales.total > disponible + 0.001) throw badRequest(`La nota de crédito supera el saldo de la factura (disponible: $ ${disponible.toLocaleString("es-AR", { minimumFractionDigits: 2 })})`);
    }

    const tipoCbte = TIPO_CBTE[d.clase][letra];
    let conector;
    try {
      conector = app.conectorArca ? app.conectorArca({ id: empresaId, cuit: empresa!.cuit }) : await conectorPara(app.db, { id: empresaId, cuit: empresa!.cuit }, { cifrador: app.cifrador, ...app.arcaPruebas });
      await conector.preparar?.();
    } catch (e) {
      if (e instanceof ErrorArca) throw new HttpError(503, `No se pudo conectar con ARCA: ${e.message}. No se emitió ningún comprobante; probá de nuevo en unos minutos.`);
      throw e;
    }

    const resultado = await app.db.transaction(async (tx) => {
      // Un solo comprobante a la vez por punto de venta y tipo: el número lo define ARCA (último + 1)
      await siguienteNumero(tx, empresaId, `fe-${d.puntoVenta}-${tipoCbte}`);

      // Stock: factura descuenta, nota de crédito devuelve
      const aMover = d.moverStock ? renglones.filter((r) => r.esProducto) : [];
      const bloqueados = aMover.length
        ? await tx
            .select()
            .from(productos)
            .where(inArray(productos.id, aMover.map((r) => r.productoId!).sort()))
            .orderBy(asc(productos.id))
            .for("update")
        : [];
      if (d.clase === "factura") {
        const faltantes: Record<string, string> = {};
        renglones.forEach((r, i) => {
          const p = bloqueados.find((b) => b.id === r.productoId);
          if (p && r3(p.stock - r.cantidad) < 0) faltantes[`items.${i}.cantidad`] = `Stock insuficiente: hay ${p.stock.toLocaleString("es-AR")} ${p.unidad}`;
        });
        if (Object.keys(faltantes).length) throw conflict("No hay stock suficiente. Si la mercadería ya se entregó con un remito, destildá \"Descontar stock\".", faltantes);
      }

      // Presupuesto de origen: se valida y se bloquea ANTES de pedir el CAE (si falla después, ARCA ya habría numerado)
      let presupuestoBloqueado: string | null = null;
      if (d.presupuestoId && d.clase === "factura") {
        const [pres] = await tx.select().from(presupuestos).where(and(eq(presupuestos.id, d.presupuestoId), eq(presupuestos.empresaId, empresaId))).for("update");
        if (!pres || pres.clienteId !== cliente.id) throw badRequest("El presupuesto no existe o es de otro cliente", { presupuestoId: "Presupuesto inválido" });
        if (pres.estado === "Facturado") throw conflict("Ese presupuesto ya fue facturado");
        presupuestoBloqueado = pres.id;
      }

      let respuesta;
      let numero: number;
      try {
        numero = (await conector.ultimoAutorizado(d.puntoVenta, tipoCbte)) + 1;
        const solicitud: SolicitudCae = {
          cuitEmisor: empresa!.cuit,
          puntoVenta: d.puntoVenta,
          tipoCbte,
          numero,
          concepto,
          docTipo: paciente?.dni ? DOC_TIPO.DNI : cliente.sinIdentificar ? DOC_TIPO.SIN_IDENTIFICAR : DOC_TIPO.CUIT,
          docNro: paciente?.dni ? paciente.dni : cliente.sinIdentificar ? "0" : cliente.cuit,
          condicionIvaReceptor: CONDICION_IVA_RECEPTOR[cliente.condicionIva] ?? 5,
          fecha,
          importeTotal: totales.total,
          importeNeto: totales.neto,
          importeExento: totales.exento,
          importeIva: totales.totalIva,
          iva: totales.iva.map((i) => ({ id: ID_ALICUOTA[i.alicuota]!, baseImponible: i.baseImponible, importe: i.importe })),
          ...(concepto !== 1 ? { fechaServicioDesde: d.fechaServicioDesde ?? fecha, fechaServicioHasta: d.fechaServicioHasta ?? fecha, fechaVencimientoPago: vencimiento } : {}),
          ...(asociado ? { asociado: { tipoCbte: asociado.tipoCbte, puntoVenta: asociado.puntoVenta, numero: asociado.numero!, cuit: empresa!.cuit, fecha: asociado.fecha } } : {}),
        };
        respuesta = await conector.solicitarCae(solicitud);
      } catch (e) {
        if (e instanceof ErrorArca) throw new HttpError(503, `No se pudo conectar con ARCA: ${e.message}. No se emitió ningún comprobante; probá de nuevo en unos minutos.`);
        throw e;
      }

      const autorizado = respuesta.resultado === "A";
      const [comp] = await tx
        .insert(comprobantes)
        .values({
          empresaId,
          tipoCbte,
          puntoVenta: d.puntoVenta,
          numero: autorizado ? numero : null,
          fecha,
          clienteId: cliente.id,
          receptor: paciente
            ? { razonSocial: paciente.nombre, cuit: "", dni: paciente.dni, condicionIva: "Consumidor Final", domicilio: null }
            : { razonSocial: cliente.razonSocial, cuit: cliente.cuit, condicionIva: cliente.condicionIva, domicilio: [cliente.domicilio, cliente.localidad].filter(Boolean).join(", ") || null },
          concepto,
          fechaServicioDesde: concepto !== 1 ? (d.fechaServicioDesde ?? fecha) : null,
          fechaServicioHasta: concepto !== 1 ? (d.fechaServicioHasta ?? fecha) : null,
          vencimiento,
          condicionVenta: d.condicionVenta,
          neto: totales.neto,
          exento: totales.exento,
          totalIva: totales.totalIva,
          iva: totales.iva,
          total: totales.total,
          estado: autorizado ? "Autorizado" : "Rechazado",
          cae: respuesta.cae ?? null,
          caeVencimiento: respuesta.caeVencimiento ?? null,
          errores: [...respuesta.errores, ...respuesta.observaciones],
          modo: conector.modo,
          observaciones: d.observaciones,
          asociadoId: asociado?.id ?? null,
          descontoStock: autorizado && aMover.length > 0,
          usuarioId: req.user.sub,
        })
        .returning();

      await tx.insert(comprobanteItems).values(
        renglones.map((r, orden) => ({
          comprobanteId: comp!.id,
          productoId: r.productoId,
          codigo: r.codigo,
          descripcion: r.descripcion,
          unidad: r.unidad,
          cantidad: r.cantidad,
          precioUnitario: r.precioUnitario,
          bonificacion: r.bonificacion,
          alicuotaIva: r.alicuotaIva,
          subtotal: totales.subtotales[orden]!,
          orden,
        })),
      );

      if (presupuestoBloqueado && autorizado) {
        await tx.update(presupuestos).set({ estado: "Facturado", comprobanteId: comp!.id, updatedAt: new Date() }).where(eq(presupuestos.id, presupuestoBloqueado));
        // Si el presupuesto venía de una oportunidad abierta, se da por ganada
        await tx
          .update(oportunidades)
          .set({ etapa: "Ganada", fechaCierre: fecha, motivoPerdida: null, version: sql`${oportunidades.version} + 1`, updatedAt: new Date() })
          .where(and(eq(oportunidades.presupuestoId, presupuestoBloqueado), notInArray(oportunidades.etapa, ["Ganada", "Perdida"])));
      }

      if (autorizado && d.cobro && d.clase === "factura") {
        await crearRecibo(tx, {
          empresaId,
          clienteId: cliente.id,
          fecha,
          medios: [{ medio: d.cobro.medio, importe: totales.total, referencia: d.cobro.referencia ?? null }],
          imputaciones: [{ comprobanteId: comp!.id, importe: totales.total }],
          observaciones: `Cobro de ${describirTipo(tipoCbte).nombre} ${formatNumero(d.puntoVenta, numero)}`,
          usuarioId: req.user.sub,
        });
      }

      const cambios: { antes: (typeof bloqueados)[number]; despues: (typeof bloqueados)[number] }[] = [];
      if (autorizado) {
        const signo = d.clase === "factura" ? -1 : 1;
        const etiqueta = `${describirTipo(tipoCbte).nombre} ${formatNumero(d.puntoVenta, numero)} · ${cliente.razonSocial}`;
        for (const r of aMover) {
          const p = bloqueados.find((b) => b.id === r.productoId)!;
          const nuevo = r3(p.stock + signo * r.cantidad);
          await tx.insert(movimientosStock).values({ empresaId, productoId: p.id, tipo: signo < 0 ? "egreso" : "ingreso", cantidad: signo * r.cantidad, stockResultante: nuevo, motivo: etiqueta, usuarioId: req.user.sub });
          const [despues] = await tx.update(productos).set({ stock: nuevo, updatedAt: new Date() }).where(eq(productos.id, p.id)).returning();
          cambios.push({ antes: { ...p }, despues: despues! });
          p.stock = nuevo;
        }
      }
      return { comp: comp!, cambios };
    });

    for (const c of resultado.cambios) await alertasStock(app.db, c.antes, c.despues);
    if (resultado.comp.estado === "Autorizado" && d.clase === "factura") void enviarFacturaAutomatica(app, empresaId, resultado.comp.id, cliente.email);
    return reply.status(201).send(conNombre(resultado.comp));
  });

  /** Puntos de venta: el administrador los da de alta con el mismo número que en ARCA */
  app.post("/puntos-venta", async (req, reply) => {
    const d = parse(z.object({ numero: z.coerce.number().int().min(1, "Número inválido").max(99998), nombre: z.string().trim().min(2, "Poné un nombre").max(80) }), req.body);
    const [existe] = await app.db.select().from(puntosVenta).where(and(eq(puntosVenta.empresaId, req.user.empresaId), eq(puntosVenta.numero, d.numero)));
    if (existe) throw conflict("Ya existe ese punto de venta", { numero: "Ya existe" });
    await exigirCupo(app.db, req.user.empresaId, "puntosVenta");
    const [pv] = await app.db.insert(puntosVenta).values({ ...d, empresaId: req.user.empresaId }).returning();
    return reply.status(201).send(pv);
  });

  app.patch("/puntos-venta/:id", async (req) => {
    const { id } = parse(idSchema, req.params);
    const d = parse(z.object({ nombre: z.string().trim().min(2).max(80).optional(), activo: z.boolean().optional() }), req.body ?? {});
    if (d.nombre === undefined && d.activo === undefined) throw badRequest("No hay nada para cambiar");
    if (d.activo === true) {
      const [actual] = await app.db.select({ activo: puntosVenta.activo }).from(puntosVenta).where(and(eq(puntosVenta.id, id), eq(puntosVenta.empresaId, req.user.empresaId)));
      if (actual && !actual.activo) await exigirCupo(app.db, req.user.empresaId, "puntosVenta");
    }
    if (d.activo === false) {
      const activos = await app.db.select().from(puntosVenta).where(and(eq(puntosVenta.empresaId, req.user.empresaId), eq(puntosVenta.activo, true), ne(puntosVenta.id, id)));
      if (activos.length === 0) throw badRequest("Tiene que quedar al menos un punto de venta activo");
    }
    const [pv] = await app.db.update(puntosVenta).set(d).where(and(eq(puntosVenta.id, id), eq(puntosVenta.empresaId, req.user.empresaId))).returning();
    if (!pv) throw notFound("Punto de venta no encontrado");
    return pv;
  });
};
