import { useMutation, useQuery, useQueryClient, type QueryClient } from "@tanstack/react-query";
import { api } from "@/api/client";
import type { Cara, PrestacionApi } from "@/modules/pacientes/api";

export const MEDIOS_DENTAL = ["Efectivo", "Transferencia", "Tarjeta de débito", "Tarjeta de crédito", "Mercado Pago", "Otro"] as const;
export type MedioDental = (typeof MEDIOS_DENTAL)[number];
export const CATEGORIAS_GASTO = ["Proveedores e insumos", "Laboratorio", "Alquiler y expensas", "Servicios", "Sueldos y honorarios", "Impuestos", "Mantenimiento", "Otros"] as const;

// ---------------------------------------------------------------- tipos

export type PrecioLista = PrestacionApi & { precioPaciente: number | null; precioObraSocial: number | null };

export interface CargoApi {
  id: string;
  prestacionId: string;
  prestacion: string;
  codigo: string;
  pieza: number | null;
  caras: Cara[];
  fecha: string;
  profesional: string;
  obraSocial: string | null;
  importePaciente: number;
  importeObraSocial: number;
  odontogramaId: string | null;
  presupuestoItemId: string | null;
  anuladoEn: string | null;
  anuladoPor: string | null;
  motivoAnulacion: string | null;
}

export interface PagoApi {
  id: string;
  numero: number;
  fecha: string;
  importe: number;
  medio: MedioDental;
  referencia: string | null;
  notas: string | null;
  cobradoPor: string;
  anuladoEn: string | null;
  anuladoPor: string | null;
  motivoAnulacion: string | null;
  createdAt: string;
}

export interface CuentaApi {
  cargos: CargoApi[];
  pagos: PagoApi[];
  saldo: number;
}

export interface ReciboApi extends PagoApi {
  paciente: { nombre: string; apellido: string; dni: string | null; obraSocial: string | null };
}

export interface ItemPresupuestoApi {
  id: string;
  prestacionId: string;
  codigo: string;
  prestacion: string;
  alcance: "cara" | "pieza" | "general";
  pieza: number | null;
  caras: Cara[];
  odontogramaId: string | null;
  descuento: number;
  importePaciente: number;
  importeObraSocial: number;
  realizado: boolean;
}

export type EstadoPresupuesto = "Pendiente" | "Aceptado" | "Rechazado";

export interface PresupuestoDentalFila {
  id: string;
  numero: number;
  fecha: string;
  validoHasta: string;
  pacienteId: string;
  paciente: string;
  obraSocial: string | null;
  profesional: string;
  estado: EstadoPresupuesto;
  total: number;
  vencido: boolean;
}

export interface PresupuestoDentalApi extends PresupuestoDentalFila {
  dni: string | null;
  observaciones: string | null;
  items: ItemPresupuestoApi[];
  realizados: number;
  version: number;
}

export interface ItemPresupuestoInput {
  prestacionId: string;
  pieza?: number | null;
  caras?: Cara[];
  odontogramaId?: string | null;
  importePaciente?: number;
  descuento?: number;
}

export interface CajaApi {
  fecha: string;
  caja: {
    id: string;
    aperturaEfectivo: number;
    abiertaPor: string;
    abiertaEn: string;
    esperadoEfectivo: number | null;
    contadoEfectivo: number | null;
    diferencia: number | null;
    cerradaPor: string | null;
    cerradaEn: string | null;
    notas: string | null;
  } | null;
  porMedio: { medio: string; ingresos: number; egresos: number }[];
  pagos: { id: string; numero: number; importe: number; medio: string; paciente: string; pacienteId: string; cobradoPor: string; createdAt: string }[];
  ingresos: { id: string; concepto: string; importe: number; medio: string; cargadoPor: string; createdAt: string }[];
  gastos: GastoApi[];
  totalIngresos: number;
  totalEgresos: number;
  esperadoEfectivo: number;
}

export interface GastoApi {
  id: string;
  fecha: string;
  categoria: (typeof CATEGORIAS_GASTO)[number];
  descripcion: string;
  proveedor: string | null;
  importe: number;
  medio: string;
  comprobante: string | null;
  cargadoPor: string;
  anuladoEn: string | null;
  anuladoPor: string | null;
  motivoAnulacion: string | null;
  createdAt: string;
}

