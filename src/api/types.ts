import type { CondicionIva, Role } from "@/types";

/** Formas que devuelve la API (fechas como string ISO) */

export interface EmpresaApi {
  id: string;
  /** gestion (Prexacode) o dental (CoreDental) */
  producto: "gestion" | "dental";
  razonSocial: string;
  nombreFantasia: string | null;
  cuit: string;
  condicionIva: CondicionIva;
  domicilio: string | null;
  localidad: string | null;
  email: string | null;
  telefono: string | null;
  plan: string;
  ingresosBrutos: string | null;
  inicioActividades: string | null;
  codigoPostal: string | null;
  logoActualizado: string | null;
  createdAt: string;
}

export interface UsuarioApi {
  id: string;
  empresaId: string;
  nombre: string;
  email: string;
  rol: Role;
  rolId: string | null;
  rolNombre: string;
  estado: "Activo" | "Suspendido";
  ultimoAcceso: string | null;
  createdAt: string;
  /** Solo en la sesión propia (/auth/me y login) */
  esAdmin?: boolean;
  permisos?: string[];
}

export interface RolApi {
  id: string;
  nombre: string;
  descripcion: string | null;
  esAdmin: boolean;
  prearmado: "admin" | "ventas" | "operaciones" | "profesional" | "recepcion" | null;
  permisos: string[];
  version: number;
  usuarios: number;
}

export interface SeccionPermisosApi {
  seccion: string;
  permisos: { id: string; nombre: string }[];
}

export interface Sesion {
  token: string;
  usuario: UsuarioApi;
  empresa: EmpresaApi;
}

export interface ClienteApi {
  id: string;
  razonSocial: string;
  cuit: string;
  /** El "Consumidor final" sin identificar de las ventas de mostrador (sin CUIT, no se edita) */
  sinIdentificar?: boolean;
  condicionIva: CondicionIva;
  contacto: string | null;
  email: string | null;
  telefono: string | null;
  domicilio: string | null;
  localidad: string | null;
  rubro: string | null;
  notas: string | null;
  estado: "Activo" | "Inactivo";
  version: number;
  createdAt: string;
  updatedAt: string;
}

export type ClienteInput = Omit<ClienteApi, "id" | "createdAt" | "updatedAt" | "estado" | "version"> & { estado?: ClienteApi["estado"]; version?: number };

export type EmpresaInput = Pick<
  EmpresaApi,
  "razonSocial" | "nombreFantasia" | "condicionIva" | "ingresosBrutos" | "inicioActividades" | "domicilio" | "localidad" | "codigoPostal" | "telefono" | "email"
>;

export interface ProductoApi {
  id: string;
  codigo: string;
  descripcion: string;
  categoria: string | null;
  unidad: string;
  precio: number;
  alicuotaIva: number;
  controlaStock: boolean;
  stock: number;
  stockMinimo: number;
  activo: boolean;
  version: number;
  createdAt: string;
  updatedAt: string;
}

export type ProductoInput = Pick<ProductoApi, "codigo" | "descripcion" | "categoria" | "unidad" | "precio" | "alicuotaIva" | "controlaStock" | "stockMinimo"> & {
  activo?: boolean;
  stockInicial?: number;
  version?: number;
};

export type TipoMovimiento = "ingreso" | "egreso" | "ajuste";

export interface MovimientoApi {
  id: string;
  productoId: string;
  tipo: TipoMovimiento;
  cantidad: number;
  stockResultante: number;
  motivo: string;
  createdAt: string;
}

export interface MovimientoListadoApi {
  id: string;
  tipo: TipoMovimiento;
  cantidad: number;
  stockResultante: number;
  motivo: string;
  createdAt: string;
  productoId: string;
  productoCodigo: string;
  productoDescripcion: string;
  unidad: string;
  usuarioNombre: string | null;
}

export type MovimientoInput =
  | { tipo: "ingreso" | "egreso"; cantidad: number; motivo: string }
  | { tipo: "ajuste"; stockContado: number; motivo: string };

export interface NotificacionApi {
  id: string;
  tipo: string;
  titulo: string;
  detalle: string;
  link: string | null;
  leida: boolean;
  createdAt: string;
}

export interface PreferenciaNotificacionApi {
  tipo: string;
  nombre: string;
  descripcion: string;
  disponible: boolean;
  enSistema: boolean;
}

export interface ResumenImportacion {
  total: number;
  crear: number;
  actualizar: number;
  omitir: number;
  errores: { fila: number; errores: Record<string, string> }[];
  aplicado: boolean;
}

