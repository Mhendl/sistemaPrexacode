import type { Concepto } from "./codigos.js";

/** Pedido de CAE, ya con los códigos de ARCA (lo arma el módulo de facturación) */
export interface SolicitudCae {
  cuitEmisor: string;
  puntoVenta: number;
  tipoCbte: number;
  numero: number;
  concepto: Concepto;
  docTipo: number;
  docNro: string;
  condicionIvaReceptor: number;
  fecha: string; // aaaa-mm-dd
  importeTotal: number;
  importeNeto: number;
  importeExento: number;
  importeIva: number;
  iva: { id: number; baseImponible: number; importe: number }[];
  /** Obligatorias si el concepto incluye servicios */
  fechaServicioDesde?: string;
  fechaServicioHasta?: string;
  fechaVencimientoPago?: string;
  /** Para notas de crédito: comprobante que se ajusta */
  asociado?: { tipoCbte: number; puntoVenta: number; numero: number; cuit: string; fecha: string };
}

export interface RespuestaCae {
  resultado: "A" | "R"; // Aprobado / Rechazado
  cae?: string;
  caeVencimiento?: string; // aaaa-mm-dd
  /** Errores y observaciones de ARCA, con su código */
  errores: { codigo: number; mensaje: string }[];
  observaciones: { codigo: number; mensaje: string }[];
}

/**
 * Conexión con ARCA. Hay dos implementaciones:
 * - simulador: para modo de prueba y para las pruebas automáticas
 * - WSFEv1 real (homologación o producción), con certificado de la empresa
 */
export interface ConectorArca {
  readonly modo: "simulado" | "homologacion" | "produccion";
  ultimoAutorizado(puntoVenta: number, tipoCbte: number): Promise<number>;
  solicitarCae(s: SolicitudCae): Promise<RespuestaCae>;
  /**
   * Deja lista la autenticación (ticket de WSAA) ANTES de abrir la transacción de la factura:
   * adentro de la transacción el conector no debe tocar la base.
   */
  preparar?(): Promise<void>;
}

/** Error de comunicación con ARCA (caída, timeout, certificado vencido…) */
export class ErrorArca extends Error {
  constructor(
    message: string,
    public reintentable = true,
  ) {
    super(message);
  }
}
