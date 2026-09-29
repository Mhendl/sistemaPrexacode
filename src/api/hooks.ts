import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "./client";
import type {
  ClienteApi,
  ClienteInput,
  ComprobanteApi,
  ComprobanteDetalleApi,
  ComprobanteInput,
  ConfigFacturacionApi,
  CuentaCorrienteApi,
  PendienteApi,
  PresupuestoApi,
  PresupuestoDetalleApi,
  PresupuestoInput,
  LibroIvaApi,
  Periodo,
  ReporteVentasApi,
  ReciboApi,
  ReciboInput,
  ReciboListadoApi,
  ResumenCobranzasApi,
  PuntoVentaApi,
  EmpresaApi,
  EmpresaInput,
  InicioApi,
  MovimientoApi,
  MovimientoInput,
  MovimientoListadoApi,
  NotificacionApi,
  PreferenciaNotificacionApi,
  ResumenImportacion,
  ProductoApi,
  ProductoInput,
  RemitoApi,
  RemitoInput,
  RemitoListadoApi,
  UsuarioApi,
  ConfigAgendaApi,
  ConfigAgendaInput,
  EventoApi,
  EventoInput,
  RecursoAgendaApi,
  EtapaOportunidad,
  OportunidadApi,
  OportunidadInput,
  CompartirApi,
  ConfigEmailApi,
  ConfigEmailInput,
  DocumentoPublicoApi,
  EmailEnviadoApi,
  ResultadoEnvio,
  TipoDocumento,
  ArcaEstadoApi,
  ModoArca,
  NotaClienteApi,
  ProductoClienteApi,
  FrecuenciaUso,
  PagoSuscripcionApi,
  PlanesApi,
  PlanId,
  SuscripcionApi,
  RolApi,
  SeccionPermisosApi,
  CambioPlanApi,
  LegalEstadoApi,
  SolicitudLegalInput,
} from "./types";

/* ---------- Clientes ---------- */

export const useClientes = (enabled = true) =>
  useQuery({ queryKey: ["clientes"], queryFn: () => api<ClienteApi[]>("/clientes"), enabled });

export const useCliente = (id: string | undefined) =>
  useQuery({ queryKey: ["clientes", id], queryFn: () => api<ClienteApi>(`/clientes/${id}`), enabled: !!id });

export function useGuardarCliente() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, datos }: { id?: string; datos: ClienteInput }) =>
      id ? api<ClienteApi>(`/clientes/${id}`, { method: "PUT", body: datos }) : api<ClienteApi>("/clientes", { method: "POST", body: datos }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["clientes"] }),
  });
}

export function useEliminarCliente() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api<void>(`/clientes/${id}`, { method: "DELETE" }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["clientes"] }),
  });
}

/* ---------- Usuarios ---------- */

export const useUsuarios = () => useQuery({ queryKey: ["usuarios"], queryFn: () => api<UsuarioApi[]>("/usuarios") });

/* ---------- Roles y permisos ---------- */

export const useRoles = (enabled = true) => useQuery({ queryKey: ["roles"], queryFn: () => api<RolApi[]>("/roles"), enabled });
export const useCatalogoPermisos = () => useQuery({ queryKey: ["roles", "permisos"], queryFn: () => api<SeccionPermisosApi[]>("/roles/permisos"), staleTime: Infinity });

export function useGuardarRol() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, ...d }: { id?: string; nombre: string; descripcion: string | null; permisos: string[]; version?: number }) =>
      id ? api<RolApi>(`/roles/${id}`, { method: "PUT", body: d }) : api<RolApi>("/roles", { method: "POST", body: d }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["roles"] }),
  });
}

export function useBorrarRol() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api<null>(`/roles/${id}`, { method: "DELETE" }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["roles"] }),
  });
}

export function useCrearUsuario() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (datos: { nombre: string; email: string; rolId: string; password: string }) => api<UsuarioApi>("/usuarios", { method: "POST", body: datos }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["usuarios"] });
      qc.invalidateQueries({ queryKey: ["suscripcion"] });
    },
  });
}

export function useEditarUsuario() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, ...datos }: { id: string; rolId?: string; estado?: string; nombre?: string }) => api<UsuarioApi>(`/usuarios/${id}`, { method: "PATCH", body: datos }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["usuarios"] });
      qc.invalidateQueries({ queryKey: ["suscripcion"] });
    },
  });
}

