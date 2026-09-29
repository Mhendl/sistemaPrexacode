import { useEffect, useMemo, useState, type DragEvent } from "react";
import { CalendarClock, FileText, MoreHorizontal, Plus, Search, Target, Trophy, TrendingUp } from "lucide-react";
import { useSearchParams } from "react-router";
import { toast } from "sonner";
import { ApiError } from "@/api/client";
import { useMoverOportunidad, useOportunidades } from "@/api/hooks";
import type { EtapaOportunidad, OportunidadApi } from "@/api/types";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { KpiCard } from "@/components/shared/KpiCard";
import { PageHeader } from "@/components/shared/PageHeader";
import { QueryState } from "@/components/shared/QueryState";
import { useRole, Si } from "@/context/AuthProvider";
import { formatDate, formatMoney, formatMoneyShort } from "@/lib/format";
import { cn } from "@/lib/utils";
import { ETAPAS, OportunidadDialog } from "./OportunidadDialog";

/** Intensidad creciente del índigo a medida que avanza la etapa */
const etapaBar: Record<EtapaOportunidad, string> = {
  Nuevo: "bg-primary/25",
  Contactado: "bg-primary/45",
  Propuesta: "bg-primary/65",
  Negociación: "bg-primary",
  Ganada: "bg-success",
  Perdida: "bg-muted-foreground/40",
};
const ABIERTAS: EtapaOportunidad[] = ["Nuevo", "Contactado", "Propuesta", "Negociación"];
const DIAS_CERRADAS = 90;

const hoyLocal = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};
const haceDias = (n: number) => {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};
const nombreDe = (o: OportunidadApi) => o.clienteRazonSocial ?? o.prospecto ?? "—";
const iniciales = (n: string) =>
  n
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]!.toUpperCase())
    .join("");