export interface RemitoListadoApi {
  id: string;
  puntoVenta: number;
  numero: number;
  fecha: string;
  estado: "Emitido" | "Anulado";
  clienteId: string;
  clienteRazonSocial: string;
  items: number;
  createdAt: string;
}

export interface RemitoItemApi {
  id: string;
  productoId: string;
  codigo: string;
  descripcion: string;
  unidad: string;
  cantidad: number;
  orden: number;
}

export interface RemitoApi {
  id: string;
  puntoVenta: number;
  numero: number;
  fecha: string;
  estado: "Emitido" | "Anulado";
  domicilioEntrega: string | null;
  observaciones: string | null;
  motivoAnulacion: string | null;
  anuladoEn: string | null;
  createdAt: string;
  cliente: ClienteApi;
  items: RemitoItemApi[];
}

export interface RemitoInput {
  clienteId: string;
  fecha: string;
  domicilioEntrega: string | null;
  observaciones: string | null;
  items: { productoId: string; cantidad: number }[];
}

export interface ComprobanteApi {
  id: string;
  tipo: string; // "Factura A", "Nota de crédito B"…
  letra: "A" | "B" | "C";
  clase: "factura" | "nota_credito";
  tipoCbte: number;
  puntoVenta: number;
  numero: number | null;
  fecha: string;
  clienteId: string;
  receptor: { razonSocial: string; cuit: string; condicionIva: string; domicilio: string | null };
  concepto: number;
  fechaServicioDesde: string | null;
  fechaServicioHasta: string | null;
  vencimiento: string;
  condicionVenta: "Contado" | "Cuenta corriente";
  neto: number;
  exento: number;
  totalIva: number;
  iva: { alicuota: number; baseImponible: number; importe: number }[];
  total: number;
  estado: "Autorizado" | "Rechazado";
  cae: string | null;
  caeVencimiento: string | null;
  errores: { codigo: number; mensaje: string }[];
  modo: "simulado" | "homologacion" | "produccion";
  observaciones: string | null;
  asociadoId: string | null;
  descontoStock: boolean;
  createdAt: string;
  /** Solo facturas: lo que falta cobrar */
  saldo: number | null;
  estadoCobro: EstadoCobro | null;
}

export interface ComprobanteItemApi {
  id: string;
  productoId: string | null;
  codigo: string | null;
  descripcion: string;
  unidad: string;
  cantidad: number;
  precioUnitario: number;
  bonificacion: number;
  alicuotaIva: number;
  subtotal: number;
  orden: number;
}

export interface ComprobanteDetalleApi extends ComprobanteApi {
  items: ComprobanteItemApi[];
  cobrado: number;
  notasCredito: number;
  qr: string | null;
  asociado: ComprobanteApi | null;
}

export interface PuntoVentaApi {
  id: string;
  numero: number;
  nombre: string;
  activo: boolean;
}

export interface ConfigFacturacionApi {
  modo: "simulado" | "homologacion" | "produccion";
  puntosVenta: PuntoVentaApi[];
  condicionIvaEmisor: string;
  certificadoVence: string | null;
}

export interface ComprobanteInput {
  clase: "factura" | "nota_credito";
  clienteId?: string;
  /** Venta de mostrador a un consumidor final sin identificar (en lugar de clienteId) */
  consumidorFinal?: boolean;
  puntoVenta: number;
  fecha: string;
  condicionVenta: "Contado" | "Cuenta corriente";
  vencimiento?: string;
  observaciones: string | null;
  moverStock: boolean;
  asociadoId?: string;
  cobro?: { medio: string; referencia?: string | null };
  presupuestoId?: string;
  items: { productoId?: string | null; descripcion?: string; cantidad: number; precioUnitario: number; alicuotaIva: number; bonificacion: number }[];
}

export type EstadoCobro = "Pagada" | "Parcial" | "Impaga" | "Vencida";

export const MEDIOS_PAGO = ["Efectivo", "Transferencia", "Cheque", "Tarjeta de débito", "Tarjeta de crédito", "Mercado Pago", "Retención", "Otro"] as const;
export type MedioPago = (typeof MEDIOS_PAGO)[number];

export interface ResumenCobranzasApi {
  totales: { porCobrar: number; vencido: number; aCuenta: number; clientesConDeuda: number; facturasVencidas: number };
  clientes: {
    clienteId: string;
    razonSocial: string;
    cuit: string;
    deuda: number;
    vencido: number;
    aCuenta: number;
    saldo: number;
    tramos: { alDia: number; d1a30: number; d31a60: number; d61a90: number; mas90: number };
    facturasPendientes: number;
    diasMaxAtraso: number;
    ultimoCobro: string | null;
  }[];
}

