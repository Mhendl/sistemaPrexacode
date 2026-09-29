import { useEffect, useState } from "react";
import { Check, Loader2, Plus, Trash2, X } from "lucide-react";
import { toast } from "sonner";
import { useQueryClient } from "@tanstack/react-query";
import { ApiError } from "@/api/client";
import { manejarErrorGuardado } from "@/api/errores";
import { useConfigAgenda, useEliminarRecurso, useGuardarConfigAgenda, useGuardarRecurso, useUsuarios } from "@/api/hooks";
import type { ConfigAgendaApi, RecursoAgendaApi } from "@/api/types";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { QueryState } from "@/components/shared/QueryState";
import { cn } from "@/lib/utils";
import { Field, Section } from "./parts";

/** Puntos de partida por rubro: vocabulario y tipos de evento típicos */
const PLANTILLAS = [
  { rubro: "Comercial", evento: "Visita", recurso: "Vendedor", tipos: ["Visita comercial", "Presentación", "Llamada", "Reunión interna"] },
  { rubro: "Servicios técnicos", evento: "Orden de servicio", recurso: "Técnico", tipos: ["Instalación", "Reparación", "Mantenimiento", "Relevamiento"] },
  { rubro: "Salud / estética", evento: "Turno", recurso: "Profesional", tipos: ["Consulta", "Control", "Tratamiento", "Primera vez"] },
  { rubro: "Distribución", evento: "Entrega", recurso: "Vehículo", tipos: ["Entrega", "Retiro", "Reparto", "Devolución"] },
  { rubro: "Educación", evento: "Clase", recurso: "Aula", tipos: ["Clase", "Examen", "Taller", "Reunión de padres"] },
];

const NINGUNO = "__ninguno";

export function AgendaTab() {
  const { data, isLoading, error, refetch } = useConfigAgenda();
  return (
    <QueryState isLoading={isLoading} error={error} onRetry={refetch}>
      {data && (
        <div className="grid gap-6 lg:grid-cols-2">
          <Vocabulario config={data} />
          <Recursos config={data} />
        </div>
      )}
    </QueryState>
  );
}

