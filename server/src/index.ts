import { buildApp } from "./app.js";
import { config } from "./config.js";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { sql } from "drizzle-orm";
import { openDatabase } from "./db/client.js";
import { cotizacionDolar, mercadoPago, pagosDeshabilitados } from "./lib/pagos.js";

const { db, close } = await openDatabase(config.databaseUrl);
// La base tiene que estar en UTF-8: si no, un emoji o ciertos caracteres en cualquier texto darían error
const codificacion = ((await db.execute(sql`show server_encoding`)) as unknown as { rows: { server_encoding: string }[] }).rows[0]?.server_encoding;
if (codificacion !== "UTF8") {
  const aviso = `La base de datos está en ${codificacion}; tiene que estar en UTF8 (crearla con --encoding=UTF8).`;
  if (config.isProduction) throw new Error(aviso);
  console.warn(aviso);
}
const app = await buildApp({
  db,
  jwtSecret: config.jwtSecret,
  logger: true,
  appUrl: config.appUrl,
  appUrlDental: config.appUrlDental,
  medicion: config.medicion,
  smtpUrl: config.smtpUrl,
  emailRemitente: config.emailRemitente,
  secretsKey: config.secretsKey,
  // Sin Mercado Pago: en desarrollo, pago simulado; en producción, deshabilitado (se cobra por transferencia)
  pagos: config.mpAccessToken ? mercadoPago(config.mpAccessToken) : config.isProduction ? pagosDeshabilitados() : undefined,
  cotizacion: cotizacionDolar(config.tipoCambioUsd),
  mpWebhookSecret: config.mpWebhookSecret,
  urlApi: config.urlApi,
  modoPruebas: config.modoPruebas,
  adminInicial: config.adminInicial,
  // En el servidor de pruebas automáticas se hacen cientos de logins seguidos desde la misma IP
  limitarIntentos: !config.modoPruebas,
  produccion: config.isProduction,
  tareas: true,
  trustProxy: config.trustProxy,
  // Si está compilada la web (npm run build), la API la sirve: una sola pieza para desplegar
  web: config.web && existsSync(join(config.web, "index.html")) ? config.web : undefined,
});

let cerrando = false;
const shutdown = async () => {
  if (cerrando) return;
  cerrando = true;
  // Si alguna conexión queda abierta (ej. keep-alive de un proxy), no esperar para siempre
  setTimeout(() => process.exit(0), 3000).unref();
  try {
    await app.close();
    await close();
  } finally {
    process.exit(0);
  }
};
process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);

await app.listen({ port: config.port, host: "0.0.0.0" });
