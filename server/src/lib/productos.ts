import { eq } from "drizzle-orm";
import type { Db } from "../db/client.js";
import { empresas } from "../db/schema.js";
import type { PlanId } from "./precios.js";

/**
 * Los productos que se venden sobre la misma plataforma. Cada empresa es de uno:
 * cambia la marca, el menú, los nombres de los planes y la dirección web. Los precios son los mismos (precios.ts).
 */
export const PRODUCTO_IDS = ["gestion", "dental"] as const;
export type ProductoId = (typeof PRODUCTO_IDS)[number];

export const PRODUCTOS: Record<ProductoId, { nombre: string; bajada: string; planes: Record<PlanId, string> }> = {
  gestion: { nombre: "Prexacode", bajada: "Gestión para empresas", planes: { basico: "Básico", profesional: "Profesional", empresa: "Empresa" } },
  dental: { nombre: "CoreDental", bajada: "Gestión para consultorios odontológicos", planes: { basico: "Consultorio", profesional: "Clínica", empresa: "Centro odontológico" } },
};

export const productoDe = (p: string | null | undefined): ProductoId => ((PRODUCTO_IDS as readonly string[]).includes(p ?? "") ? (p as ProductoId) : "gestion");
export const marcaDe = (p: string | null | undefined) => PRODUCTOS[productoDe(p)];
export const nombrePlan = (producto: string | null | undefined, plan: string) => marcaDe(producto).planes[plan as PlanId] ?? plan;

type Tx = Db | Parameters<Parameters<Db["transaction"]>[0]>[0];

export async function productoDeEmpresa(db: Tx, empresaId: string): Promise<ProductoId> {
  const [e] = await db.select({ producto: empresas.producto }).from(empresas).where(eq(empresas.id, empresaId));
  return productoDe(e?.producto);
}
