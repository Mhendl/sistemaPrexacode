import type { LucideIcon } from "lucide-react";

/** Tipo de rol: los pre armados, o uno creado por la empresa */
export type Role = "admin" | "ventas" | "operaciones" | "personalizado";

/** Lo que puede hacer el usuario en sesión (el administrador, todo) */
export interface Acceso {
  esAdmin: boolean;
  permisos: string[];
}

export interface NavItem {
  path: string;
  label: string;
  icon: LucideIcon;
  /** Se ve con alguno de estos permisos (vacío: todos) */
  permisos: string[];
  description: string;
  /** Solo para módulos todavía no construidos */
  features?: string[];
}

export interface NavSection {
  title: string;
  items: NavItem[];
}

export type Severity = "info" | "warning" | "danger" | "success";

export interface Notificacion {
  id: string;
  titulo: string;
  detalle: string;
  hace: string;
  severidad: Severity;
  leida: boolean;
}

export type CondicionIva = "Responsable Inscripto" | "Monotributista" | "Consumidor Final" | "Exento";

export interface Cliente {
  id: string;
  razonSocial: string;
  cuit: string;
  condicionIva: CondicionIva;
  contacto: string;
  email: string;
  telefono: string;
  localidad: string;
  rubro: string;
  estado: "Activo" | "Inactivo";
  alta: string;
}

export interface Producto {
  id: string;
  codigo: string;
  descripcion: string;
  categoria: string;
  unidad: string;
  stock: number;
  stockMinimo: number;
  precio: number;
  alicuotaIva: 21 | 10.5 | 0;
}

export type TipoComprobante = "Factura A" | "Factura B" | "Factura C" | "Nota de crédito A" | "Nota de crédito B";
export type EstadoArca = "Autorizado" | "Pendiente" | "Rechazado";
export type EstadoCobro = "Pagada" | "Impaga" | "Vencida" | "Anulada";

export interface ItemComprobante {
  productoId: string;
  descripcion: string;
  cantidad: number;
  precioUnitario: number;
  alicuotaIva: 21 | 10.5 | 0;
}

export interface Comprobante {
  id: string;
  tipo: TipoComprobante;
  puntoVenta: number;
  numero: number;
  fecha: string;
  vencimiento: string;
  clienteId: string;
  items: ItemComprobante[];
  estadoArca: EstadoArca;
  cobro: EstadoCobro;
  cae?: string;
  caeVencimiento?: string;
}

export interface Recurso {
  id: string;
  nombre: string;
  /** Color identificatorio en la agenda (variable CSS o hex) */
  color: string;
}

export interface EventoAgenda {
  id: string;
  titulo: string;
  recursoId: string;
  clienteId?: string;
  tipo: string;
  /** Día relativo a la semana actual: 0 = lunes */
  dia: number;
  inicio: string; // "09:30"
  fin: string;
  estado: "Confirmado" | "Pendiente" | "Cancelado" | "Realizado";
}

export type EtapaOportunidad = "Nuevo" | "Contactado" | "Propuesta" | "Negociación" | "Ganada";

export interface Oportunidad {
  id: string;
  titulo: string;
  clienteId: string;
  etapa: EtapaOportunidad;
  monto: number;
  responsable: string;
  cierreEstimado: string;
}

export interface Usuario {
  id: string;
  nombre: string;
  email: string;
  rol: Role;
  estado: "Activo" | "Invitado" | "Suspendido";
  ultimoAcceso?: string;
  iniciales: string;
}
