import { Recordatorios } from "./Recordatorios";
import { productoActivo } from "@/config/brand";
import { useEffect, useMemo, useState, type MouseEvent } from "react";
import { Ban, CalendarPlus, ChevronLeft, ChevronRight, Plus, Settings2 } from "lucide-react";
import { Link, useSearchParams } from "react-router";
import { useBloqueos, useConfigAgenda, useEventos } from "@/api/hooks";
import type { BloqueoAgendaApi, ConfigAgendaApi, EventoApi, EventoInput, RecursoAgendaApi } from "@/api/types";
import { BloqueoDialog, VerBloqueo } from "./BloqueoDialog";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { PageHeader } from "@/components/shared/PageHeader";
import { QueryState } from "@/components/shared/QueryState";
import { StatusBadge } from "@/components/shared/StatusBadge";
import { useRole, Si } from "@/context/AuthProvider";
import { cn } from "@/lib/utils";
import { EventoDialog, sumarMinutos } from "./EventoDialog";

const HORA_PX = 56;
const nombresDia = ["Lun", "Mar", "Mié", "Jue", "Vie", "Sáb", "Dom"];

/* Fechas en hora local, como "aaaa-mm-dd" */
const iso = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
const aFecha = (f: string) => new Date(`${f}T00:00:00`);
const sumarDias = (f: string, n: number) => {
  const d = aFecha(f);
  d.setDate(d.getDate() + n);
  return iso(d);
};
const lunesDe = (f: string) => sumarDias(f, -((aFecha(f).getDay() + 6) % 7));
const aMin = (h: string) => Number(h.slice(0, 2)) * 60 + Number(h.slice(3, 5));
const esFecha = (f: string | null): f is string => !!f && /^\d{4}-\d{2}-\d{2}$/.test(f);

export function AgendaPage() {
  const { data: config, isLoading, error, refetch } = useConfigAgenda();
  return (
    <QueryState isLoading={isLoading} error={error} onRetry={refetch}>
      {config && <Calendario config={config} />}
    </QueryState>
  );
}

