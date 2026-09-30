import { useEffect, useState } from "react";
import { Copy, Loader2, Plus, X } from "lucide-react";
import { toast } from "sonner";
import { ApiError } from "@/api/client";
import { useGuardarHorarios } from "@/api/hooks";
import type { FranjaHorario, RecursoAgendaApi } from "@/api/types";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

/** Lunes primero, como se lee una semana de trabajo */
export const DIAS_SEMANA = [
  { dia: 1, nombre: "Lunes", corto: "Lun" },
  { dia: 2, nombre: "Martes", corto: "Mar" },
  { dia: 3, nombre: "Miércoles", corto: "Mié" },
  { dia: 4, nombre: "Jueves", corto: "Jue" },
  { dia: 5, nombre: "Viernes", corto: "Vie" },
  { dia: 6, nombre: "Sábado", corto: "Sáb" },
  { dia: 0, nombre: "Domingo", corto: "Dom" },
];

/** "Lun, Mié 09:00–13:00 · Vie 14:00–18:00": agrupa los días que tienen el mismo horario */
export function resumenHorario(horarios: FranjaHorario[]) {
  if (!horarios.length) return "Sin horario fijo";
  const grupos = new Map<string, string[]>();
  for (const d of DIAS_SEMANA) {
    const f = horarios.filter((h) => h.dia === d.dia).sort((a, b) => a.desde.localeCompare(b.desde));
    if (!f.length) continue;
    const clave = f.map((x) => `${x.desde}–${x.hasta}`).join(" y ");
    grupos.set(clave, [...(grupos.get(clave) ?? []), d.corto]);
  }
  return [...grupos].map(([h, dias]) => `${dias.join(", ")} ${h}`).join(" · ");
}

type Semana = Record<number, { desde: string; hasta: string }[]>;
const aSemana = (h: FranjaHorario[]): Semana => Object.fromEntries(DIAS_SEMANA.map((d) => [d.dia, h.filter((x) => x.dia === d.dia).map(({ desde, hasta }) => ({ desde, hasta }))]));

export function HorariosDialog({ recurso, open, onOpenChange }: { recurso: RecursoAgendaApi; open: boolean; onOpenChange: (o: boolean) => void }) {
  const guardar = useGuardarHorarios();
  const [semana, setSemana] = useState<Semana>(() => aSemana(recurso.horarios));
  const [duracion, setDuracion] = useState(String(recurso.duracionTurno));
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setSemana(aSemana(recurso.horarios));
    setDuracion(String(recurso.duracionTurno));
    setError(null);
  }, [open, recurso]);

  const set = (dia: number, franjas: { desde: string; hasta: string }[]) => setSemana((s) => ({ ...s, [dia]: franjas }));

  /** Copia el horario del lunes a martes, miércoles, jueves y viernes */
  const copiarLunes = () => setSemana((s) => ({ ...s, 2: [...s[1]!], 3: [...s[1]!], 4: [...s[1]!], 5: [...s[1]!] }));

  const submit = async () => {
    setError(null);
    const horarios = DIAS_SEMANA.flatMap((d) => (semana[d.dia] ?? []).map((f) => ({ dia: d.dia, ...f })));
    if (horarios.some((h) => !h.desde || !h.hasta)) return setError("Completá las horas de cada franja");
    try {
      await guardar.mutateAsync({ id: recurso.id, datos: { horarios, duracionTurno: Number(duracion), version: recurso.version } });
      toast.success(`Horarios de ${recurso.nombre} guardados`);
      onOpenChange(false);
    } catch (e) {
      setError(e instanceof ApiError ? (e.details.duracionTurno ?? e.details.horarios ?? e.message) : "No se pudo guardar");
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[92svh] overflow-y-auto sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>Horarios de {recurso.nombre}</DialogTitle>
          <DialogDescription>Los días y horas en que atiende. Si se agenda fuera de este horario, el sistema avisa. Sin ningún día marcado, no hay restricción.</DialogDescription>
        </DialogHeader>

        <div className="grid gap-2">
          {DIAS_SEMANA.map((d) => {
            const franjas = semana[d.dia] ?? [];
            const atiende = franjas.length > 0;
            return (
              <div key={d.dia} className="grid gap-2 rounded-lg border p-2.5 sm:grid-cols-[130px_1fr] sm:items-start">
                <label className="flex items-center gap-2 pt-1 text-sm font-medium">
                  <Checkbox checked={atiende} onCheckedChange={(v) => set(d.dia, v ? [{ desde: "09:00", hasta: "13:00" }] : [])} aria-label={`Atiende los ${d.nombre.toLowerCase()}`} />
                  {d.nombre}
                </label>
                {atiende ? (
                  <div className="grid gap-1.5">
                    {franjas.map((f, i) => (
                      <div key={i} className="flex items-center gap-1.5">
                        <Input type="time" step={900} value={f.desde} onChange={(e) => set(d.dia, franjas.map((x, j) => (j === i ? { ...x, desde: e.target.value } : x)))} aria-label={`${d.nombre} desde ${i + 1}`} className="h-8 w-28" />
                        <span className="text-xs text-muted-foreground">a</span>
                        <Input type="time" step={900} value={f.hasta} onChange={(e) => set(d.dia, franjas.map((x, j) => (j === i ? { ...x, hasta: e.target.value } : x)))} aria-label={`${d.nombre} hasta ${i + 1}`} className="h-8 w-28" />
                        {franjas.length > 1 && (
                          <Button type="button" size="icon-sm" variant="ghost" onClick={() => set(d.dia, franjas.filter((_, j) => j !== i))} aria-label={`Quitar franja ${i + 1} del ${d.nombre.toLowerCase()}`}>
                            <X className="size-4" />
                          </Button>
                        )}
                        {i === franjas.length - 1 && franjas.length < 3 && (
                          <Button type="button" size="sm" variant="ghost" className="h-8 text-xs" onClick={() => set(d.dia, [...franjas, { desde: "16:00", hasta: "20:00" }])} aria-label={`Agregar franja el ${d.nombre.toLowerCase()}`}>
                            <Plus className="size-3.5" /> Cortado
                          </Button>
                        )}
                      </div>
                    ))}
                    {d.dia === 1 && (
                      <button type="button" onClick={copiarLunes} className="flex w-fit items-center gap-1 text-xs text-primary hover:underline">
                        <Copy className="size-3" /> Copiar a martes, miércoles, jueves y viernes
                      </button>
                    )}
                  </div>
                ) : (
                  <span className="pt-1 text-sm text-muted-foreground">No atiende</span>
                )}
              </div>
            );
          })}
        </div>

        <div className="grid gap-1.5">
          <Label htmlFor="hr-duracion">Duración habitual del turno (minutos)</Label>
          <Input id="hr-duracion" inputMode="numeric" className="w-28" value={duracion} onChange={(e) => setDuracion(e.target.value.replace(/\D/g, "").slice(0, 3))} />
          <p className="text-xs text-muted-foreground">Se usa para ofrecer los horarios libres al dar un turno.</p>
        </div>

        {error && (
          <p className="text-sm text-destructive" role="alert">
            {error}
          </p>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          <Button onClick={submit} disabled={guardar.isPending}>
            {guardar.isPending && <Loader2 className="size-4 animate-spin" />}
            Guardar horarios
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
