import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@/api/client";

export const CATEGORIAS_TICKET = ["Problema", "Consulta", "Facturación y pagos", "Sugerencia"] as const;
export type EstadoTicket = "Abierto" | "Respondido" | "Cerrado";

export interface MensajeTicket {
  id: string;
  autor: "cliente" | "soporte";
  nombre: string;
  texto: string;
  createdAt: string;
}

export interface TicketApi {
  id: string;
  numero: number;
  empresaId: string;
  usuarioId: string | null;
  asunto: string;
  categoria: string;
  estado: EstadoTicket;
  pantalla: string | null;
  sinLeerCliente: boolean;
  sinLeerSoporte: boolean;
  createdAt: string;
  updatedAt: string;
  usuario?: string | null;
  mensajes?: number;
}

export type TicketConMensajes = Omit<TicketApi, "mensajes"> & { mensajes: MensajeTicket[] };

export const useTickets = () => useQuery({ queryKey: ["soporte"], queryFn: () => api<TicketApi[]>("/soporte") });
export const useTicket = (id: string | undefined) => useQuery({ queryKey: ["soporte", id], queryFn: () => api<TicketConMensajes>(`/soporte/${id}`), enabled: !!id });

export function useCrearTicket() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (d: { asunto: string; categoria: string; mensaje: string; pantalla?: string }) => api<TicketConMensajes>("/soporte", { method: "POST", body: d }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["soporte"] }),
  });
}

export function useResponderTicket(id: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (texto: string) => api<TicketConMensajes>(`/soporte/${id}/mensajes`, { method: "POST", body: { texto } }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["soporte"] }),
  });
}

export function useCerrarTicket(id: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => api<TicketApi>(`/soporte/${id}/cerrar`, { method: "POST" }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["soporte"] }),
  });
}
