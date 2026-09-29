/** Códigos de las tablas de ARCA para factura electrónica (WSFEv1) */

export type Letra = "A" | "B" | "C";
export type ClaseComprobante = "factura" | "nota_credito";

/** Tipo de comprobante (FEParamGetTiposCbte) */
export const TIPO_CBTE: Record<ClaseComprobante, Record<Letra, number>> = {
  factura: { A: 1, B: 6, C: 11 },
  nota_credito: { A: 3, B: 8, C: 13 },
};

export function describirTipo(codigo: number): { clase: ClaseComprobante; letra: Letra; nombre: string } {
  for (const clase of ["factura", "nota_credito"] as const) {
    for (const letra of ["A", "B", "C"] as const) {
      if (TIPO_CBTE[clase][letra] === codigo) {
        return { clase, letra, nombre: `${clase === "factura" ? "Factura" : "Nota de crédito"} ${letra}` };
      }
    }
  }
  throw new Error(`Tipo de comprobante desconocido: ${codigo}`);
}

/** Alícuota de IVA → Id de ARCA (FEParamGetTiposIva) */
export const ID_ALICUOTA: Record<number, number> = { 0: 3, 10.5: 4, 21: 5, 27: 6, 5: 8, 2.5: 9 };

/** Tipo de documento del receptor (FEParamGetTiposDoc) */
export const DOC_TIPO = { CUIT: 80, CUIL: 86, DNI: 96, SIN_IDENTIFICAR: 99 } as const;

/**
 * Desde este total, una factura a consumidor final tiene que identificar al comprador (RG 5700/2025 de ARCA).
 * Si ARCA lo cambia, se cambia acá.
 */
export const TOPE_CONSUMIDOR_SIN_IDENTIFICAR = 10_000_000;

/** Condición frente al IVA del receptor (RG 5616, FEParamGetCondicionIvaReceptor) */
export const CONDICION_IVA_RECEPTOR: Record<string, number> = {
  "Responsable Inscripto": 1,
  Exento: 4,
  "Consumidor Final": 5,
  Monotributista: 6,
};

/** Concepto: 1 productos, 2 servicios, 3 productos y servicios */
export type Concepto = 1 | 2 | 3;

/**
 * Qué letra corresponde según emisor y receptor.
 * - Responsable Inscripto: A a otro RI y a monotributistas (RG 5003); B a exentos y consumidores finales.
 * - Monotributista o Exento: siempre C.
 */
export function letraSegun(emisor: string, receptor: string): Letra {
  if (emisor !== "Responsable Inscripto") return "C";
  return receptor === "Responsable Inscripto" || receptor === "Monotributista" ? "A" : "B";
}
