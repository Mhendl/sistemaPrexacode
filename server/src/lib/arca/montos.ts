import type { Letra } from "./codigos.js";

/** Redondeo a centavos "half up" sin arrastres de coma flotante */
export const r2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;

export interface ItemCalculo {
  cantidad: number;
  /** Precio unitario SIN IVA */
  precioUnitario: number;
  alicuotaIva: number;
  /** Bonificación en % (0 a 100) */
  bonificacion?: number;
}

export interface IvaAlicuota {
  alicuota: number;
  baseImponible: number;
  importe: number;
}

export interface Totales {
  /** Neto gravado (ítems con IVA distinto de 0) */
  neto: number;
  /** Operaciones exentas (alícuota 0) */
  exento: number;
  iva: IvaAlicuota[];
  totalIva: number;
  total: number;
  /** Subtotal neto de cada ítem, en el mismo orden */
  subtotales: number[];
}

/**
 * Calcula los importes como los valida ARCA:
 * - subtotal de cada ítem redondeado a centavos
 * - IVA calculado sobre la suma de netos de cada alícuota (no ítem por ítem)
 * - total = neto + exento + IVA
 * En factura C no se discrimina IVA: todo va como neto y el IVA es 0.
 */
export function calcularTotales(items: ItemCalculo[], letra: Letra): Totales {
  const subtotales = items.map((i) => r2(i.cantidad * i.precioUnitario * (1 - (i.bonificacion ?? 0) / 100)));

  if (letra === "C") {
    const neto = r2(subtotales.reduce((a, b) => a + b, 0));
    return { neto, exento: 0, iva: [], totalIva: 0, total: neto, subtotales };
  }

  const porAlicuota = new Map<number, number>();
  items.forEach((it, idx) => porAlicuota.set(it.alicuotaIva, r2((porAlicuota.get(it.alicuotaIva) ?? 0) + subtotales[idx]!)));

  const exento = porAlicuota.get(0) ?? 0;
  const iva: IvaAlicuota[] = [...porAlicuota.entries()]
    .filter(([a]) => a > 0)
    .sort(([a], [b]) => a - b)
    .map(([alicuota, base]) => ({ alicuota, baseImponible: base, importe: r2((base * alicuota) / 100) }));

  const neto = r2(iva.reduce((a, i) => a + i.baseImponible, 0));
  const totalIva = r2(iva.reduce((a, i) => a + i.importe, 0));
  return { neto, exento, iva, totalIva, total: r2(neto + exento + totalIva), subtotales };
}
