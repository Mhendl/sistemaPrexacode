import nodemailer from "nodemailer";

export type Seguridad = "STARTTLS" | "SSL/TLS" | "Ninguna";

export type Transporte =
  | { tipo: "plataforma" }
  | { tipo: "smtp"; host: string; puerto: number; seguridad: Seguridad; usuario: string; password: string };

export interface Mensaje {
  de: string;
  responderA?: string | null;
  para: string;
  asunto: string;
  html: string;
  texto: string;
}

/** Quien entrega los emails. En las pruebas se reemplaza por uno que los guarda en memoria. */
export interface Cartero {
  enviar(transporte: Transporte, mensaje: Mensaje): Promise<void>;
}

/** La plataforma no tiene servidor de correo configurado: el envío se registra como simulado */
export class SinServidorPlataforma extends Error {
  constructor() {
    super("El servidor de correo de la plataforma no está configurado");
  }
}

const opcionesSmtp = (t: Extract<Transporte, { tipo: "smtp" }>) => ({
  host: t.host,
  port: t.puerto,
  secure: t.seguridad === "SSL/TLS",
  requireTLS: t.seguridad === "STARTTLS",
  ignoreTLS: t.seguridad === "Ninguna",
  auth: { user: t.usuario, pass: t.password },
  // Que un servidor que no responde no deje colgado el pedido
  connectionTimeout: 10_000,
  greetingTimeout: 10_000,
  socketTimeout: 20_000,
});

export function carteroSmtp(smtpUrlPlataforma?: string): Cartero {
  return {
    async enviar(transporte, m) {
      let tr;
      if (transporte.tipo === "plataforma") {
        if (!smtpUrlPlataforma) throw new SinServidorPlataforma();
        tr = nodemailer.createTransport(smtpUrlPlataforma);
      } else {
        tr = nodemailer.createTransport(opcionesSmtp(transporte));
      }
      try {
        await tr.sendMail({ from: m.de, replyTo: m.responderA ?? undefined, to: m.para, subject: m.asunto, html: m.html, text: m.texto });
      } finally {
        tr.close();
      }
    },
  };
}
