import { and, count, eq } from "drizzle-orm";
import type { Db } from "../db/client.js";
import { empresas, puntosVenta, suscripciones, usuarios } from "../db/schema.js";
import { hoyAr } from "./cuentas.js";
import { HttpError } from "./errors.js";

/** Catálogo de planes. Todos incluyen todos los módulos: cambian usuarios y puntos de venta. */
export const PLANES = {
  basico: { nombre: "Básico", precioUsd: 35, usuarios: 2, puntosVenta: 1, bajada: "Para emprendedores y comercios que arrancan" },
  profesional: { nombre: "Profesional", precioUsd: 75, usuarios: 5, puntosVenta: 3, bajada: "Para PyMEs con ventas, stock y equipo" },
  empresa: { nombre: "Empresa", precioUsd: 140, usuarios: 10, puntosVenta: null as number | null, bajada: "Para empresas con varias sucursales" },
} as const;
export type PlanId = keyof typeof PLANES;
export const PLAN_IDS = Object.keys(PLANES) as PlanId[];
export const PRECIO_USUARIO_ADICIONAL_USD = 12;
/** Pagando anual se pagan 10 meses (2 gratis) */
export const MESES_COBRADOS_ANUAL = 10;
export const DIAS_PRUEBA = 14;
export const DIAS_GRACIA = 7;
export const DIAS_AVISO = 7;

export type Periodo = "mensual" | "anual";
export type EstadoSuscripcion = "Prueba" | "Activa" | "Gracia" | "SoloLectura";