function Calendario({ config }: { config: ConfigAgendaApi }) {
  const { usuario, puede } = useRole();
  const [params, setParams] = useSearchParams();
  const hoy = iso(new Date());
  const [fecha, setFecha] = useState(() => (esFecha(params.get("fecha")) ? params.get("fecha")! : hoy));
  const [vista, setVista] = useState<"semana" | "dia">(() => (window.innerWidth < 768 ? "dia" : "semana"));
  const [ocultos, setOcultos] = useState<string[]>([]);
  const [dialogo, setDialogo] = useState<{ evento?: EventoApi; inicial?: Partial<EventoInput> } | null>(null);
  const [bloqueando, setBloqueando] = useState(false);
  const [verBloqueo, setVerBloqueo] = useState<BloqueoAgendaApi | null>(null);

  const lunes = lunesDe(fecha);
  const domingo = sumarDias(lunes, 6);
  const { data: eventos = [] } = useEventos(lunes, domingo);
  const { data: bloqueos = [] } = useBloqueos(lunes, domingo);
  const recursoPorId = useMemo(() => new Map(config.recursos.map((r) => [r.id, r])), [config.recursos]);
  const miRecurso = config.recursos.find((r) => r.activo && r.usuarioId === usuario.id);

  const sinRecursos = !config.recursos.some((r) => r.activo);

  // Desde la ficha de un paciente: /agenda?paciente=… abre un turno nuevo para él
  const pacienteParam = params.get("paciente");
  useEffect(() => {
    if (!pacienteParam || sinRecursos) return;
    nuevo({ pacienteId: pacienteParam, titulo: "" });
    setParams({}, { replace: true });
  }, [pacienteParam]); // eslint-disable-line react-hooks/exhaustive-deps

  // Link desde una notificación: /agenda?fecha=…&evento=…
  const eventoParam = params.get("evento");
  useEffect(() => {
    if (!eventoParam) return;
    const ev = eventos.find((e) => e.id === eventoParam);
    if (ev) {
      setDialogo({ evento: ev });
      setParams({}, { replace: true });
    }
  }, [eventoParam, eventos, setParams]);

  const dias = vista === "semana" ? Array.from({ length: 7 }, (_, i) => sumarDias(lunes, i)) : [fecha];
  const visibles = eventos.filter((e) => !ocultos.includes(e.recursoId));
  const bloqueosVisibles = bloqueos.filter((b) => !b.recursoId || !ocultos.includes(b.recursoId));
  const conHorario = config.recursos.filter((r) => r.activo && !ocultos.includes(r.id));
  // Recursos a mostrar: activos, más los desactivados que tengan algo esta semana
  const recursos = config.recursos.filter((r) => r.activo || eventos.some((e) => e.recursoId === r.id));

  // Franja horaria: la configurada, ampliada si hay eventos o alguien atiende fuera de ella
  const franjas = conHorario.flatMap((r) => r.horarios);
  const desdeH = Math.floor(Math.min(aMin(config.horaInicio), ...visibles.map((e) => aMin(e.inicio)), ...franjas.map((h) => aMin(h.desde))) / 60);
  const hastaH = Math.ceil(Math.max(aMin(config.horaFin), ...visibles.map((e) => aMin(e.fin)), ...franjas.map((h) => aMin(h.hasta))) / 60);
  const horas = Array.from({ length: Math.max(1, hastaH - desdeH) }, (_, i) => desdeH + i);

  const titulo =
    vista === "semana"
      ? `${aFecha(lunes).getDate()} al ${aFecha(domingo).toLocaleDateString("es-AR", { day: "numeric", month: "long", year: "numeric" })}`
      : aFecha(fecha).toLocaleDateString("es-AR", { weekday: "long", day: "numeric", month: "long", year: "numeric" });

  const mover = (delta: number) => setFecha((f) => sumarDias(f, vista === "semana" ? delta * 7 : delta));

  const nuevo = (inicial: Partial<EventoInput> = {}) =>
    setDialogo({ inicial: { fecha, recursoId: miRecurso?.id ?? config.recursos.find((r) => r.activo)?.id ?? "", tipo: config.tiposEvento[0] ?? null, ...inicial } });

  /** Clic en un hueco de la grilla: agenda en ese horario (redondeado a media hora) */
  const clicEnColumna = (dia: string, e: MouseEvent<HTMLDivElement>) => {
    if (e.target !== e.currentTarget && !(e.target as HTMLElement).dataset.hueco) return;
    const y = e.clientY - e.currentTarget.getBoundingClientRect().top;
    const min = Math.min(23 * 60 + 30, desdeH * 60 + Math.floor(((y / HORA_PX) * 60) / 30) * 30);
    const inicio = `${String(Math.floor(min / 60)).padStart(2, "0")}:${String(min % 60).padStart(2, "0")}`;
    nuevo({ fecha: dia, inicio, fin: sumarMinutos(inicio, 60) });
  };


  return (
    <>
      <PageHeader
        title="Agenda"
        description={`Tocá un horario libre para agendar. Cada color es un/a ${config.nombreRecurso.toLowerCase()}.`}
        actions={
          <>
            {productoActivo() === "dental" && puede("agenda.editar") && <Recordatorios />}
            <Si permiso="agenda.editar">
              <Button variant="outline" onClick={() => setBloqueando(true)} disabled={sinRecursos}>
                <Ban className="size-4" /> Bloquear horario
              </Button>
            </Si>
            {puede("configuracion") && (
              <Button variant="outline" asChild>
                <Link to="/configuracion?tab=agenda">
                  <Settings2 className="size-4" /> Personalizar
                </Link>
              </Button>
            )}
            <Si permiso="agenda.editar">
              <Button onClick={() => nuevo()} disabled={sinRecursos}>
                <Plus className="size-4" /> Agendar {config.nombreEvento.toLowerCase()}
              </Button>
            </Si>
          </>
        }
      />

      {sinRecursos && (
        <Card className="mb-5 flex-row items-center gap-3 p-4 text-sm shadow-none">
          <CalendarPlus className="size-5 shrink-0 text-primary" />
          <span>
            Para agendar hace falta al menos un/a {config.nombreRecurso.toLowerCase()} activo/a.{" "}
            {puede("configuracion") ? (
              <Link to="/configuracion?tab=agenda" className="text-primary hover:underline">
                Agregalo en Configuración → Agenda
              </Link>
            ) : (
              "Pedíselo a un administrador."
            )}
          </span>
        </Card>
      )}

      <Card className="gap-0 overflow-hidden p-0 shadow-none">
        <div className="flex flex-col gap-3 border-b p-3 lg:flex-row lg:items-center">
          <div className="flex items-center gap-1">
            <Button variant="outline" size="icon-sm" onClick={() => mover(-1)} aria-label="Anterior">
              <ChevronLeft className="size-4" />
            </Button>
            <Button variant="outline" size="icon-sm" onClick={() => mover(1)} aria-label="Siguiente">
              <ChevronRight className="size-4" />
            </Button>
            <Button variant="ghost" size="sm" onClick={() => setFecha(hoy)}>
              Hoy
            </Button>
            <span className="ml-2 text-sm font-semibold first-letter:uppercase" data-testid="agenda-titulo">
              {titulo}
            </span>
          </div>

          <div className="flex flex-wrap items-center gap-1.5 lg:ml-auto">
            {recursos.map((r) => {
              const off = ocultos.includes(r.id);
              return (
                <button
                  key={r.id}
                  type="button"
                  aria-pressed={!off}
                  onClick={() => setOcultos((o) => (off ? o.filter((x) => x !== r.id) : [...o, r.id]))}
                  className={cn("flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs transition-opacity", off && "opacity-40")}
                >
                  <span className="size-2.5 rounded-full" style={{ background: r.color }} />
                  {r.nombre}
                </button>
              );
            })}
          </div>

          <div className="flex rounded-lg bg-muted p-0.5 text-sm">
            {(["dia", "semana"] as const).map((v) => (
              <button
                key={v}
                type="button"
                onClick={() => setVista(v)}
                className={cn("rounded-md px-3 py-1", vista === v ? "bg-background font-medium shadow-sm" : "text-muted-foreground")}
              >
                {v === "dia" ? "Día" : "Semana"}
              </button>
            ))}
          </div>
        </div>

        <div className="overflow-x-auto">
          <div className={cn(vista === "semana" && "min-w-[860px]")}>
            <div className="grid border-b" style={{ gridTemplateColumns: `56px repeat(${dias.length}, minmax(0, 1fr))` }}>
              <div />
              {dias.map((f) => {
                const d = aFecha(f);
                return (
                  <button key={f} type="button" onClick={() => { setFecha(f); setVista("dia"); }} className="border-l px-2 py-2 text-center hover:bg-muted/40">
                    <div className="text-xs text-muted-foreground">{nombresDia[(d.getDay() + 6) % 7]}</div>
                    <div className={cn("mx-auto mt-0.5 flex size-8 items-center justify-center rounded-full text-sm font-semibold", f === hoy && "bg-primary text-primary-foreground")}>{d.getDate()}</div>
                  </button>
                );
              })}
            </div>

            <div className="relative grid" style={{ gridTemplateColumns: `56px repeat(${dias.length}, minmax(0, 1fr))` }}>
              <div>
                {horas.map((h) => (
                  <div key={h} className="tabular relative pr-2 text-right text-[11px] text-muted-foreground" style={{ height: HORA_PX }}>
                    <span className="relative -top-2">{String(h).padStart(2, "0")}:00</span>
                  </div>
                ))}
              </div>
              {dias.map((f) => (
                <div
                  key={f}
                  data-testid="columna-dia"
                  data-fecha={f}
                  onClick={(e) => !sinRecursos && clicEnColumna(f, e)}
                  className={cn("relative cursor-copy border-l", f === hoy && "bg-primary/[0.03]")}
                >
                  {horas.map((h) => (
                    <div key={h} data-hueco="1" className="border-b border-dashed border-border/70" style={{ height: HORA_PX }} />
                  ))}
                  {fueraDeHorario(conHorario, f, desdeH * 60, hastaH * 60).map(([a, b]) => (
                    <div key={a} data-hueco="1" data-testid="fuera-de-horario" className="absolute inset-x-0 bg-muted/60" style={{ top: ((a - desdeH * 60) / 60) * HORA_PX, height: ((b - a) / 60) * HORA_PX }} />
                  ))}
                  {bloqueosVisibles
                    .filter((b) => b.desde <= f && f <= b.hasta)
                    .map((b) => {
                      const a = b.horaDesde ? Math.max(aMin(b.horaDesde), desdeH * 60) : desdeH * 60;
                      const z = b.horaHasta ? Math.min(aMin(b.horaHasta), hastaH * 60) : hastaH * 60;
                      if (z <= a) return null;
                      const quien = b.recursoId ? (recursoPorId.get(b.recursoId)?.nombre ?? "") : "Toda la agenda";
                      return (
                        <button
                          key={b.id}
                          type="button"
                          data-testid="bloqueo-agenda"
                          aria-label={`Bloqueado: ${b.motivo}, ${quien}`}
                          onClick={(ev) => {
                            ev.stopPropagation();
                            setVerBloqueo(b);
                          }}
                          className="absolute inset-x-0.5 overflow-hidden rounded-md border border-dashed border-muted-foreground/40 px-2 py-1 text-left text-[11px] text-muted-foreground"
                          style={{
                            top: ((a - desdeH * 60) / 60) * HORA_PX + 1,
                            height: ((z - a) / 60) * HORA_PX - 2,
                            background: "repeating-linear-gradient(135deg, color-mix(in oklch, var(--muted-foreground) 10%, transparent) 0 6px, transparent 6px 12px)",
                          }}
                        >
                          <span className="font-medium">{b.motivo}</span>
                          <span className="block truncate">{quien}</span>
                        </button>
                      );
                    })}
                  {conCarriles(visibles.filter((e) => e.fecha === f)).map(({ evento, carril, carriles }) => (
                    <EventoBloque
                      key={evento.id}
                      evento={evento}
                      color={recursoPorId.get(evento.recursoId)?.color ?? "var(--muted-foreground)"}
                      recurso={recursoPorId.get(evento.recursoId)?.nombre ?? ""}
                      desdeH={desdeH}
                      carril={carril}
                      carriles={carriles}
                      compacto={vista === "semana"}
                      onClick={() => setDialogo({ evento })}
                    />
                  ))}
                </div>
              ))}
            </div>
          </div>
        </div>
      </Card>

      <EventoDialog open={!!dialogo} onOpenChange={(o) => !o && setDialogo(null)} config={config} evento={dialogo?.evento} inicial={dialogo?.inicial} />
      <BloqueoDialog open={bloqueando} onOpenChange={setBloqueando} config={config} fecha={fecha < hoy ? hoy : fecha} recursoId={miRecurso?.id} />
      <VerBloqueo bloqueo={verBloqueo} nombre={verBloqueo?.recursoId ? (recursoPorId.get(verBloqueo.recursoId)?.nombre ?? "") : "Toda la agenda"} onClose={() => setVerBloqueo(null)} puedeQuitar={puede("agenda.editar")} />
    </>
  );
}

