import { eq } from "drizzle-orm";
import type { FastifyInstance } from "fastify";
import { configEmail, emailsEnviados, empresas } from "../../db/schema.js";
import { SinServidorPlataforma, type Seguridad, type Transporte } from "./cartero.js";

export interface Envio {
  empresaId: string;
  para: string;
  asunto: string;
  html: string;
  texto: string;
  tipo: "comprobante" | "presupuesto" | "prueba" | "turno" | "campana";
  refId?: string | null;
  usuarioId?: string | null;
  automatico?: boolean;
}

export type ConfigEmail = typeof configEmail.$inferSelect;

export async function obtenerConfigEmail(app: FastifyInstance, empresaId: string): Promise<ConfigEmail> {
  await app.db.insert(configEmail).values({ empresaId }).onConflictDoNothing();
  const [c] = await app.db.select().from(configEmail).where(eq(configEmail.empresaId, empresaId));
  return c!;
}

function transporteDe(app: FastifyInstance, c: ConfigEmail): Transporte {
  if (c.modo !== "smtp") return { tipo: "plataforma" };
  if (!c.host || !c.puerto || !c.usuario || !c.passwordCifrada) throw new Error("Falta completar la configuración del servidor de correo");
  return { tipo: "smtp", host: c.host, puerto: c.puerto, seguridad: (c.seguridad ?? "STARTTLS") as Seguridad, usuario: c.usuario, password: app.cifrador.descifrar(c.passwordCifrada) };
}

/** Traduce los errores típicos de SMTP a algo que se entienda */
export function explicarError(e: unknown): string {
  const err = e as { code?: string; responseCode?: number; message?: string };
  const msg = err.message ?? "";
  if (err.code === "EAUTH" || err.responseCode === 535) return "El servidor rechazó el usuario o la contraseña. En Gmail hace falta una contraseña de aplicación.";
  // nodemailer a veces informa los errores de red como ESOCKET: se mira también el mensaje
  if (/ENOTFOUND|EAI_AGAIN/.test(`${err.code} ${msg}`)) return "No se encontró el servidor de correo: revisá que esté bien escrito.";
  if (/ECONNREFUSED|ECONNRESET|ECONNECTION/.test(`${err.code} ${msg}`)) return "No se pudo conectar con el servidor de correo. Revisá el servidor y el puerto.";
  if (/ETIMEDOUT|timeout/i.test(`${err.code} ${msg}`)) return "El servidor de correo no respondió a tiempo. Revisá el puerto (587 o 465).";
  if (err.code === "EENVELOPE") return "El servidor no aceptó la dirección de destino.";
  if (/TLS|SSL|certificate|wrong version number/i.test(msg)) return "Falló la conexión segura: probá con otra opción de seguridad (STARTTLS en 587, SSL/TLS en 465).";
  return msg || "Error desconocido al enviar";
}

/**
 * Envía y deja registro. Nunca tira error: devuelve el resultado para mostrarlo.
 * Sin servidor de la plataforma configurado (desarrollo), queda como "Simulado".
 */
export async function enviarEmail(app: FastifyInstance, e: Envio): Promise<{ estado: "Enviado" | "Error" | "Simulado"; error: string | null }> {
  const c = await obtenerConfigEmail(app, e.empresaId);
  const [emp] = await app.db.select({ razonSocial: empresas.razonSocial, nombreFantasia: empresas.nombreFantasia, email: empresas.email }).from(empresas).where(eq(empresas.id, e.empresaId));
  const nombre = (c.remitenteNombre || emp?.nombreFantasia || emp?.razonSocial || "Prexacode").replace(/["<>]/g, "");
  let estado: "Enviado" | "Error" | "Simulado" = "Enviado";
  let error: string | null = null;
  try {
    const transporte = transporteDe(app, c);
    const de = transporte.tipo === "smtp" ? `"${nombre}" <${transporte.usuario}>` : `"${nombre}" <${app.emailRemitente}>`;
    await app.cartero.enviar(transporte, { de, responderA: c.responderA || emp?.email || null, para: e.para, asunto: e.asunto, html: e.html, texto: e.texto });
  } catch (err) {
    if (err instanceof SinServidorPlataforma) {
      estado = "Simulado";
    } else {
      estado = "Error";
      error = explicarError(err);
    }
  }
  await app.db.insert(emailsEnviados).values({ empresaId: e.empresaId, para: e.para, asunto: e.asunto, estado, error, tipo: e.tipo, refId: e.refId ?? null, automatico: e.automatico ?? false, usuarioId: e.usuarioId ?? null });
  return { estado, error };
}
