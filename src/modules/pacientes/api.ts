import { useMutation, useQuery, useQueryClient, type QueryClient } from "@tanstack/react-query";
import { api, ApiError, getToken } from "@/api/client";

export const TIPOS_ARCHIVO = ["Radiografía", "Foto", "Estudio", "Documento"] as const;
export const ESTADOS_MARCA = { a_realizar: "A realizar", realizado: "Realizado", existente: "Existente" } as const;
export type EstadoMarca = keyof typeof ESTADOS_MARCA;
/** V vestibular · L lingual/palatino · M mesial · D distal · O oclusal/incisal */
export const CARAS = ["V", "L", "M", "D", "O"] as const;
export type Cara = (typeof CARAS)[number];
export const NOMBRE_CARA: Record<Cara, string> = { V: "Vestibular", L: "Lingual / palatino", M: "Mesial", D: "Distal", O: "Oclusal / incisal" };

export interface PacienteFila {
  id: string;
  nombre: string;
  apellido: string;
  dni: string | null;
  telefono: string | null;
  email: string | null;
  fechaNacimiento: string | null;
  edad: number | null;
  obraSocial: string | null;
  plan: string | null;
  datosPendientes: boolean;
  estado: "Activo" | "Inactivo";
}

export interface PacienteInput {
  nombre: string;
  apellido: string;
  dni: string | null;
  fechaNacimiento: string | null;
  sexo: "F" | "M" | "X" | null;
  telefono: string | null;
  email: string | null;
  domicilio: string | null;
  localidad: string | null;
  obraSocialId: string | null;
  plan: string | null;
  numeroAfiliado: string | null;
  alergias: string | null;
  medicacion: string | null;
  antecedentes: string | null;
  intervenciones: string | null;
  notas: string | null;
  estado?: "Activo" | "Inactivo";
}

export interface PacienteApi extends PacienteInput {
  id: string;
  obraSocial: string | null;
  edad: number | null;
  datosPendientes: boolean;
  estado: "Activo" | "Inactivo";
  /** El usuario puede ver los antecedentes (tiene permiso de historia clínica) */
  veAntecedentes: boolean;
  version: number;
  createdAt: string;
}

export interface ObraSocialApi {
  id: string;
  nombre: string;
  activa: boolean;
}

export interface EvolucionApi {
  id: string;
  fecha: string;
  texto: string;
  autor: string;
  createdAt: string;
}

export interface ArchivoApi {
  id: string;
  tipo: (typeof TIPOS_ARCHIVO)[number];
  descripcion: string | null;
  nombreArchivo: string;
  mime: string;
  tamano: number;
  fecha: string;
  autor: string;
}

export interface PrestacionApi {
  id: string;
  codigo: string;
  nombre: string;
  alcance: "cara" | "pieza" | "general";
  simbolo: "relleno" | "cruz" | "circulo" | "ausente" | "texto";
  etiqueta: string | null;
  activa: boolean;
  version: number;
}

export interface MarcaApi {
  id: string;
  pieza: number;
  caras: Cara[];
  estado: EstadoMarca;
  fecha: string;
  notas: string | null;
  autor: string;
  realizadoEn: string | null;
  realizadoPor: string | null;
  anuladoEn: string | null;
  anuladoPor: string | null;
  motivoAnulacion: string | null;
  prestacionId: string;
  prestacion: Pick<PrestacionApi, "codigo" | "nombre" | "alcance" | "simbolo" | "etiqueta">;
}

export interface TurnoPacienteApi {
  id: string;
  fecha: string;
  inicio: string;
  fin: string;
  estado: string;
  tipo: string | null;
  profesional: string;
  notas: string | null;
}

export const nombreCompleto = (p: { nombre: string; apellido: string }) => `${p.apellido}, ${p.nombre}`;

const invalidar = (qc: QueryClient, id?: string) => {
  qc.invalidateQueries({ queryKey: ["pacientes"] });
  if (id) qc.invalidateQueries({ queryKey: ["paciente", id] });
  qc.invalidateQueries({ queryKey: ["inicio"] });
};

export const usePacientes = (q?: string, habilitado = true) =>
  useQuery({ queryKey: ["pacientes", q ?? ""], queryFn: () => api<PacienteFila[]>(`/pacientes${q ? `?q=${encodeURIComponent(q)}` : ""}`), enabled: habilitado });
