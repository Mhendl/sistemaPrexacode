import type { FastifyInstance } from "fastify";
import { marcaDe } from "../productos.js";
import { armarEmail } from "./plantilla.js";

/**
 * Casillas que no existen: las de las cuentas demo (para mostrar el producto). Los avisos automáticos no se les mandan:
 * rebotarían desde nuestro propio dominio, y eso le baja la reputación a todos los envíos.
 */
const SIN_CASILLA = /^demo\.[a-z0-9._-]+@prexacode\.com$/i;

/** Turquesa de CoreDental */
export const COLOR_DENTAL = "#0e8fae";

/**
 * Email de Prexacode a sus usuarios (bienvenida, recuperar contraseña, avisos de la suscripción).
 * Sale del servidor de correo de la plataforma. Nunca frena lo que se estaba haciendo: si falla, queda en el log.
 */
export async function enviarDePlataforma(
  app: FastifyInstance,
  e: { para: string; asunto: string; saludo: string; parrafos: string[]; boton?: { texto: string; url: string }; pie?: string; producto?: string | null },
): Promise<boolean> {
  if (SIN_CASILLA.test(e.para.trim())) return true;
  const marca = marcaDe(e.producto);
  const { html, texto } = armarEmail({ color: e.producto === "dental" ? COLOR_DENTAL : undefined, empresa: marca.nombre, saludo: e.saludo, parrafos: e.parrafos, boton: e.boton, pie: e.pie ?? `${marca.nombre} · ${marca.bajada} · Si tenés dudas, escribinos desde Soporte.` });
  try {
    await app.cartero.enviar({ tipo: "plataforma" }, { de: `"${marca.nombre}" <${app.emailRemitente}>`, para: e.para, asunto: e.asunto, html, texto });
    return true;
  } catch (err) {
    app.log.warn({ err, para: e.para, asunto: e.asunto }, "No se pudo enviar un email de la plataforma");
    return false;
  }
}