/**
 * Tramos del día en que no atiende ninguno de los que se están viendo (para sombrearlos).
 * Si alguno no tiene horarios cargados, atiende siempre: no se sombrea nada.
 */
function fueraDeHorario(recursos: RecursoAgendaApi[], fecha: string, desde: number, hasta: number): [number, number][] {
  if (!recursos.length || recursos.some((r) => !r.horarios.length)) return [];
  const dia = aFecha(fecha).getDay();
  const franjas = recursos
    .flatMap((r) => r.horarios.filter((h) => h.dia === dia))
    .map((h) => [aMin(h.desde), aMin(h.hasta)] as [number, number])
    .sort((a, b) => a[0] - b[0]);
  const out: [number, number][] = [];
  let cursor = desde;
  for (const [a, b] of franjas) {
    if (a > cursor) out.push([cursor, Math.min(a, hasta)]);
    cursor = Math.max(cursor, b);
  }
  if (cursor < hasta) out.push([cursor, hasta]);
  return out.filter(([a, b]) => b > a);
}

/** Reparte los eventos superpuestos en carriles lado a lado */
function conCarriles(evs: EventoApi[]) {
  const orden = [...evs].sort((a, b) => a.inicio.localeCompare(b.inicio));
  const out: { evento: EventoApi; carril: number; carriles: number }[] = [];
  let grupo: typeof out = [];
  let finGrupo = 0;
  const cerrar = () => {
    const n = Math.max(...grupo.map((g) => g.carril)) + 1;
    grupo.forEach((g) => out.push({ ...g, carriles: n }));
    grupo = [];
  };
  for (const e of orden) {
    if (grupo.length && aMin(e.inicio) >= finGrupo) cerrar();
    const ocupados = grupo.filter((g) => aMin(g.evento.fin) > aMin(e.inicio)).map((g) => g.carril);
    let carril = 0;
    while (ocupados.includes(carril)) carril++;
    grupo.push({ evento: e, carril, carriles: 1 });
    finGrupo = Math.max(finGrupo, aMin(e.fin));
  }
  if (grupo.length) cerrar();
  return out;
}

