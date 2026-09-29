import { and, asc, eq, inArray } from "drizzle-orm";
import type { Db } from "../db/client.js";
import { comprobantes, imputaciones, reciboMedios, recibos } from "../db/schema.js";
import { r2 } from "./arca/montos.js";
import { saldosFacturas } from "./cuentas.js";
import { badRequest, conflict } from "./errors.js";
import { siguienteNumero } from "./numeracion.js";

type Tx = Parameters<Parameters<Db["transaction"]>[0]>[0];

export const MEDIOS_PAGO = ["Efectivo", "Transferencia", "Cheque", "Tarjeta de débito", "Tarjeta de crédito", "Mercado Pago", "Retención", "Otro"] as const;

export interface DatosRecibo {
  empresaId: string;
  clienteId: string;
  fecha: string;
  medios: { medio: string; importe: number; referencia?: string | null }[];
  imputaciones: { comprobanteId: string; importe: number }[];
  observaciones?: string | null;
  usuarioId: string;
}

/**
 * Crea un recibo dentro de una transacción. Bloquea las facturas a las que se imputa
 * para que dos cobros simultáneos no paguen dos veces lo mismo.
 */
export async function crearRecibo(tx: Tx, d: DatosRecibo) {
  const total = r2(d.medios.reduce((a, m) => a + m.importe, 0));
  if (total <= 0) throw badRequest("El total cobrado tiene que ser mayor a cero", { medios: "Cargá al menos un importe" });
  const imputado = r2(d.imputaciones.reduce((a, i) => a + i.importe, 0));
  if (imputado > total + 0.001) throw badRequest("Lo aplicado a facturas no puede superar lo cobrado", { imputaciones: `Aplicado $ ${imputado} > cobrado $ ${total}` });

  const ids = d.imputaciones.map((i) => i.comprobanteId);
  if (new Set(ids).size !== ids.length) throw badRequest("Hay una factura repetida en el recibo");
  if (ids.length) {
    await tx
      .select({ id: comprobantes.id })
      .from(comprobantes)
      .where(and(eq(comprobantes.empresaId, d.empresaId), inArray(comprobantes.id, [...ids].sort())))
      .orderBy(asc(comprobantes.id))
      .for("update");
    const saldos = await saldosFacturas(tx, d.empresaId, { ids });
    const detalles: Record<string, string> = {};
    d.imputaciones.forEach((imp, i) => {
      const s = saldos.find((x) => x.id === imp.comprobanteId);
      if (!s || s.clienteId !== d.clienteId) detalles[`imputaciones.${i}.comprobanteId`] = "La factura no es de este cliente o no está autorizada";
      else if (imp.importe > s.saldo + 0.001) detalles[`imputaciones.${i}.importe`] = `Supera el saldo de la factura ($ ${s.saldo.toLocaleString("es-AR", { minimumFractionDigits: 2 })})`;
    });
    if (Object.keys(detalles).length) {
      const excede = Object.keys(detalles).some((k) => k.endsWith(".importe"));
      throw excede ? conflict("Alguna factura ya tiene cobrado más de lo que querés aplicar. Revisá los saldos.", detalles) : badRequest("Revisá las facturas del recibo", detalles);
    }
  }

  const numero = await siguienteNumero(tx, d.empresaId, "recibo");
  const [recibo] = await tx
    .insert(recibos)
    .values({ empresaId: d.empresaId, numero, fecha: d.fecha, clienteId: d.clienteId, total, observaciones: d.observaciones ?? null, usuarioId: d.usuarioId })
    .returning();
  await tx.insert(reciboMedios).values(d.medios.map((m) => ({ reciboId: recibo!.id, medio: m.medio, importe: r2(m.importe), referencia: m.referencia || null })));
  if (d.imputaciones.length) {
    await tx.insert(imputaciones).values(d.imputaciones.map((i) => ({ reciboId: recibo!.id, comprobanteId: i.comprobanteId, importe: r2(i.importe) })));
  }
  return recibo!;
}
