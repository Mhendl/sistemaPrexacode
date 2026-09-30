import { fileURLToPath } from "node:url";

/**
 * Configuración por variables de entorno.
 *
 * DATABASE_URL:
 *   - "postgres://…"      → PostgreSQL real (producción)
 *   - "memory://"         → PGlite en memoria (pruebas)
 *   - cualquier otra ruta → PGlite persistido en esa carpeta (desarrollo)
 */
export const config = {
  port: Number(process.env.PORT ?? 3001),
  databaseUrl: process.env.DATABASE_URL ?? "./.data/pglite",
  jwtSecret: process.env.JWT_SECRET ?? "dev-secret-cambiar-en-produccion",
  isProduction: process.env.NODE_ENV === "production",
  /** Dirección pública de la web: se usa en los links que reciben los clientes */
  appUrl: (process.env.APP_URL ?? "http://localhost:5173").replace(/\/$/, ""),
  /** Medición de visitas y registros en las pantallas públicas (vacío: no se carga nada) */
  medicion: { ga: process.env.GA_ID || null, metaPixel: process.env.META_PIXEL_ID || null },
  /** Dirección pública de CoreDental (si no, la misma que APP_URL) */
  appUrlDental: process.env.APP_URL_DENTAL?.replace(/\/$/, ""),
  /** Servidor de correo de la plataforma (smtp[s]://usuario:clave@host:puerto). Sin él, los envíos "por Prexacode" se simulan. */
  smtpUrl: process.env.SMTP_URL,
  emailRemitente: process.env.EMAIL_FROM ?? "notificaciones@prexacode.com.ar",
  /** Clave para cifrar datos sensibles (contraseñas de SMTP, tokens). Si falta, se deriva de JWT_SECRET. */
  secretsKey: process.env.SECRETS_KEY,
  /** Mercado Pago (cobro de suscripciones). Sin token, los pagos se simulan. */
  mpAccessToken: process.env.MP_ACCESS_TOKEN,
  mpWebhookSecret: process.env.MP_WEBHOOK_SECRET,
  /** Dólar fijo para cobrar (si no, se toma el oficial del día) */
  tipoCambioUsd: process.env.TIPO_CAMBIO_USD ? Number(process.env.TIPO_CAMBIO_USD) : undefined,
  /** URL pública de la API, si no es la misma que la web (para el aviso de Mercado Pago) */
  urlApi: process.env.API_PUBLIC_URL,
  /** Solo para el servidor de pruebas automáticas (nunca en producción) */
  modoPruebas: process.env.PREXACODE_PRUEBAS === "1" && process.env.NODE_ENV !== "production",
  /** Primer administrador del panel /admin: se crea al arrancar si todavía no hay ninguno (después se gestiona desde el panel) */
  adminInicial: process.env.ADMIN_EMAIL && process.env.ADMIN_PASSWORD ? { email: process.env.ADMIN_EMAIL, password: process.env.ADMIN_PASSWORD } : undefined,
  /** Detrás de un proxy (lo normal en producción): usar la IP real del cliente */
  trustProxy: process.env.TRUST_PROXY ? process.env.TRUST_PROXY === "1" : process.env.NODE_ENV === "production",
  /** Carpeta de la web compilada para servirla desde la API ("0" para no servirla) */
  web: process.env.SERVIR_WEB === "0" ? undefined : (process.env.SERVIR_WEB ?? fileURLToPath(new URL("../../dist", import.meta.url))),
};

/** En producción: si falta algo crítico, no arranca (mejor un error claro al desplegar que un problema con clientes) */
export function validarProduccion(c: typeof config): string[] {
  if (!c.isProduction) return [];
  const faltan: string[] = [];
  if (!/^postgres(ql)?:\/\//.test(c.databaseUrl)) faltan.push("DATABASE_URL tiene que ser una base PostgreSQL (postgres://…)");
  if (c.jwtSecret.startsWith("dev-") || c.jwtSecret.length < 32) faltan.push("JWT_SECRET: una clave aleatoria de al menos 32 caracteres");
  if (!c.secretsKey || c.secretsKey.length < 32) faltan.push("SECRETS_KEY: una clave aleatoria de al menos 32 caracteres (cifra contraseñas y certificados guardados)");
  if (!process.env.APP_URL || !c.appUrl.startsWith("https://")) faltan.push("APP_URL: la dirección pública con https (ej. https://app.prexacode.com.ar)");
  if (c.modoPruebas) faltan.push("PREXACODE_PRUEBAS no puede estar activo en producción");
  if (c.adminInicial && c.adminInicial.password.length < 12) faltan.push("ADMIN_PASSWORD: al menos 12 caracteres (es la llave del panel de administración)");
  return faltan;
}

const faltan = validarProduccion(config);
if (faltan.length) {
  throw new Error(`Configuración incompleta para producción:\n - ${faltan.join("\n - ")}`);
}
