import { randomBytes } from "node:crypto";
import { and, eq } from "drizzle-orm";
import type { Db } from "../db/client.js";
import { enlacesPublicos } from "../db/schema.js";

export type TipoDocumento = "comprobante" | "presupuesto";

/** Devuelve el link público del documento, creándolo la primera vez (token aleatorio de 192 bits) */
export async function tokenPublico(db: Db, empresaId: string, tipo: TipoDocumento, refId: string) {
  const filtro = and(eq(enlacesPublicos.empresaId, empresaId), eq(enlacesPublicos.tipo, tipo), eq(enlacesPublicos.refId, refId));
  const [existente] = await db.select().from(enlacesPublicos).where(filtro);
  if (existente) return existente;
  await db.insert(enlacesPublicos).values({ token: randomBytes(24).toString("base64url"), empresaId, tipo, refId }).onConflictDoNothing();
  const [creado] = await db.select().from(enlacesPublicos).where(filtro);
  return creado!;
}

export const urlPublica = (appUrl: string, token: string) => `${appUrl}/ver/${token}`;
