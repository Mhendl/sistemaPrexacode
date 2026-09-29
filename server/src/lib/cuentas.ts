import { and, eq, inArray, sql } from "drizzle-orm";
import type { Db } from "../db/client.js";
import { comprobantes, imputaciones, recibos } from "../db/schema.js";
import { r2 } from "./arca/montos.js";

export const TIPOS_FACTURA = [1, 6, 11];
export const TIPOS_NC = [3, 8, 13];

type Tx = Db | Parameters<Parameters<Db["transaction"]>[0]>[0];

/** Fecha de hoy en Argentina (aaaa-mm-dd) */
export const hoyAr = () => new Date(Date.now() - 3 * 3600_000).toISOString().slice(0, 10);

export const diasEntre = (desde: string, hasta: string) => Math.round((Date.parse(`${hasta}T00:00:00Z`) - Date.parse(`${desde}T00:00:00Z`)) / 86_400_000);

export type EstadoCobro = "Pagada" | "Parcial" | "Impaga" | "Vencida";

export interface SaldoFactura {
  id: string;
  clienteId: string;
  tipoCbte: number;
  puntoVenta: number;
  numero: number;
  fecha: string;
  vencimiento: string;
  total: number;
  cobrado: number;
  notasCredito: number;
  saldo: number;
  /** Lo que se cobró + las notas de crédito por encima del total (ej. NC sobre una factura ya pagada): saldo a favor del cliente */
  excedente: number;
  diasVencida: number; // 0 si no venció
  estadoCobro: EstadoCobro;
}

/**
 * Saldo de cada factura autorizada:
 * total − lo imputado por recibos vigentes − las notas de crédito autorizadas que la ajustan.
 */
export async function saldosFacturas(db: Tx, empresaId: string, filtro: { clienteId?: string; ids?: string[] } = {}): Promise<SaldoFactura[]> {
  const condiciones = [eq(comprobantes.empresaId, empresaId), eq(comprobantes.estado, "Autorizado"), inArray(comprobantes.tipoCbte, TIPOS_FACTURA)];
  if (filtro.clienteId) condiciones.push(eq(comprobantes.clienteId, filtro.clienteId));
  if (filtro.ids) {
    if (filtro.ids.length === 0) return [];
    condiciones.push(inArray(comprobantes.id, filtro.ids));
  }
  const facturas = await db.select().from(comprobantes).where(and(...condiciones));
  if (facturas.length === 0) return [];
  const ids = facturas.map((f) => f.id);

  const cobros = await db
    .select({ id: imputaciones.comprobanteId, importe: sql<number>`sum(${imputaciones.importe})::float` })
    .from(imputaciones)
    .innerJoin(recibos, eq(recibos.id, imputaciones.reciboId))
    .where(and(inArray(imputaciones.comprobanteId, ids), eq(recibos.estado, "Emitido")))
    .groupBy(imputaciones.comprobanteId);
  const ncs = await db
    .select({ id: comprobantes.asociadoId, importe: sql<number>`sum(${comprobantes.total})::float` })
    .from(comprobantes)
    .where(and(eq(comprobantes.empresaId, empresaId), eq(comprobantes.estado, "Autorizado"), inArray(comprobantes.tipoCbte, TIPOS_NC), inArray(comprobantes.asociadoId, ids)))
    .groupBy(comprobantes.asociadoId);

  const hoy = hoyAr();
  return facturas.map((f) => {
    const cobrado = r2(cobros.find((c) => c.id === f.id)?.importe ?? 0);
    const notasCredito = r2(ncs.find((n) => n.id === f.id)?.importe ?? 0);
    const saldo = Math.max(0, r2(f.total - cobrado - notasCredito));
    const excedente = Math.max(0, r2(cobrado + notasCredito - f.total));
    const diasVencida = saldo > 0 && f.vencimiento < hoy ? diasEntre(f.vencimiento, hoy) : 0;
    const estadoCobro: EstadoCobro = saldo === 0 ? "Pagada" : diasVencida > 0 ? "Vencida" : cobrado + notasCredito > 0 ? "Parcial" : "Impaga";
    return {
      id: f.id,
      clienteId: f.clienteId,
      tipoCbte: f.tipoCbte,
      puntoVenta: f.puntoVenta,
      numero: f.numero!,
      fecha: f.fecha,
      vencimiento: f.vencimiento,
      total: f.total,
      cobrado,
      notasCredito,
      saldo,
      excedente,
      diasVencida,
      estadoCobro,
    };
  });
}

/**
 * Saldo a favor de cada cliente:
 * - plata cobrada que no se aplicó a ninguna factura (pagos a cuenta), más
 * - notas de crédito que superan lo que quedaba por pagar de su factura (ej. devolución de algo ya pagado).
 */
export async function aCuentaPorCliente(db: Tx, empresaId: string, clienteId?: string): Promise<Map<string, number>> {
  const cond = [eq(recibos.empresaId, empresaId), eq(recibos.estado, "Emitido")];
  if (clienteId) cond.push(eq(recibos.clienteId, clienteId));
  const cobrado = await db
    .select({ clienteId: recibos.clienteId, total: sql<number>`sum(${recibos.total})::float` })
    .from(recibos)
    .where(and(...cond))
    .groupBy(recibos.clienteId);
  const aplicado = await db
    .select({ clienteId: recibos.clienteId, total: sql<number>`sum(${imputaciones.importe})::float` })
    .from(imputaciones)
    .innerJoin(recibos, eq(recibos.id, imputaciones.reciboId))
    .where(and(...cond))
    .groupBy(recibos.clienteId);
  const favor = new Map<string, number>(cobrado.map((c) => [c.clienteId, r2(c.total - (aplicado.find((a) => a.clienteId === c.clienteId)?.total ?? 0))]));
  for (const f of await saldosFacturas(db, empresaId, clienteId ? { clienteId } : {})) {
    if (f.excedente > 0) favor.set(f.clienteId, r2((favor.get(f.clienteId) ?? 0) + f.excedente));
  }
  return favor;
}