export interface PendienteApi {
  id: string;
  clienteId: string;
  clienteRazonSocial: string;
  comprobante: string;
  tipoCbte: number;
  puntoVenta: number;
  numero: number;
  fecha: string;
  vencimiento: string;
  total: number;
  cobrado: number;
  notasCredito: number;
  saldo: number;
  diasVencida: number;
  estadoCobro: EstadoCobro;
}

export interface CuentaCorrienteApi {
  saldo: number;
  aCuenta: number;
  movimientos: { fecha: string; tipo: "Factura" | "Nota de crédito" | "Recibo"; descripcion: string; debe: number; haber: number; saldo: number; link: string }[];
}

export interface ReciboListadoApi {
  id: string;
  numero: number;
  fecha: string;
  total: number;
  estado: "Emitido" | "Anulado";
  clienteId: string;
  clienteRazonSocial: string;
}

export interface ReciboApi {
  id: string;
  numero: number;
  fecha: string;
  total: number;
  observaciones: string | null;
  estado: "Emitido" | "Anulado";
  motivoAnulacion: string | null;
  cliente: ClienteApi;
  medios: { id: string; medio: string; importe: number; referencia: string | null }[];
  imputaciones: { comprobanteId: string; comprobante: string; importe: number; fecha: string; total: number }[];
  aplicado: number;
  aCuenta: number;
}

export interface ReciboInput {
  clienteId: string;
  fecha: string;
  medios: { medio: string; importe: number; referencia: string | null }[];
  imputaciones: { comprobanteId: string; importe: number }[];
  observaciones: string | null;
}

export interface InicioApi {
  stock: { bajoMinimo: number; sinStock: number; productos: { id: string; codigo: string; descripcion: string; stock: number; stockMinimo: number; unidad: string }[] };
  remitosHoy: number;
  primerosPasos: { logo: boolean; clientes: boolean; productos: boolean; factura: boolean; equipo: boolean };
  ventas?: { mes: number; cantidad: number; mesAnterior: number; serie: { mes: string; total: number }[] };
  cobranzas?: { porCobrar: number; vencido: number; vencidas: { id: string; comprobante: string; cliente: string; saldo: number; diasVencida: number }[] };
  ultimos?: { id: string; comprobante: string; cliente: string; fecha: string; total: number }[];
}

export type EstadoPresupuesto = "Pendiente" | "Aceptado" | "Rechazado" | "Vencido" | "Facturado";

export interface PresupuestoApi {
  id: string;
  numero: number;
  fecha: string;
  validoHasta: string;
  clienteId: string;
  estado: EstadoPresupuesto;
  letra: "A" | "B" | "C";
  neto: number;
  exento: number;
  totalIva: number;
  iva: { alicuota: number; baseImponible: number; importe: number }[];
  total: number;
  condiciones: string | null;
  observaciones: string | null;
  comprobanteId: string | null;
  version: number;
  createdAt: string;
  clienteRazonSocial?: string;
}

export interface PresupuestoDetalleApi extends PresupuestoApi {
  cliente: ClienteApi;
  items: ComprobanteItemApi[];
  factura: { id: string; tipoCbte: number; puntoVenta: number; numero: number | null } | null;
}

export interface PresupuestoInput {
  clienteId: string;
  fecha: string;
  validoHasta: string;
  condiciones: string | null;
  observaciones: string | null;
  items: ComprobanteInput["items"];
  version?: number;
  oportunidadId?: string | null;
}

export interface Periodo {
  desde: string;
  hasta: string;
}

export interface ReporteVentasApi extends Periodo {
  agrupacion: "dia" | "mes";
  resumen: { facturado: number; notasCredito: number; neto: number; iva: number; total: number; facturas: number; notas: number; ticketPromedio: number };
  serie: { clave: string; etiqueta: string; total: number }[];
  porCliente: { clienteId: string; razonSocial: string; cuit: string; facturas: number; neto: number; total: number }[];
  porProducto: { productoId: string | null; codigo: string | null; descripcion: string; unidad: string; cantidad: number; neto: number }[];
}

export interface RenglonLibroIva {
  id: string;
  fecha: string;
  tipo: string;
  letra: "A" | "B" | "C";
  numero: string;
  razonSocial: string;
  cuit: string;
  condicionIva: string;
  neto: number;
  exento: number;
  iva: Record<string, number>;
  totalIva: number;
  total: number;
  modo: string;
}