export function OportunidadesPage() {
  const { usuario } = useRole();
  const [params, setParams] = useSearchParams();
  const { data, isLoading, error, refetch } = useOportunidades();
  const mover = useMoverOportunidad();
  const [busqueda, setBusqueda] = useState("");
  const [quien, setQuien] = useState("todos");
  const [dialogo, setDialogo] = useState<{ oportunidad?: OportunidadApi } | null>(null);
  const [perdiendo, setPerdiendo] = useState<OportunidadApi | null>(null);
  const [motivo, setMotivo] = useState("");
  const [arrastrando, setArrastrando] = useState<string | null>(null);
  const [sobre, setSobre] = useState<EtapaOportunidad | null>(null);

  const lista = data ?? [];

  // Link desde una notificación: /oportunidades?id=…
  const idParam = params.get("id");
  useEffect(() => {
    if (!idParam || !data) return;
    const o = data.find((x) => x.id === idParam);
    if (o) setDialogo({ oportunidad: o });
    setParams({}, { replace: true });
  }, [idParam, data, setParams]);

  const responsables = useMemo(() => {
    const m = new Map<string, string>();
    for (const o of lista) if (o.responsableId && o.responsableNombre) m.set(o.responsableId, o.responsableNombre);
    return [...m].sort((a, b) => a[1].localeCompare(b[1], "es"));
  }, [lista]);

  const desdeCerradas = haceDias(DIAS_CERRADAS);
  const visibles = lista.filter((o) => {
    if (quien === "mias" && o.responsableId !== usuario.id) return false;
    if (quien !== "todos" && quien !== "mias" && o.responsableId !== quien) return false;
    if (busqueda && !`${o.titulo} ${nombreDe(o)}`.toLowerCase().includes(busqueda.toLowerCase())) return false;
    return true;
  });

  // Indicadores sobre lo filtrado
  const abiertas = visibles.filter((o) => ABIERTAS.includes(o.etapa));
  const mes = hoyLocal().slice(0, 7);
  const ganadasMes = visibles.filter((o) => o.etapa === "Ganada" && o.fechaCierre?.startsWith(mes));
  const cerradasRecientes = visibles.filter((o) => (o.etapa === "Ganada" || o.etapa === "Perdida") && (o.fechaCierre ?? "") >= desdeCerradas);
  const ganadasRecientes = cerradasRecientes.filter((o) => o.etapa === "Ganada").length;

  const cambiarEtapa = async (o: OportunidadApi, etapa: EtapaOportunidad, motivoPerdida?: string) => {
    if (o.etapa === etapa) return;
    if (etapa === "Perdida" && motivoPerdida === undefined) {
      setMotivo("");
      setPerdiendo(o);
      return;
    }
    try {
      await mover.mutateAsync({ id: o.id, etapa, motivoPerdida: motivoPerdida || null });
      toast.success(`"${o.titulo}" pasó a ${etapa}`);
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : "No se pudo mover");
    }
  };

  const soltar = (etapa: EtapaOportunidad, e: DragEvent) => {
    e.preventDefault();
    setSobre(null);
    const o = lista.find((x) => x.id === (arrastrando ?? e.dataTransfer.getData("text/plain")));
    setArrastrando(null);
    if (o) cambiarEtapa(o, etapa);
  };

  return (
    <>
      <PageHeader
        title="Oportunidades"
        description="Tu embudo de ventas. Arrastrá cada tarjeta a la etapa en la que está."
        actions={
          <Si permiso="oportunidades.editar">
            <Button onClick={() => setDialogo({})}>
              <Plus className="size-4" /> Nueva oportunidad
            </Button>
          </Si>
        }
      />
      <QueryState isLoading={isLoading} error={error} onRetry={refetch}>
        <div className="mb-5 grid gap-4 sm:grid-cols-3">
          <div data-testid="kpi-en-juego">
            <KpiCard label="En juego" value={formatMoneyShort(abiertas.reduce((a, o) => a + o.monto, 0))} icon={Target} hint={`${abiertas.length} ${abiertas.length === 1 ? "abierta" : "abiertas"}`} />
          </div>
          <div data-testid="kpi-ganado-mes">
            <KpiCard label="Ganado este mes" value={formatMoneyShort(ganadasMes.reduce((a, o) => a + o.monto, 0))} icon={Trophy} tone="success" hint={`${ganadasMes.length} ${ganadasMes.length === 1 ? "oportunidad" : "oportunidades"}`} />
          </div>
          <KpiCard
            label="Tasa de éxito"
            value={cerradasRecientes.length ? `${Math.round((ganadasRecientes / cerradasRecientes.length) * 100)} %` : "—"}
            icon={TrendingUp}
            tone="highlight"
            hint={`Ganadas sobre cerradas, últimos ${DIAS_CERRADAS} días`}
          />
        </div>

        <div className="mb-4 flex flex-col gap-2 sm:flex-row">
          <div className="relative sm:w-72">
            <Search className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input value={busqueda} onChange={(e) => setBusqueda(e.target.value)} placeholder="Buscar por título o cliente…" className="pl-8" aria-label="Buscar oportunidades" />
          </div>
          <Select value={quien} onValueChange={setQuien}>
            <SelectTrigger className="sm:w-56" aria-label="Filtrar por responsable">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="todos">Todos los responsables</SelectItem>
              <SelectItem value="mias">Solo las mías</SelectItem>
              {responsables
                .filter(([id]) => id !== usuario.id)
                .map(([id, nombre]) => (
                  <SelectItem key={id} value={id}>
                    {nombre}
                  </SelectItem>
                ))}
            </SelectContent>
          </Select>
        </div>

        <div className="-mx-4 overflow-x-auto px-4 pb-2 lg:mx-0 lg:px-0">
          <div className="grid min-w-[1180px] grid-cols-6 gap-3">
            {ETAPAS.map((etapa) => {
              const cerrada = etapa === "Ganada" || etapa === "Perdida";
              const items = visibles
                .filter((o) => o.etapa === etapa && (!cerrada || (o.fechaCierre ?? "") >= desdeCerradas))
                .sort((a, b) => (cerrada ? (b.fechaCierre ?? "").localeCompare(a.fechaCierre ?? "") : (a.cierreEstimado ?? "9999").localeCompare(b.cierreEstimado ?? "9999")));
              const suma = items.reduce((a, o) => a + o.monto, 0);
              return (
                <div
                  key={etapa}
                  data-testid="columna-etapa"
                  data-etapa={etapa}
                  onDragOver={(e) => {
                    e.preventDefault();
                    setSobre(etapa);
                  }}
                  onDragLeave={() => setSobre((s) => (s === etapa ? null : s))}
                  onDrop={(e) => soltar(etapa, e)}
                  className={cn("flex min-h-40 flex-col gap-2.5 rounded-xl bg-muted/60 p-3 transition-colors", sobre === etapa && "bg-primary/10 ring-2 ring-primary/40")}
                >
                  <div>
                    <div className={cn("mb-2 h-1 rounded-full", etapaBar[etapa])} />
                    <div className="flex items-center justify-between">
                      <span className="text-sm font-semibold">{etapa}</span>
                      <span className="rounded-full bg-background px-2 text-xs text-muted-foreground" data-testid="cantidad-etapa">
                        {items.length}
                      </span>
                    </div>
                    <div className="tabular text-xs text-muted-foreground">
                      {formatMoneyShort(suma)}
                      {cerrada && ` · últimos ${DIAS_CERRADAS} días`}
                    </div>
                  </div>
                  {items.map((o) => (
                    <Tarjeta
                      key={o.id}
                      o={o}
                      arrastrando={arrastrando === o.id}
                      onAbrir={() => setDialogo({ oportunidad: o })}
                      onMover={(e) => cambiarEtapa(o, e)}
                      onDragStart={(e) => {
                        e.dataTransfer.setData("text/plain", o.id);
                        e.dataTransfer.effectAllowed = "move";
                        setArrastrando(o.id);
                      }}
                      onDragEnd={() => {
                        setArrastrando(null);
                        setSobre(null);
                      }}
                    />
                  ))}
                  {items.length === 0 && <div className="rounded-lg border border-dashed border-border/80 px-2 py-4 text-center text-xs text-muted-foreground">Soltá acá</div>}
                </div>
              );
            })}
          </div>
        </div>
      </QueryState>

      <OportunidadDialog open={!!dialogo} onOpenChange={(o) => !o && setDialogo(null)} oportunidad={dialogo?.oportunidad} />

      <Dialog open={!!perdiendo} onOpenChange={(o) => !o && setPerdiendo(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>¿Por qué se perdió?</DialogTitle>
            <DialogDescription>Anotarlo ayuda a ver después en qué se pierden los negocios. Es opcional.</DialogDescription>
          </DialogHeader>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              const o = perdiendo!;
              setPerdiendo(null);
              cambiarEtapa(o, "Perdida", motivo.trim());
            }}
            className="grid gap-4"
          >
            <Input value={motivo} onChange={(e) => setMotivo(e.target.value)} placeholder="Ej.: precio, plazo, eligió otro proveedor" aria-label="Motivo de la pérdida" autoFocus />
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setPerdiendo(null)}>
                Cancelar
              </Button>
              <Button type="submit">Marcar como perdida</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}

