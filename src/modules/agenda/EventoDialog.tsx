import { useEffect, useState } from "react";
import { AlertTriangle, Loader2, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { useQueryClient } from "@tanstack/react-query";
import { ApiError } from "@/api/client";
import { manejarErrorGuardado } from "@/api/errores";
import { useAccionEvento, useClientes, useDisponibles, useGuardarEvento } from "@/api/hooks";
import type { ConfigAgendaApi, EstadoEvento, EventoApi, EventoInput } from "@/api/types";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { productoActivo } from "@/config/brand";
import { PacienteSelector } from "@/modules/pacientes/PacienteSelector";

const NINGUNO = "__ninguno";
/** Avisos del servidor que se pueden pasar por alto con "Agendar igual" */
const AVISOS: Record<string, string> = { SUPERPOSICION: "Se superpone.", FUERA_DE_HORARIO: "Fuera de horario.", BLOQUEADO: "Horario bloqueado." };
const ESTADOS: EstadoEvento[] = ["Pendiente", "Confirmado", "Realizado", "Cancelado"];
/** En un consultorio además se marca si el paciente no vino */
const ESTADOS_DENTAL: EstadoEvento[] = ["Pendiente", "Confirmado", "Realizado", "Ausente", "Cancelado"];

export const sumarMinutos = (h: string, m: number) => {
  const t = Math.min(23 * 60 + 59, Number(h.slice(0, 2)) * 60 + Number(h.slice(3, 5)) + m);
  return `${String(Math.floor(t / 60)).padStart(2, "0")}:${String(t % 60).padStart(2, "0")}`;
};

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  config: ConfigAgendaApi;
  /** Si viene, se edita; si no, es un alta con los valores iniciales */
  evento?: EventoApi | null;
  inicial?: Partial<EventoInput>;
}

const vacio = (config: ConfigAgendaApi, inicial?: Partial<EventoInput>): EventoInput => ({
  titulo: "",
  tipo: null,
  recursoId: config.recursos.find((r) => r.activo)?.id ?? "",
  clienteId: null,
  fecha: "",
  inicio: "09:00",
  fin: "10:00",
  estado: "Pendiente",
  lugar: null,
  notas: null,
  ...inicial,
});

