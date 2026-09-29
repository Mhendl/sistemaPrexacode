import { createHmac, timingSafeEqual } from "node:crypto";

/** Pedido HTTP JSON (inyectable: en las pruebas es un Mercado Pago falso) */
export type HttpJson = (url: string, init: { method: "GET" | "POST"; headers: Record<string, string>; body?: unknown }) => Promise<{ status: number; json: unknown }>;

export const httpFetch: HttpJson = async (url, init) => {
  const res = await fetch(url, {
    method: init.method,
    headers: { "Content-Type": "application/json", ...init.headers },
    body: init.body === undefined ? undefined : JSON.stringify(init.body),
    signal: AbortSignal.timeout(20_000),
  });
  let json: unknown = null;
  try {
    json = await res.json();
  } catch {
    // sin cuerpo JSON
  }
  return { status: res.status, json };
};

export type EstadoPago = "Aprobado" | "Rechazado" | "Pendiente";

export interface Cobro {
  referencia: string;
  titulo: string;
  importeArs: number;
  email: string;
  urlVolver: string;
  urlNotificacion: string;
}

/** Quien cobra: Mercado Pago en producción; un simulador cuando no hay credenciales */
export interface ProveedorPagos {
  nombre: "mercadopago" | "simulado";
  crearCobro(c: Cobro): Promise<{ id: string; url: string }>;
  /** Estado real del pago consultado al proveedor (nunca se confía en lo que manda el navegador) */
  consultarPago(pagoId: string): Promise<{ referencia: string; estado: EstadoPago; importe: number }>;
}

export class ErrorPagos extends Error {}

const MP = "https://api.mercadopago.com";

export function mercadoPago(accessToken: string, http: HttpJson = httpFetch): ProveedorPagos {
  const auth = { Authorization: `Bearer ${accessToken}` };
  return {
    nombre: "mercadopago",
    async crearCobro(c) {
      const r = await http(`${MP}/checkout/preferences`, {
        method: "POST",
        headers: { ...auth, "X-Idempotency-Key": c.referencia },
        body: {
          items: [{ id: c.referencia, title: c.titulo, quantity: 1, unit_price: c.importeArs, currency_id: "ARS" }],
          payer: { email: c.email },
          external_reference: c.referencia,
          back_urls: { success: c.urlVolver, failure: c.urlVolver, pending: c.urlVolver },
          auto_return: "approved",
          notification_url: c.urlNotificacion,
          statement_descriptor: "PREXACODE",
        },
      });
      const j = r.json as { id?: string; init_point?: string; message?: string } | null;
      if (r.status >= 300 || !j?.id || !j.init_point) throw new ErrorPagos(`Mercado Pago no pudo crear el cobro${j?.message ? `: ${j.message}` : ""}`);
      return { id: j.id, url: j.init_point };
    },
    async consultarPago(pagoId) {
      const r = await http(`${MP}/v1/payments/${encodeURIComponent(pagoId)}`, { method: "GET", headers: auth });
      const j = r.json as { status?: string; external_reference?: string; transaction_amount?: number } | null;
      if (r.status >= 300 || !j?.external_reference) throw new ErrorPagos("No se pudo consultar el pago en Mercado Pago");
      const estado: EstadoPago = j.status === "approved" ? "Aprobado" : j.status === "rejected" || j.status === "cancelled" || j.status === "refunded" ? "Rechazado" : "Pendiente";
      return { referencia: j.external_reference, estado, importe: Number(j.transaction_amount ?? 0) };
    },
  };
}

/**
 * Firma de las notificaciones de Mercado Pago (header x-signature: "ts=…,v1=…").
 * Se firma "id:<data.id>;request-id:<x-request-id>;ts:<ts>;" con la clave secreta del webhook.
 */
export function firmaMercadoPagoValida(o: { firma: string | undefined; requestId: string | undefined; dataId: string; secreto: string }) {
  if (!o.firma) return false;
  const partes = Object.fromEntries(o.firma.split(",").map((p) => p.trim().split("=") as [string, string]));
  if (!partes.ts || !partes.v1) return false;
  const manifiesto = `id:${o.dataId.toLowerCase()};${o.requestId ? `request-id:${o.requestId};` : ""}ts:${partes.ts};`;
  const esperado = createHmac("sha256", o.secreto).update(manifiesto).digest("hex");
  const a = Buffer.from(esperado);
  const b = Buffer.from(partes.v1);
  return a.length === b.length && timingSafeEqual(a, b);
}

/** Para desarrollo y demos: el "checkout" es una página propia donde se aprueba o rechaza */
export function pagosSimulados(appUrl: string): ProveedorPagos & { resultados: Map<string, EstadoPago> } {
  const resultados = new Map<string, EstadoPago>();
  return {
    nombre: "simulado",
    resultados,
    async crearCobro(c) {
      return { id: `sim-${c.referencia}`, url: `${appUrl}/suscripcion/pago/${c.referencia}` };
    },
    async consultarPago(pagoId) {
      const referencia = pagoId.replace(/^sim-/, "");
      return { referencia, estado: resultados.get(referencia) ?? "Pendiente", importe: 0 };
    },
  };
}

/** Cotización del dólar oficial (venta) para cobrar en pesos */
export type Cotizacion = () => Promise<number>;

/** Dólar oficial del Banco Central (Comunicación A 3500), el último publicado */
async function dolarBcra(http: HttpJson) {
  const r = await http("https://api.bcra.gob.ar/estadisticascambiarias/v1.0/Cotizaciones/USD", { method: "GET", headers: {} });
  const j = r.json as { results?: { fecha?: string; detalle?: { codigoMoneda?: string; tipoCotizacion?: number }[] }[] } | null;
  const valor = Number(j?.results?.[0]?.detalle?.find((d) => d.codigoMoneda === "USD")?.tipoCotizacion);
  if (!(r.status === 200 && valor > 0)) throw new Error("BCRA sin cotización");
  return valor;
}

/** Respaldo: dólar oficial de venta (Banco Nación) publicado por dolarapi.com */
async function dolarOficialVenta(http: HttpJson) {
  const r = await http("https://dolarapi.com/v1/dolares/oficial", { method: "GET", headers: {} });
  const venta = Number((r.json as { venta?: number } | null)?.venta);
  if (!(venta > 0)) throw new Error("cotización inválida");
  return venta;
}

/**
 * Cotización para pasar los precios en dólares a pesos, en el momento:
 * primero el BCRA (fuente oficial); si no responde, el oficial de venta; si no hay red, la última conocida.
 * Se guarda una hora para no consultar en cada pedido.
 */
export function cotizacionDolar(fija?: number, http: HttpJson = httpFetch): Cotizacion {
  let cache: { valor: number; hasta: number } | null = null;
  return async () => {
    if (fija && fija > 0) return fija;
    if (cache && cache.hasta > Date.now()) return cache.valor;
    for (const fuente of [dolarBcra, dolarOficialVenta]) {
      try {
        const valor = Math.round((await fuente(http)) * 100) / 100;
        cache = { valor, hasta: Date.now() + 3600_000 };
        return valor;
      } catch {
        // probar con la siguiente
      }
    }
    if (cache) return cache.valor;
    throw new ErrorPagos("No se pudo obtener la cotización del dólar. Probá de nuevo en unos minutos.");
  };
}
