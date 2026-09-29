import { and, eq } from "drizzle-orm";
import type { Db } from "../db/client.js";
import { clientes } from "../db/schema.js";

type Tx = Db | Parameters<Parameters<Db["transaction"]>[0]>[0];

/** El cliente "Consumidor final" sin identificar de la empresa (ventas de mostrador); se crea la primera vez */
export async function clienteConsumidorFinal(db: Tx, empresaId: string) {
  const buscar = () => db.select().from(clientes).where(and(eq(clientes.empresaId, empresaId), eq(clientes.sinIdentificar, true)));
  const [existe] = await buscar();
  if (existe) return existe;
  // Sin CUIT: el índice único (empresa, CUIT) evita que dos ventas simultáneas creen dos
  await db.insert(clientes).values({ empresaId, razonSocial: "Consumidor final", cuit: "", condicionIva: "Consumidor Final", sinIdentificar: true }).onConflictDoNothing();
  const [c] = await buscar();
  return c!;
}