/* ---------- Productos y stock ---------- */

export const useProductos = () => useQuery({ queryKey: ["productos"], queryFn: () => api<ProductoApi[]>("/productos") });

export const useProducto = (id: string | undefined) =>
  useQuery({ queryKey: ["productos", id], queryFn: () => api<ProductoApi>(`/productos/${id}`), enabled: !!id });

export const useCategorias = () => useQuery({ queryKey: ["productos", "categorias"], queryFn: () => api<string[]>("/productos/categorias") });

export function useGuardarProducto() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, datos }: { id?: string; datos: ProductoInput }) =>
      id ? api<ProductoApi>(`/productos/${id}`, { method: "PUT", body: datos }) : api<ProductoApi>("/productos", { method: "POST", body: datos }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["productos"] });
      qc.invalidateQueries({ queryKey: ["movimientos"] });
      qc.invalidateQueries({ queryKey: ["notificaciones"] }); // el cambio puede haber generado un aviso
    },
  });
}

export function useEliminarProducto() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api<void>(`/productos/${id}`, { method: "DELETE" }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["productos"] }),
  });
}

export const useMovimientosProducto = (id: string | undefined) =>
  useQuery({ queryKey: ["movimientos", "producto", id], queryFn: () => api<MovimientoApi[]>(`/productos/${id}/movimientos`), enabled: !!id });

export const useMovimientos = (enabled = true) =>
  useQuery({ queryKey: ["movimientos", "todos"], queryFn: () => api<MovimientoListadoApi[]>("/movimientos"), enabled });

export function useRegistrarMovimiento() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ productoId, datos }: { productoId: string; datos: MovimientoInput }) =>
      api<{ movimiento: MovimientoApi; producto: ProductoApi }>(`/productos/${productoId}/movimientos`, { method: "POST", body: datos }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["productos"] });
      qc.invalidateQueries({ queryKey: ["movimientos"] });
      qc.invalidateQueries({ queryKey: ["notificaciones"] }); // el cambio puede haber generado un aviso
    },
  });
}

/* ---------- Empresa ---------- */

export const useGuardarEmpresa = () =>
  useMutation({ mutationFn: (datos: EmpresaInput) => api<EmpresaApi>("/empresa", { method: "PUT", body: datos }) });

export const useSubirLogo = () =>
  useMutation({ mutationFn: (datos: string) => api<EmpresaApi>("/empresa/logo", { method: "PUT", body: { datos } }) });

export const useQuitarLogo = () => useMutation({ mutationFn: () => api<EmpresaApi>("/empresa/logo", { method: "DELETE" }) });

/* ---------- Notificaciones ---------- */

export const useNotificaciones = () =>
  useQuery({
    queryKey: ["notificaciones"],
    queryFn: () => api<{ items: NotificacionApi[]; noLeidas: number }>("/notificaciones"),
    refetchInterval: 30_000, // revisa si hay avisos nuevos cada 30 segundos
  });

export function useMarcarLeida() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string | "todas") => api<void>(id === "todas" ? "/notificaciones/leer-todas" : `/notificaciones/${id}/leer`, { method: "POST" }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["notificaciones"] }),
  });
}

export const usePreferenciasNotificacion = () =>
  useQuery({ queryKey: ["notificaciones", "preferencias"], queryFn: () => api<PreferenciaNotificacionApi[]>("/notificaciones/preferencias") });

export function useGuardarPreferencias() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (prefs: { tipo: string; enSistema: boolean }[]) => api<void>("/notificaciones/preferencias", { method: "PUT", body: prefs }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["notificaciones", "preferencias"] }),
  });
}

/* ---------- Importación ---------- */

export function useImportar() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ entidad, filas, siExiste, simular }: { entidad: "clientes" | "productos"; filas: Record<string, unknown>[]; siExiste: "actualizar" | "omitir"; simular: boolean }) =>
      api<ResumenImportacion>(`/importar/${entidad}`, { method: "POST", body: { filas, siExiste, simular } }),
    onSuccess: (r, v) => {
      if (!r.aplicado) return;
      qc.invalidateQueries({ queryKey: [v.entidad] });
      qc.invalidateQueries({ queryKey: ["movimientos"] });
    },
  });
}