export interface LibroIvaApi extends Periodo {
  alicuotas: number[];
  renglones: RenglonLibroIva[];
  totales: { neto: number; exento: number; iva: Record<string, number>; totalIva: number; total: number };
  conPruebas: boolean;
}

export type EstadoEvento = "Pendiente" | "Confirmado" | "Realizado" | "Ausente" | "Cancelado";

export interface RecursoAgendaApi {
  id: string;
  nombre: string;
  color: string;
  usuarioId: string | null;
  activo: boolean;
  version: number;
}

export interface ConfigAgendaApi {
  nombreEvento: string;
  nombreRecurso: string;
  horaInicio: string;
  horaFin: string;
  tiposEvento: string[];
  version: number;
  recursos: RecursoAgendaApi[];
  colores: string[];
}

export interface ConfigAgendaInput {
  nombreEvento: string;
  nombreRecurso: string;
  horaInicio: string;
  horaFin: string;
  tiposEvento: string[];
  version?: number;
}

export interface EventoApi {
  id: string;
  titulo: string;
  tipo: string | null;
  recursoId: string;
  clienteId: string | null;
  clienteRazonSocial: string | null;
  /** CoreDental: el paciente del turno */
  pacienteId: string | null;
  pacienteNombre: string | null;
  pacienteTelefono: string | null;
  pacienteDatosPendientes: boolean;
  fecha: string;
  inicio: string;
  fin: string;
  estado: EstadoEvento;
  lugar: string | null;
  notas: string | null;
  version: number;
}

export interface EventoInput {
  titulo: string;
  tipo: string | null;
  recursoId: string;
  clienteId: string | null;
  pacienteId?: string | null;
  fecha: string;
  inicio: string;
  fin: string;
  estado: EstadoEvento;
  lugar: string | null;
  notas: string | null;
  version?: number;
  permitirSuperposicion?: boolean;
}

export type EtapaOportunidad = "Nuevo" | "Contactado" | "Propuesta" | "Negociación" | "Ganada" | "Perdida";

export interface OportunidadApi {
  id: string;
  titulo: string;
  clienteId: string | null;
  clienteRazonSocial: string | null;
  prospecto: string | null;
  contacto: string | null;
  etapa: EtapaOportunidad;
  monto: number;
  responsableId: string | null;
  responsableNombre: string | null;
  cierreEstimado: string | null;
  fechaCierre: string | null;
  motivoPerdida: string | null;
  presupuesto: { id: string; numero: number; estado: string } | null;
  notas: string | null;
  version: number;
  updatedAt: string;
}

export interface OportunidadInput {
  titulo: string;
  clienteId: string | null;
  prospecto: string | null;
  contacto: string | null;
  etapa: EtapaOportunidad;
  monto: number;
  responsableId: string | null;
  cierreEstimado: string | null;
  motivoPerdida: string | null;
  notas: string | null;
  version?: number;
}

export type SeguridadSmtp = "STARTTLS" | "SSL/TLS" | "Ninguna";

export interface ConfigEmailApi {
  modo: "plataforma" | "smtp";
  host: string | null;
  puerto: number | null;
  seguridad: SeguridadSmtp | null;
  usuario: string | null;
  tienePassword: boolean;
  remitenteNombre: string | null;
  responderA: string | null;
  verificado: boolean;
  ultimoError: string | null;
  enviarFacturaAlEmitir: boolean;
  recordarFacturas: boolean;
  correoPlataforma: boolean;
  version: number;
}

export interface ConfigEmailInput {
  modo: "plataforma" | "smtp";
  host?: string | null;
  puerto?: number | null;
  seguridad?: SeguridadSmtp | null;
  usuario?: string | null;
  password?: string | null;
  remitenteNombre?: string | null;
  responderA?: string | null;
  enviarFacturaAlEmitir: boolean;
  recordarFacturas: boolean;
  version?: number;
}

export interface EmailEnviadoApi {
  id: string;
  para: string;
  asunto: string;
  estado: "Enviado" | "Error" | "Simulado";
  error: string | null;
  tipo: string;
  refId: string | null;
  automatico: boolean;
  createdAt: string;
}

export interface ResultadoEnvio {
  estado: EmailEnviadoApi["estado"];
  error: string | null;
  para?: string;
}

export type TipoDocumento = "comprobante" | "presupuesto";

export interface CompartirApi {
  titulo: string;
  url: string;
  vistas: number;
  email: string | null;
  whatsapp: { telefono: string | null; texto: string; url: string };
  enviados: EmailEnviadoApi[];
}

