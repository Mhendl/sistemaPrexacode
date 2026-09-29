import type { FastifyInstance } from "fastify";
import { armarEmail } from "./plantilla.js";

/**
 * Email de Prexacode a sus usuarios (bienvenida, recuperar contraseña, avisos de la suscripción).
 * Sale del servidor de correo de la plataforma. Nunca frena lo que se estaba haciendo: si falla, queda en el log.
 */
export async function enviarDePlataforma(
  app: FastifyInstance,
  e: { para: string; asunto: string; saludo: string; parrafos: string[]; boton?: { texto: string; url: string }; pie?: string },
): Promise<boolean> {
  const { html, texto } = armarEmail({ empresa: "Prexacode", saludo: e.saludo, parrafos: e.parrafos, boton: e.boton, pie: e.pie ?? "Prexacode · Gestión para empresas · Si tenés dudas, escribinos desde Ayuda y soporte." });
  try {
    await app.cartero.enviar({ tipo: "plataforma" }, { de: `"Prexacode" <${app.emailRemitente}>`, para: e.para, asunto: e.asunto, html, texto });
    return true;
  } catch (err) {
    app.log.warn({ err, para: e.para, asunto: e.asunto }, "No se pudo enviar un email de la plataforma");
    return false;
  }
}