/* ---------- Remitos ---------- */

export const useRemitos = (clienteId?: string, enabled = true) =>
  useQuery({
    queryKey: ["remitos", { clienteId }],
    queryFn: () => api<RemitoListadoApi[]>(`/remitos${clienteId ? `?clienteId=${clienteId}` : ""}`),
    enabled,
  });

export const useRemito = (id: string | undefined) => useQuery({ queryKey: ["remitos", id], queryFn: () => api<RemitoApi>(`/remitos/${id}`), enabled: !!id });

/** Emitir o anular cambia stock, historial y puede generar avisos */
function invalidarStock(qc: ReturnType<typeof useQueryClient>) {
  qc.invalidateQueries({ queryKey: ["remitos"] });
  qc.invalidateQueries({ queryKey: ["productos"] });
  qc.invalidateQueries({ queryKey: ["movimientos"] });
  qc.invalidateQueries({ queryKey: ["notificaciones"] });
}

export function useEmitirRemito() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (datos: RemitoInput) => api<{ id: string; numero: number; puntoVenta: number }>("/remitos", { method: "POST", body: datos }),
    onSuccess: () => invalidarStock(qc),
  });
}

export function useAnularRemito() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, motivo }: { id: string; motivo: string }) => api<RemitoApi>(`/remitos/${id}/anular`, { method: "POST", body: { motivo } }),
    onSuccess: () => invalidarStock(qc),
  });
}

/* ---------- Facturación ---------- */

export const useConfigFacturacion = () => useQuery({ queryKey: ["facturacion", "config"], queryFn: () => api<ConfigFacturacionApi>("/comprobantes/config") });

export const useComprobantes = (clienteId?: string, enabled = true) =>
  useQuery({
    queryKey: ["comprobantes", { clienteId }],
    queryFn: () => api<ComprobanteApi[]>(`/comprobantes${clienteId ? `?clienteId=${clienteId}` : ""}`),
    enabled,
  });

export const useComprobante = (id: string | undefined) =>
  useQuery({ queryKey: ["comprobantes", id], queryFn: () => api<ComprobanteDetalleApi>(`/comprobantes/${id}`), enabled: !!id });

export function useEmitirComprobante() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (datos: ComprobanteInput) => api<ComprobanteApi>("/comprobantes", { method: "POST", body: datos }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["cobranzas"] });
      qc.invalidateQueries({ queryKey: ["recibos"] });
      qc.invalidateQueries({ queryKey: ["presupuestos"] });
      qc.invalidateQueries({ queryKey: ["oportunidades"] });
      qc.invalidateQueries({ queryKey: ["comprobantes"] });
      qc.invalidateQueries({ queryKey: ["productos"] });
      qc.invalidateQueries({ queryKey: ["movimientos"] });
      qc.invalidateQueries({ queryKey: ["notificaciones"] });
    },
  });
}

export function useCrearPuntoVenta() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (datos: { numero: number; nombre: string }) => api<PuntoVentaApi>("/comprobantes/puntos-venta", { method: "POST", body: datos }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["facturacion"] });
      qc.invalidateQueries({ queryKey: ["suscripcion"] });
    },
  });
}

export function useEditarPuntoVenta() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, ...datos }: { id: string; activo?: boolean; nombre?: string }) => api<PuntoVentaApi>(`/comprobantes/puntos-venta/${id}`, { method: "PATCH", body: datos }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["facturacion"] });
      qc.invalidateQueries({ queryKey: ["suscripcion"] });
    },
  });
}

/* ---------- Cobranzas ---------- */

export const useResumenCobranzas = (enabled = true) =>
  useQuery({ queryKey: ["cobranzas", "resumen"], queryFn: () => api<ResumenCobranzasApi>("/cobranzas/resumen"), enabled });

export const usePendientes = (params: { clienteId?: string; soloVencidas?: boolean }, enabled = true) =>
  useQuery({
    queryKey: ["cobranzas", "pendientes", params],
    queryFn: () => {
      const q = new URLSearchParams();
      if (params.clienteId) q.set("clienteId", params.clienteId);
      if (params.soloVencidas) q.set("soloVencidas", "true");
      return api<PendienteApi[]>(`/cobranzas/pendientes?${q}`);
    },
    enabled,
  });

