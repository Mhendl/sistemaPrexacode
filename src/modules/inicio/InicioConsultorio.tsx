import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { CalendarClock, CalendarPlus, Check, Contact, UserX, Wallet } from "lucide-react";
import { Link } from "react-router";
import { api } from "@/api/client";
import { KpiCard } from "@/components/shared/KpiCard";
import { PageHeader } from "@/components/shared/PageHeader";
import { QueryState } from "@/components/shared/QueryState";
import { StatusBadge } from "@/components/shared/StatusBadge";
import { Button } from "@/components/ui/button";
import { Card, CardAction, CardHeader, CardTitle } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { Si, useRole } from "@/context/AuthProvider";
import { formatMoneyShort } from "@/lib/format";
import { cn } from "@/lib/utils";
import type { EstadoEvento } from "@/api/types";

interface InicioConsultorioApi {
  turnosHoy: { id: string; inicio: string; fin: string; estado: EstadoEvento; tipo: string | null; titulo: string; pacienteId: string | null; paciente: string | null; datosPendientes: boolean | null; profesional: string; color: string; esMio: boolean }[] | null;
  proximos: number;
  ausentesMes: number;
  pacientes: { activos: number; nuevosMes: number; datosPendientes: number } | null;
  cobros: { mes: number; porCobrar: number } | null;
  primerosPasos: { logo: boolean; pacientes: boolean; turno: boolean; equipo: boolean };
}

const fechaLarga = () => {
  const s = new Date().toLocaleDateString("es-AR", { weekday: "long", day: "numeric", month: "long", year: "numeric" });
  return s.charAt(0).toUpperCase() + s.slice(1);
};

function PrimerosPasos({ pasos }: { pasos: InicioConsultorioApi["primerosPasos"] }) {
  const { puede, esAdmin } = useRole();
  const lista = [
    { hecho: pasos.logo, titulo: "Completá los datos del consultorio y subí el logo", link: "/configuracion?tab=empresa", ok: puede("configuracion") },
    { hecho: pasos.pacientes, titulo: "Cargá tu primer paciente", link: "/pacientes", ok: puede("pacientes.editar") },
    { hecho: pasos.turno, titulo: "Dale un turno", link: "/agenda", ok: puede("agenda.editar") },
    { hecho: pasos.equipo, titulo: "Sumá a tu equipo (profesionales y recepción)", link: "/configuracion?tab=usuarios", ok: esAdmin },
  ].filter((p) => p.ok);
  const hechos = lista.filter((p) => p.hecho).length;
  if (hechos === lista.length) return null;
  return (
    <Card className="mb-6 gap-4 border-primary/30 bg-primary/[0.03] p-5 shadow-none" data-testid="primeros-pasos">
      <div>
        <div className="text-base font-semibold">Primeros pasos</div>
        <div className="text-sm text-muted-foreground">
          {hechos} de {lista.length} listos
        </div>
      </div>
      <ol className="grid gap-2 sm:grid-cols-2">
        {lista.map((p, i) => (
          <li key={p.titulo}>
            <Link to={p.link} className={cn("flex items-center gap-3 rounded-lg border bg-card px-3 py-2.5 text-sm transition-colors hover:border-primary", p.hecho && "text-muted-foreground line-through")}>
              <span className={cn("flex size-6 shrink-0 items-center justify-center rounded-full text-xs font-semibold", p.hecho ? "bg-success text-white" : "bg-primary/10 text-primary")}>
                {p.hecho ? <Check className="size-3.5" /> : i + 1}
              </span>
              {p.titulo}
            </Link>
          </li>
        ))}
      </ol>
    </Card>
  );
}