export interface DocumentoPublicoApi {
  tipo: TipoDocumento;
  empresa: Pick<EmpresaApi, "id" | "razonSocial" | "nombreFantasia" | "cuit" | "condicionIva" | "domicilio" | "localidad" | "telefono" | "email" | "logoActualizado">;
  documento: ComprobanteDetalleApi | PresupuestoDetalleApi;
}

export type ModoArca = "simulado" | "homologacion" | "produccion";

export interface ArcaEstadoApi {
  modo: ModoArca;
  certificado: { alias: string | null; cuit: string | null; desde: string; vence: string; emisor: string; deHomologacion: boolean } | null;
  csrPendiente: boolean;
  aliasSugerido: string;
  ultimaConexion: string | null;
  ultimoError: string | null;
}

export interface NotaClienteApi {
  id: string;
  texto: string;
  fijada: boolean;
  usuarioId: string | null;
  autor: string | null;
  createdAt: string;
  updatedAt: string;
}

export const FRECUENCIAS_USO = ["por semana", "cada 15 días", "por mes", "por bimestre", "por trimestre", "por año"] as const;
export type FrecuenciaUso = (typeof FRECUENCIAS_USO)[number];

export interface ProductoClienteApi {
  id: string;
  productoId: string;
  cantidad: number | null;
  frecuencia: FrecuenciaUso | null;
  nota: string | null;
  producto: { id: string; codigo: string; descripcion: string; unidad: string; precio: number; alicuotaIva: number; controlaStock: boolean; stock: number; stockMinimo: number; activo: boolean };
}

export type PlanId = "basico" | "profesional" | "empresa";
export type EstadoSuscripcion = "Prueba" | "Activa" | "Gracia" | "SoloLectura";

export interface PagoSuscripcionApi {
  id: string;
  referencia: string;
  plan: PlanId;
  periodo: "mensual" | "anual";
  usuariosAdicionales: number;
  importeUsd: number;
  tipoCambio: number;
  importeArs: number;
  estado: "Pendiente" | "Aprobado" | "Rechazado";
  proveedor: "mercadopago" | "simulado" | "manual";
  tipo?: "periodo" | "cambio";
  desde: string | null;
  hasta: string | null;
  createdAt: string;
}

export interface SuscripcionApi {
  plan: PlanId;
  planNombre: string;
  estado: EstadoSuscripcion;
  vence: string;
  diasRestantes: number;
  graciaHasta: string;
  avisar: boolean;
  diasGracia: number;
  // Solo administradores
  periodo?: "mensual" | "anual";
  usuariosAdicionales?: number;
  pruebaHasta?: string;
  pagoHasta?: string | null;
  version?: number;
  limites?: { usuarios: number; puntosVenta: number | null };
  usos?: { usuarios: number; puntosVenta: number };
  proveedor?: "mercadopago" | "simulado" | "deshabilitado";
  pagos?: PagoSuscripcionApi[];
  bajaSolicitadaEn?: string | null;
  bajaCodigo?: string | null;
  /** Cambio programado para la próxima renovación (bajada de plan o de usuarios) */
  planProximo?: PlanId | null;
  adicionalesProximos?: number | null;
}

/** Resultado de cambiar el plan: se aplicó ya, hay que pagar la diferencia, o queda para la renovación */
export type CambioPlanApi =
  | { aplicado: "inmediato"; plan: PlanId; usuariosAdicionales: number }
  | { aplicado: "proximo"; desde: string; plan: PlanId; planProximo: PlanId; adicionalesProximos: number }
  | { aplicado: "pagar"; dias: number; referencia: string; url: string; importeArs: number; importeUsd: number; titulo: string };

export interface PlanesApi {
  planes: { id: PlanId; nombre: string; precioUsd: number; usuarios: number; puntosVenta: number | null; bajada: string }[];
  precioUsuarioAdicionalUsd: number;
  mesesCobradosAnual: number;
  dolar: number | null;
}

export interface LegalEstadoApi {
  version: string;
  aceptada: boolean;
  aceptadaEn: string | null;
  versionAnterior: string | null;
}

export interface SolicitudLegalInput {
  tipo: "baja" | "arrepentimiento";
  nombre: string;
  email: string;
  cuit?: string | null;
  motivo?: string | null;
}

export interface SolicitudLegalApi {
  id: string;
  tipo: "baja" | "arrepentimiento";
  codigo: string;
  empresaId: string | null;
  empresa: string | null;
  nombre: string;
  email: string;
  cuit: string | null;
  motivo: string | null;
  estado: "Pendiente" | "Resuelta";
  nota: string | null;
  createdAt: string;
  resueltaEn: string | null;
}
