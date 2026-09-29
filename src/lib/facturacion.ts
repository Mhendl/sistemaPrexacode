/**
 * Mismas reglas que el servidor (server/src/lib/arca): se usan para la vista previa en vivo.
 * El servidor recalcula todo al emitir; si algo difiriera, vale lo del servidor.
 */
export type Letra = "A" | "B" | "C";

export function letraSegun(emisor: string, receptor: string): Letra {
  if (emisor !== "Responsable Inscripto") return "C";
  return receptor === "Responsable Inscripto" || receptor === "Monotributista" ? "A" : "B";
}

export const r2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;

export interface ItemCalculo {
  cantidad: number;
  precioUnitario: number;
  alicuotaIva: number;
  bonificacion?: number;
}

export function calcularTotales(items: ItemCalculo[], letra: Letra) {
  const subtotales = items.map((i) => r2((i.cantidad || 0) * (i.precioUnitario || 0) * (1 - (i.bonificacion ?? 0) / 100)));
  if (letra === "C") {
    const neto = r2(subtotales.reduce((a, b) => a + b, 0));
    return { neto, exento: 0, iva: [] as { alicuota: number; baseImponible: number; importe: number }[], totalIva: 0, total: neto, subtotales };
  }
  const por = new Map<number, number>();
  items.forEach((it, i) => por.set(it.alicuotaIva, r2((por.get(it.alicuotaIva) ?? 0) + subtotales[i]!)));
  const exento = por.get(0) ?? 0;
  const iva = [...por.entries()]
    .filter(([a]) => a > 0)
    .sort(([a], [b]) => a - b)
    .map(([alicuota, base]) => ({ alicuota, baseImponible: base, importe: r2((base * alicuota) / 100) }));
  const neto = r2(iva.reduce((a, i) => a + i.baseImponible, 0));
  const totalIva = r2(iva.reduce((a, i) => a + i.importe, 0));
  return { neto, exento, iva, totalIva, total: r2(neto + exento + totalIva), subtotales };
}

export const numeroComprobante = (puntoVenta: number, numero: number | null) =>
  numero ? `${String(puntoVenta).padStart(4, "0")}-${String(numero).padStart(8, "0")}` : `${String(puntoVenta).padStart(4, "0")}-sin número`;

/** Código de ARCA del tipo de comprobante (se imprime en el recuadro de la letra) */
export const codigoTipo = (tipoCbte: number) => String(tipoCbte).padStart(2, "0");

export const ALICUOTAS_IVA = [21, 10.5, 27, 5, 2.5, 0];