export const sumarDias = (f: string, n: number) => {
  const d = new Date(`${f}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
};

/** Suma meses respetando fin de mes (31/01 + 1 mes = 28 o 29/02) */
export const sumarMeses = (f: string, n: number) => {
  const [a, m, d] = f.split("-").map(Number) as [number, number, number];
  const destino = new Date(Date.UTC(a, m - 1 + n, 1));
  const ultimo = new Date(Date.UTC(destino.getUTCFullYear(), destino.getUTCMonth() + 1, 0)).getUTCDate();
  destino.setUTCDate(Math.min(d, ultimo));
  return destino.toISOString().slice(0, 10);
};

const diasEntre = (desde: string, hasta: string) => Math.round((Date.parse(`${hasta}T00:00:00Z`) - Date.parse(`${desde}T00:00:00Z`)) / 86_400_000);

export type Suscripcion = typeof suscripciones.$inferSelect;

/** La suscripción de la empresa; la primera vez se crea con la prueba gratis contada desde el alta */
export async function obtenerSuscripcion(db: Db, empresaId: string): Promise<Suscripcion> {
  const [s] = await db.select().from(suscripciones).where(eq(suscripciones.empresaId, empresaId));
  if (s) return s;
  const [e] = await db.select({ creada: empresas.createdAt, plan: empresas.plan }).from(empresas).where(eq(empresas.id, empresaId));
  const alta = new Date((e?.creada ?? new Date()).getTime() - 3 * 3600_000).toISOString().slice(0, 10);
  const plan = (PLAN_IDS as string[]).includes(e?.plan ?? "") ? e!.plan : "profesional";
  await db.insert(suscripciones).values({ empresaId, plan, pruebaHasta: sumarDias(alta, DIAS_PRUEBA) }).onConflictDoNothing();
  const [creada] = await db.select().from(suscripciones).where(eq(suscripciones.empresaId, empresaId));
  return creada!;
}

/** Hasta cuándo puede usar todo (prueba o pago, lo que sea más tarde) */
export const venceEl = (s: Pick<Suscripcion, "pruebaHasta" | "pagoHasta">) => (s.pagoHasta && s.pagoHasta > s.pruebaHasta ? s.pagoHasta : s.pruebaHasta);

export function estadoDe(s: Pick<Suscripcion, "pruebaHasta" | "pagoHasta">, hoy = hoyAr()) {
  const vence = venceEl(s);
  let estado: EstadoSuscripcion;
  if (s.pagoHasta && hoy <= s.pagoHasta) estado = "Activa";
  else if (hoy <= s.pruebaHasta) estado = "Prueba";
  else if (hoy <= sumarDias(vence, DIAS_GRACIA)) estado = "Gracia";
  else estado = "SoloLectura";
  return {
    estado,
    vence,
    diasRestantes: diasEntre(hoy, vence),
    /** En gracia: hasta cuándo se puede seguir cargando */
    graciaHasta: sumarDias(vence, DIAS_GRACIA),
    avisar: estado !== "Activa" || diasEntre(hoy, vence) <= DIAS_AVISO,
  };
}

export function limitesDe(s: Pick<Suscripcion, "plan" | "usuariosAdicionales">) {
  const p = PLANES[s.plan as PlanId] ?? PLANES.profesional;
  return { usuarios: p.usuarios + s.usuariosAdicionales, puntosVenta: p.puntosVenta };
}

export function precioUsd(plan: PlanId, adicionales: number, periodo: Periodo) {
  const mensual = PLANES[plan].precioUsd + adicionales * PRECIO_USUARIO_ADICIONAL_USD;
  return periodo === "anual" ? mensual * MESES_COBRADOS_ANUAL : mensual;
}

/** Período que cubre un pago aprobado hoy: sigue desde el vencimiento vigente (no se pierden días) */
export function periodoCubierto(s: Pick<Suscripcion, "pruebaHasta" | "pagoHasta">, periodo: Periodo, hoy = hoyAr()) {
  const vence = venceEl(s);
  const desde = vence >= hoy ? sumarDias(vence, 1) : hoy;
  const hasta = sumarDias(sumarMeses(desde, periodo === "anual" ? 12 : 1), -1);
  return { desde, hasta };
}

export async function usosActuales(db: Db, empresaId: string) {
  const [{ u }] = await db.select({ u: count() }).from(usuarios).where(and(eq(usuarios.empresaId, empresaId), eq(usuarios.estado, "Activo")));
  const [{ p }] = await db.select({ p: count() }).from(puntosVenta).where(and(eq(puntosVenta.empresaId, empresaId), eq(puntosVenta.activo, true)));
  return { usuarios: Number(u), puntosVenta: Number(p) };
}

/** Antes de sumar un usuario o un punto de venta activo: tiene que haber lugar en el plan */
export async function exigirCupo(db: Db, empresaId: string, que: "usuarios" | "puntosVenta") {
  const s = await obtenerSuscripcion(db, empresaId);
  const lim = limitesDe(s);
  const usos = await usosActuales(db, empresaId);
  const plan = PLANES[s.plan as PlanId]?.nombre ?? s.plan;
  if (que === "usuarios" && usos.usuarios >= lim.usuarios) {
    throw new HttpError(409, `Tu plan ${plan} permite ${lim.usuarios} usuarios activos y ya los usás todos. Sumá usuarios adicionales en Configuración → Plan, o suspendé alguno.`, undefined, "LIMITE_PLAN");
  }
  if (que === "puntosVenta" && lim.puntosVenta !== null && usos.puntosVenta >= lim.puntosVenta) {
    throw new HttpError(409, `Tu plan ${plan} permite ${lim.puntosVenta} punto${lim.puntosVenta === 1 ? "" : "s"} de venta activo${lim.puntosVenta === 1 ? "" : "s"}. Pasate a un plan mayor en Configuración → Plan.`, undefined, "LIMITE_PLAN");
  }
}

export type ResultadoCambio =
  | { tipo: "inmediato" }
  | { tipo: "proximo"; desde: string }
  | { tipo: "pagar"; importeUsd: number; dias: number; hasta: string };

/**
 * Qué pasa si la empresa cambia de plan o de usuarios adicionales:
 * - sin período pago en curso (prueba, gracia, solo lectura): se aplica ya; el próximo pago usa el precio nuevo
 * - con período pago en curso y el precio sube: se paga la diferencia solo por los días que faltan
 * - con período pago en curso y el precio baja: queda programado para la próxima renovación (lo pagado no se devuelve)
 */
export function cotizarCambio(s: Pick<Suscripcion, "plan" | "usuariosAdicionales" | "periodo" | "pruebaHasta" | "pagoHasta">, plan: PlanId, adicionales: number, hoy = hoyAr()): ResultadoCambio {
  if (!s.pagoHasta || s.pagoHasta < hoy) return { tipo: "inmediato" };
  const diferencia = precioUsd(plan, adicionales, "mensual") - precioUsd(s.plan as PlanId, s.usuariosAdicionales, "mensual");
  if (diferencia === 0) return { tipo: "inmediato" };
  if (diferencia < 0) return { tipo: "proximo", desde: sumarDias(s.pagoHasta, 1) };
  const dias = diasPagosRestantes(s, hoy);
  if (dias === 0) return { tipo: "inmediato" };
  const importe = (precioDiaUsd(plan, adicionales, s.periodo as Periodo) - precioDiaUsd(s.plan as PlanId, s.usuariosAdicionales, s.periodo as Periodo)) * dias;
  return { tipo: "pagar", importeUsd: Math.max(0.01, Math.round(importe * 100) / 100), dias, hasta: s.pagoHasta };
}

/** Desde cuándo corren los días pagos (los que todavía son de prueba gratis no cuentan) */
const inicioPago = (s: Pick<Suscripcion, "pruebaHasta">, hoy: string) => (s.pruebaHasta >= hoy ? sumarDias(s.pruebaHasta, 1) : hoy);

/** Días pagos que le quedan (hoy incluido) */
export const diasPagosRestantes = (s: Pick<Suscripcion, "pruebaHasta" | "pagoHasta">, hoy = hoyAr()) =>
  s.pagoHasta ? Math.max(0, diasEntre(inicioPago(s, hoy), s.pagoHasta) + 1) : 0;

/** Precio por día en USD (pagando anual, cada mes sale 10/12 del mensual) */
export const precioDiaUsd = (plan: PlanId, adicionales: number, periodo: Periodo) =>
  (precioUsd(plan, adicionales, "mensual") * (periodo === "anual" ? MESES_COBRADOS_ANUAL / 12 : 1)) / 30;

/**
 * Qué compra un pago de "cambio" al acreditarse. Todo peso cobrado se convierte en días de servicio a precio de lista:
 * - lo normal: habilita el plan o los usuarios nuevos y el vencimiento queda igual
 * - si mientras tanto renovó al precio viejo, los días de más se recalculan al precio nuevo (el vencimiento se acorta)
 * - si ya estaba aplicado (pagó dos veces lo mismo) o ya no es una suba, no cambia el plan: se acredita como días
 * - si se paga con el período ya vencido, los días corren desde hoy
 */
export function aplicarCambioPagado(
  s: Pick<Suscripcion, "plan" | "usuariosAdicionales" | "periodo" | "pruebaHasta" | "pagoHasta">,
  pago: { plan: PlanId; usuariosAdicionales: number; importeUsd: number },
  hoy = hoyAr(),
) {
  const periodo = s.periodo as Periodo;
  const sube = precioUsd(pago.plan, pago.usuariosAdicionales, "mensual") > precioUsd(s.plan as PlanId, s.usuariosAdicionales, "mensual");
  const plan = sube ? pago.plan : (s.plan as PlanId);
  const usuariosAdicionales = sube ? pago.usuariosAdicionales : s.usuariosAdicionales;
  const restantes = diasPagosRestantes(s, hoy);
  const valor = restantes * precioDiaUsd(s.plan as PlanId, s.usuariosAdicionales, periodo) + pago.importeUsd;
  const dias = Math.round(valor / precioDiaUsd(plan, usuariosAdicionales, periodo));
  const pagoHasta = dias > 0 ? sumarDias(inicioPago(s, hoy), dias - 1) : s.pagoHasta;
  return { plan, usuariosAdicionales, pagoHasta, aplicado: sube };
}
