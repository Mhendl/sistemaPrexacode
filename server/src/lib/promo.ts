/**
 * Promo de lanzamiento: un descuento en los primeros pagos mensuales, para una cantidad limitada de empresas.
 * Se configura desde el panel (Precios y cobros). La empresa la toma con su primer pago mensual y la conserva
 * por los pagos que dure, aunque después la promo se apague o se acaben los lugares.
 */
import { isNotNull } from "drizzle-orm";
import type { FastifyInstance } from "fastify";
import { suscripciones } from "../db/schema.js";
import { configPlataforma } from "./facturacionPropia.js";
import type { Periodo, Suscripcion } from "./suscripcion.js";

export interface PromoGuardada {
  activa: boolean;
  /** Porcentaje de descuento (1 a 90) */
  descuentoPct: number;
  /** En cuántos pagos mensuales se aplica (el primero incluido) */
  pagos: number;
  /** Para cuántas empresas */
  cupos: number;
}

/** Lo que se le puede contar a cualquiera (landings, emails): se refresca al guardar y al aprobarse un pago */
export const promoPublica: { vigente: { descuentoPct: number; pagos: number; quedan: number } | null } = { vigente: null };

export async function estadoPromo(app: FastifyInstance) {
  const promo = ((await configPlataforma(app)).promo as PromoGuardada | null) ?? null;
  const usadas = (await app.db.select({ id: suscripciones.empresaId }).from(suscripciones).where(isNotNull(suscripciones.promoPct))).length;
  const quedan = promo ? Math.max(0, promo.cupos - usadas) : 0;
  return { promo, usadas, quedan, vigente: !!promo?.activa && quedan > 0 };
}

export async function refrescarPromo(app: FastifyInstance) {
  const e = await estadoPromo(app);
  promoPublica.vigente = e.vigente ? { descuentoPct: e.promo!.descuentoPct, pagos: e.promo!.pagos, quedan: e.quedan } : null;
  return e;
}

/**
 * El descuento que le corresponde a esta empresa en un pago (0 si ninguno), y cuántos pagos con descuento le quedan
 * contando este. Solo en pagos mensuales: pagando el año ya hay meses gratis.
 */
export async function descuentoDe(app: FastifyInstance, s: Pick<Suscripcion, "promoPct" | "promoPagosRestantes" | "pagoHasta">, periodo: Periodo) {
  if (periodo !== "mensual") return { pct: 0, pagos: 0 };
  // Ya la tiene: le quedan pagos con descuento
  if (s.promoPct && s.promoPagosRestantes > 0) return { pct: s.promoPct, pagos: s.promoPagosRestantes };
  // Todavía no pagó nunca y hay lugar: la toma con este pago
  if (s.promoPct === null && !s.pagoHasta) {
    const e = await estadoPromo(app);
    if (e.vigente) return { pct: e.promo!.descuentoPct, pagos: e.promo!.pagos };
  }
  return { pct: 0, pagos: 0 };
}

export const conDescuento = (usd: number, pct: number) => Math.round(usd * (100 - pct)) / 100;