function Vocabulario({ config }: { config: ConfigAgendaApi }) {
  const qc = useQueryClient();
  const guardar = useGuardarConfigAgenda();
  const [d, setD] = useState(config);
  const [nuevoTipo, setNuevoTipo] = useState("");
  const [errores, setErrores] = useState<Record<string, string>>({});
  useEffect(() => setD(config), [config]);

  const agregarTipo = () => {
    const t = nuevoTipo.trim();
    if (!t) return;
    if (!d.tiposEvento.some((x) => x.toLowerCase() === t.toLowerCase())) setD({ ...d, tiposEvento: [...d.tiposEvento, t] });
    setNuevoTipo("");
  };

  const submit = async () => {
    setErrores({});
    try {
      await guardar.mutateAsync({ nombreEvento: d.nombreEvento, nombreRecurso: d.nombreRecurso, horaInicio: d.horaInicio, horaFin: d.horaFin, tiposEvento: d.tiposEvento, version: config.version });
      toast.success("Agenda actualizada");
    } catch (err) {
      manejarErrorGuardado(err, { setErrores, qc, recargar: ["agenda", "config"] });
    }
  };

  return (
    <Section title="Cómo se llama cada cosa" description="Adaptá la agenda al vocabulario de tu rubro.">
      <div className="mb-5">
        <div className="mb-2 text-sm font-medium">Plantillas rápidas</div>
        <div className="flex flex-wrap gap-2">
          {PLANTILLAS.map((p) => (
            <button
              key={p.rubro}
              type="button"
              onClick={() => {
                setD({ ...d, nombreEvento: p.evento, nombreRecurso: p.recurso, tiposEvento: p.tipos });
                toast(`Plantilla "${p.rubro}" cargada`, { description: "Revisala y tocá Guardar." });
              }}
              className="rounded-full border px-3 py-1.5 text-xs hover:border-primary hover:bg-primary/5 hover:text-primary"
            >
              {p.rubro} · <span className="text-muted-foreground">{p.evento}</span>
            </button>
          ))}
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Cada evento se llama" htmlFor="ag-evento" hint="Ej.: Turno, Visita, Orden de servicio, Clase">
          <Input id="ag-evento" value={d.nombreEvento} onChange={(e) => setD({ ...d, nombreEvento: e.target.value })} aria-invalid={!!errores.nombreEvento} />
        </Field>
        <Field label="Se asigna a un/a" htmlFor="ag-recurso" hint="Ej.: Profesional, Técnico, Sala, Vehículo">
          <Input id="ag-recurso" value={d.nombreRecurso} onChange={(e) => setD({ ...d, nombreRecurso: e.target.value })} aria-invalid={!!errores.nombreRecurso} />
        </Field>
        <Field label="Horario desde" htmlFor="ag-desde">
          <Input id="ag-desde" type="time" step={1800} value={d.horaInicio} onChange={(e) => setD({ ...d, horaInicio: e.target.value })} />
        </Field>
        <Field label="Horario hasta" htmlFor="ag-hasta">
          <Input id="ag-hasta" type="time" step={1800} value={d.horaFin} onChange={(e) => setD({ ...d, horaFin: e.target.value })} aria-invalid={!!errores.horaFin} />
          {errores.horaFin && <p className="text-xs text-destructive">{errores.horaFin}</p>}
        </Field>
      </div>

      <div className="mt-5">
        <div className="mb-2 text-sm font-medium">Tipos de {d.nombreEvento.toLowerCase() || "evento"}</div>
        <div className="flex flex-wrap gap-2" data-testid="tipos-evento">
          {d.tiposEvento.map((t) => (
            <span key={t} className="inline-flex items-center gap-1 rounded-full bg-secondary py-1 pr-1.5 pl-3 text-xs text-secondary-foreground">
              {t}
              <button type="button" aria-label={`Quitar ${t}`} onClick={() => setD({ ...d, tiposEvento: d.tiposEvento.filter((x) => x !== t) })} className="rounded-full p-0.5 hover:bg-foreground/10">
                <X className="size-3" />
              </button>
            </span>
          ))}
        </div>
        <form
          className="mt-2 flex gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            agregarTipo();
          }}
        >
          <Input value={nuevoTipo} onChange={(e) => setNuevoTipo(e.target.value)} placeholder="Nuevo tipo…" aria-label="Nuevo tipo" className="h-8 max-w-60" />
          <Button type="submit" size="sm" variant="outline" aria-label="Agregar tipo">
            <Plus className="size-4" /> Agregar
          </Button>
        </form>
      </div>

      <div className="mt-6 flex justify-end">
        <Button onClick={submit} disabled={guardar.isPending}>
          {guardar.isPending && <Loader2 className="size-4 animate-spin" />}
          Guardar
        </Button>
      </div>
    </Section>
  );
}

function Recursos({ config }: { config: ConfigAgendaApi }) {
  const [agregando, setAgregando] = useState(false);
  return (
    <Section
      title="A quién se asigna"
      description="Cada uno con su color. Si lo vinculás a un usuario, esa persona recibe un aviso cuando le agendan algo."
      action={
        <Button variant="outline" size="sm" onClick={() => setAgregando(true)} disabled={agregando} aria-label={`Agregar ${config.nombreRecurso.toLowerCase()}`}>
          <Plus className="size-4" /> Agregar
        </Button>
      }
    >
      <div className="grid gap-2">
        {agregando && <FilaRecurso config={config} onListo={() => setAgregando(false)} />}
        {config.recursos.map((r) => (
          <FilaRecurso key={r.id} config={config} recurso={r} />
        ))}
        {config.recursos.length === 0 && !agregando && <p className="text-sm text-muted-foreground">Todavía no hay ninguno.</p>}
      </div>
    </Section>
  );
}

