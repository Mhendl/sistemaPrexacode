import { XMLParser } from "fast-xml-parser";
import { ErrorArca } from "./cliente.js";

/** Cómo se hace el pedido HTTP (en las pruebas se reemplaza por un ARCA falso) */
export type TransporteSoap = (url: string, init: { headers: Record<string, string>; body: string }) => Promise<{ status: number; texto: string }>;

export const transporteFetch: TransporteSoap = async (url, init) => {
  let res: Response;
  try {
    res = await fetch(url, { method: "POST", headers: init.headers, body: init.body, signal: AbortSignal.timeout(30_000) });
  } catch (e) {
    const err = e as Error;
    throw new ErrorArca(err.name === "TimeoutError" ? "ARCA no respondió a tiempo" : `no se pudo conectar (${err.message})`);
  }
  return { status: res.status, texto: await res.text() };
};

export const urlsArca = {
  homologacion: { wsaa: "https://wsaahomo.afip.gov.ar/ws/services/LoginCms", wsfe: "https://wswhomo.afip.gov.ar/wsfev1/service.asmx" },
  produccion: { wsaa: "https://wsaa.afip.gov.ar/ws/services/LoginCms", wsfe: "https://servicios1.afip.gov.ar/wsfev1/service.asmx" },
};
export type UrlsArca = (typeof urlsArca)["homologacion"];

export const escaparXml = (s: string | number) => String(s).replace(/[<>&'"]/g, (c) => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;", "'": "&apos;", '"': "&quot;" })[c]!);

const parser = new XMLParser({
  removeNSPrefix: true,
  ignoreAttributes: true,
  parseTagValue: false, // todo como texto: CAE y CUIT no deben convertirse en número
  trimValues: true,
});

export const leerXml = (xml: string) => parser.parse(xml) as Record<string, unknown>;

/** Siempre como lista (el XML trae un objeto si hay uno solo) */
export const lista = <T>(v: T | T[] | undefined | null): T[] => (v == null ? [] : Array.isArray(v) ? v : [v]);

/** Cuerpo de la respuesta SOAP; si es un Fault, lanza ErrorArca con el mensaje de ARCA */
export function cuerpoSoap(xml: string, status: number): Record<string, unknown> {
  let doc: Record<string, unknown>;
  try {
    doc = leerXml(xml);
  } catch {
    throw new ErrorArca(`respuesta inválida de ARCA (HTTP ${status})`);
  }
  const body = (doc.Envelope as Record<string, unknown> | undefined)?.Body as Record<string, unknown> | undefined;
  if (!body) throw new ErrorArca(`respuesta inesperada de ARCA (HTTP ${status})`);
  const fault = body.Fault as { faultcode?: string; faultstring?: string } | undefined;
  if (fault) {
    // Los problemas de certificado no se arreglan reintentando
    const reintentable = !/alreadyAuthenticated|cms\.|cert|expired|notAuthorized/i.test(fault.faultcode ?? "");
    throw new ErrorArca(fault.faultstring || "error de ARCA", reintentable);
  }
  return body;
}