export function InicioConsultorio() {
  const { usuario } = useRole();
  const { data, isLoading, error, refetch } = useQuery({ queryKey: ["inicio", "consultorio"], queryFn: () => api<InicioConsultorioApi>("/inicio/consultorio") });
  const [soloMios, setSoloMios] = useState(false);
  const turnos = data?.turnosHoy ?? [];
  const tieneMios = turnos.some((t) => t.esMio);
  const lista = soloMios ? turnos.filter((t) => t.esMio) : turnos;

  return (
    <>
      <PageHeader
        title={`Hola, ${usuario.nombre.split(" ")[0]}`}
        description={fechaLarga()}
        actions={
          <>
            <Si permiso="pacientes.editar">
              <Button variant="outline" asChild>
                <Link to="/pacientes">
                  <Contact className="size-4" /> Pacientes
                </Link>
              </Button>
            </Si>
            <Si permiso="agenda.editar">
              <Button asChild>
                <Link to="/agenda">
                  <CalendarPlus className="size-4" /> Dar turno
                </Link>
              </Button>
            </Si>
          </>
        }
      />
      <QueryState isLoading={isLoading} error={error} onRetry={refetch}>
        {data && (
          <>
            <PrimerosPasos pasos={data.primerosPasos} />
            <div className="mb-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-4" data-testid="kpis-consultorio">
              {data.turnosHoy && <KpiCard label="Turnos de hoy" value={String(turnos.length)} icon={CalendarClock} hint={`${data.proximos} en los próximos 7 días`} />}
              {data.pacientes && <KpiCard label="Pacientes activos" value={String(data.pacientes.activos)} icon={Contact} tone="highlight" hint={`${data.pacientes.nuevosMes} nuevos este mes`} />}
              {data.cobros && <KpiCard label="Cobrado este mes" value={formatMoneyShort(data.cobros.mes)} icon={Wallet} tone="success" hint={`Por cobrar: ${formatMoneyShort(data.cobros.porCobrar)}`} />}
              {data.turnosHoy && <KpiCard label="Ausentes este mes" value={String(data.ausentesMes)} icon={UserX} tone={data.ausentesMes ? "warning" : "default"} hint="Pacientes que no vinieron" />}
            </div>

            {data.turnosHoy && (
              <Card className="gap-0 pb-0 shadow-none">
                <CardHeader className="pb-4">
                  <CardTitle>Turnos de hoy</CardTitle>
                  <CardAction className="flex items-center gap-4">
                    {tieneMios && (
                      <label className="flex items-center gap-2 text-sm text-muted-foreground">
                        <Switch checked={soloMios} onCheckedChange={setSoloMios} aria-label="Solo mis turnos" /> Solo los míos
                      </label>
                    )}
                    <Link to="/agenda" className="text-sm font-medium text-primary hover:underline">
                      Ver agenda
                    </Link>
                  </CardAction>
                </CardHeader>
                {lista.length === 0 ? (
                  <div className="border-t px-6 py-10 text-center text-sm text-muted-foreground">No hay turnos para hoy.</div>
                ) : (
                  <ul className="divide-y border-t" data-testid="turnos-hoy">
                    {lista.map((t) => (
                      <li key={t.id} className="flex items-center gap-4 px-6 py-3">
                        <div className="w-24 shrink-0 text-sm font-semibold tabular">
                          {t.inicio}
                          <span className="font-normal text-muted-foreground">–{t.fin}</span>
                        </div>
                        <span className="h-9 w-1 shrink-0 rounded-full" style={{ background: t.color }} />
                        <div className="min-w-0 flex-1">
                          {t.pacienteId ? (
                            <Link to={`/pacientes/${t.pacienteId}`} className="font-medium hover:underline">
                              {t.paciente}
                            </Link>
                          ) : (
                            <span className="font-medium">{t.titulo}</span>
                          )}
                          {t.datosPendientes && <span className="ml-2 rounded bg-warning/15 px-1.5 py-0.5 text-[10px] font-semibold text-warning uppercase">Faltan datos</span>}
                          <div className="truncate text-xs text-muted-foreground">
                            {[t.tipo, t.profesional].filter(Boolean).join(" · ")}
                          </div>
                        </div>
                        <StatusBadge status={t.estado} />
                      </li>
                    ))}
                  </ul>
                )}
              </Card>
            )}
          </>
        )}
      </QueryState>
    </>
  );
}