function FilaRecurso({ config, recurso, onListo }: { config: ConfigAgendaApi; recurso?: RecursoAgendaApi; onListo?: () => void }) {
  const qc = useQueryClient();
  const { data: usuarios = [] } = useUsuarios();
  const guardar = useGuardarRecurso();
  const eliminar = useEliminarRecurso();
  const usados = new Set(config.recursos.map((r) => r.color));
  const [nombre, setNombre] = useState(recurso?.nombre ?? "");
  const [color, setColor] = useState(recurso?.color ?? config.colores.find((c) => !usados.has(c)) ?? config.colores[0]!);
  const [usuarioId, setUsuarioId] = useState<string | null>(recurso?.usuarioId ?? null);
  const cambiado = !recurso || nombre !== recurso.nombre || color !== recurso.color || usuarioId !== recurso.usuarioId;

  const grabar = async (extra: { activo?: boolean } = {}) => {
    try {
      await guardar.mutateAsync({ id: recurso?.id, datos: { nombre, color, usuarioId, activo: extra.activo ?? recurso?.activo, version: recurso?.version } });
      toast.success(recurso ? "Guardado" : `${nombre} agregado`);
      onListo?.();
    } catch (err) {
      manejarErrorGuardado(err, { setErrores: () => {}, qc, recargar: ["agenda", "config"] });
    }
  };

  const borrar = async () => {
    try {
      await eliminar.mutateAsync(recurso!.id);
      toast.success(`${recurso!.nombre} eliminado`);
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "No se pudo eliminar", { duration: 8000 });
    }
  };

  return (
    <div className={cn("grid gap-2 rounded-lg border p-3", recurso && !recurso.activo && "bg-muted/40")} data-testid="fila-recurso">
      <div className="flex items-center gap-2">
        <span className="size-4 shrink-0 rounded-full" style={{ background: color }} />
        <Input value={nombre} onChange={(e) => setNombre(e.target.value)} aria-label="Nombre" placeholder="Nombre" className="h-8" autoFocus={!recurso} />
        {recurso && (
          <label className="flex shrink-0 items-center gap-1.5 text-xs text-muted-foreground">
            <Switch checked={recurso.activo} onCheckedChange={(v) => grabar({ activo: v })} aria-label={`${recurso.nombre} activo`} />
            {recurso.activo ? "Activo" : "Inactivo"}
          </label>
        )}
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <div className="flex gap-1" role="radiogroup" aria-label="Color">
          {config.colores.map((c) => (
            <button
              key={c}
              type="button"
              role="radio"
              aria-checked={c === color}
              aria-label={`Color ${c}`}
              onClick={() => setColor(c)}
              className={cn("size-5 rounded-full ring-offset-2 ring-offset-background", c === color && "ring-2 ring-foreground/60")}
              style={{ background: c }}
            />
          ))}
        </div>
        <Select value={usuarioId ?? NINGUNO} onValueChange={(v) => setUsuarioId(v === NINGUNO ? null : v)}>
          <SelectTrigger className="h-8 w-44 text-xs" aria-label="Usuario vinculado">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={NINGUNO}>Sin usuario</SelectItem>
            {usuarios.map((u) => (
              <SelectItem key={u.id} value={u.id}>
                {u.nombre}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <div className="ml-auto flex gap-1">
          {cambiado && (
            <Button size="sm" onClick={() => grabar()} disabled={guardar.isPending || nombre.trim().length < 2}>
              <Check className="size-4" /> {recurso ? "Guardar" : "Agregar"}
            </Button>
          )}
          {recurso ? (
            <Button size="icon-sm" variant="ghost" onClick={borrar} aria-label={`Eliminar ${recurso.nombre}`}>
              <Trash2 className="size-4" />
            </Button>
          ) : (
            <Button size="sm" variant="ghost" onClick={onListo}>
              Cancelar
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}