interface TarjetaProps {
  o: OportunidadApi;
  arrastrando: boolean;
  onAbrir: () => void;
  onMover: (etapa: EtapaOportunidad) => void;
  onDragStart: (e: DragEvent) => void;
  onDragEnd: () => void;
}

function Tarjeta({ o, arrastrando, onAbrir, onMover, onDragStart, onDragEnd }: TarjetaProps) {
  const abierta = ABIERTAS.includes(o.etapa);
  const atrasada = abierta && !!o.cierreEstimado && o.cierreEstimado < hoyLocal();
  return (
    <Card
      draggable
      onDragStart={onDragStart}
      onDragEnd={onDragEnd}
      data-testid="tarjeta-oportunidad"
      className={cn("group relative cursor-grab gap-1.5 p-3 shadow-none transition-shadow hover:shadow-md active:cursor-grabbing", arrastrando && "opacity-40", o.etapa === "Perdida" && "opacity-70")}
    >
      <button type="button" onClick={onAbrir} className="pr-6 text-left text-sm leading-snug font-medium after:absolute after:inset-0" aria-label={`Abrir ${o.titulo}`}>
        {o.titulo}
      </button>
      <div className="flex items-center gap-1.5 truncate text-xs text-muted-foreground">
        <span className="truncate">{nombreDe(o)}</span>
        {!o.clienteId && o.prospecto && <span className="shrink-0 rounded bg-highlight/15 px-1 text-[10px] text-highlight">Prospecto</span>}
      </div>
      <div className="tabular text-base font-semibold whitespace-nowrap">{formatMoney(o.monto)}</div>
      <div className="flex items-center justify-between gap-2 text-xs text-muted-foreground">
        <span className={cn("flex items-center gap-1", atrasada && "font-medium text-destructive")}>
          {o.etapa === "Ganada" || o.etapa === "Perdida" ? (
            <>
              {o.etapa === "Ganada" ? <Trophy className="size-3.5" /> : null}
              {o.fechaCierre ? formatDate(o.fechaCierre) : ""}
            </>
          ) : o.cierreEstimado ? (
            <>
              <CalendarClock className="size-3.5" /> {formatDate(o.cierreEstimado)}
            </>
          ) : null}
        </span>
        <span className="flex items-center gap-1.5">
          {o.presupuesto && <FileText className="size-3.5 text-primary" aria-label="Tiene presupuesto" />}
          {o.responsableNombre && (
            <span className="flex size-6 items-center justify-center rounded-full bg-primary/10 text-[10px] font-semibold text-primary" title={o.responsableNombre}>
              {iniciales(o.responsableNombre)}
            </span>
          )}
        </span>
      </div>
      {o.etapa === "Perdida" && o.motivoPerdida && <div className="truncate text-xs text-muted-foreground italic">{o.motivoPerdida}</div>}

      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" size="icon-sm" className="absolute top-1.5 right-1.5 z-10 size-6 opacity-60 group-hover:opacity-100" aria-label={`Mover ${o.titulo}`}>
            <MoreHorizontal className="size-4" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuLabel>Mover a</DropdownMenuLabel>
          {ETAPAS.filter((e) => e !== o.etapa).map((e) => (
            <DropdownMenuItem key={e} onSelect={() => onMover(e)}>
              {e}
            </DropdownMenuItem>
          ))}
        </DropdownMenuContent>
      </DropdownMenu>
    </Card>
  );
}
