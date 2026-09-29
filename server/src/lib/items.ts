import { and, eq, inArray } from "drizzle-orm";
import { z } from "zod";
import type { Db } from "../db/client.js";
import { productos } from "../db/schema.js";
import { r2 } from "./arca/montos.js";
import { badRequest } from "./errors.js";
import { MAX_CANTIDAD, MAX_IMPORTE, MAX_TOTAL } from "./validation.js";

export const ALICUOTAS = [0, 2.5, 5, 10.5, 21, 27];
const r3 = (n: number) => Math.round(n * 1000) / 1000;

/** Ítem de factura o presupuesto: un producto del catálogo, o un ítem libre con descripción, precio e IVA */
export const itemSchema = z
  .object({
    productoId: z.string().uuid().optional().nullable(),
    descripcion: z.string().trim().max(200).optional(),
    cantidad: z.coerce.number({ invalid_type_error: "Cantidad inválida" }).positive("La cantidad tiene que ser mayor a cero").max(MAX_CANTIDAD, "La cantidad es demasiado grande"),
    precioUnitario: z.coerce.number({ invalid_type_error: "Precio inválido" }).min(0, "El precio no puede ser negativo").max(MAX_IMPORTE, "El precio es demasiado grande").optional(),
    alicuotaIva: z.coerce
      .number()
      .refine((v) => ALICUOTAS.includes(v), "Alícuota de IVA inválida")
      .optional(),
    bonificacion: z.coerce.number().min(0).max(100, "La bonificación va de 0 a 100 %").default(0),
  })
  .refine((i) => i.productoId || (i.descripcion && i.precioUnitario !== undefined && i.alicuotaIva !== undefined), {
    message: "Elegí un producto o completá descripción, precio e IVA",
    path: ["descripcion"],
  });

export type ItemEntrada = z.infer<typeof itemSchema>;

export interface Renglon {
  productoId: string | null;
  codigo: string | null;
  descripcion: string;
  unidad: string;
  cantidad: number;
  precioUnitario: number;
  alicuotaIva: number;
  bonificacion: number;
  /** true si es un producto que controla stock */
  esProducto: boolean;
}

/**
 * Completa cada ítem con los datos del producto (código, descripción, unidad, precio e IVA de lista),
 * respetando lo que el usuario haya cambiado. Valida que los productos sean de la empresa.
 */
export async function armarRenglones(db: Db, empresaId: string, items: ItemEntrada[], opciones: { rechazarInactivos: boolean }): Promise<Renglon[]> {
  const ids = items.map((i) => i.productoId).filter((x): x is string => !!x);
  const prods = ids.length ? await db.select().from(productos).where(and(eq(productos.empresaId, empresaId), inArray(productos.id, ids))) : [];
  const porId = new Map(prods.map((p) => [p.id, p]));

  const detalles: Record<string, string> = {};
  const renglones = items.map((it, i) => {
    const p = it.productoId ? porId.get(it.productoId) : undefined;
    if (it.productoId && !p) detalles[`items.${i}.productoId`] = "Producto inexistente";
    if (p && !p.activo && opciones.rechazarInactivos) detalles[`items.${i}.productoId`] = `${p.descripcion} está inactivo`;
    return {
      productoId: p?.id ?? null,
      codigo: p?.codigo ?? null,
      descripcion: it.descripcion || p?.descripcion || "",
      unidad: p?.unidad ?? "u.",
      cantidad: r3(it.cantidad),
      precioUnitario: r2(it.precioUnitario ?? p?.precio ?? 0),
      alicuotaIva: it.alicuotaIva ?? p?.alicuotaIva ?? 21,
      bonificacion: it.bonificacion,
      esProducto: !!p?.controlaStock,
    };
  });
  // Cantidad × precio no puede pasarse de lo que entra en un comprobante
  renglones.forEach((r, i) => {
    if (r.cantidad * r.precioUnitario > MAX_TOTAL) detalles[`items.${i}.cantidad`] = "El importe del renglón es demasiado grande";
  });
  if (renglones.reduce((a, r) => a + r.cantidad * r.precioUnitario * (1 + r.alicuotaIva / 100), 0) > MAX_TOTAL) detalles.items = "El total es demasiado grande";
  if (Object.keys(detalles).length) throw badRequest("Revisá los ítems", detalles);
  return renglones;
}
