/**
 * Precios de Prexacode (en dólares por mes). Es el ÚNICO lugar donde se definen:
 * la web, el cobro, el panel y las pruebas los toman de acá.
 * Todos los planes incluyen todos los módulos: cambian usuarios y puntos de venta.
 */
export const PLANES = {
  basico: { nombre: "Básico", precioUsd: 45, usuarios: 2, puntosVenta: 1, bajada: "Para emprendedores y comercios que arrancan" },
  profesional: { nombre: "Profesional", precioUsd: 89, usuarios: 5, puntosVenta: 3, bajada: "Para PyMEs con ventas, stock y equipo" },
  empresa: { nombre: "Empresa", precioUsd: 169, usuarios: 10, puntosVenta: null as number | null, bajada: "Para empresas con varias sucursales" },
} as const;
export type PlanId = keyof typeof PLANES;
export const PLAN_IDS = Object.keys(PLANES) as PlanId[];
export const PRECIO_USUARIO_ADICIONAL_USD = 15;
/** Pagando anual se pagan 10 meses (2 gratis) */
export const MESES_COBRADOS_ANUAL = 10;
