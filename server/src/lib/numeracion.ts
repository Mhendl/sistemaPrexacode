import { sql } from "drizzle-orm";
import type { Db } from "../db/client.js";
import { numeradores } from "../db/schema.js";

type Tx = Parameters<Parameters<Db["transaction"]>[0]>[0];

/**
 * Devuelve el próximo número del documento para la empresa.
 * Es atómico: el UPDATE bloquea la fila hasta que termina la transacción,
 * así dos remitos emitidos al mismo tiempo nunca comparten número.
 */
export async function siguienteNumero(tx: Tx, empresaId: string, tipo: string): Promise<number> {
  const [r] = await tx
    .insert(numeradores)
    .values({ empresaId, tipo, ultimo: 1 })
    .onConflictDoUpdate({ target: [numeradores.empresaId, numeradores.tipo], set: { ultimo: sql`${numeradores.ultimo} + 1` } })
    .returning({ ultimo: numeradores.ultimo });
  return r.ultimo;
}

export const formatNumero = (puntoVenta: number, numero: number) => `${String(puntoVenta).padStart(4, "0")}-${String(numero).padStart(8, "0")}`;
