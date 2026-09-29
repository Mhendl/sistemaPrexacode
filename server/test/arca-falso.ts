import forge from "node-forge";
import { XMLParser } from "fast-xml-parser";
import { ErrorArca } from "../src/lib/arca/cliente.js";
import type { TransporteSoap } from "../src/lib/arca/soap.js";

/**
 * ARCA falso para las pruebas: una autoridad certificante como la de homologación,
 * y WSAA + WSFEv1 que validan los pedidos como el real y responden el mismo XML.
 */

export function crearCa(nombre = "Computadores Test") {
  const claves = forge.pki.rsa.generateKeyPair({ bits: 1024, e: 0x10001 });
  const cert = forge.pki.createCertificate();
  cert.publicKey = claves.publicKey;
  cert.serialNumber = "01";
  cert.validity.notBefore = new Date(Date.now() - 86_400_000);
  cert.validity.notAfter = new Date(Date.now() + 5 * 365 * 86_400_000);
  const sujeto = [
    { name: "countryName", value: "AR" },
    { name: "organizationName", value: "AFIP" },
    { name: "commonName", value: nombre },
  ];
  cert.setSubject(sujeto);
  cert.setIssuer(sujeto);
  cert.setExtensions([{ name: "basicConstraints", cA: true }]);
  cert.sign(claves.privateKey, forge.md.sha256.create());
  return {
    pem: forge.pki.certificateToPem(cert),
    /** Firma un CSR como lo hace ARCA al descargar el certificado */
    firmar(csrPem: string, o: { dias?: number; desdeDias?: number } = {}) {
      const csr = forge.pki.certificationRequestFromPem(csrPem);
      const c = forge.pki.createCertificate();
      c.publicKey = csr.publicKey!;
      c.serialNumber = String(Math.floor(Math.random() * 1e9) + 2);
      c.validity.notBefore = new Date(Date.now() + (o.desdeDias ?? -1) * 86_400_000);
      c.validity.notAfter = new Date(Date.now() + (o.dias ?? 730) * 86_400_000);
      c.setSubject(csr.subject.attributes);
      c.setIssuer(cert.subject.attributes);
      c.sign(claves.privateKey, forge.md.sha256.create());
      return forge.pki.certificateToPem(c);
    },
  };
}

/** Un certificado de otra clave (para probar que se rechaza) */
export function certificadoAjeno(ca: ReturnType<typeof crearCa>, cuit: string) {
  const k = forge.pki.rsa.generateKeyPair({ bits: 1024, e: 0x10001 });
  const csr = forge.pki.createCertificationRequest();
  csr.publicKey = k.publicKey;
  csr.setSubject([
    { name: "countryName", value: "AR" },
    { name: "commonName", value: "otro" },
    { type: "2.5.4.5", value: `CUIT ${cuit}` },
  ]);
  csr.sign(k.privateKey, forge.md.sha256.create());
  return ca.firmar(forge.pki.certificationRequestToPem(csr));
}

/** Contenido firmado de un CMS leído con node-forge (queda en rawCapture, a veces partido en varios OCTET STRING) */
export function contenidoCms(msg: forge.pkcs7.PkcsSignedData): string {
  type Nodo = { value: string | Nodo[] };
  const envuelto = (msg as unknown as { rawCapture?: { content?: Nodo } }).rawCapture?.content;
  const octetos = (envuelto?.value as Nodo[] | undefined)?.[0];
  if (!octetos) return "";
  const bytes = Array.isArray(octetos.value) ? octetos.value.map((p) => p.value as string).join("") : octetos.value;
  return forge.util.decodeUtf8(bytes);
}

const parser = new XMLParser({ removeNSPrefix: true, ignoreAttributes: true, parseTagValue: false });
const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
const sobre = (cuerpo: string) => `<?xml version="1.0" encoding="utf-8"?><soap:Envelope xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"><soap:Body>${cuerpo}</soap:Body></soap:Envelope>`;
const fault = (codigo: string, msg: string) => ({
  status: 500,
  texto: sobre(`<soapenv:Fault xmlns:soapenv="http://schemas.xmlsoap.org/soap/envelope/"><faultcode xmlns:ns1="http://xml.apache.org/axis/">ns1:${codigo}</faultcode><faultstring>${esc(msg)}</faultstring></soapenv:Fault>`),
});
const hoyAfip = () => new Date(Date.now() - 3 * 3600_000).toISOString().slice(0, 10).replaceAll("-", "");
const n = (v: unknown) => Number(v ?? 0);

export interface PedidoCae {
  ptoVta: number;
  tipo: number;
  det: Record<string, unknown>;
}

