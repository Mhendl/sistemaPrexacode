import { ErrorArca } from "./cliente.js";
import { firmarCms } from "./certificados.js";
import { cuerpoSoap, escaparXml, leerXml, type TransporteSoap } from "./soap.js";

export interface TicketAcceso {
  token: string;
  sign: string;
  vence: Date;
}

/** Fecha con el huso de Argentina, como la espera WSAA: 2026-09-26T10:00:00-03:00 */
export function fechaArca(d: Date) {
  const ar = new Date(d.getTime() - 3 * 3600_000);
  return `${ar.toISOString().slice(0, 19)}-03:00`;
}

/** Pedido de acceso (TRA) para un servicio, válido ±10 minutos */
export function armarTra(servicio: string, ahora = new Date()) {
  const desde = fechaArca(new Date(ahora.getTime() - 10 * 60_000));
  const hasta = fechaArca(new Date(ahora.getTime() + 10 * 60_000));
  return `<?xml version="1.0" encoding="UTF-8"?><loginTicketRequest version="1.0"><header><uniqueId>${Math.floor(ahora.getTime() / 1000)}</uniqueId><generationTime>${desde}</generationTime><expirationTime>${hasta}</expirationTime></header><service>${escaparXml(servicio)}</service></loginTicketRequest>`;
}

/** Pide a WSAA un ticket de acceso (dura unas 12 horas) firmando el TRA con el certificado de la empresa */
export async function pedirTicket(o: { url: string; certificado: string; clave: string; servicio?: string; transporte: TransporteSoap }): Promise<TicketAcceso> {
  const cms = firmarCms(armarTra(o.servicio ?? "wsfe"), o.certificado, o.clave);
  const sobre = `<soapenv:Envelope xmlns:soapenv="http://schemas.xmlsoap.org/soap/envelope/" xmlns:wsaa="http://wsaa.view.sua.dvadac.desein.afip.gov"><soapenv:Header/><soapenv:Body><wsaa:loginCms><wsaa:in0>${cms}</wsaa:in0></wsaa:loginCms></soapenv:Body></soapenv:Envelope>`;
  const r = await o.transporte(o.url, { headers: { "Content-Type": "text/xml; charset=utf-8", SOAPAction: '""' }, body: sobre });
  let body: Record<string, unknown>;
  try {
    body = cuerpoSoap(r.texto, r.status);
  } catch (e) {
    if (e instanceof ErrorArca && /ya posee un TA valido/i.test(e.message)) {
      throw new ErrorArca("ARCA indica que ya hay un acceso vigente para este certificado (se pidió desde otro sistema o se perdió). Esperá unos minutos y probá de nuevo.", true);
    }
    throw e;
  }
  const ret = (body.loginCmsResponse as { loginCmsReturn?: string } | undefined)?.loginCmsReturn;
  if (!ret) throw new ErrorArca("WSAA no devolvió el ticket de acceso");
  const ticket = leerXml(ret).loginTicketResponse as { header?: { expirationTime?: string }; credentials?: { token?: string; sign?: string } } | undefined;
  const token = ticket?.credentials?.token;
  const sign = ticket?.credentials?.sign;
  const vence = ticket?.header?.expirationTime ? new Date(ticket.header.expirationTime) : null;
  if (!token || !sign || !vence || Number.isNaN(vence.getTime())) throw new ErrorArca("El ticket de acceso de WSAA vino incompleto");
  return { token, sign, vence };
}
