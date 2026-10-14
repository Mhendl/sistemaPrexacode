/**
 * Buscador de contactos desde la consola del servidor (lo mismo que el botón "Buscar contactos" del panel).
 *
 *   docker compose exec -T app node dist/buscar.js --campana "Consultorios" --que "consultorio odontológico; clínica dental" --donde "Avellaneda; Lanús"
 *
 * --campana: el nombre (o parte) de la campaña · --que y --donde: separados por ";" (se combinan todos con todos, hasta 10)
 */
import { config } from "./config.js";
import { openDatabase } from "./db/client.js";
import { buscarDesdeConsola, rastreadorGoogle } from "./lib/buscador.js";
import type { FastifyInstance } from "fastify";

const arg = (n: string) => {
  const i = process.argv.indexOf(`--${n}`);
  return i >= 0 ? (process.argv[i + 1] ?? "") : "";
};
const lista = (t: string) => t.split(";");

const { db, close } = await openDatabase(config.databaseUrl);
// Lo único que usa el buscador: la base y Google
const app = { db, rastreador: rastreadorGoogle(config.googlePlacesKey), log: console } as unknown as FastifyInstance;
try {
  const r = await buscarDesdeConsola(app, { campana: arg("campana"), que: lista(arg("que")), donde: lista(arg("donde")) }, (t) => console.log(t));
  console.log(`${r.estado}: ${r.lugares} negocios · ${r.conWeb} con web · ${r.conEmail} con email · ${r.nuevos} nuevos en «${r.campana}» (${r.pedidos} pedidos a Google)${r.error ? `\n${r.error}` : ""}`);
  process.exitCode = r.estado === "Terminada" ? 0 : 1;
} catch (e) {
  console.error((e as Error).message);
  process.exitCode = 1;
} finally {
  await close();
}
