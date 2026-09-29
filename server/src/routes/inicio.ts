import { and, count, desc, eq, gte, inArray } from "drizzle-orm";
import type { FastifyPluginAsync } from "fastify";
import { clientes, comprobantes, empresas, productos, remitos, usuarios } from "../db/schema.js";
import { describirTipo } from "../lib/arca/codigos.js";
import { r2 } from "../lib/arca/montos.js";
import { requireAuth, tienePermiso } from "../lib/auth.js";
import { hoyAr, saldosFacturas, TIPOS_FACTURA, TIPOS_NC } from "../lib/cuentas.js";
import { formatNumero } from "../lib/numeracion.js";

const MESES = ["Ene", "Feb", "Mar", "Abr", "May", "Jun", "Jul", "Ago", "Sep", "Oct", "Nov", "Dic"];

/** Últimos 12 meses (aaaa-mm), del más viejo al actual */
function ultimos12(hoy: string) {
  const [a, m] = hoy.split("-").map(Number) as [number, number];
  return Array.from({ length: 12 }, (_, i) => {
    const d = new Date(Date.UTC(a, m - 1 - (11 - i), 1));
    return { clave: d.toISOString().slice(0, 7), mes: MESES[d.getUTCMonth()]! };
  });
}

/** Resumen para la pantalla de inicio. Cada rol recibe solo lo que puede ver. */
export const inicioRoutes: FastifyPluginAsync = async (app) => {
  app.addHook("preHandler", requireAuth);

  app.get("/", async (req) => {
    const empresaId = req.user.empresaId;
    const verVentas = tienePermiso(req, "facturacion.ver");
    const hoy = hoyAr();
    const meses = ultimos12(hoy);

    // Stock (todos los roles)
    const prods = await app.db.select().from(productos).where(and(eq(productos.empresaId, empresaId), eq(productos.activo, true), eq(productos.controlaStock, true)));
    const bajos = prods.filter((p) => p.stock < p.stockMinimo || p.stock <= 0).sort((a, b) => a.stock / (a.stockMinimo || 1) - b.stock / (b.stockMinimo || 1));
    const stock = {
      bajoMinimo: bajos.length,
      sinStock: bajos.filter((p) => p.stock <= 0).length,
      productos: bajos.slice(0, 8).map((p) => ({ id: p.id, codigo: p.codigo, descripcion: p.descripcion, stock: p.stock, stockMinimo: p.stockMinimo, unidad: p.unidad })),
    };
    const [{ n: remitosHoy }] = await app.db.select({ n: count() }).from(remitos).where(and(eq(remitos.empresaId, empresaId), eq(remitos.fecha, hoy), eq(remitos.estado, "Emitido")));

    // Primeros pasos (para guiar a una empresa nueva)
    const [{ n: nClientes }] = await app.db.select({ n: count() }).from(clientes).where(and(eq(clientes.empresaId, empresaId), eq(clientes.sinIdentificar, false)));
    const [{ n: nProductos }] = await app.db.select({ n: count() }).from(productos).where(eq(productos.empresaId, empresaId));
    const [{ n: nUsuarios }] = await app.db.select({ n: count() }).from(usuarios).where(eq(usuarios.empresaId, empresaId));
    const [{ n: nComprobantes }] = await app.db.select({ n: count() }).from(comprobantes).where(and(eq(comprobantes.empresaId, empresaId), eq(comprobantes.estado, "Autorizado")));
    const [emp] = await app.db.select({ logo: empresas.logoActualizado }).from(empresas).where(eq(empresas.id, empresaId));
    const primerosPasos = { logo: !!emp?.logo, clientes: nClientes > 0, productos: nProductos > 0, factura: nComprobantes > 0, equipo: nUsuarios > 1 };

    if (!verVentas) return { stock, remitosHoy, primerosPasos };

    // Ventas: facturas − notas de crédito autorizadas, por mes
    const desde = `${meses[0]!.clave}-01`;
    const comps = await app.db
      .select()
      .from(comprobantes)
      .where(and(eq(comprobantes.empresaId, empresaId), eq(comprobantes.estado, "Autorizado"), gte(comprobantes.fecha, desde), inArray(comprobantes.tipoCbte, [...TIPOS_FACTURA, ...TIPOS_NC])));
    const porMes = new Map<string, { total: number; cantidad: number }>();
    for (const c of comps) {
      const clave = c.fecha.slice(0, 7);
      const signo = TIPOS_NC.includes(c.tipoCbte) ? -1 : 1;
      const x = porMes.get(clave) ?? { total: 0, cantidad: 0 };
      x.total = r2(x.total + signo * c.total);
      if (signo > 0) x.cantidad++;
      porMes.set(clave, x);
    }
    const serie = meses.map((m) => ({ mes: m.mes, total: porMes.get(m.clave)?.total ?? 0 }));
    const actual = porMes.get(meses[11]!.clave) ?? { total: 0, cantidad: 0 };
    const anterior = porMes.get(meses[10]!.clave)?.total ?? 0;

    // Cobranzas
    const saldos = (await saldosFacturas(app.db, empresaId)).filter((s) => s.saldo > 0);
    const vencidas = saldos.filter((s) => s.diasVencida > 0).sort((a, b) => b.diasVencida - a.diasVencida);
    const ids = [...new Set(vencidas.slice(0, 6).map((v) => v.clienteId))];
    const nombres = new Map(ids.length ? (await app.db.select({ id: clientes.id, r: clientes.razonSocial }).from(clientes).where(inArray(clientes.id, ids))).map((c) => [c.id, c.r]) : []);

    const ultimos = await app.db
      .select()
      .from(comprobantes)
      .where(and(eq(comprobantes.empresaId, empresaId), eq(comprobantes.estado, "Autorizado")))
      .orderBy(desc(comprobantes.createdAt))
      .limit(6);

    return {
      stock,
      remitosHoy,
      primerosPasos,
      ventas: { mes: actual.total, cantidad: actual.cantidad, mesAnterior: anterior, serie },
      cobranzas: {
        porCobrar: r2(saldos.reduce((a, s) => a + s.saldo, 0)),
        vencido: r2(vencidas.reduce((a, s) => a + s.saldo, 0)),
        vencidas: vencidas.slice(0, 6).map((v) => ({
          id: v.id,
          comprobante: `${describirTipo(v.tipoCbte).nombre} ${formatNumero(v.puntoVenta, v.numero)}`,
          cliente: nombres.get(v.clienteId) ?? "",
          saldo: v.saldo,
          diasVencida: v.diasVencida,
        })),
      },
      ultimos: ultimos.map((c) => ({
        id: c.id,
        comprobante: `${describirTipo(c.tipoCbte).nombre} ${formatNumero(c.puntoVenta, c.numero!)}`,
        cliente: c.receptor.razonSocial,
        fecha: c.fecha,
        total: TIPOS_NC.includes(c.tipoCbte) ? -c.total : c.total,
      })),
    };
  });
};