export const useCuentaCorriente = (clienteId: string | undefined, enabled = true) =>
  useQuery({ queryKey: ["cobranzas", "cuenta", clienteId], queryFn: () => api<CuentaCorrienteApi>(`/cobranzas/cuenta-corriente/${clienteId}`), enabled: !!clienteId && enabled });

export const useRecibos = (clienteId?: string) =>
  useQuery({ queryKey: ["recibos", { clienteId }], queryFn: () => api<ReciboListadoApi[]>(`/recibos${clienteId ? `?clienteId=${clienteId}` : ""}`) });

export const useRecibo = (id: string | undefined) => useQuery({ queryKey: ["recibos", id], queryFn: () => api<ReciboApi>(`/recibos/${id}`), enabled: !!id });

function invalidarCobranzas(qc: ReturnType<typeof useQueryClient>) {
  qc.invalidateQueries({ queryKey: ["recibos"] });
  qc.invalidateQueries({ queryKey: ["cobranzas"] });
  qc.invalidateQueries({ queryKey: ["comprobantes"] });
  qc.invalidateQueries({ queryKey: ["notificaciones"] });
}

export function useCrearRecibo() {
  const qc = useQueryClient();
  return useMutation({ mutationFn: (d: ReciboInput) => api<{ id: string; numero: number }>("/recibos", { method: "POST", body: d }), onSuccess: () => invalidarCobranzas(qc) });
}

export function useAnularRecibo() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, motivo }: { id: string; motivo: string }) => api<ReciboApi>(`/recibos/${id}/anular`, { method: "POST", body: { motivo } }),
    onSuccess: () => invalidarCobranzas(qc),
  });
}

/* ---------- Inicio ---------- */

// Siempre fresco al entrar: resume lo que pasó en todos los módulos
export const useInicio = () => useQuery({ queryKey: ["inicio"], queryFn: () => api<InicioApi>("/inicio"), staleTime: 0 });

/* ---------- Presupuestos ---------- */

export const usePresupuestos = (clienteId?: string, enabled = true) =>
  useQuery({ queryKey: ["presupuestos", { clienteId }], queryFn: () => api<PresupuestoApi[]>(`/presupuestos${clienteId ? `?clienteId=${clienteId}` : ""}`), enabled });

export const usePresupuesto = (id: string | undefined) =>
  useQuery({ queryKey: ["presupuestos", id], queryFn: () => api<PresupuestoDetalleApi>(`/presupuestos/${id}`), enabled: !!id });

export function useGuardarPresupuesto() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, datos }: { id?: string; datos: PresupuestoInput }) =>
      id ? api<PresupuestoApi>(`/presupuestos/${id}`, { method: "PUT", body: datos }) : api<PresupuestoApi>("/presupuestos", { method: "POST", body: datos }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["presupuestos"] });
      qc.invalidateQueries({ queryKey: ["oportunidades"] });
    },
  });
}

export function useAccionPresupuesto() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, accion, estado }: { id: string; accion: "estado" | "duplicar" | "eliminar"; estado?: string }): Promise<PresupuestoApi | null> => {
      if (accion === "eliminar") {
        await api<void>(`/presupuestos/${id}`, { method: "DELETE" });
        return null;
      }
      return api<PresupuestoApi>(`/presupuestos/${id}/${accion}`, { method: "POST", body: accion === "estado" ? { estado } : {} });
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["presupuestos"] }),
  });
}

const qsPeriodo = (p: Periodo) => `desde=${p.desde}&hasta=${p.hasta}`;

export const useReporteVentas = (p: Periodo) =>
  useQuery({ queryKey: ["comprobantes", "reporte-ventas", p], queryFn: () => api<ReporteVentasApi>(`/reportes/ventas?${qsPeriodo(p)}`), enabled: p.desde <= p.hasta });

export const useLibroIva = (p: Periodo, enabled = true) =>
  useQuery({ queryKey: ["comprobantes", "libro-iva", p], queryFn: () => api<LibroIvaApi>(`/reportes/libro-iva?${qsPeriodo(p)}`), enabled: enabled && p.desde <= p.hasta });

