/**
 * Los productos que se venden sobre la misma plataforma: la marca, los colores y el menú dependen del producto.
 * Antes de iniciar sesión lo define la dirección web (coredental… → CoreDental); con sesión, el de la empresa.
 */
export type ProductoId = "gestion" | "dental";

export const MARCAS: Record<ProductoId, { nombre: string; bajada: string; web: string }> = {
  gestion: { nombre: "Prexacode", bajada: "Gestión para empresas", web: "prexacode.com" },
  dental: { nombre: "CoreDental", bajada: "Gestión odontológica", web: "coredental.com.ar" },
};

const CLAVE = "prexacode-producto";
const esProducto = (p: unknown): p is ProductoId => p === "gestion" || p === "dental";

/** El producto de la dirección web. Con ?producto=dental (demos y pruebas) queda recordado en este navegador. */
export function productoDelSitio(): ProductoId {
  try {
    const pedido = new URLSearchParams(window.location.search).get("producto");
    if (esProducto(pedido)) localStorage.setItem(CLAVE, pedido);
    const guardado = localStorage.getItem(CLAVE);
    if (esProducto(guardado)) return guardado;
  } catch {
    /* sin almacenamiento: se usa la dirección */
  }
  return /coredental/i.test(window.location.hostname) ? "dental" : "gestion";
}

let activo: ProductoId = "gestion";

/** Cambia la marca activa (colores incluidos) */
export function setProductoActivo(p: string | null | undefined) {
  activo = esProducto(p) ? p : productoDelSitio();
  document.documentElement.dataset.producto = activo;
}
export const productoActivo = () => activo;

setProductoActivo(productoDelSitio());

/** Identidad del producto activo: cambiarla acá la cambia en toda la app. */
export const brand = {
  get nombre() {
    return MARCAS[activo].nombre;
  },
  get bajada() {
    return MARCAS[activo].bajada;
  },
  get web() {
    return MARCAS[activo].web;
  },
};

/** Nombre comercial de cada plan en cada producto (los precios son los mismos) */
const PLANES: Record<ProductoId, Record<string, string>> = {
  gestion: { basico: "Básico", profesional: "Profesional", empresa: "Empresa" },
  dental: { basico: "Consultorio", profesional: "Clínica", empresa: "Centro odontológico" },
};
export const nombrePlan = (plan: string, p: ProductoId = activo) => PLANES[p][plan] ?? plan;

/** La plataforma (panel de administración, textos del proveedor): siempre Prexacode */
export const plataforma = MARCAS.gestion;
