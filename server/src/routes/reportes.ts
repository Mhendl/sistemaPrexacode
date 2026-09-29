import { and, asc, eq, gte, inArray, lte } from "drizzle-orm";
import type { FastifyPluginAsync } from "fastify";
import { z } from "zod";
import { comprobanteItems, comprobantes } from "../db/schema.js";
import { describirTipo } from "../lib/arca/codigos.js";
import { r2 } from "../lib/arca/montos.js";
import { requirePermiso } from "../lib/auth.js";
import { diasEntre, hoyAr, TIPOS_FACTURA, TIPOS_NC } from "../lib/cuentas.js";
import { badRequest, parse } from "../lib/errors.js";
import { formatNumero } from "../lib/numeracion.js";
import { fechaValida } from "../lib/validation.js";

const MESES = ["Ene", "Feb", "Mar", "Abr", "May", "Jun", "Jul", "Ago", "Sep", "Oct", "Nov", "Dic"];
const fechaIso = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Fecha inválida").refine(fechaValida, "Esa fecha no existe");
const periodoSchema = z.object({ desde: fechaIso.optional(), hasta: fechaIso.optional() });

/** Período pedido; por defecto el mes en curso. Hasta 3 años para no traer de más. */
function periodo(query: unknown) {
  const q = parse(periodoSchema, query);
  const hoy = hoyAr();
  const desde = q.desde ?? `${hoy.slice(0, 7)}-01`;
  const hasta = q.hasta ?? hoy;
  if (hasta < desde) throw badRequest("El período está invertido", { hasta: "Anterior a la fecha desde" });
  if (diasEntre(desde, hasta) > 366 * 3) throw badRequest("El período puede ser de hasta 3 años", { desde: "Período demasiado largo" });
  return { desde, hasta };
}

/** Claves de la serie: días si el período es corto, meses si es largo */
function claves(desde: string, hasta: string) {
  const porDia = diasEntre(desde, hasta) <= 62;
  const out: { clave: string; etiqueta: string }[] = [];
  if (porDia) {
    for (let d = new Date(`${desde}T00:00:00Z`); d.toISOString().slice(0, 10) <= hasta; d.setUTCDate(d.getUTCDate() + 1)) {
      const f = d.toISOString().slice(0, 10);
      out.push({ clave: f, etiqueta: `${f.slice(8)}/${f.slice(5, 7)}` });
    }
  } else {
    for (let d = new Date(`${desde.slice(0, 7)}-01T00:00:00Z`); d.toISOString().slice(0, 7) <= hasta.slice(0, 7); d.setUTCMonth(d.getUTCMonth() + 1)) {
      out.push({ clave: d.toISOString().slice(0, 7), etiqueta: `${MESES[d.getUTCMonth()]} ${String(d.getUTCFullYear()).slice(2)}` });
    }
  }
  return { agrupacion: porDia ? ("dia" as const) : ("mes" as const), claves: out };
}

