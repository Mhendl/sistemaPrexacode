/**
 * Precios de Prexacode y CoreDental (en dólares por mes). Los de acá son los de fábrica; los vigentes se cambian
 * desde el panel de la plataforma (se guardan en la base y se aplican al arrancar y al guardarlos).
 * Todos los planes incluyen todos los módulos: cambian usuarios y puntos de venta.
 */
type Plan = { nombre: string; precioUsd: number; usuarios: number; puntosVenta: number | null; bajada: string };

const DE_FABRICA = {
  basico: { nombre: "Básico", precioUsd: 45, usuarios: 2, puntosVenta: 1, bajada: "Para emprendedores y comercios que arrancan" },
  profesional: { nombre: "Profesional", precioUsd: 89, usuarios: 5, puntosVenta: 3, bajada: "Para PyMEs con ventas, stock y equipo" },
  empresa: { nombre: "Empresa", precioUsd: 169, usuarios: 10, puntosVenta: null, bajada: "Para empresas con varias sucursales" },
} satisfies Record<string, Plan>;

export type PlanId = keyof typeof DE_FABRICA;
export const PLAN_IDS = Object.keys(DE_FABRICA) as PlanId[];

/** Los planes vigentes (el precio puede cambiar desde el panel) */
export const PLANES: Record<PlanId, Plan> = structuredClone(DE_FABRICA);

/** Valores de fábrica (las pruebas calculan los importes esperados con estos) */
export const PRECIO_USUARIO_ADICIONAL_USD = 15;
/** Pagando anual se pagan 10 meses (2 gratis) */
export const MESES_COBRADOS_ANUAL = 10;

/** Lo vigente del usuario adicional y del pago anual */
export const precios = { usuarioAdicionalUsd: PRECIO_USUARIO_ADICIONAL_USD, mesesCobradosAnual: MESES_COBRADOS_ANUAL };

export interface PreciosGuardados {
  planes: Record<PlanId, number>;
  usuarioAdicionalUsd: number;
  mesesCobradosAnual: number;
}

/** Aplica los precios guardados (o vuelve a los de fábrica si no hay) */
export function aplicarPrecios(p: PreciosGuardados | null | undefined) {
  for (const id of PLAN_IDS) PLANES[id].precioUsd = p?.planes?.[id] ?? DE_FABRICA[id].precioUsd;
  precios.usuarioAdicionalUsd = p?.usuarioAdicionalUsd ?? PRECIO_USUARIO_ADICIONAL_USD;
  precios.mesesCobradosAnual = p?.mesesCobradosAnual ?? MESES_COBRADOS_ANUAL;
}

export const preciosVigentes = (): PreciosGuardados => ({
  planes: Object.fromEntries(PLAN_IDS.map((id) => [id, PLANES[id].precioUsd])) as Record<PlanId, number>,
  usuarioAdicionalUsd: precios.usuarioAdicionalUsd,
  mesesCobradosAnual: precios.mesesCobradosAnual,
});