export interface CobrosApi {
  deudores: { id: string; nombre: string; apellido: string; telefono: string | null; saldo: number }[];
  aFavor: { id: string; nombre: string; apellido: string; saldo: number }[];
  totalAdeudado: number;
  ultimosPagos: (PagoApi & { paciente: string; pacienteId: string })[];
}

export interface ResumenApi {
  desde: string;
  hasta: string;
  cobradoPacientes: number;
  otrosIngresos: number;
  gastos: number;
  resultado: number;
  prestaciones: number;
  facturadoPacientes: number;
  aLiquidarObrasSociales: number;
}

export interface LiquidacionApi {
  obraSocial: string;
  desde: string;
  hasta: string;
  total: number;
  pacientes: number;
  prestaciones: { id: string; fecha: string; paciente: string; dni: string | null; plan: string | null; numeroAfiliado: string | null; codigo: string; prestacion: string; pieza: number | null; caras: string[]; profesional: string; importeObraSocial: number; importePaciente: number }[];
}

// ---------------------------------------------------------------- precios

export const usePrecios = (lista: string) => useQuery({ queryKey: ["precios", lista], queryFn: () => api<PrecioLista[]>(`/prestaciones/precios?lista=${lista}`) });

export function useGuardarPrecios() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (d: { lista: string; precios: { prestacionId: string; precioPaciente: number | null; precioObraSocial: number | null }[] }) => api<{ guardados: number }>("/prestaciones/precios", { method: "PUT", body: d }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["precios"] }),
  });
}

export function useAumentarPrecios() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (d: { lista: string; porcentaje: number; redondeo: number }) => api<{ actualizados: number }>("/prestaciones/precios/aumento", { method: "POST", body: d }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["precios"] }),
  });
}

export function useGuardarPrestacion() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, ...d }: Partial<PrestacionApi> & { id?: string }) => (id ? api<PrestacionApi>(`/prestaciones/${id}`, { method: "PUT", body: d }) : api<PrestacionApi>("/prestaciones", { method: "POST", body: d })),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["prestaciones"] });
      qc.invalidateQueries({ queryKey: ["precios"] });
    },
  });
}

export function useGuardarObraSocial() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, nombre, activa }: { id: string; nombre: string; activa: boolean }) => api(`/pacientes/obras-sociales/${id}`, { method: "PUT", body: { nombre, activa } }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["obras-sociales"] }),
  });
}

// ---------------------------------------------------------------- cuenta del paciente

const invalidarCuenta = (qc: QueryClient, pacienteId: string) => {
  qc.invalidateQueries({ queryKey: ["paciente", pacienteId, "cuenta"] });
  qc.invalidateQueries({ queryKey: ["consultorio"] });
  qc.invalidateQueries({ queryKey: ["inicio"] });
};

export const useCuenta = (pacienteId: string, habilitado = true) => useQuery({ queryKey: ["paciente", pacienteId, "cuenta"], queryFn: () => api<CuentaApi>(`/pacientes/${pacienteId}/cuenta`), enabled: habilitado });

export function useCargarPrestacion(pacienteId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (d: { prestacionId: string; pieza?: number | null; fecha?: string; importePaciente?: number }) => api<CargoApi>(`/pacientes/${pacienteId}/cargos`, { method: "POST", body: d }),
    onSuccess: () => invalidarCuenta(qc, pacienteId),
  });
}

export function useRegistrarPago(pacienteId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (d: { importe: number; medio: MedioDental; fecha?: string; referencia?: string | null; notas?: string | null }) => api<PagoApi & { saldo: number }>(`/pacientes/${pacienteId}/pagos`, { method: "POST", body: d }),
    onSuccess: () => invalidarCuenta(qc, pacienteId),
  });
}

export function useAnularEnCuenta(pacienteId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ tipo, id, motivo }: { tipo: "cargos" | "pagos"; id: string; motivo: string }) => api(`/pacientes/${pacienteId}/${tipo}/${id}/anular`, { method: "POST", body: { motivo } }),
    onSuccess: () => invalidarCuenta(qc, pacienteId),
  });
}

export const useRecibo = (pacienteId: string, pagoId: string) => useQuery({ queryKey: ["recibo", pagoId], queryFn: () => api<ReciboApi>(`/pacientes/${pacienteId}/pagos/${pagoId}`) });

