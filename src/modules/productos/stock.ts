import type { ProductoApi, TipoMovimiento } from "@/api/types";

export type EstadoStock = "OK" | "Bajo" | "Sin stock" | "Servicio";

export function estadoStock(p: Pick<ProductoApi, "controlaStock" | "stock" | "stockMinimo">): EstadoStock {
  if (!p.controlaStock) return "Servicio";
  if (p.stock <= 0) return "Sin stock";
  if (p.stock < p.stockMinimo) return "Bajo";
  return "OK";
}

export const formatCantidad = (n: number) => n.toLocaleString("es-AR", { maximumFractionDigits: 3 });

export const tipoMovimientoLabel: Record<TipoMovimiento, string> = {
  ingreso: "Ingreso",
  egreso: "Egreso",
  ajuste: "Ajuste",
};

export const ALICUOTAS_IVA = [21, 10.5, 27, 5, 2.5, 0];