/** Alta y edición de un evento de la agenda (turno, visita, orden…) */
export function EventoDialog({ open, onOpenChange, config, evento, inicial }: Props) {
  const qc = useQueryClient();
  const dental = productoActivo() === "dental";
  const { data: clientes = [] } = useClientes(open && !dental);
  const guardar = useGuardarEvento();
  const accion = useAccionEvento();
  const [d, setD] = useState<EventoInput>(() => vacio(config, inicial));
  const [errores, setErrores] = useState<Record<string, string>>({});
  const [superpone, setSuperpone] = useState<{ titulo: string; mensaje: string } | null>(null);
  const [confirmarBorrado, setConfirmarBorrado] = useState(false);

  useEffect(() => {
    if (!open) return;
    setD(evento ? { ...evento, version: evento.version } : vacio(config, inicial));
    setErrores({});
    setSuperpone(null);
    setConfirmarBorrado(false);
  }, [open, evento]); // eslint-disable-line react-hooks/exhaustive-deps

  const set = <K extends keyof EventoInput>(k: K, v: EventoInput[K]) => {
    setD((x) => ({ ...x, [k]: v }));
    if (["recursoId", "fecha", "inicio", "fin", "estado"].includes(k)) setSuperpone(null);
  };
  const cambiarInicio = (v: string) => {
    // Al mover el inicio se conserva la duración
    const dur = Math.max(15, minutos(d.fin) - minutos(d.inicio));
    setD((x) => ({ ...x, inicio: v, fin: v ? sumarMinutos(v, dur) : x.fin }));
    setSuperpone(null);
  };

  const nombre = config.nombreEvento.toLowerCase();
  const recursos = config.recursos.filter((r) => r.activo || r.id === d.recursoId);
  const tipos = d.tipo && !config.tiposEvento.includes(d.tipo) ? [...config.tiposEvento, d.tipo] : config.tiposEvento;
  const activos = clientes.filter((c) => c.estado === "Activo" || c.id === d.clienteId);

  const submit = async (permitirSuperposicion = false) => {
    setErrores({});
    if (dental && !d.pacienteId && d.titulo.trim().length < 2) {
      setErrores({ pacienteId: "Elegí el paciente (o escribí un título si es algo interno)" });
      return;
    }
    try {
      await guardar.mutateAsync({ id: evento?.id, datos: { ...d, permitirSuperposicion } });
      toast.success(evento ? "Cambios guardados" : "Quedó agendado", { description: `${d.titulo} · ${d.inicio} a ${d.fin}` });
      onOpenChange(false);
    } catch (err) {
      if (err instanceof ApiError && err.code && AVISOS[err.code]) {
        setSuperpone({ titulo: AVISOS[err.code]!, mensaje: err.message });
        return;
      }
      if (manejarErrorGuardado(err, { setErrores, qc, recargar: ["agenda", "eventos"] })) onOpenChange(false);
    }
  };

  const borrar = async () => {
    try {
      await accion.mutateAsync({ id: evento!.id });
      toast.success("Eliminado de la agenda");
      onOpenChange(false);
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "No se pudo eliminar");
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[92svh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{evento ? `Editar ${nombre}` : `Agendar ${nombre}`}</DialogTitle>
          <DialogDescription>
            {evento ? "Si cambiás el día, el horario o a quién se asigna, se le avisa a esa persona." : "Si se pisa con otra del mismo " + config.nombreRecurso.toLowerCase() + ", te avisamos."}
          </DialogDescription>
        </DialogHeader>

        <form
          className="grid gap-4 sm:grid-cols-2"
          onSubmit={(e) => {
            e.preventDefault();
            submit();
          }}
        >
          {dental && (
            <div className="grid gap-1.5 sm:col-span-2">
              <Label htmlFor="ev-paciente">Paciente</Label>
              <PacienteSelector
                value={d.pacienteId ?? null}
                invalido={!!errores.pacienteId}
                onChange={(id, nombrePaciente) => setD((x) => ({ ...x, pacienteId: id, titulo: nombrePaciente ?? (x.pacienteId ? "" : x.titulo) }))}
              />
              {errores.pacienteId && <p className="text-xs text-destructive">{errores.pacienteId}</p>}
            </div>
          )}
          {(!dental || !d.pacienteId) && (
            <div className="grid gap-1.5 sm:col-span-2">
              <Label htmlFor="ev-titulo">{dental ? "O un título (bloqueo, reunión…)" : "Título"}</Label>
              <Input id="ev-titulo" value={d.titulo} onChange={(e) => set("titulo", e.target.value)} aria-invalid={!!errores.titulo} autoFocus={!dental} />
              {errores.titulo && <p className="text-xs text-destructive">{errores.titulo}</p>}
            </div>
          )}
          <div className="grid gap-1.5">
            <Label htmlFor="ev-recurso">{config.nombreRecurso}</Label>
            <Select value={d.recursoId} onValueChange={(v) => set("recursoId", v)}>
              <SelectTrigger id="ev-recurso" className="w-full" aria-invalid={!!errores.recursoId}>
                <SelectValue placeholder="Elegí" />
              </SelectTrigger>
              <SelectContent>
                {recursos.map((r) => (
                  <SelectItem key={r.id} value={r.id}>
                    <span className="size-2.5 rounded-full" style={{ background: r.color }} />
                    {r.nombre}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {errores.recursoId && <p className="text-xs text-destructive">{errores.recursoId}</p>}
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="ev-tipo">Tipo</Label>
            <Select value={d.tipo ?? NINGUNO} onValueChange={(v) => set("tipo", v === NINGUNO ? null : v)}>
              <SelectTrigger id="ev-tipo" className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={NINGUNO}>Sin tipo</SelectItem>
                {tipos.map((t) => (
                  <SelectItem key={t} value={t}>
                    {t}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          {!dental && (
          <div className="grid gap-1.5 sm:col-span-2">
            <Label htmlFor="ev-cliente">Cliente</Label>
            <Select value={d.clienteId ?? NINGUNO} onValueChange={(v) => set("clienteId", v === NINGUNO ? null : v)}>
              <SelectTrigger id="ev-cliente" className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={NINGUNO}>Sin cliente (interno)</SelectItem>
                {activos.map((c) => (
                  <SelectItem key={c.id} value={c.id}>
                    {c.razonSocial}
                  </SelectItem>
                ))}
                {d.clienteId && !activos.some((c) => c.id === d.clienteId) && evento?.clienteRazonSocial && <SelectItem value={d.clienteId}>{evento.clienteRazonSocial}</SelectItem>}
              </SelectContent>
            </Select>
          </div>
          )}
          <div className="grid grid-cols-[1.4fr_1fr_1fr] gap-3 sm:col-span-2">
            <div className="grid gap-1.5">
              <Label htmlFor="ev-fecha">Fecha</Label>
              <Input id="ev-fecha" type="date" value={d.fecha} onChange={(e) => set("fecha", e.target.value)} aria-invalid={!!errores.fecha} />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="ev-inicio">Desde</Label>
              <Input id="ev-inicio" type="time" step={300} value={d.inicio} onChange={(e) => cambiarInicio(e.target.value)} aria-invalid={!!errores.inicio || !!superpone} />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="ev-fin">Hasta</Label>
              <Input id="ev-fin" type="time" step={300} value={d.fin} onChange={(e) => set("fin", e.target.value)} aria-invalid={!!errores.fin} />
            </div>
            {(errores.fecha || errores.inicio || errores.fin) && <p className="col-span-3 text-xs text-destructive">{errores.fin ?? errores.inicio ?? errores.fecha}</p>}
          </div>
          {!evento && open && (
            <HorariosLibres
              recursoId={d.recursoId}
              fecha={d.fecha}
              elegido={d.inicio}
              soloConHorarios={!dental}
              onElegir={(inicio, duracion) => {
                setD((x) => ({ ...x, inicio, fin: sumarMinutos(inicio, duracion) }));
                setSuperpone(null);
              }}
            />
          )}
          <div className="grid gap-1.5">
            <Label htmlFor="ev-estado">Estado</Label>
            <Select value={d.estado} onValueChange={(v) => set("estado", v as EstadoEvento)}>
              <SelectTrigger id="ev-estado" className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {(dental ? ESTADOS_DENTAL : ESTADOS).map((e) => (
                  <SelectItem key={e} value={e}>
                    {e}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="ev-lugar">{dental ? "Consultorio / sillón" : "Lugar"}</Label>
            <Input id="ev-lugar" value={d.lugar ?? ""} onChange={(e) => set("lugar", e.target.value || null)} placeholder={dental ? "Ej.: Sillón 2" : "Dirección, sala, link…"} />
          </div>
          <div className="grid gap-1.5 sm:col-span-2">
            <Label htmlFor="ev-notas">Notas</Label>
            <Textarea id="ev-notas" rows={2} value={d.notas ?? ""} onChange={(e) => set("notas", e.target.value || null)} />
          </div>

          {superpone && (
            <div className="flex flex-col gap-2 rounded-lg border border-warning/50 bg-warning/10 p-3 text-sm sm:col-span-2" role="alert" data-testid="aviso-superposicion">
              <div className="flex items-start gap-2">
                <AlertTriangle className="mt-0.5 size-4 shrink-0 text-warning-ink" />
                <span>
                  <b>{superpone.titulo}</b> {superpone.mensaje}
                </span>
              </div>
              <div className="flex justify-end">
                <Button type="button" size="sm" variant="outline" onClick={() => submit(true)} disabled={guardar.isPending}>
                  Agendar igual
                </Button>
              </div>
            </div>
          )}

          <DialogFooter className="gap-2 sm:col-span-2 sm:justify-between">
            {evento ? (
              confirmarBorrado ? (
                <div className="flex items-center gap-2">
                  <span className="text-sm">¿Eliminar?</span>
                  <Button type="button" size="sm" variant="destructive" onClick={borrar} disabled={accion.isPending}>
                    Sí, eliminar
                  </Button>
                  <Button type="button" size="sm" variant="ghost" onClick={() => setConfirmarBorrado(false)}>
                    No
                  </Button>
                </div>
              ) : (
                <Button type="button" variant="ghost" className="text-destructive hover:text-destructive" onClick={() => setConfirmarBorrado(true)}>
                  <Trash2 className="size-4" /> Eliminar
                </Button>
              )
            ) : (
              <span />
            )}
            <div className="flex gap-2">
              <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
                Cerrar
              </Button>
              <Button type="submit" disabled={guardar.isPending}>
                {guardar.isPending && <Loader2 className="size-4 animate-spin" />}
                Guardar
              </Button>
            </div>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

const minutos = (h: string) => Number(h.slice(0, 2)) * 60 + Number(h.slice(3, 5));

/** Los horarios libres del profesional ese día, para elegir con un toque */
function HorariosLibres({ recursoId, fecha, elegido, soloConHorarios, onElegir }: { recursoId: string; fecha: string; elegido: string; soloConHorarios: boolean; onElegir: (inicio: string, duracion: number) => void }) {
  const { data } = useDisponibles(recursoId, fecha);
  const [todos, setTodos] = useState(false);
  if (!data || (soloConHorarios && !data.conHorarios)) return null;
  const MAX = 12;
  const lista = todos ? data.libres : data.libres.slice(0, MAX);
  return (
    <div className="grid gap-1.5 sm:col-span-2" data-testid="horarios-libres">
      <div className="text-xs text-muted-foreground">
        {data.bloqueo ? (
          <span className="text-warning-ink">Bloqueado: {data.bloqueo}</span>
        ) : data.libres.length ? (
          <>Horarios libres{data.horario ? ` (${data.horario})` : ""}:</>
        ) : (
          <>No quedan horarios libres ese día{data.horario ? ` (${data.horario})` : ""}.</>
        )}
      </div>
      {!data.bloqueo && data.libres.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {lista.map((h) => (
            <button
              key={h}
              type="button"
              onClick={() => onElegir(h, data.duracion)}
              aria-label={`Turno libre ${h}`}
              aria-pressed={h === elegido}
              className={h === elegido ? "rounded-md border border-primary bg-primary px-2 py-1 text-xs font-medium text-primary-foreground" : "rounded-md border px-2 py-1 text-xs hover:border-primary hover:text-primary"}
            >
              {h}
            </button>
          ))}
          {data.libres.length > MAX && (
            <button type="button" onClick={() => setTodos(!todos)} className="px-1 text-xs text-primary hover:underline">
              {todos ? "Ver menos" : `+${data.libres.length - MAX} más`}
            </button>
          )}
        </div>
      )}
    </div>
  );
}
