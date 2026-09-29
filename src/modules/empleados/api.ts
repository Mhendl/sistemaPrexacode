import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@/api/client";

export const TIPOS_PAGO = ["Sueldo", "Adelanto", "Aguinaldo", "Vacaciones", "Bono", "Otro"] as const;
export const TIPOS_NOVEDAD = ["Vacaciones", "Licencia", "Enfermedad", "Ausencia", "Otro"] as const;
export const MEDIOS = ["Transferencia", "Efectivo", "Cheque", "Otro"] as const;
export const MODALIDADES = ["Mensual", "Quincenal", "Semanal", "Por hora"] as const;

export interface Concepto {
  concepto: string;
  importe: number;
}

export interface EmpleadoApi {
  id: string;
  nombre: string;
  apellido: string;
  cuil: string | null;
  puesto: string | null;
  fechaIngreso: string;
  fechaEgreso: string | null;
  motivoEgreso: string | null;
  modalidad: (typeof MODALIDADES)[number];
  sueldo: number;
  telefono: string | null;
  email: string | null;
  domicilio: string | null;
  cbu: string | null;
  obraSocial: string | null;
  notas: string | null;
  estado: "Activo" | "Baja";
  version: number;
}

export type EmpleadoFila = EmpleadoApi & { sueldoPagado: boolean; adelantosMes: number; pagadoMes: number };

export interface PagoEmpleadoApi {
  id: string;
  empleadoId: string;
  numero: number;
  tipo: (typeof TIPOS_PAGO)[number];
  periodo: string;
  fecha: string;
  conceptos: Concepto[];
  total: number;
  medio: string;
  nota: string | null;
  estado: "Emitido" | "Anulado";
  motivoAnulacion: string | null;
  createdAt: string;
}

export interface NovedadApi {
  id: string;
  tipo: (typeof TIPOS_NOVEDAD)[number];
  desde: string;
  hasta: string;
  dias: number;
  nota: string | null;
}

export type EmpleadoDetalle = EmpleadoApi & {
  pagos: PagoEmpleadoApi[];
  novedades: NovedadApi[];
  vacaciones: { anio: number; corresponden: number; tomadas: number; quedan: number };
};

export interface Liquidacion {
  periodo: string;
  basico: number;
  modalidad: string;
  adelantos: { id: string; numero: number; fecha: string; total: number }[];
  totalAdelantos: number;
  sueldoYaPagado: PagoEmpleadoApi | null;
}

export type EmpleadoInput = Omit<EmpleadoApi, "id" | "estado" | "fechaEgreso" | "motivoEgreso" | "version"> & { version?: number };

const invalidar = (qc: ReturnType<typeof useQueryClient>) => qc.invalidateQueries({ queryKey: ["empleados"] });

export const useEmpleados = () =>
  useQuery({
    queryKey: ["empleados"],
    queryFn: () => api<{ empleados: EmpleadoFila[]; resumen: { activos: number; sueldosMensuales: number; pagadoMes: number; sueldosPendientes: number; mes: string } }>("/empleados"),
  });
export const useEmpleado = (id: string | undefined) => useQuery({ queryKey: ["empleados", id], queryFn: () => api<EmpleadoDetalle>(`/empleados/${id}`), enabled: !!id });
export const useLiquidacion = (id: string, periodo: string, enabled: boolean) =>
  useQuery({ queryKey: ["empleados", id, "liquidacion", periodo], queryFn: () => api<Liquidacion>(`/empleados/${id}/liquidacion?periodo=${periodo}`), enabled });
export const usePagoEmpleado = (id: string | undefined) =>
  useQuery({
    queryKey: ["empleados", "pagos", id],
    queryFn: () => api<PagoEmpleadoApi & { empleado: Pick<EmpleadoApi, "id" | "nombre" | "apellido" | "cuil" | "puesto" | "fechaIngreso"> }>(`/empleados/pagos/${id}`),
    enabled: !!id,
  });

export function useGuardarEmpleado() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, ...d }: EmpleadoInput & { id?: string }) => (id ? api<EmpleadoApi>(`/empleados/${id}`, { method: "PUT", body: d }) : api<EmpleadoApi>("/empleados", { method: "POST", body: d })),
    onSuccess: () => invalidar(qc),
  });
}

/** Acciones sobre un empleado o sus pagos: registrar pagos, novedades, baja, anular */
export function useAccionEmpleado() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ url, metodo = "POST", body }: { url: string; metodo?: "POST" | "DELETE"; body?: object }) => api<unknown>(url, { method: metodo, body }),
    onSuccess: () => invalidar(qc),
  });
}