/* ---------- Agenda ---------- */

export const useConfigAgenda = () => useQuery({ queryKey: ["agenda", "config"], queryFn: () => api<ConfigAgendaApi>("/agenda/config"), staleTime: 5 * 60_000 });

export function useGuardarConfigAgenda() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (datos: ConfigAgendaInput) => api<ConfigAgendaApi>("/agenda/config", { method: "PUT", body: datos }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["agenda", "config"] }),
  });
}

export function useGuardarRecurso() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, datos }: { id?: string; datos: Pick<RecursoAgendaApi, "nombre" | "color" | "usuarioId"> & { activo?: boolean; version?: number } }) =>
      id ? api<RecursoAgendaApi>(`/agenda/recursos/${id}`, { method: "PUT", body: datos }) : api<RecursoAgendaApi>("/agenda/recursos", { method: "POST", body: datos }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["agenda", "config"] }),
  });
}

export function useEliminarRecurso() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api<void>(`/agenda/recursos/${id}`, { method: "DELETE" }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["agenda", "config"] }),
  });
}

export const useEventos = (desde: string, hasta: string, enabled = true) =>
  useQuery({ queryKey: ["agenda", "eventos", { desde, hasta }], queryFn: () => api<EventoApi[]>(`/agenda/eventos?desde=${desde}&hasta=${hasta}`), enabled });

export const useEventosCliente = (clienteId: string | undefined) =>
  useQuery({ queryKey: ["agenda", "eventos", { clienteId }], queryFn: () => api<EventoApi[]>(`/agenda/eventos?clienteId=${clienteId}`), enabled: !!clienteId });

export function useGuardarEvento() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, datos }: { id?: string; datos: EventoInput }) =>
      id ? api<EventoApi>(`/agenda/eventos/${id}`, { method: "PUT", body: datos }) : api<EventoApi>("/agenda/eventos", { method: "POST", body: datos }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["agenda", "eventos"] });
      qc.invalidateQueries({ queryKey: ["notificaciones"] });
    },
  });
}

export function useAccionEvento() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, estado }: { id: string; estado?: EventoApi["estado"] }): Promise<EventoApi | null> => {
      if (!estado) {
        await api<void>(`/agenda/eventos/${id}`, { method: "DELETE" });
        return null;
      }
      return api<EventoApi>(`/agenda/eventos/${id}/estado`, { method: "POST", body: { estado } });
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["agenda", "eventos"] }),
  });
}

/* ---------- Oportunidades ---------- */

export const useOportunidades = (clienteId?: string, enabled = true) =>
  useQuery({ queryKey: ["oportunidades", { clienteId }], queryFn: () => api<OportunidadApi[]>(`/oportunidades${clienteId ? `?clienteId=${clienteId}` : ""}`), enabled });

export const useResponsables = (enabled = true) =>
  useQuery({ queryKey: ["oportunidades", "responsables"], queryFn: () => api<{ id: string; nombre: string }[]>("/oportunidades/responsables"), enabled, staleTime: 5 * 60_000 });

export function useGuardarOportunidad() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, datos }: { id?: string; datos: OportunidadInput }) =>
      id ? api<OportunidadApi>(`/oportunidades/${id}`, { method: "PUT", body: datos }) : api<OportunidadApi>("/oportunidades", { method: "POST", body: datos }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["oportunidades"] }),
  });
}

export function useMoverOportunidad() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, etapa, motivoPerdida }: { id: string; etapa: EtapaOportunidad; motivoPerdida?: string | null }) =>
      api<OportunidadApi>(`/oportunidades/${id}/etapa`, { method: "POST", body: { etapa, motivoPerdida } }),
    // Se mueve la tarjeta al instante; si falla, se vuelve a pedir la lista
    onMutate: async ({ id, etapa }) => {
      await qc.cancelQueries({ queryKey: ["oportunidades"] });
      qc.setQueriesData<OportunidadApi[]>({ queryKey: ["oportunidades"] }, (lista) => lista?.map((o) => (o.id === id ? { ...o, etapa } : o)));
    },
    onSettled: () => qc.invalidateQueries({ queryKey: ["oportunidades"] }),
  });
}

