import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { BellRing, Check, Mail, MessageCircle } from "lucide-react";
import { toast } from "sonner";
import { api, ApiError } from "@/api/client";
import type { EventoApi } from "@/api/types";
import { StatusBadge } from "@/components/shared/StatusBadge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";

type TurnoRecordatorio = EventoApi & { profesional: string; pacienteEmail: string | null; avisadoWhatsappEn: string | null; recordatorioEnviadoEn: string | null; respuestaPacienteEn: string | null };

const manana = () => {
  const d = new Date(Date.now() + 86_400_000);
  return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
};

/** Recordatorios del día: WhatsApp con un clic (con el link para confirmar) o email, y quién ya respondió */
export function Recordatorios() {
  const [abierto, setAbierto] = useState(false);
  const [fecha, setFecha] = useState(manana());
  const qc = useQueryClient();
  const lista = useQuery({ queryKey: ["agenda", "recordatorios", fecha], queryFn: () => api<TurnoRecordatorio[]>(`/agenda/recordatorios?fecha=${fecha}`), enabled: abierto });
  const whatsapp = useMutation({ mutationFn: (id: string) => api<{ url: string; telefono: string | null }>(`/agenda/eventos/${id}/whatsapp`, { method: "POST" }) });
  const email = useMutation({ mutationFn: (id: string) => api(`/agenda/eventos/${id}/email`, { method: "POST" }) });

  const porWhatsapp = async (t: TurnoRecordatorio) => {
    // La ventana se abre en el momento del clic (si no, el navegador la bloquea) y después se le pone el mensaje
    const ventana = window.open("about:blank", "_blank");
    try {
      const r = await whatsapp.mutateAsync(t.id);
      if (!r.telefono) toast.warning("El paciente no tiene un teléfono válido: elegí el contacto en WhatsApp");
      if (ventana) ventana.location.href = r.url;
      else window.location.href = r.url;
      qc.invalidateQueries({ queryKey: ["agenda", "recordatorios", fecha] });
    } catch (e) {
      ventana?.close();
      toast.error(e instanceof ApiError ? e.message : "No se pudo armar el mensaje");
    }
  };

  const porEmail = async (t: TurnoRecordatorio) => {
    try {
      await email.mutateAsync(t.id);
      toast.success(`Recordatorio enviado a ${t.pacienteEmail}`);
      qc.invalidateQueries({ queryKey: ["agenda", "recordatorios", fecha] });
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : "No se pudo enviar");
    }
  };

  const turnos = (lista.data ?? []).filter((t) => t.estado !== "Cancelado");

  return (
    <>
      <Button variant="outline" onClick={() => setAbierto(true)}>
        <BellRing className="size-4" /> Recordatorios
      </Button>
      <Dialog open={abierto} onOpenChange={setAbierto}>
        <DialogContent className="max-h-[92svh] overflow-y-auto sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>Recordatorios de turnos</DialogTitle>
            <DialogDescription>Mandale a cada paciente su recordatorio por WhatsApp (con un clic) o por email. El mensaje tiene un link para que confirme o cancele.</DialogDescription>
          </DialogHeader>
          <div className="flex items-center gap-2">
            <Input type="date" value={fecha} onChange={(e) => e.target.value && setFecha(e.target.value)} className="w-44" aria-label="Día de los turnos" />
            <span className="text-sm text-muted-foreground">{turnos.length ? `${turnos.length} turnos con paciente` : ""}</span>
          </div>
          {lista.isLoading ? (
            <div className="py-8 text-center text-sm text-muted-foreground">Cargando…</div>
          ) : turnos.length === 0 ? (
            <div className="py-8 text-center text-sm text-muted-foreground">No hay turnos con paciente ese día.</div>
          ) : (
            <ul className="divide-y rounded-md border">
              {turnos.map((t) => (
                <li key={t.id} className="flex flex-col gap-2 px-3 py-3 sm:flex-row sm:items-center sm:justify-between" data-testid="recordatorio">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="font-semibold tabular">{t.inicio}</span>
                      <span className="truncate font-medium">{t.pacienteNombre}</span>
                    </div>
                    <div className="flex flex-wrap items-center gap-x-2 text-xs text-muted-foreground">
                      <span>{t.profesional}</span>
                      <StatusBadge status={t.estado} className="py-0 text-[10px]" />
                      {t.respuestaPacienteEn && <span className="text-success">respondió desde el link</span>}
                    </div>
                  </div>
                  <div className="flex shrink-0 gap-2">
                    <Button size="sm" variant={t.avisadoWhatsappEn ? "ghost" : "outline"} onClick={() => porWhatsapp(t)} disabled={!t.pacienteTelefono} title={t.pacienteTelefono ? undefined : "Sin teléfono cargado"}>
                      {t.avisadoWhatsappEn ? <Check className="size-4 text-success" /> : <MessageCircle className="size-4" />} WhatsApp
                    </Button>
                    <Button size="sm" variant={t.recordatorioEnviadoEn ? "ghost" : "outline"} onClick={() => porEmail(t)} disabled={!t.pacienteEmail || email.isPending} title={t.pacienteEmail ? undefined : "Sin email cargado"}>
                      {t.recordatorioEnviadoEn ? <Check className="size-4 text-success" /> : <Mail className="size-4" />} Email
                    </Button>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
