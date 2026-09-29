/**
 * Datos del PROVEEDOR del servicio (quien vende Prexacode) que aparecen en los Términos y la Política de Privacidad.
 *
 * ⚠️ COMPLETAR antes de tener clientes reales, y hacer revisar los textos (src/modules/legal/textos.ts) por un abogado.
 * Al cambiar cualquier texto legal, actualizar TERMINOS_VERSION en server/src/lib/legal.ts: los administradores
 * de cada empresa tendrán que volver a aceptarlos, y queda registrado quién, cuándo y desde qué IP.
 */
export const proveedor = {
  razonSocial: "HENDL MARTIN EZEQUIEL",
  cuit: "24-35324876-2",
  domicilio: "[DOMICILIO LEGAL]",
  email: "[EMAIL DE CONTACTO]",
  /** Ciudad de los tribunales para cualquier reclamo (ej.: "la Ciudad Autónoma de Buenos Aires", "La Plata") */
  jurisdiccion: "[CIUDAD DE LOS TRIBUNALES]",
};

/** Plazos y topes que usan los textos (los mismos que aplica el sistema) */
export const condiciones = {
  diasPrueba: 14,
  diasGracia: 7,
  /** Pasada la gracia sin pago, a los cuántos días se puede dar de baja la cuenta y borrar los datos (con aviso previo) */
  diasHastaBajaPorFaltaDePago: 60,
  diasConservacionTrasBaja: 60,
  diasAvisoCambios: 30,
  diasArrepentimiento: 10,
  /** Tope de responsabilidad: lo pagado por el Cliente en estos meses anteriores al reclamo */
  mesesTopeResponsabilidad: 3,
};

/** true mientras falte completar algún dato del proveedor */
export const faltanDatosProveedor = Object.values(proveedor).some((v) => v.startsWith("["));