interface BloqueProps {
  evento: EventoApi;
  color: string;
  recurso: string;
  desdeH: number;
  carril: number;
  carriles: number;
  compacto: boolean;
  onClick: () => void;
}

function EventoBloque({ evento: e, color, recurso, desdeH, carril, carriles, compacto, onClick }: BloqueProps) {
  const top = ((aMin(e.inicio) - desdeH * 60) / 60) * HORA_PX;
  const height = Math.max(26, ((aMin(e.fin) - aMin(e.inicio)) / 60) * HORA_PX - 3);
  const cliente = e.pacienteId ? (e.tipo ?? "Turno") : (e.clienteRazonSocial ?? "Interno");
  const cancelado = e.estado === "Cancelado" || e.estado === "Ausente";

  return (
    <button
      type="button"
      data-testid="evento-agenda"
      aria-label={`${e.titulo}, ${e.inicio} a ${e.fin}, ${recurso}, ${e.estado}`}
      onClick={(ev) => {
        ev.stopPropagation();
        onClick();
      }}
      className={cn(
        "absolute flex flex-col items-stretch justify-start overflow-hidden rounded-md border-l-[3px] px-2 py-1 text-left text-xs transition-shadow hover:z-10 hover:shadow-md",
        cancelado && "opacity-50",
      )}
      style={{
        top: top + 1,
        height,
        left: `calc(${(carril / carriles) * 100}% + 3px)`,
        width: `calc(${100 / carriles}% - 6px)`,
        borderLeftColor: color,
        background: `color-mix(in oklch, ${color} 14%, var(--card))`,
      }}
    >
      <div className="flex items-center justify-between gap-2">
        <span className="tabular text-[10px] text-muted-foreground">
          {e.inicio}–{e.fin}
        </span>
        {!compacto && <StatusBadge status={e.estado} className="py-0 text-[10px]" />}
      </div>
      <div className={cn("truncate font-medium text-foreground", cancelado && "line-through")}>{e.titulo}</div>
      {!compacto && (
        <div className="truncate text-muted-foreground">
          {cliente} · {recurso}
        </div>
      )}
      {compacto && height > 60 && <div className="truncate text-muted-foreground">{cliente}</div>}
    </button>
  );
}