export function crearArcaFalso() {
  const estado = {
    logins: 0,
    /** Horas de validez de los tickets que emite WSAA */
    horasTicket: 12,
    tokens: new Set<string>(),
    numeros: new Map<string, number>(),
    pedidos: [] as PedidoCae[],
    cuitsLogin: [] as string[],
    /** Fallas a simular (se consumen al usarse) */
    caido: false,
    rechazarTokenUnaVez: false,
    rechazar: null as null | { codigo: number; mensaje: string },
    faultWsaa: null as null | { codigo: string; mensaje: string },
  };

  const wsaa = (body: string) => {
    if (estado.faultWsaa) {
      const f = estado.faultWsaa;
      estado.faultWsaa = null;
      return fault(f.codigo, f.mensaje);
    }
    const in0 = (parser.parse(body) as { Envelope: { Body: { loginCms: { in0: string } } } }).Envelope.Body.loginCms.in0;
    const msg = forge.pkcs7.messageFromAsn1(forge.asn1.fromDer(forge.util.decode64(in0))) as forge.pkcs7.PkcsSignedData;
    const tra = parser.parse(contenidoCms(msg)) as { loginTicketRequest: { service: string; header: { generationTime: string; expirationTime: string } } };
    if (tra.loginTicketRequest.service !== "wsfe") return fault("wsn.unavailable", "servicio no disponible");
    const gen = new Date(tra.loginTicketRequest.header.generationTime).getTime();
    const exp = new Date(tra.loginTicketRequest.header.expirationTime).getTime();
    if (!(gen < Date.now() && exp > Date.now())) return fault("cms.bad", "generationTime/expirationTime inválidos");
    const cert = msg.certificates[0]!;
    const serial = cert.subject.attributes.find((a) => a.type === "2.5.4.5")?.value as string;
    estado.cuitsLogin.push(serial.replace(/\D/g, ""));
    estado.logins++;
    const token = `TOKEN-${estado.logins}-${Math.random().toString(36).slice(2)}`;
    estado.tokens.add(token);
    const vence = new Date(Date.now() + estado.horasTicket * 3600_000).toISOString();
    const ticket = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><loginTicketResponse version="1.0"><header><source>CN=wsaahomo, O=AFIP, C=AR</source><destination>${esc(cert.subject.attributes.map((a) => `${a.shortName ?? a.type}=${a.value}`).join(", "))}</destination><uniqueId>1</uniqueId><generationTime>${new Date().toISOString()}</generationTime><expirationTime>${vence}</expirationTime></header><credentials><token>${token}</token><sign>SIGN-${estado.logins}</sign></credentials></loginTicketResponse>`;
    return { status: 200, texto: sobre(`<loginCmsResponse xmlns="http://wsaa.view.sua.dvadac.desein.afip.gov"><loginCmsReturn>${esc(ticket)}</loginCmsReturn></loginCmsResponse>`) };
  };

  const errores = (lista: { codigo: number; mensaje: string }[]) => `<Errors>${lista.map((e) => `<Err><Code>${e.codigo}</Code><Msg>${esc(e.mensaje)}</Msg></Err>`).join("")}</Errors>`;

  const wsfe = (accion: string, body: string) => {
    const b = (parser.parse(body) as { Envelope: { Body: Record<string, Record<string, unknown>> } }).Envelope.Body;
    const metodo = accion.replace(/"/g, "").split("/").pop()!;
    const req = b[metodo]!;
    const auth = req.Auth as { Token: string; Sign: string; Cuit: string };
    const resp = (contenido: string) => ({ status: 200, texto: sobre(`<${metodo}Response xmlns="http://ar.gov.afip.dif.FEV1/"><${metodo}Result>${contenido}</${metodo}Result></${metodo}Response>`) });
    if (estado.rechazarTokenUnaVez || !estado.tokens.has(auth.Token)) {
      estado.rechazarTokenUnaVez = false;
      estado.tokens.delete(auth.Token);
      return resp(errores([{ codigo: 600, mensaje: "ValidacionDeToken: No validaron las firmas digitales" }]));
    }
    if (metodo === "FECompUltimoAutorizado") {
      const clave = `${auth.Cuit}-${req.PtoVta}-${req.CbteTipo}`;
      return resp(`<PtoVta>${req.PtoVta}</PtoVta><CbteTipo>${req.CbteTipo}</CbteTipo><CbteNro>${estado.numeros.get(clave) ?? 0}</CbteNro>`);
    }
    if (metodo === "FECAESolicitar") {
      const cae = req.FeCAEReq as { FeCabReq: { PtoVta: string; CbteTipo: string }; FeDetReq: { FECAEDetRequest: Record<string, unknown> } };
      const ptoVta = n(cae.FeCabReq.PtoVta);
      const tipo = n(cae.FeCabReq.CbteTipo);
      const det = cae.FeDetReq.FECAEDetRequest;
      estado.pedidos.push({ ptoVta, tipo, det });
      const clave = `${auth.Cuit}-${ptoVta}-${tipo}`;
      const cab = (resultado: string) => `<FeCabResp><Cuit>${auth.Cuit}</Cuit><PtoVta>${ptoVta}</PtoVta><CbteTipo>${tipo}</CbteTipo><FchProceso>${hoyAfip()}120000</FchProceso><CantReg>1</CantReg><Resultado>${resultado}</Resultado><Reproceso>N</Reproceso></FeCabResp>`;
      const rechazo = (obs: { codigo: number; mensaje: string }[]) =>
        resp(
          `${cab("R")}<FeDetResp><FECAEDetResponse><Concepto>${det.Concepto}</Concepto><DocTipo>${det.DocTipo}</DocTipo><DocNro>${det.DocNro}</DocNro><CbteDesde>${det.CbteDesde}</CbteDesde><CbteHasta>${det.CbteHasta}</CbteHasta><CbteFch>${det.CbteFch}</CbteFch><Resultado>R</Resultado><Observaciones>${obs.map((o) => `<Obs><Code>${o.codigo}</Code><Msg>${esc(o.mensaje)}</Msg></Obs>`).join("")}</Observaciones><CAE></CAE><CAEFchVto></CAEFchVto></FECAEDetResponse></FeDetResp>`,
        );
      // Validaciones como las de ARCA
      if (n(det.CbteDesde) !== (estado.numeros.get(clave) ?? 0) + 1) return resp(`${cab("R")}${errores([{ codigo: 10016, mensaje: "El numero o fecha del comprobante no se corresponde con el proximo a autorizar" }])}`);
      const alicuotas = ((det.Iva as { AlicIva?: unknown } | undefined)?.AlicIva ?? []) as { Importe: string; BaseImp: string } | { Importe: string; BaseImp: string }[];
      const ivas = Array.isArray(alicuotas) ? alicuotas : [alicuotas];
      if ([11, 13].includes(tipo) && ivas.length) return rechazo([{ codigo: 10071, mensaje: "Para comprobantes tipo C el objeto IVA no debe informarse" }]);
      const sumaIva = ivas.reduce((a, i) => a + n(i.Importe), 0);
      if (Math.abs(sumaIva - n(det.ImpIVA)) > 0.01) return rechazo([{ codigo: 10051, mensaje: "La suma de los importes de IVA no coincide con ImpIVA" }]);
      if (Math.abs(n(det.ImpNeto) + n(det.ImpIVA) + n(det.ImpOpEx) + n(det.ImpTotConc) + n(det.ImpTrib) - n(det.ImpTotal)) > 0.01) return rechazo([{ codigo: 10048, mensaje: "El campo ImpTotal no coincide con la suma de los importes" }]);
      if (!det.CondicionIVAReceptorId) return rechazo([{ codigo: 10242, mensaje: "Falta la condición frente al IVA del receptor" }]);
      if (estado.rechazar) {
        const r = estado.rechazar;
        estado.rechazar = null;
        return rechazo([r]);
      }
      const numero = n(det.CbteDesde);
      estado.numeros.set(clave, numero);
      const vto = new Date(Date.now() + 10 * 86_400_000).toISOString().slice(0, 10).replaceAll("-", "");
      const cae14 = String(76000000000000 + Math.floor(Math.random() * 999999999));
      return resp(
        `${cab("A")}<FeDetResp><FECAEDetResponse><Concepto>${det.Concepto}</Concepto><DocTipo>${det.DocTipo}</DocTipo><DocNro>${det.DocNro}</DocNro><CbteDesde>${numero}</CbteDesde><CbteHasta>${numero}</CbteHasta><CbteFch>${det.CbteFch}</CbteFch><Resultado>A</Resultado><CAE>${cae14}</CAE><CAEFchVto>${vto}</CAEFchVto></FECAEDetResponse></FeDetResp>`,
      );
    }
    return { status: 500, texto: "método desconocido" };
  };

  const transporte: TransporteSoap = async (url, init) => {
    if (estado.caido) throw new ErrorArca("no se pudo conectar (connect ECONNREFUSED)");
    if (url.includes("wsaa")) return wsaa(init.body);
    return wsfe(init.headers.SOAPAction ?? "", init.body);
  };

  return { estado, transporte, urls: { homologacion: { wsaa: "https://wsaa.falso/LoginCms", wsfe: "https://wsfe.falso/service.asmx" }, produccion: { wsaa: "https://wsaa-prod.falso/LoginCms", wsfe: "https://wsfe-prod.falso/service.asmx" } } };
}
