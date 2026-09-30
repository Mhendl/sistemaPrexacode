import { useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { ApiError } from "@/api/client";
import { useAccionBloqueo } from "@/api/hooks";
import type { BloqueoAgendaApi, ConfigAgendaApi } from "@/api/types";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { formatDate } from "@/lib/format";

const TODOS = "__todos";

/** Bloquear días u horas de un profesional (o de toda la agenda): vacaciones, congreso, feriado */
export function BloqueoDialog({ open, onOpenChange, config, fecha, recursoId }: { open: boolean; onOpenChange: (o: boolean) => void; config: ConfigAgendaApi; fecha: string; recursoId?: string }) {
  const accion = useAccionBloqueo();
  const inicial = () => ({ recursoId: recursoId ?? TODOS, desde: fecha, hasta: fecha, diaCompleto: true, horaDesde: "09:00", horaHasta: "13:00", motivo: "" });
  const [d, setD] = useState(inicial);
  const [errores, setErrores] = useState<Record<string, string>>({});
  useEffect(() => {
    if (open) {
      setD(inicial());
      setErrores({});
    }
  }, [open]); // eslint-disable-line react-hooks/exhaustive-deps

  const submit = async () => {
    setErrores({});
    try {
      const r = await accion.mutateAsync({
        crear: { recursoId: d.recursoId === TODOS ? null : d.recursoId, desde: d.desde, hasta: d.hasta < d.desde ? d.desde : d.hasta, horaDesde: d.diaCompleto ? null : d.horaDesde, horaHasta: d.diaCompleto ? null : d.horaHasta, motivo: d.motivo },
      });
      toast.success("Horario bloqueado", { description: d.motivo });
      const afectados = r?.turnosAfectados ?? [];
      if (afectados.length) {
        toast.warning(`${afectados.length === 1 ? "Hay un turno dado" : `Hay ${afectados.length} turnos dados`} en ese horario: reprogramalo${afectados.length === 1 ? "" : "s"}.`, {
          description: afectados.map((t) => `${t.titulo} · ${formatDate(t.fecha)} ${t.inicio}`).join(" — "),
          duration: 12000,
        });
      }
      onOpenChange(false);
    } catch (e) {
      if (e instanceof ApiError) {
        setErrores(e.details);
        if (!Object.keys(e.details).length) toast.error(e.message);
      } else toast.error("No se pudo bloquear");
    }
  };

  const activos = config.recursos.filter((r) => r.activo);
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Bloquear horario</DialogTitle>
          <DialogDescription>Vacaciones, un congreso, un feriado: en ese horario no se dan {config.nombreEvento.toLowerCase()}s.</DialogDescription>
        </DialogHeader>
        <div className="grid gap-4">
          <div className="grid gap-1.5">
            <Label>A quién</Label>
            <Select value={d.recursoId} onValueChange={(v) => setD({ ...d, recursoId: v })}>
              <SelectTrigger aria-label="A quién se bloquea">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={TODOS}>Toda la agenda</SelectItem>
                {activos.map((r) => (
                  <SelectItem key={r.id} value={r.id}>
                    {r.nombre}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="grid gap-1.5">
              <Label htmlFor="bl-desde">Desde el día</Label>
              <Input id="bl-desde" type="date" value={d.desde} onChange={(e) => setD({ ...d, desde: e.target.value, hasta: d.hasta < e.target.value ? e.target.value : d.hasta })} aria-invalid={!!errores.desde} />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="bl-hasta">Hasta el día</Label>
              <Input id="bl-hasta" type="date" value={d.hasta} min={d.desde} onChange={(e) => setD({ ...d, hasta: e.target.value })} aria-invalid={!!errores.hasta} />
              {errores.hasta && <p className="text-xs text-destructive">{errores.hasta}</p>}
            </div>
          </div>
          <label className="flex items-center gap-2 text-sm">
            <Switch checked={d.diaCompleto} onCheckedChange={(v) => setD({ ...d, diaCompleto: v })} aria-label="Todo el día" />
            Todo el día
          </label>
          {!d.diaCompleto && (
            <div className="grid grid-cols-2 gap-3">
              <div className="grid gap-1.5">
                <Label htmlFor="bl-hdesde">De</Label>
                <Input id="bl-hdesde" type="time" step={900} value={d.horaDesde} onChange={(e) => setD({ ...d, horaDesde: e.target.value })} />
              </div>
              <div className="grid gap-1.5">
                <Label htmlFor="bl-hhasta">A</Label>
                <Input id="bl-hhasta" type="time" step={900} value={d.horaHasta} onChange={(e) => setD({ ...d, horaHasta: e.target.value })} aria-invalid={!!errores.horaHasta} />
                {errores.horaHasta && <p className="text-xs text-destructive">{errores.horaHasta}</p>}
              </div>
            </div>
          )}
          <div className="grid gap-1.5">
            <Label htmlFor="bl-motivo">Motivo</Label>
            <Input id="bl-motivo" value={d.motivo} onChange={(e) => setD({ ...d, motivo: e.target.value })} placeholder="Vacaciones, congreso, feriado…" maxLength={120} aria-invalid={!!errores.motivo} />
            {errores.motivo && <p className="text-xs text-destructive">{errores.motivo}</p>}
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          <Button onClick={submit} disabled={accion.isPending}>
            {accion.isPending && <Loader2 className="size-4 animate-spin" />}
            Bloquear
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/** Ver un bloqueo y quitarlo */
export function VerBloqueo({ bloqueo, nombre, onClose, puedeQuitar }: { bloqueo: BloqueoAgendaApi | null; nombre: string; onClose: () => void; puedeQuitar: boolean }) {
  const accion = useAccionBloqueo();
  if (!bloqueo) return null;
  const quitar = async () => {
    try {
      await accion.mutateAsync({ borrar: bloqueo.id });
      toast.success("Bloqueo quitado");
      onClose();
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : "No se pudo quitar");
    }
  };
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>{bloqueo.motivo}</DialogTitle>
          <DialogDescription>
            {nombre} · {bloqueo.desde === bloqueo.hasta ? formatDate(bloqueo.desde) : `del ${formatDate(bloqueo.desde)} al ${formatDate(bloqueo.hasta)}`}
            {bloqueo.horaDesde ? `, de ${bloqueo.horaDesde} a ${bloqueo.horaHasta}` : ", todo el día"}. Lo cargó {bloqueo.creadoPor}.
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Cerrar
          </Button>
          {puedeQuitar && (
            <Button variant="destructive" onClick={quitar} disabled={accion.isPending}>
              Quitar bloqueo
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