export function useEliminarOportunidad() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api<void>(`/oportunidades/${id}`, { method: "DELETE" }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["oportunidades"] }),
  });
}

/* ---------- Email y documentos compartidos ---------- */

export const useConfigEmail = () => useQuery({ queryKey: ["email", "config"], queryFn: () => api<ConfigEmailApi>("/email/config") });

export function useGuardarConfigEmail() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (datos: ConfigEmailInput) => api<ConfigEmailApi>("/email/config", { method: "PUT", body: datos }),
    onSuccess: (c) => qc.setQueryData(["email", "config"], c),
  });
}

export function useProbarEmail() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (para?: string) => api<ResultadoEnvio>("/email/probar", { method: "POST", body: para ? { para } : {} }),
    onSettled: () => qc.invalidateQueries({ queryKey: ["email"] }),
  });
}

export const useEmailsEnviados = () => useQuery({ queryKey: ["email", "enviados"], queryFn: () => api<EmailEnviadoApi[]>("/email/enviados") });

export const useCompartir = (tipo: TipoDocumento, id: string | undefined, enabled = true) =>
  // staleTime 0: cada vez que se abre, se ve si el cliente ya abrió el link
  useQuery({ queryKey: ["compartir", tipo, id], queryFn: () => api<CompartirApi>(`/documentos/${tipo}/${id}/compartir`), enabled: enabled && !!id, staleTime: 0 });

export function useEnviarDocumento() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ tipo, id, para, mensaje }: { tipo: TipoDocumento; id: string; para: string; mensaje?: string | null }) =>
      api<ResultadoEnvio>(`/documentos/${tipo}/${id}/enviar`, { method: "POST", body: { para, mensaje } }),
    onSettled: (_r, _e, v) => {
      qc.invalidateQueries({ queryKey: ["compartir", v.tipo, v.id] });
      qc.invalidateQueries({ queryKey: ["email", "enviados"] });
    },
  });
}

export function useAnularEnlace() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ tipo, id }: { tipo: TipoDocumento; id: string }) => api<void>(`/documentos/${tipo}/${id}/enlace`, { method: "DELETE" }),
    onSuccess: (_r, v) => qc.invalidateQueries({ queryKey: ["compartir", v.tipo, v.id] }),
  });
}

export const useDocumentoPublico = (token: string | undefined) =>
  useQuery({ queryKey: ["publico", token], queryFn: () => api<DocumentoPublicoApi>(`/publico/${token}`), enabled: !!token, retry: false });

/* ---------- Conexión con ARCA ---------- */

export const useArca = () => useQuery({ queryKey: ["arca"], queryFn: () => api<ArcaEstadoApi>("/arca") });

export function useGenerarCsr() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (alias?: string) => api<{ csr: string; alias: string; archivo: string }>("/arca/csr", { method: "POST", body: alias ? { alias } : {} }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["arca"] }),
  });
}

export const descargarCsr = () => api<{ csr: string }>("/arca/csr");

export function useCargarCertificado() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (pem: string) => api<ArcaEstadoApi>("/arca/certificado", { method: "POST", body: { pem } }),
    onSuccess: (e) => {
      qc.setQueryData(["arca"], e);
      qc.invalidateQueries({ queryKey: ["facturacion"] });
    },
  });
}

export function useModoArca() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (modo: ModoArca) => api<ArcaEstadoApi>("/arca/modo", { method: "PUT", body: { modo } }),
    onSuccess: (e) => {
      qc.setQueryData(["arca"], e);
      qc.invalidateQueries({ queryKey: ["facturacion"] });
    },
  });
}

export function useProbarArca() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => api<{ ok: true; puntoVenta: number; tipo: string; ultimoNumero: number }>("/arca/probar", { method: "POST", body: {} }),
    onSettled: () => qc.invalidateQueries({ queryKey: ["arca"] }),
  });
}

/* ---------- Notas y productos habituales del cliente ---------- */

export const useNotasCliente = (clienteId: string) => useQuery({ queryKey: ["clientes", clienteId, "notas"], queryFn: () => api<NotaClienteApi[]>(`/clientes/${clienteId}/notas`) });