export const usePaciente = (id?: string) => useQuery({ queryKey: ["paciente", id], queryFn: () => api<PacienteApi>(`/pacientes/${id}`), enabled: !!id });
export const useObrasSociales = () => useQuery({ queryKey: ["obras-sociales"], queryFn: () => api<ObraSocialApi[]>("/pacientes/obras-sociales"), staleTime: 60_000 });
export const usePrestaciones = (habilitado = true) => useQuery({ queryKey: ["prestaciones"], queryFn: () => api<PrestacionApi[]>("/prestaciones"), staleTime: 60_000, enabled: habilitado });

export function useGuardarPaciente() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, datos }: { id?: string; datos: PacienteInput & { version?: number } }) =>
      id ? api<PacienteApi>(`/pacientes/${id}`, { method: "PUT", body: datos }) : api<PacienteApi>("/pacientes", { method: "POST", body: datos }),
    onSuccess: (p) => invalidar(qc, p.id),
  });
}

export function useBorrarPaciente() {
  const qc = useQueryClient();
  return useMutation({ mutationFn: (id: string) => api<void>(`/pacientes/${id}`, { method: "DELETE" }), onSuccess: () => invalidar(qc) });
}

export function useCrearObraSocial() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (nombre: string) => api<ObraSocialApi>("/pacientes/obras-sociales", { method: "POST", body: { nombre } }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["obras-sociales"] }),
  });
}

// ---------------------------------------------------------------- historia clínica

export const useEvoluciones = (id: string) => useQuery({ queryKey: ["paciente", id, "evoluciones"], queryFn: () => api<EvolucionApi[]>(`/pacientes/${id}/evoluciones`) });

export function useNuevaEvolucion(id: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (d: { texto: string; fecha?: string }) => api<EvolucionApi>(`/pacientes/${id}/evoluciones`, { method: "POST", body: d }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["paciente", id, "evoluciones"] }),
  });
}

export const useArchivos = (id: string) => useQuery({ queryKey: ["paciente", id, "archivos"], queryFn: () => api<ArchivoApi[]>(`/pacientes/${id}/archivos`) });

export function useSubirArchivo(id: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (d: { datos: string; nombreArchivo: string; tipo: string; descripcion: string | null; fecha?: string }) => api<ArchivoApi>(`/pacientes/${id}/archivos`, { method: "POST", body: d }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["paciente", id, "archivos"] }),
  });
}

export function useBorrarArchivo(id: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (archivoId: string) => api<void>(`/pacientes/${id}/archivos/${archivoId}`, { method: "DELETE" }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["paciente", id, "archivos"] }),
  });
}

/** El contenido de un archivo (con la sesión: son datos de salud). Devuelve una dirección temporal del navegador. */
export async function urlDeArchivo(pacienteId: string, archivoId: string): Promise<string> {
  const token = getToken();
  const res = await fetch(`/api/pacientes/${pacienteId}/archivos/${archivoId}`, { headers: token ? { authorization: `Bearer ${token}` } : {} });
  if (!res.ok) throw new ApiError(res.status, "No se pudo abrir el archivo");
  return URL.createObjectURL(await res.blob());
}

// ---------------------------------------------------------------- odontograma

export const useOdontograma = (id: string) => useQuery({ queryKey: ["paciente", id, "odontograma"], queryFn: () => api<MarcaApi[]>(`/pacientes/${id}/odontograma`) });

export function useMarcar(id: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (d: { prestacionId: string; piezas: number[]; caras: Cara[]; estado: EstadoMarca; notas: string | null }) => api<MarcaApi[]>(`/pacientes/${id}/odontograma`, { method: "POST", body: d }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["paciente", id, "odontograma"] }),
  });
}

export function useAccionMarca(id: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ marcaId, accion, motivo }: { marcaId: string; accion: "realizar" | "anular"; motivo?: string }) =>
      api<MarcaApi>(`/pacientes/${id}/odontograma/${marcaId}/${accion}`, { method: "POST", body: accion === "anular" ? { motivo } : {} }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["paciente", id, "odontograma"] }),
  });
}

export const useTurnosPaciente = (id: string) => useQuery({ queryKey: ["paciente", id, "turnos"], queryFn: () => api<TurnoPacienteApi[]>(`/pacientes/${id}/turnos`) });