// ---------------------------------------------------------------- presupuestos

export const usePresupuestosDentales = (pacienteId?: string) =>
  useQuery({ queryKey: ["presupuestos-dentales", pacienteId ?? "todos"], queryFn: () => api<PresupuestoDentalFila[]>(`/presupuestos-dentales${pacienteId ? `?pacienteId=${pacienteId}` : ""}`) });
export const usePresupuestoDental = (id?: string) => useQuery({ queryKey: ["presupuesto-dental", id], queryFn: () => api<PresupuestoDentalApi>(`/presupuestos-dentales/${id}`), enabled: !!id });

const invalidarPresupuestos = (qc: QueryClient) => {
  qc.invalidateQueries({ queryKey: ["presupuestos-dentales"] });
  qc.invalidateQueries({ queryKey: ["presupuesto-dental"] });
  qc.invalidateQueries({ queryKey: ["paciente"] });
  qc.invalidateQueries({ queryKey: ["consultorio"] });
};

export function useGuardarPresupuestoDental() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, ...d }: { id?: string; pacienteId: string; validoHasta?: string; observaciones: string | null; items: ItemPresupuestoInput[] }) =>
      id ? api<PresupuestoDentalApi>(`/presupuestos-dentales/${id}`, { method: "PUT", body: d }) : api<PresupuestoDentalApi>("/presupuestos-dentales", { method: "POST", body: d }),
    onSuccess: () => invalidarPresupuestos(qc),
  });
}

export function useAccionPresupuestoDental() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ url, metodo = "POST", body }: { url: string; metodo?: "POST" | "DELETE"; body?: object }) => api<PresupuestoDentalApi | undefined>(`/presupuestos-dentales${url}`, { method: metodo, body: body ?? (metodo === "POST" ? {} : undefined) }),
    onSuccess: () => invalidarPresupuestos(qc),
  });
}

// ---------------------------------------------------------------- caja, gastos, cobros, liquidación

export const useCaja = (fecha: string) => useQuery({ queryKey: ["consultorio", "caja", fecha], queryFn: () => api<CajaApi>(`/consultorio/caja?fecha=${fecha}`) });
export const useGastos = (desde: string, hasta: string) =>
  useQuery({ queryKey: ["consultorio", "gastos", desde, hasta], queryFn: () => api<{ gastos: GastoApi[]; total: number; porCategoria: { categoria: string; total: number }[] }>(`/consultorio/gastos?desde=${desde}&hasta=${hasta}`) });
export const useResumenConsultorio = (desde: string, hasta: string) => useQuery({ queryKey: ["consultorio", "resumen", desde, hasta], queryFn: () => api<ResumenApi>(`/consultorio/resumen?desde=${desde}&hasta=${hasta}`) });
export const useCobrosConsultorio = () => useQuery({ queryKey: ["consultorio", "cobros"], queryFn: () => api<CobrosApi>("/consultorio/cobros") });
export const useLiquidacion = (obraSocialId: string, desde: string, hasta: string) =>
  useQuery({ queryKey: ["consultorio", "liquidacion", obraSocialId, desde, hasta], queryFn: () => api<LiquidacionApi>(`/consultorio/liquidacion?obraSocialId=${obraSocialId}&desde=${desde}&hasta=${hasta}`), enabled: !!obraSocialId });

export function useAccionConsultorio() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ url, body }: { url: string; body?: object }) => api<unknown>(`/consultorio${url}`, { method: "POST", body: body ?? {} }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["consultorio"] });
      qc.invalidateQueries({ queryKey: ["paciente"] });
    },
  });
}

// ---------------------------------------------------------------- utilidades

const hoyLocal = () => {
  const d = new Date();
  return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
};
export const hoyIso = hoyLocal;
/** Primer y último día del mes de una fecha (aaaa-mm-dd) */
export function mesDe(fecha: string) {
  const [a, m] = fecha.split("-").map(Number) as [number, number];
  const ultimo = new Date(Date.UTC(a, m, 0)).getUTCDate();
  return { desde: `${fecha.slice(0, 7)}-01`, hasta: `${fecha.slice(0, 7)}-${String(ultimo).padStart(2, "0")}` };
}