export function useGuardarNota(clienteId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, texto, fijada }: { id?: string; texto: string; fijada: boolean }) =>
      id ? api<NotaClienteApi>(`/clientes/${clienteId}/notas/${id}`, { method: "PUT", body: { texto, fijada } }) : api<NotaClienteApi>(`/clientes/${clienteId}/notas`, { method: "POST", body: { texto, fijada } }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["clientes", clienteId, "notas"] }),
  });
}

export function useBorrarNota(clienteId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api<void>(`/clientes/${clienteId}/notas/${id}`, { method: "DELETE" }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["clientes", clienteId, "notas"] }),
  });
}

export const useProductosCliente = (clienteId: string) =>
  useQuery({ queryKey: ["clientes", clienteId, "productos"], queryFn: () => api<ProductoClienteApi[]>(`/clientes/${clienteId}/productos`) });

type UsoInput = { cantidad: number | null; frecuencia: FrecuenciaUso | null; nota: string | null };

export function useGuardarProductoCliente(clienteId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, productoId, ...datos }: UsoInput & { id?: string; productoId?: string }) =>
      id
        ? api<ProductoClienteApi>(`/clientes/${clienteId}/productos/${id}`, { method: "PUT", body: datos })
        : api<ProductoClienteApi>(`/clientes/${clienteId}/productos`, { method: "POST", body: { productoId, ...datos } }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["clientes", clienteId, "productos"] }),
  });
}

export function useQuitarProductoCliente(clienteId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api<void>(`/clientes/${clienteId}/productos/${id}`, { method: "DELETE" }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["clientes", clienteId, "productos"] }),
  });
}

/* ---------- Suscripción ---------- */

export const useSuscripcion = () => useQuery({ queryKey: ["suscripcion"], queryFn: () => api<SuscripcionApi>("/suscripcion"), staleTime: 5 * 60_000 });
export const usePlanes = () => useQuery({ queryKey: ["suscripcion", "planes"], queryFn: () => api<PlanesApi>("/suscripcion/planes"), staleTime: 30 * 60_000 });

export function useCambiarPlan() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (d: { plan: PlanId; usuariosAdicionales: number; version?: number }) => api<CambioPlanApi>("/suscripcion", { method: "PUT", body: d }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["suscripcion"] }),
  });
}

export function usePagarSuscripcion() {
  return useMutation({
    mutationFn: (periodo: "mensual" | "anual") => api<{ referencia: string; url: string; importeArs: number; importeUsd: number; dolar: number; titulo: string }>("/suscripcion/pagar", { method: "POST", body: { periodo } }),
  });
}

export const usePagoSuscripcion = (referencia: string | undefined) =>
  useQuery({ queryKey: ["suscripcion", "pago", referencia], queryFn: () => api<PagoSuscripcionApi>(`/suscripcion/pagos/${referencia}`), enabled: !!referencia });

export function useResolverPago() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ referencia, simular, pagoId }: { referencia: string; simular?: "Aprobado" | "Rechazado"; pagoId?: string }) =>
      simular
        ? api<PagoSuscripcionApi>(`/suscripcion/pagos/${referencia}/simular`, { method: "POST", body: { resultado: simular } })
        : api<PagoSuscripcionApi>(`/suscripcion/pagos/${referencia}/verificar`, { method: "POST", body: pagoId ? { pagoId } : {} }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["suscripcion"] }),
  });
}

/* ---------- Legal ---------- */

export const useLegalEstado = (enabled = true) => useQuery({ queryKey: ["legal", "estado"], queryFn: () => api<LegalEstadoApi>("/legal/estado"), enabled, staleTime: 30 * 60_000 });

export function useAceptarTerminos() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => api<{ aceptada: true }>("/legal/aceptar", { method: "POST", body: {} }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["legal"] }),
  });
}

export function useSolicitudLegal() {
  return useMutation({ mutationFn: (d: SolicitudLegalInput) => api<{ codigo: string; tipo: string; fecha: string }>("/legal/solicitud", { method: "POST", body: d }) });
}

export function useBajaSuscripcion() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ anular, motivo }: { anular?: boolean; motivo?: string }) =>
      anular ? api<null>("/suscripcion/baja", { method: "DELETE" }) : api<{ codigo: string; accesoHasta: string }>("/suscripcion/baja", { method: "POST", body: { motivo } }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["suscripcion"] }),
  });
}
