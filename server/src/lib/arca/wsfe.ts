import { ErrorArca, type ConectorArca, type RespuestaCae, type SolicitudCae } from "./cliente.js";
import { cuerpoSoap, escaparXml, lista, type TransporteSoap } from "./soap.js";
import type { TicketAcceso } from "./wsaa.js";

const NS = "http://ar.gov.afip.dif.FEV1/";
/** Errores de WSFE que indican que el ticket de acceso no sirve (vencido, de otro CUIT, sin relación) */
const ERRORES_ACCESO = [600, 601, 602];

const importe = (n: number) => n.toFixed(2);
const fechaAfip = (f: string) => f.replaceAll("-", "");
const deFechaAfip = (f: string | undefined) => (f && /^\d{8}$/.test(f) ? `${f.slice(0, 4)}-${f.slice(4, 6)}-${f.slice(6, 8)}` : undefined);

type Mensaje = { Code?: string; Msg?: string };
const mensajes = (v: unknown, clave: "Err" | "Obs") => lista((v as Record<string, Mensaje | Mensaje[]> | undefined)?.[clave]).map((m) => ({ codigo: Number(m.Code), mensaje: String(m.Msg ?? "") }));

export interface OpcionesWsfe {
  modo: "homologacion" | "produccion";
  url: string;
  cuit: string;
  transporte: TransporteSoap;
  /** Ticket vigente de WSAA (lo cachea quien crea el conector) */
  ticket: () => Promise<TicketAcceso>;
  /** Se llama si ARCA rechaza el ticket, para pedir uno nuevo la próxima vez */
  invalidarTicket: () => Promise<void>;
}

/** Detalle del comprobante en el formato de FECAESolicitar */
export function detalleCae(s: SolicitudCae) {
  const servicios = s.concepto !== 1;
  const iva = s.iva.filter((i) => i.importe > 0 || i.baseImponible > 0);
  return [
    `<ar:Concepto>${s.concepto}</ar:Concepto>`,
    `<ar:DocTipo>${s.docTipo}</ar:DocTipo>`,
    `<ar:DocNro>${escaparXml(s.docNro)}</ar:DocNro>`,
    `<ar:CbteDesde>${s.numero}</ar:CbteDesde>`,
    `<ar:CbteHasta>${s.numero}</ar:CbteHasta>`,
    `<ar:CbteFch>${fechaAfip(s.fecha)}</ar:CbteFch>`,
    `<ar:ImpTotal>${importe(s.importeTotal)}</ar:ImpTotal>`,
    `<ar:ImpTotConc>0.00</ar:ImpTotConc>`,
    `<ar:ImpNeto>${importe(s.importeNeto)}</ar:ImpNeto>`,
    `<ar:ImpOpEx>${importe(s.importeExento)}</ar:ImpOpEx>`,
    `<ar:ImpTrib>0.00</ar:ImpTrib>`,
    `<ar:ImpIVA>${importe(s.importeIva)}</ar:ImpIVA>`,
    ...(servicios
      ? [
          `<ar:FchServDesde>${fechaAfip(s.fechaServicioDesde ?? s.fecha)}</ar:FchServDesde>`,
          `<ar:FchServHasta>${fechaAfip(s.fechaServicioHasta ?? s.fecha)}</ar:FchServHasta>`,
          `<ar:FchVtoPago>${fechaAfip(s.fechaVencimientoPago ?? s.fecha)}</ar:FchVtoPago>`,
        ]
      : []),
    `<ar:MonId>PES</ar:MonId>`,
    `<ar:MonCotiz>1</ar:MonCotiz>`,
    `<ar:CondicionIVAReceptorId>${s.condicionIvaReceptor}</ar:CondicionIVAReceptorId>`,
    ...(s.asociado
      ? [
          `<ar:CbtesAsoc><ar:CbteAsoc><ar:Tipo>${s.asociado.tipoCbte}</ar:Tipo><ar:PtoVta>${s.asociado.puntoVenta}</ar:PtoVta><ar:Nro>${s.asociado.numero}</ar:Nro><ar:Cuit>${escaparXml(s.asociado.cuit)}</ar:Cuit><ar:CbteFch>${fechaAfip(s.asociado.fecha)}</ar:CbteFch></ar:CbteAsoc></ar:CbtesAsoc>`,
        ]
      : []),
    // Factura C (monotributo/exento): sin IVA discriminado
    ...(iva.length
      ? [`<ar:Iva>${iva.map((i) => `<ar:AlicIva><ar:Id>${i.id}</ar:Id><ar:BaseImp>${importe(i.baseImponible)}</ar:BaseImp><ar:Importe>${importe(i.importe)}</ar:Importe></ar:AlicIva>`).join("")}</ar:Iva>`]
      : []),
  ].join("");
}