export const reportesRoutes: FastifyPluginAsync = async (app) => {
  app.addHook("preHandler", requirePermiso("reportes.ver"));

  /** Comprobantes autorizados del período (facturas y notas de crédito), en orden */
  const delPeriodo = (empresaId: string, desde: string, hasta: string) =>
    app.db
      .select()
      .from(comprobantes)
      .where(
        and(
          eq(comprobantes.empresaId, empresaId),
          eq(comprobantes.estado, "Autorizado"),
          gte(comprobantes.fecha, desde),
          lte(comprobantes.fecha, hasta),
          inArray(comprobantes.tipoCbte, [...TIPOS_FACTURA, ...TIPOS_NC]),
        ),
      )
      .orderBy(asc(comprobantes.fecha), asc(comprobantes.tipoCbte), asc(comprobantes.puntoVenta), asc(comprobantes.numero));

  /** Ventas del período: las notas de crédito restan. Importes netos = sin IVA. */
  app.get("/ventas", async (req) => {
    const empresaId = req.user.empresaId;
    const { desde, hasta } = periodo(req.query);
    const comps = await delPeriodo(empresaId, desde, hasta);
    const signo = (tipo: number) => (TIPOS_NC.includes(tipo) ? -1 : 1);

    const resumen = { facturado: 0, notasCredito: 0, neto: 0, iva: 0, total: 0, facturas: 0, notas: 0, ticketPromedio: 0 };
    const { agrupacion, claves: cs } = claves(desde, hasta);
    const serie = new Map(cs.map((c) => [c.clave, 0]));
    const porCliente = new Map<string, { clienteId: string; razonSocial: string; cuit: string; facturas: number; neto: number; total: number }>();

    for (const c of comps) {
      const s = signo(c.tipoCbte);
      if (s > 0) {
        resumen.facturado = r2(resumen.facturado + c.total);
        resumen.facturas++;
      } else {
        resumen.notasCredito = r2(resumen.notasCredito + c.total);
        resumen.notas++;
      }
      resumen.neto = r2(resumen.neto + s * (c.neto + c.exento));
      resumen.iva = r2(resumen.iva + s * c.totalIva);
      resumen.total = r2(resumen.total + s * c.total);
      const clave = agrupacion === "dia" ? c.fecha : c.fecha.slice(0, 7);
      serie.set(clave, r2((serie.get(clave) ?? 0) + s * c.total));
      const x = porCliente.get(c.clienteId) ?? { clienteId: c.clienteId, razonSocial: c.receptor.razonSocial, cuit: c.receptor.cuit, facturas: 0, neto: 0, total: 0 };
      if (s > 0) x.facturas++;
      x.neto = r2(x.neto + s * (c.neto + c.exento));
      x.total = r2(x.total + s * c.total);
      porCliente.set(c.clienteId, x);
    }
    resumen.ticketPromedio = resumen.facturas ? r2(resumen.facturado / resumen.facturas) : 0;

    // Por producto (los ítems libres se agrupan por descripción)
    const tipoDe = new Map(comps.map((c) => [c.id, c.tipoCbte]));
    const items = comps.length ? await app.db.select().from(comprobanteItems).where(inArray(comprobanteItems.comprobanteId, [...tipoDe.keys()])) : [];
    const porProducto = new Map<string, { productoId: string | null; codigo: string | null; descripcion: string; unidad: string; cantidad: number; neto: number }>();
    for (const i of items) {
      const s = signo(tipoDe.get(i.comprobanteId)!);
      const clave = i.productoId ?? `libre:${i.descripcion.trim().toLowerCase()}`;
      const x = porProducto.get(clave) ?? { productoId: i.productoId, codigo: i.codigo, descripcion: i.descripcion, unidad: i.unidad, cantidad: 0, neto: 0 };
      x.cantidad = Math.round((x.cantidad + s * i.cantidad) * 1000) / 1000;
      x.neto = r2(x.neto + s * i.subtotal);
      porProducto.set(clave, x);
    }

    return {
      desde,
      hasta,
      agrupacion,
      resumen,
      serie: cs.map((c) => ({ ...c, total: serie.get(c.clave) ?? 0 })),
      porCliente: [...porCliente.values()].sort((a, b) => b.total - a.total),
      porProducto: [...porProducto.values()].sort((a, b) => b.neto - a.neto),
    };
  });

  /** Libro IVA Ventas: un renglón por comprobante, notas de crédito en negativo */
  app.get("/libro-iva", async (req) => {
    const empresaId = req.user.empresaId;
    const { desde, hasta } = periodo(req.query);
    const comps = await delPeriodo(empresaId, desde, hasta);
    const alicuotas = [...new Set(comps.flatMap((c) => c.iva.filter((i) => i.alicuota > 0).map((i) => i.alicuota)))].sort((a, b) => b - a);

    const renglones = comps.map((c) => {
      const s = TIPOS_NC.includes(c.tipoCbte) ? -1 : 1;
      const tipo = describirTipo(c.tipoCbte);
      const iva: Record<string, number> = {};
      for (const a of alicuotas) iva[String(a)] = r2(s * c.iva.filter((i) => i.alicuota === a).reduce((t, i) => t + i.importe, 0));
      return {
        id: c.id,
        fecha: c.fecha,
        tipo: tipo.nombre,
        letra: tipo.letra,
        numero: formatNumero(c.puntoVenta, c.numero ?? 0),
        razonSocial: c.receptor.razonSocial,
        cuit: c.receptor.cuit,
        condicionIva: c.receptor.condicionIva,
        neto: r2(s * c.neto),
        exento: r2(s * c.exento),
        iva,
        totalIva: r2(s * c.totalIva),
        total: r2(s * c.total),
        modo: c.modo,
      };
    });

    const totales = {
      neto: r2(renglones.reduce((t, r) => t + r.neto, 0)),
      exento: r2(renglones.reduce((t, r) => t + r.exento, 0)),
      iva: Object.fromEntries(alicuotas.map((a) => [String(a), r2(renglones.reduce((t, r) => t + (r.iva[String(a)] ?? 0), 0))])),
      totalIva: r2(renglones.reduce((t, r) => t + r.totalIva, 0)),
      total: r2(renglones.reduce((t, r) => t + r.total, 0)),
    };
    return { desde, hasta, alicuotas, renglones, totales, conPruebas: comps.some((c) => c.modo !== "produccion") };
  });
};
