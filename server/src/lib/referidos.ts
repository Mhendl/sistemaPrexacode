/**
 * Programa de referidos: cada empresa tiene un código. Quien se registra con ese código y paga por primera vez
 * le suma un mes gratis (30 días) a la empresa que la recomendó. Una sola vez por empresa referida.
 */
import { randomInt } from "node:crypto";
import { and, eq, isNull, sql } from "drizzle-orm";
import type { FastifyInstance } from "fastify";
import type { Db } from "../db/client.js";
import { empresas, suscripciones } from "../db/schema.js";
import { hoyAr } from "./cuentas.js";
import { enviarDePlataforma } from "./email/plataforma.js";
import { marcaDe } from "./productos.js";
import { estadoDe, obtenerSuscripcion, sumarDias } from "./suscripcion.js";
import { administradores } from "./tareas.js";

type Tx = Db | Parameters<Parameters<Db["transaction"]>[0]>[0];

/** Sin letras que se confunden (0/O, 1/I/L) */
const LETRAS = "23456789ABCDEFGHJKMNPQRSTUVWXYZ";
export const DIAS_REGALO = 30;

export const nuevoCodigo = () => Array.from({ length: 7 }, () => LETRAS[randomInt(LETRAS.length)]).join("");

/** El código de la empresa (se crea la primera vez que hace falta) */
export async function codigoDe(db: Tx, empresaId: string): Promise<string> {
  const [e] = await db.select({ codigo: empresas.codigoReferido }).from(empresas).where(eq(empresas.id, empresaId));
  if (e?.codigo) return e.codigo;
  for (let i = 0; i < 5; i++) {
    const codigo = nuevoCodigo();
    try {
      const [r] = await db.update(empresas).set({ codigoReferido: codigo }).where(and(eq(empresas.id, empresaId), isNull(empresas.codigoReferido))).returning({ codigo: empresas.codigoReferido });
      if (r?.codigo) return r.codigo;
      const [otra] = await db.select({ codigo: empresas.codigoReferido }).from(empresas).where(eq(empresas.id, empresaId));
      if (otra?.codigo) return otra.codigo;
    } catch {
      // código repetido (muy raro): se prueba otro
    }
  }
  throw new Error("No se pudo generar el código de referido");
}

/** La empresa dueña de un código (sin distinguir mayúsculas) */
export async function empresaDeCodigo(db: Tx, codigo: string | null | undefined) {
  if (!codigo) return null;
  const [e] = await db.select({ id: empresas.id }).from(empresas).where(eq(empresas.codigoReferido, codigo.trim().toUpperCase()));
  return e?.id ?? null;
}

/**
 * La primera vez que paga una empresa que llegó recomendada, quien la recomendó suma 30 días:
 * al final de lo que ya tenía pago, o de la prueba si está probando, o desde hoy si estaba vencida.
 */
export async function recompensarReferido(app: FastifyInstance, empresaId: string) {
  const [marcada] = await app.db
    .update(empresas)
    .set({ referidoRecompensadoEn: new Date() })
    .where(and(eq(empresas.id, empresaId), isNull(empresas.referidoRecompensadoEn), sql`${empresas.referidaPor} is not null`))
    .returning({ referidaPor: empresas.referidaPor, razonSocial: empresas.razonSocial });
  if (!marcada?.referidaPor) return false;
  const quien = marcada.referidaPor;
  const hoy = hoyAr();
  const s = await obtenerSuscripcion(app.db, quien);
  const est = estadoDe(s, hoy);
  const cambios =
    s.pagoHasta && s.pagoHasta >= hoy
      ? { pagoHasta: sumarDias(s.pagoHasta, DIAS_REGALO) }
      : est.estado === "Prueba"
        ? { pruebaHasta: sumarDias(s.pruebaHasta, DIAS_REGALO) }
        : { pagoHasta: sumarDias(hoy, DIAS_REGALO - 1) };
  await app.db.update(suscripciones).set({ ...cambios, version: sql`${suscripciones.version} + 1`, updatedAt: new Date() }).where(eq(suscripciones.empresaId, quien));
  const [dueña] = await app.db.select({ producto: empresas.producto }).from(empresas).where(eq(empresas.id, quien));
  for (const a of await administradores(app, quien)) {
    void enviarDePlataforma(app, {
      producto: dueña?.producto,
      para: a.email,
      asunto: `¡Ganaste un mes gratis de ${marcaDe(dueña?.producto).nombre}!`,
      saludo: `Hola ${a.nombre.split(" ")[0]},`,
      parrafos: [`${marcada.razonSocial} se sumó con tu recomendación y ya empezó a pagar. Como agradecimiento, te sumamos ${DIAS_REGALO} días gratis a tu suscripción.`, "Podés seguir recomendando: por cada uno que se suma y paga, otro mes gratis."],
      boton: { texto: "Ver mi plan", url: `${app.urlDe(dueña?.producto)}/configuracion?tab=plan` },
    });
  }
  return true;
}