/** Conector real con WSFEv1 (factura electrónica de ARCA) */
export function crearConectorWsfe(o: OpcionesWsfe): ConectorArca {
  async function llamar(metodo: string, contenido: (auth: string) => string) {
    const t = await o.ticket();
    const auth = `<ar:Auth><ar:Token>${escaparXml(t.token)}</ar:Token><ar:Sign>${escaparXml(t.sign)}</ar:Sign><ar:Cuit>${escaparXml(o.cuit)}</ar:Cuit></ar:Auth>`;
    const sobre = `<soapenv:Envelope xmlns:soapenv="http://schemas.xmlsoap.org/soap/envelope/" xmlns:ar="${NS}"><soapenv:Header/><soapenv:Body><ar:${metodo}>${contenido(auth)}</ar:${metodo}></soapenv:Body></soapenv:Envelope>`;
    const r = await o.transporte(o.url, { headers: { "Content-Type": "text/xml; charset=utf-8", SOAPAction: `"${NS}${metodo}"` }, body: sobre });
    const body = cuerpoSoap(r.texto, r.status);
    const resultado = (body[`${metodo}Response`] as Record<string, unknown> | undefined)?.[`${metodo}Result`] as Record<string, unknown> | undefined;
    if (!resultado) throw new ErrorArca(`WSFE no devolvió resultado para ${metodo}`);
    const errores = mensajes(resultado.Errors, "Err");
    if (errores.some((e) => ERRORES_ACCESO.includes(e.codigo))) {
      await o.invalidarTicket();
      throw new ErrorArca(
        `ARCA rechazó el acceso: ${errores.map((e) => e.mensaje).join(" · ")}. Revisá que el certificado esté autorizado para Facturación Electrónica en el Administrador de Relaciones.`,
        false,
      );
    }
    return { resultado, errores };
  }

  return {
    modo: o.modo,

    async preparar() {
      await o.ticket();
    },

    async ultimoAutorizado(puntoVenta, tipoCbte) {
      const { resultado, errores } = await llamar("FECompUltimoAutorizado", (auth) => `${auth}<ar:PtoVta>${puntoVenta}</ar:PtoVta><ar:CbteTipo>${tipoCbte}</ar:CbteTipo>`);
      if (errores.length) throw new ErrorArca(errores.map((e) => `${e.codigo}: ${e.mensaje}`).join(" · "), false);
      const n = Number(resultado.CbteNro);
      if (!Number.isInteger(n) || n < 0) throw new ErrorArca("ARCA devolvió un número de comprobante inválido");
      return n;
    },

    async solicitarCae(s): Promise<RespuestaCae> {
      const { resultado, errores } = await llamar(
        "FECAESolicitar",
        (auth) =>
          `${auth}<ar:FeCAEReq><ar:FeCabReq><ar:CantReg>1</ar:CantReg><ar:PtoVta>${s.puntoVenta}</ar:PtoVta><ar:CbteTipo>${s.tipoCbte}</ar:CbteTipo></ar:FeCabReq><ar:FeDetReq><ar:FECAEDetRequest>${detalleCae(s)}</ar:FECAEDetRequest></ar:FeDetReq></ar:FeCAEReq>`,
      );
      const det = lista((resultado.FeDetResp as { FECAEDetResponse?: Record<string, unknown> | Record<string, unknown>[] } | undefined)?.FECAEDetResponse)[0];
      const cab = resultado.FeCabResp as { Resultado?: string } | undefined;
      const observaciones = det ? mensajes(det.Observaciones, "Obs") : [];
      const aprobado = (det?.Resultado ?? cab?.Resultado) === "A" && !!det?.CAE;
      if (aprobado) {
        return { resultado: "A", cae: String(det!.CAE), caeVencimiento: deFechaAfip(String(det!.CAEFchVto)), errores: [], observaciones };
      }
      // Rechazado: los motivos pueden venir como errores generales o como observaciones del comprobante
      const motivos = [...errores, ...observaciones];
      return { resultado: "R", errores: motivos.length ? motivos : [{ codigo: 0, mensaje: "ARCA rechazó el comprobante sin indicar el motivo" }], observaciones: [] };
    },
  };
}
