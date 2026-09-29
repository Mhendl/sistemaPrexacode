import { eq } from "drizzle-orm";
import type { FastifyInstance } from "fastify";
import { clientes, empresas } from "../db/schema.js";
import { detalleComprobante } from "../routes/comprobantes.js";
import { detallePresupuesto } from "../routes/presupuestos.js";
import { armarEmail } from "./email/plantilla.js";
import { enviarEmail } from "./email/servicio.js";
import { tokenPublico, urlPublica, type TipoDocumento } from "./enlaces.js";
import { formatNumero } from "./numeracion.js";
import { telefonoWhatsapp } from "./telefono.js";

const pesos = (n: number) => `$ ${n.toLocaleString("es-AR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const fecha = (f: string) => `${f.slice(8, 10)}/${f.slice(5, 7)}/${f.slice(0, 4)}`;

export interface Resumen {
  titulo: string;
  empresa: string;
  cliente: { razonSocial: string; email: string | null; telefono: string | null; contacto: string | null };
  /** Frases con los datos del documento (se usan en email y WhatsApp) */
  detalle: string[];
  boton: string;
  url: string;
  vistas: number;
}

/**
 * Datos para compartir un documento: título, destinatario sugerido y link público.
 * Devuelve null si no existe o no se puede compartir (ej. factura rechazada por ARCA).
 */
export async function resumenDocumento(app: FastifyInstance, empresaId: string, tipo: TipoDocumento, id: string): Promise<Resumen | null> {
  const [emp] = await app.db.select({ razonSocial: empresas.razonSocial, nombreFantasia: empresas.nombreFantasia }).from(empresas).where(eq(empresas.id, empresaId));
  const empresa = emp?.nombreFantasia || emp?.razonSocial || "";
  let base: Omit<Resumen, "url" | "vistas" | "empresa">;
  if (tipo === "comprobante") {
    const c = await detalleComprobante(app.db, empresaId, id);
    if (!c || c.estado !== "Autorizado" || c.numero == null) return null;
    const titulo = `${c.tipo} ${formatNumero(c.puntoVenta, c.numero)}`;
    const cli = await clienteDe(app, c.clienteId);
    const detalle = [`Te enviamos la ${titulo} por ${pesos(c.total)}.`];
    if (c.clase === "factura" && (c.saldo ?? 0) > 0 && c.condicionVenta !== "Contado") detalle.push(`Vence el ${fecha(c.vencimiento)}.`);
    base = { titulo, cliente: cli ?? { razonSocial: c.receptor.razonSocial, email: null, telefono: null, contacto: null }, detalle, boton: c.clase === "factura" ? "Ver factura" : "Ver nota de crédito" };
  } else {
    const p = await detallePresupuesto(app.db, empresaId, id);
    if (!p) return null;
    const titulo = `Presupuesto N° ${String(p.numero).padStart(8, "0")}`;
    base = {
      titulo,
      cliente: { razonSocial: p.cliente.razonSocial, email: p.cliente.email, telefono: p.cliente.telefono, contacto: p.cliente.contacto },
      detalle: [`Te enviamos el ${titulo.replace("Presupuesto", "presupuesto")} por ${pesos(p.total)}, válido hasta el ${fecha(p.validoHasta)}.`],
      boton: "Ver presupuesto",
    };
  }
  const enlace = await tokenPublico(app.db, empresaId, tipo, id);
  return { ...base, empresa, url: urlPublica(app.appUrl, enlace.token), vistas: enlace.vistas };
}

async function clienteDe(app: FastifyInstance, clienteId: string) {
  const [c] = await app.db.select({ razonSocial: clientes.razonSocial, email: clientes.email, telefono: clientes.telefono, contacto: clientes.contacto }).from(clientes).where(eq(clientes.id, clienteId));
  return c ?? null;
}

const saludoPara = (r: Resumen) => `Hola${r.cliente.contacto ? ` ${r.cliente.contacto.split(" ")[0]}` : ""},`;

/** Texto listo para WhatsApp (click-to-chat), con el link */
export function textoWhatsapp(r: Resumen, mensaje?: string | null) {
  return [saludoPara(r), ...r.detalle, ...(mensaje ? [mensaje] : []), `${r.boton}: ${r.url}`, `— ${r.empresa}`].join("\n");
}

export function datosWhatsapp(r: Resumen) {
  const telefono = telefonoWhatsapp(r.cliente.telefono);
  const texto = textoWhatsapp(r);
  return { telefono, texto, url: `https://wa.me/${telefono ?? ""}?text=${encodeURIComponent(texto)}` };
}

export async function enviarDocumentoPorEmail(
  app: FastifyInstance,
  o: { empresaId: string; tipo: TipoDocumento; id: string; para: string; mensaje?: string | null; usuarioId?: string | null; automatico?: boolean; resumen?: Resumen },
) {
  const r = o.resumen ?? (await resumenDocumento(app, o.empresaId, o.tipo, o.id));
  if (!r) return null;
  const { html, texto } = armarEmail({
    empresa: r.empresa,
    saludo: saludoPara(r),
    parrafos: [...r.detalle, ...(o.mensaje ? [o.mensaje] : [])],
    boton: { texto: r.boton, url: r.url },
    pie: `${r.empresa} · Enviado con Prexacode. Podés ver, imprimir o guardar el documento en PDF desde el link.`,
  });
  return enviarEmail(app, { empresaId: o.empresaId, para: o.para, asunto: `${r.titulo} · ${r.empresa}`, html, texto, tipo: o.tipo, refId: o.id, usuarioId: o.usuarioId, automatico: o.automatico });
}
