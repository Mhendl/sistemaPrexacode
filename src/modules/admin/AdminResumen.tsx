import { AlertTriangle, Building2, CircleDollarSign, Clock, Inbox, TrendingUp, Wallet } from "lucide-react";
import { Link } from "react-router";
import { Card, CardAction, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { KpiCard } from "@/components/shared/KpiCard";
import { PageHeader } from "@/components/shared/PageHeader";
import { QueryState } from "@/components/shared/QueryState";
import { StatusBadge } from "@/components/shared/StatusBadge";
import { formatDate, formatMoney, formatMoneyShort } from "@/lib/format";
import { useResumenAdmin } from "./api";
import { BarrasMes, nombreEstado, nombrePlan, usd } from "./comun";

export function AdminResumen() {
  const { data: r, isLoading, error, refetch } = useResumenAdmin();
  return (
    <>
      <PageHeader title="Resumen" description="Cómo va Prexacode: empresas, ingresos y lo que necesita tu atención." />
      <QueryState isLoading={isLoading} error={error} onRetry={refetch}>
        {r && (
          <div className="grid gap-6" data-testid="resumen-admin">
            <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
              <div data-testid="kpi-mrr">
                <KpiCard label="Ingreso mensual (MRR)" value={usd(Math.round(r.mrrUsd))} icon={TrendingUp} tone="success" hint={`${r.porEstado.Activa} ${r.porEstado.Activa === 1 ? "empresa pagando" : "empresas pagando"}`} />
              </div>
              <div data-testid="kpi-cobrado-mes">
                <KpiCard label="Cobrado este mes" value={formatMoneyShort(r.cobradoMes)} icon={CircleDollarSign} tone="highlight" hint={`${formatMoney(r.cobrado30Dias.ars)} en los últimos 30 días`} />
              </div>
              <div data-testid="kpi-empresas">
                <KpiCard label="Empresas" value={String(r.empresas)} icon={Building2} hint={`${r.porEstado.Prueba} en prueba · ${r.altas30Dias} nuevas en 30 días`} />
              </div>
              <KpiCard label="Cobrado desde el inicio" value={formatMoneyShort(r.cobradoTotal)} icon={Wallet} />
            </div>

            {(r.ticketsAbiertos > 0 || r.solicitudesPendientes > 0 || r.porEstado.Gracia > 0 || r.porEstado.SoloLectura > 0 || r.suspendidas > 0 || r.bajasPedidas > 0) && (
              <Card className="flex-row flex-wrap items-center gap-x-6 gap-y-2 p-4 shadow-none" data-testid="alertas-admin">
                <AlertTriangle className="size-5 text-warning-ink" />
                {r.ticketsAbiertos > 0 && (
                  <Link to="/admin/soporte" className="text-sm hover:underline" data-testid="alerta-tickets">
                    <b>{r.ticketsAbiertos}</b> {r.ticketsAbiertos === 1 ? "pedido de soporte esperando respuesta" : "pedidos de soporte esperando respuesta"}
                  </Link>
                )}
                {r.solicitudesPendientes > 0 && (
                  <Link to="/admin/solicitudes" className="text-sm hover:underline">
                    <b>{r.solicitudesPendientes}</b> pedidos de baja o arrepentimiento sin resolver
                  </Link>
                )}
                {r.porEstado.Gracia > 0 && (
                  <span className="text-sm">
                    <b>{r.porEstado.Gracia}</b> vencidas en gracia
                  </span>
                )}
                {r.porEstado.SoloLectura > 0 && (
                  <span className="text-sm">
                    <b>{r.porEstado.SoloLectura}</b> en solo lectura
                  </span>
                )}
                {r.bajasPedidas > 0 && (
                  <span className="text-sm">
                    <b>{r.bajasPedidas}</b> con baja pedida
                  </span>
                )}
                {r.suspendidas > 0 && (
                  <span className="text-sm">
                    <b>{r.suspendidas}</b> suspendidas
                  </span>
                )}
              </Card>
            )}

            <div className="grid gap-6 xl:grid-cols-3">
              <Card className="shadow-none xl:col-span-2">
                <CardHeader>
                  <CardTitle>Cobrado por mes</CardTitle>
                </CardHeader>
                <CardContent>
                  <BarrasMes dinero datos={r.ingresosPorMes.map((m) => ({ etiqueta: m.etiqueta, valor: m.ars }))} />
                </CardContent>
              </Card>
              <Card className="shadow-none">
                <CardHeader>
                  <CardTitle>Empresas pagando por plan</CardTitle>
                </CardHeader>
                <CardContent className="grid gap-3">
                  {Object.entries(nombrePlan).map(([id, nombre]) => {
                    const n = r.porPlan[id] ?? 0;
                    const max = Math.max(1, ...Object.values(r.porPlan));
                    return (
                      <div key={id} className="grid gap-1" data-testid={`plan-${id}`}>
                        <div className="flex justify-between text-sm">
                          <span>{nombre}</span>
                          <b>{n}</b>
                        </div>
                        <div className="h-2 rounded-full bg-muted">
                          <div className="h-2 rounded-full bg-primary" style={{ width: `${(n / max) * 100}%` }} />
                        </div>
                      </div>
                    );
                  })}
                  <div className="mt-2 grid grid-cols-2 gap-2 border-t pt-3 text-sm">
                    {(Object.keys(r.porEstado) as (keyof typeof r.porEstado)[]).map((e) => (
                      <span key={e} className="flex items-center justify-between gap-2">
                        <span className="text-muted-foreground">{nombreEstado[e]}</span> <b>{r.porEstado[e]}</b>
                      </span>
                    ))}
                    <span className="flex items-center justify-between gap-2">
                      <span className="text-muted-foreground">Suspendidas</span> <b>{r.suspendidas}</b>
                    </span>
                  </div>
                </CardContent>
              </Card>
            </div>

            <div className="grid gap-6 xl:grid-cols-3">
              <Card className="gap-0 pb-0 shadow-none">
                <CardHeader className="pb-3">
                  <CardTitle className="flex items-center gap-2">
                    <Clock className="size-4 text-primary" /> Vencen pronto
                  </CardTitle>
                </CardHeader>
                {r.proximosVencimientos.length === 0 ? (
                  <CardContent className="pb-6 text-sm text-muted-foreground">Nada vence en los próximos 10 días.</CardContent>
                ) : (
                  <ul className="divide-y border-t" data-testid="vencen-pronto">
                    {r.proximosVencimientos.map((v) => (
                      <li key={v.empresaId}>
                        <Link to={`/admin/empresas/${v.empresaId}`} className="flex items-center justify-between gap-2 px-6 py-2.5 text-sm hover:bg-muted/40">
                          <span className="min-w-0 [overflow-wrap:anywhere]">
                            {v.empresa} <span className="text-muted-foreground">· {nombrePlan[v.plan]}</span>
                          </span>
                          <span className="shrink-0 text-xs">
                            {formatDate(v.vence)} ({v.diasRestantes >= 0 ? `${v.diasRestantes} d` : "vencida"})
                          </span>
                        </Link>
                      </li>
                    ))}
                  </ul>
                )}
              </Card>
              <Card className="gap-0 pb-0 shadow-none xl:col-span-2">
                <CardHeader className="pb-3">
                  <CardTitle>Últimos pagos</CardTitle>
                  <CardAction>
                    <Button variant="ghost" size="sm" asChild>
                      <Link to="/admin/pagos">Ver todos</Link>
                    </Button>
                  </CardAction>
                </CardHeader>
                {r.ultimosPagos.length === 0 ? (
                  <CardContent className="pb-6 text-sm text-muted-foreground">Todavía no hay pagos.</CardContent>
                ) : (
                  <ul className="divide-y border-t">
                    {r.ultimosPagos.map((p) => (
                      <li key={p.id} className="flex items-center justify-between gap-2 px-6 py-2.5 text-sm">
                        <span className="min-w-0">
                          <Link to={`/admin/empresas/${p.empresaId}`} className="font-medium [overflow-wrap:anywhere] hover:underline">
                            {p.empresa}
                          </Link>
                          <span className="block text-xs text-muted-foreground">
                            {p.tipo === "cambio" ? "cambio de plan" : `${nombrePlan[p.plan]} ${p.periodo === "anual" ? "anual" : "mensual"}`} · {p.proveedor} · {new Date(p.aprobadoAt).toLocaleDateString("es-AR")}
                          </span>
                        </span>
                        <span className="tabular shrink-0 font-medium">{formatMoney(p.importeArs)}</span>
                      </li>
                    ))}
                  </ul>
                )}
              </Card>
            </div>

            <Card className="shadow-none">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Inbox className="size-4 text-primary" /> Altas de empresas por mes
                </CardTitle>
              </CardHeader>
              <CardContent>
                <BarrasMes alto={160} datos={r.altasPorMes.map((m) => ({ etiqueta: m.etiqueta, valor: m.altas }))} />
              </CardContent>
            </Card>
            <p className="text-xs text-muted-foreground">
              MRR: lo que pagan por mes las empresas al día (las anuales, divididas en 12). <StatusBadge status="Activa" /> = con el período pago en curso.
            </p>
          </div>
        )}
      </QueryState>
    </>
  );
}
