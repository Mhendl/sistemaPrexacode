import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ApiError } from "@/api/client";
import type { PagoSuscripcionApi, PlanId, SolicitudLegalApi } from "@/api/types";
import type { MensajeTicket, TicketApi } from "@/modules/soporte/api";

/**
 * Cliente del panel de administración de la plataforma.
 * Usa su propio token, guardado aparte del de las empresas: una sesión no sirve para la otra.
 */
const TOKEN_KEY = "prexacode-admin-token";

export function getAdminToken(): string | null {
  try {
    return localStorage.getItem(TOKEN_KEY);
  } catch {
    return null;
  }
}

export function setAdminToken(token: string | null) {
  try {
    if (token) localStorage.setItem(TOKEN_KEY, token);
    else localStorage.removeItem(TOKEN_KEY);
  } catch {
    /* sin almacenamiento */
  }
}

export async function apiAdmin<T>(path: string, init: { method?: string; body?: unknown } = {}): Promise<T> {
  const headers: Record<string, string> = {};
  const token = getAdminToken();
  if (token) headers.authorization = `Bearer ${token}`;
  if (init.body !== undefined) headers["content-type"] = "application/json";
  let res: Response;
  try {
    res = await fetch(`/api${path}`, { method: init.method ?? "GET", headers, body: init.body !== undefined ? JSON.stringify(init.body) : undefined });
  } catch {
    throw new ApiError(0, "No se pudo conectar con el servidor. Revisá tu conexión.");
  }
  if (res.status === 204) return undefined as T;
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    // Sesión del panel vencida: a la pantalla de entrada
    if (res.status === 401 && token && path !== "/admin/login") {
      setAdminToken(null);
      window.location.assign("/admin/login");
    }
    throw new ApiError(res.status, data.error ?? "Ocurrió un error inesperado", data.details, data.code);
  }
  return data as T;
}

/* ---------- Tipos ---------- */

export type EstadoSus = "Prueba" | "Activa" | "Gracia" | "SoloLectura";

export interface AdminApi {
  id: string;
  email: string;
  nombre: string;
  activo: boolean;
  ultimoAcceso: string | null;
  createdAt: string;
}

export interface ResumenAdmin {
  empresas: number;
  porEstado: Record<EstadoSus, number>;
  porPlan: Record<string, number>;
  suspendidas: number;
  bajasPedidas: number;
  altas30Dias: number;
  vencenEn7Dias: number;
  mrrUsd: number;
  cobrado30Dias: { ars: number; pagos: number };
  cobradoMes: number;
  cobradoTotal: number;
  solicitudesPendientes: number;
  ticketsAbiertos: number;
  ingresosPorMes: { clave: string; etiqueta: string; ars: number }[];
  altasPorMes: { clave: string; etiqueta: string; altas: number }[];
  ultimosPagos: { id: string; empresaId: string; empresa: string; importeArs: number; tipo: string; plan: string; periodo: string; proveedor: string; aprobadoAt: string }[];
  proximosVencimientos: { empresaId: string; empresa: string; plan: string; estado: EstadoSus; vence: string; diasRestantes: number }[];
}

export interface EmpresaAdmin {
  id: string;
  razonSocial: string;
  cuit: string;
  alta: string;
  plan: string;
  planNombre: string;
  /** gestion (Prexacode) o dental (CoreDental) */
  producto: "gestion" | "dental";
  planProximo: string | null;
  periodo: string;
  usuariosAdicionales: number;
  estado: EstadoSus;
  vence: string;
  diasRestantes: number;
  bajaSolicitada: boolean;
  suspendida: boolean;
  usuariosActivos: number;
  limiteUsuarios: number;
  ultimoAcceso: string | null;
  /** Veces que un dispositivo siguió usando una sesión ya abierta en otro: posible usuario compartido */
  sesionesPisadas: number;
  comprobantes: number;
  facturadoMes: number;
  clientes: number;
  mensualUsd: number;
  pagadoTotal: number;
  pagos: number;
  admin: { email: string; nombre: string } | null;
}

