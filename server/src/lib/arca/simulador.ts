import type { ConectorArca, RespuestaCae, SolicitudCae } from "./cliente.js";
import { DOC_TIPO } from "./codigos.js";

/**
 * Simulador de ARCA: mismas reglas básicas que WSFEv1, sin conexión real.
 * Los comprobantes que autoriza NO tienen validez fiscal.
 *
 * Valida lo mismo que ARCA rechaza con más frecuencia, para que los errores
 * aparezcan antes de pasar a producción.
 */
const ultimos = new Map<string, number>();

let secuenciaCae = 0;

export function crearSimulador(cuitEmisor: string): ConectorArca {
  return {
    modo: "simulado",

    async ultimoAutorizado(puntoVenta, tipoCbte) {
      return ultimos.get(`${cuitEmisor}-${puntoVenta}-${tipoCbte}`) ?? 0;
    },

    async solicitarCae(s: SolicitudCae): Promise<RespuestaCae> {
      const clave = `${s.cuitEmisor}-${s.puntoVenta}-${s.tipoCbte}`;
      const errores: RespuestaCae["errores"] = [];
      const ultimo = ultimos.get(clave) ?? 0;

      if (s.numero !== ultimo + 1) errores.push({ codigo: 10016, mensaje: `El número de comprobante debe ser ${ultimo + 1}` });
      // Factura A (1) y NC A (3): el receptor tiene que tener CUIT
      if ([1, 3].includes(s.tipoCbte) && s.docTipo !== DOC_TIPO.CUIT) errores.push({ codigo: 10013, mensaje: "Para comprobantes A el receptor debe identificarse con CUIT" });
      const suma = Math.round((s.importeNeto + s.importeExento + s.importeIva) * 100);
      if (suma !== Math.round(s.importeTotal * 100)) errores.push({ codigo: 10048, mensaje: "El importe total no coincide con la suma de los importes" });
      const sumaIva = Math.round(s.iva.reduce((a, i) => a + i.importe, 0) * 100);
      if (sumaIva !== Math.round(s.importeIva * 100)) errores.push({ codigo: 10051, mensaje: "La suma de alícuotas de IVA no coincide con el importe de IVA" });
      if (s.concepto !== 1 && (!s.fechaServicioDesde || !s.fechaServicioHasta || !s.fechaVencimientoPago)) {
        errores.push({ codigo: 10035, mensaje: "Para servicios son obligatorias las fechas de servicio y de vencimiento de pago" });
      }
      if (s.importeTotal <= 0) errores.push({ codigo: 10016, mensaje: "El importe total debe ser mayor a cero" });

      if (errores.length) return { resultado: "R", errores, observaciones: [] };

      ultimos.set(clave, s.numero);
      const vto = new Date(`${s.fecha}T00:00:00Z`);
      vto.setUTCDate(vto.getUTCDate() + 10);
      const cae = `7${String(Date.now()).slice(-9)}${String(++secuenciaCae % 10000).padStart(4, "0")}`;
      return { resultado: "A", cae, caeVencimiento: vto.toISOString().slice(0, 10), errores: [], observaciones: [] };
    },
  };
}
