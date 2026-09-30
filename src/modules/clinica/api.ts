import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@/api/client";

// ---------------------------------------------------------------- laboratorios

export interface LaboratorioFila {
  id: string;
  nombre: string;
  telefono: string | null;
  email: string | null;
  notas: string | null;
  activo: boolean;
  trabajos: number;
  pagado: number;
  saldo: number;
  pendientes: number;
}

export interface TrabajoApi {
  id: string;
  laboratorioId: string;
  pacienteId: string | null;
  paciente?: string | null;
  laboratorio?: string;
  descripcion: string;
  pieza: number | null;
  fechaEnvio: string;
  fechaPrevista: string | null;
  fechaRecibido: string | null;
  estado: "Enviado" | "Recibido" | "Cancelado";
  importe: number;
  profesional: string;
  notas: string | null;
}

export interface LaboratorioApi extends Omit<LaboratorioFila, "trabajos" | "pagado" | "saldo" | "pendientes"> {
  trabajos: TrabajoApi[];
  pagos: { id: string; fecha: string; importe: number; medio: string; comprobante: string | null; cargadoPor: string; anuladoEn: string | null }[];
  totalTrabajos: number;
  pagado: number;
  saldo: number;
}

export const useLaboratorios = () => useQuery({ queryKey: ["laboratorios"], queryFn: () => api<LaboratorioFila[]>("/laboratorios") });
export const useLaboratorio = (id?: string) => useQuery({ queryKey: ["laboratorios", id], queryFn: () => api<LaboratorioApi>(`/laboratorios/${id}`), enabled: !!id });
export const useTrabajosPaciente = (pacienteId: string, habilitado = true) =>
  useQuery({ queryKey: ["laboratorios", "paciente", pacienteId], queryFn: () => api<TrabajoApi[]>(`/laboratorios/trabajos/paciente/${pacienteId}`), enabled: habilitado });

export function useAccionLaboratorio() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ url, metodo = "POST", body }: { url: string; metodo?: "POST" | "PUT"; body?: object }) => api<{ id: string }>(`/laboratorios${url}`, { method: metodo, body: body ?? {} }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["laboratorios"] });
      qc.invalidateQueries({ queryKey: ["consultorio"] });
    },
  });
}

// ---------------------------------------------------------------- consentimientos

export interface PlantillaApi {
  id: string;
  titulo: string;
  texto: string;
  activa: boolean;
}

export interface ConsentimientoApi {
  id: string;
  titulo: string;
  texto?: string;
  profesional: string;
  firmante: string;
  firmanteDni: string | null;
  vinculo: string;
  firmaPaciente?: string;
  firmaProfesional?: string | null;
  ip: string | null;
  firmadoEn: string;
  revocadoEn: string | null;
  revocadoPor: string | null;
  motivoRevocacion: string | null;
}

export const VINCULOS = ["Paciente", "Madre, padre o tutor", "Representante legal"] as const;

export const usePlantillas = (habilitado = true) => useQuery({ queryKey: ["consentimientos", "plantillas"], queryFn: () => api<PlantillaApi[]>("/clinica/consentimientos/plantillas"), enabled: habilitado });
export const useConsentimientos = (pacienteId: string) => useQuery({ queryKey: ["paciente", pacienteId, "consentimientos"], queryFn: () => api<ConsentimientoApi[]>(`/clinica/pacientes/${pacienteId}/consentimientos`) });
export const useConsentimiento = (pacienteId: string, id: string | null) =>
  useQuery({ queryKey: ["paciente", pacienteId, "consentimientos", id], queryFn: () => api<ConsentimientoApi>(`/clinica/pacientes/${pacienteId}/consentimientos/${id}`), enabled: !!id });
export const usePrevia = (pacienteId: string, plantillaId: string) =>
  useQuery({ queryKey: ["consentimientos", "previa", pacienteId, plantillaId], queryFn: () => api<{ titulo: string; texto: string }>(`/clinica/pacientes/${pacienteId}/consentimientos/previa?plantillaId=${plantillaId}`), enabled: !!plantillaId });

export function useAccionClinica() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ url, metodo = "POST", body }: { url: string; metodo?: "POST" | "PUT"; body?: object }) => api<{ id: string }>(`/clinica${url}`, { method: metodo, body: body ?? {} }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["consentimientos"] });
      qc.invalidateQueries({ queryKey: ["paciente"] });
    },
  });
}

// ---------------------------------------------------------------- periodontograma

export interface PiezaPerio {
  ausente?: boolean;
  ps: (number | null)[];
  mg: (number | null)[];
  sangrado: boolean[];
  placa: boolean[];
  movilidad: number;
  furca: number;
}

export interface IndicesPerio {
  piezas: number;
  sitios: number;
  psPromedio: number;
  nicPromedio: number | null;
  sangrado: number;
  placa: number;
  sitiosPs4: number;
  sitiosPs6: number;
}

export interface PeriodontogramaApi {
  id: string;
  fecha: string;
  profesional: string;
  notas: string | null;
  piezas: Record<string, PiezaPerio>;
  indices: IndicesPerio;
}

export const usePeriodontogramas = (pacienteId: string) => useQuery({ queryKey: ["paciente", pacienteId, "periodontogramas"], queryFn: () => api<PeriodontogramaApi[]>(`/clinica/pacientes/${pacienteId}/periodontogramas`) });
