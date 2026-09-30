import { useEffect, useState } from "react";
import { Copy, ExternalLink, Loader2, MessageCircle, RefreshCw } from "lucide-react";
import { toast } from "sonner";
import { useQueryClient } from "@tanstack/react-query";
import { ApiError } from "@/api/client";
import { manejarErrorGuardado } from "@/api/errores";
import { useAccionTurnosOnline, useGuardarConfigAgenda } from "@/api/hooks";
import type { ConfigAgendaApi } from "@/api/types";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { resumenHorario } from "@/modules/agenda/HorariosDialog";
import { Field, Section } from "./parts";

/** CoreDental: los pacientes reservan su turno solos desde un link (web, Instagram, WhatsApp, Google) */
export function TurnosOnline({ config }: { config: ConfigAgendaApi }) {
  const qc = useQueryClient();
  const guardar = useGuardarConfigAgenda();
  const accion = useAccionTurnosOnline();
  const inicial = () => ({ reservaOnline: config.reservaOnline, anticipacion: String(config.reservaAnticipacionHoras), dias: String(config.reservaDiasMax), mensaje: config.reservaMensaje ?? "" });
  const [d, setD] = useState(inicial);
  const [errores, setErrores] = useState<Record<string, string>>({});
  useEffect(() => setD(inicial()), [config]); // eslint-disable-line react-hooks/exhaustive-deps

  const link = config.reservaCodigo ? `${window.location.origin}/reservar/${config.reservaCodigo}` : null;
  const conHorarios = config.recursos.filter((r) => r.activo && r.horarios.length > 0);
  const sinHorarios = config.recursos.filter((r) => r.activo && r.horarios.length === 0);

  const submit = async () => {
    setErrores({});
    try {
      await guardar.mutateAsync({
        nombreEvento: config.nombreEvento,
        nombreRecurso: config.nombreRecurso,
        horaInicio: config.horaInicio,
        horaFin: config.horaFin,
        tiposEvento: config.tiposEvento,
        reservaOnline: d.reservaOnline,
        reservaAnticipacionHoras: Number(d.anticipacion),
        reservaDiasMax: Number(d.dias),
        reservaMensaje: d.mensaje.trim() || null,
        version: config.version,
      });
      toast.success(d.reservaOnline ? "Turnos online activados" : "Turnos online guardados");
    } catch (err) {
      manejarErrorGuardado(err, { setErrores, qc, recargar: ["agenda", "config"] });
    }
  };

  const copiar = async () => {
    if (!link) return;
    try {
      await navigator.clipboard.writeText(link);
      toast.success("Link copiado");
    } catch {
      toast.error("No se pudo copiar: seleccioná el link y copialo a mano");
    }
  };

  const nuevoLink = async () => {
    try {
      await accion.mutateAsync({ nuevoLink: true });
      toast.success("Link nuevo creado", { description: "El anterior dejó de funcionar." });
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : "No se pudo");
    }
  };

  const cambiarProfesional = async (recursoId: string, reservaOnline: boolean) => {
    try {
      await accion.mutateAsync({ recursoId, reservaOnline });
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : "No se pudo");
    }
  };

  return (
    <Section title="Turnos online" description="Tus pacientes sacan turno solos, las 24 horas, desde un link que ponés en tu web, Instagram, WhatsApp o Google. Solo ven los horarios libres de cada profesional.">
      <div className="grid gap-4">
        <label className="flex items-start gap-3 text-sm">
          <Switch checked={d.reservaOnline} onCheckedChange={(v) => setD({ ...d, reservaOnline: v })} aria-label="Activar turnos online" className="mt-0.5" />
          <span>
            <b className="font-medium">Activar turnos online</b>
            <span className="block text-muted-foreground">Al consultorio le llega un aviso con cada turno nuevo, y al paciente un email con el link para confirmarlo o cancelarlo.</span>
          </span>
        </label>

        {config.reservaOnline && link && (
          <div className="grid gap-2 rounded-lg border bg-muted/30 p-3">
            <div className="text-xs font-medium text-muted-foreground">Link para tus pacientes</div>
            <div className="flex flex-wrap items-center gap-2">
              <code className="min-w-0 flex-1 truncate rounded bg-background px-2 py-1.5 text-xs" data-testid="link-turnos-online">
                {link}
              </code>
              <Button size="sm" variant="outline" onClick={copiar}>
                <Copy className="size-4" /> Copiar
              </Button>
              <Button size="sm" variant="outline" asChild>
                <a href={link} target="_blank" rel="noreferrer">
                  <ExternalLink className="size-4" /> Ver
                </a>
              </Button>
              <Button size="sm" variant="outline" asChild>
                <a href={`https://wa.me/?text=${encodeURIComponent(`Sacá tu turno online: ${link}`)}`} target="_blank" rel="noreferrer">
                  <MessageCircle className="size-4" /> Compartir
                </a>
              </Button>
            </div>
            <button type="button" onClick={nuevoLink} className="flex w-fit items-center gap-1 text-xs text-muted-foreground hover:text-foreground" disabled={accion.isPending}>
              <RefreshCw className="size-3" /> Crear un link nuevo (el actual deja de funcionar)
            </button>
          </div>
        )}

        <div className="grid gap-2">
          <div className="text-sm font-medium">Profesionales que dan turnos online</div>
          {conHorarios.length === 0 && <p className="text-sm text-warning-ink">Todavía nadie tiene horarios cargados. Cargalos en «A quién se asigna» → Horarios: los turnos online salen de ahí.</p>}
          {conHorarios.map((r) => (
            <label key={r.id} className="flex items-start gap-2 text-sm">
              <Checkbox checked={r.reservaOnline} onCheckedChange={(v) => cambiarProfesional(r.id, !!v)} aria-label={`${r.nombre} da turnos online`} className="mt-0.5" />
              <span>
                {r.nombre}
                <span className="block text-xs text-muted-foreground">{resumenHorario(r.horarios)} · turnos de {r.duracionTurno} min</span>
              </span>
            </label>
          ))}
          {sinHorarios.length > 0 && conHorarios.length > 0 && <p className="text-xs text-muted-foreground">Sin horarios cargados (no aparecen): {sinHorarios.map((r) => r.nombre).join(", ")}.</p>}
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Anticipación mínima (horas)" htmlFor="to-anticipacion" hint="Ej.: 2 = no se puede reservar para dentro de menos de 2 horas.">
            <Input id="to-anticipacion" inputMode="numeric" className="w-28" value={d.anticipacion} onChange={(e) => setD({ ...d, anticipacion: e.target.value.replace(/\D/g, "").slice(0, 3) })} aria-invalid={!!errores.reservaAnticipacionHoras} />
            {errores.reservaAnticipacionHoras && <p className="text-xs text-destructive">{errores.reservaAnticipacionHoras}</p>}
          </Field>
          <Field label="Hasta cuántos días adelante" htmlFor="to-dias">
            <Input id="to-dias" inputMode="numeric" className="w-28" value={d.dias} onChange={(e) => setD({ ...d, dias: e.target.value.replace(/\D/g, "").slice(0, 3) })} aria-invalid={!!errores.reservaDiasMax} />
            {errores.reservaDiasMax && <p className="text-xs text-destructive">{errores.reservaDiasMax}</p>}
          </Field>
        </div>
        <Field label="Mensaje para el paciente (opcional)" htmlFor="to-mensaje" hint="Aparece al reservar. Ej.: «Traé tu credencial y llegá 10 minutos antes».">
          <Textarea id="to-mensaje" rows={2} maxLength={300} value={d.mensaje} onChange={(e) => setD({ ...d, mensaje: e.target.value })} />
        </Field>
        <div className="flex justify-end">
          <Button onClick={submit} disabled={guardar.isPending}>
            {guardar.isPending && <Loader2 className="size-4 animate-spin" />}
            Guardar turnos online
          </Button>
        </div>
      </div>
    </Section>
  );
}