export interface EmpresaAdminDetalle {
  empresa: { id: string; razonSocial: string; nombreFantasia: string | null; cuit: string; condicionIva: string; email: string | null; telefono: string | null; localidad: string | null; createdAt: string; suspendidaEn: string | null; motivoSuspension: string | null };
  suscripcion: {
    plan: PlanId;
    planNombre: string;
  /** gestion (Prexacode) o dental (CoreDental) */
  producto: "gestion" | "dental";
    usuariosAdicionales: number;
    periodo: string;
    pruebaHasta: string;
    pagoHasta: string | null;
    planProximo: string | null;
    adicionalesProximos: number | null;
    bajaCodigo: string | null;
    estado: EstadoSus;
    vence: string;
    diasRestantes: number;
    graciaHasta: string;
    limites: { usuarios: number; puntosVenta: number | null };
  };
  uso: { usuariosActivos: number; clientes: number; productos: number; actividad: { clave: string; etiqueta: string; comprobantes: number; facturado: number }[] };
  pagadoTotal: number;
  usuarios: { id: string; nombre: string; email: string; rol: string; estado: string; ultimoAcceso: string | null; sesionesPisadas: number; createdAt: string }[];
  pagos: (PagoSuscripcionApi & { tipo: string; aprobadoAt: string | null })[];
  aceptaciones: { id: string; version: string; ip: string | null; userAgent: string | null; aceptadoEn: string }[];
  auditoria: AuditoriaAdmin[];
  solicitudes: SolicitudLegalApi[];
  tickets: TicketApi[];
}

export interface AuditoriaAdmin {
  id: string;
  adminEmail: string;
  empresaId: string | null;
  empresa?: string | null;
  accion: string;
  detalle: Record<string, unknown>;
  createdAt: string;
}

export type TicketAdmin = TicketApi & { empresa: string; usuario: string | null; email: string | null };
export type TicketAdminDetalle = Omit<TicketAdmin, "mensajes"> & { mensajes: MensajeTicket[] };

export type PagoAdmin = PagoSuscripcionApi & { tipo: string; empresa: string; empresaId: string; aprobadoAt: string | null };

/* ---------- Hooks ---------- */

export const useAdminYo = (habilitado: boolean) => useQuery({ queryKey: ["admin", "yo"], queryFn: () => apiAdmin<AdminApi>("/admin/me"), enabled: habilitado, retry: false });
export const useResumenAdmin = () => useQuery({ queryKey: ["admin", "resumen"], queryFn: () => apiAdmin<ResumenAdmin>("/plataforma/resumen") });
export const useEmpresasAdmin = () => useQuery({ queryKey: ["admin", "empresas"], queryFn: () => apiAdmin<EmpresaAdmin[]>("/plataforma/empresas") });
export const useEmpresaAdmin = (id: string | undefined) => useQuery({ queryKey: ["admin", "empresas", id], queryFn: () => apiAdmin<EmpresaAdminDetalle>(`/plataforma/empresas/${id}`), enabled: !!id });
export const usePagosAdmin = () => useQuery({ queryKey: ["admin", "pagos"], queryFn: () => apiAdmin<PagoAdmin[]>("/plataforma/pagos") });
export const useSolicitudesAdmin = () => useQuery({ queryKey: ["admin", "solicitudes"], queryFn: () => apiAdmin<SolicitudLegalApi[]>("/plataforma/solicitudes") });
export const useAuditoriaAdmin = () => useQuery({ queryKey: ["admin", "auditoria"], queryFn: () => apiAdmin<AuditoriaAdmin[]>("/plataforma/auditoria") });
export const useTicketsAdmin = () => useQuery({ queryKey: ["admin", "tickets"], queryFn: () => apiAdmin<TicketAdmin[]>("/plataforma/tickets") });
export const useTicketAdmin = (id: string | undefined) => useQuery({ queryKey: ["admin", "tickets", id], queryFn: () => apiAdmin<TicketAdminDetalle>(`/plataforma/tickets/${id}`), enabled: !!id });
export const useAdministradores = () => useQuery({ queryKey: ["admin", "administradores"], queryFn: () => apiAdmin<AdminApi[]>("/admin/administradores") });

/** Cualquier acción del panel (POST/PUT/PATCH): al terminar se refresca todo lo del panel */
export function useAccionAdmin() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ url, metodo = "POST", body = {} }: { url: string; metodo?: "POST" | "PUT" | "PATCH"; body?: object }) => apiAdmin<unknown>(url, { method: metodo, body }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["admin"] }),
  });
}
