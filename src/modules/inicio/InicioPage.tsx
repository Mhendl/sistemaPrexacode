import { AlertTriangle, ArrowDownRight, ArrowUpRight, Boxes, Check, Plus, Receipt, Truck, Wallet } from "lucide-react";
import { Link } from "react-router";
import { useInicio } from "@/api/hooks";
import type { InicioApi } from "@/api/types";
import { Button } from "@/components/ui/button";
import { Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { KpiCard } from "@/components/shared/KpiCard";
import { PageHeader } from "@/components/shared/PageHeader";
import { QueryState } from "@/components/shared/QueryState";
import { useRole, Si } from "@/context/AuthProvider";
import { formatDate, formatMoney, formatMoneyShort } from "@/lib/format";
import { cn } from "@/lib/utils";
import { AgendaHoy } from "@/modules/agenda/AgendaHoy";
import { formatCantidad } from "@/modules/productos/stock";
import { VentasChart } from "./VentasChart";

const fechaLarga = () => {
  const s = new Date().toLocaleDateString("es-AR", { weekday: "long", day: "numeric", month: "long", year: "numeric" });
  return s.charAt(0).toUpperCase() + s.slice(1);
};

/** Guía para una empresa recién creada: desaparece cuando completó todo */
function PrimerosPasos({ pasos }: { pasos: InicioApi["primerosPasos"] }) {
  const { puede, esAdmin } = useRole();
  // Cada rol ve solo los pasos que puede hacer (Ventas no carga productos, Operaciones no carga clientes)
  const lista = [
    { hecho: pasos.logo, titulo: "Subí el logo y completá los datos de la empresa", link: "/configuracion?tab=empresa", ok: puede("configuracion") },
    { hecho: pasos.clientes, titulo: "Cargá tus clientes (o importalos desde Excel)", link: "/clientes?nuevo=1", ok: puede("clientes.editar") },
    { hecho: pasos.productos, titulo: "Cargá tus productos y servicios", link: "/productos", ok: puede("productos.editar") },
    { hecho: pasos.factura, titulo: "Emití tu primera factura", link: "/facturacion/nueva", ok: puede("facturacion.emitir") },
    { hecho: pasos.equipo, titulo: "Sumá a tu equipo como usuarios", link: "/configuracion?tab=usuarios", ok: esAdmin },
  ].filter((p) => p.ok);
  const hechos = lista.filter((p) => p.hecho).length;
  if (hechos === lista.length) return null;

  return (
    <Card className="mb-6 gap-4 border-primary/30 bg-primary/[0.03] p-5 shadow-none" data-testid="primeros-pasos">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <div className="text-base font-semibold">Primeros pasos</div>
          <div className="text-sm text-muted-foreground">
            {hechos} de {lista.length} listos · en unos minutos tenés todo andando
          </div>
        </div>
        <div className="h-2 w-40 overflow-hidden rounded-full bg-muted">
          <div className="h-full bg-primary transition-all" style={{ width: `${(hechos / lista.length) * 100}%` }} />
        </div>
      </div>
      <ol className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
        {lista.map((p, i) => (
          <li key={p.titulo}>
            <Link
              to={p.link}
              className={cn("flex items-center gap-3 rounded-lg border bg-card px-3 py-2.5 text-sm transition-colors hover:border-primary", p.hecho && "text-muted-foreground line-through")}
            >
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

function Variacion({ actual, anterior }: { actual: number; anterior: number }) {
  if (!anterior) return <span>{actual ? "Primer mes con ventas" : "Todavía sin ventas este mes"}</span>;
  const pct = ((actual - anterior) / Math.abs(anterior)) * 100;
  const sube = pct >= 0;
  return (
    <span className={cn("inline-flex items-center gap-0.5", sube ? "text-success" : "text-destructive")}>
      {sube ? <ArrowUpRight className="size-3.5" /> : <ArrowDownRight className="size-3.5" />}
      {Math.abs(pct).toLocaleString("es-AR", { maximumFractionDigits: 1 })} % vs. mes anterior
    </span>
  );
}

export function InicioPage() {
  const { usuario, puede } = useRole();
  const { data, isLoading, error, refetch } = useInicio();
  const verVentas = puede("facturacion.ver");

  return (
    <>
      <PageHeader
        title={`Hola, ${usuario.nombre.split(" ")[0]}`}
        description={fechaLarga()}
        actions={
          verVentas ? (
            <>
              <Si permiso="cobranzas.cobrar">
                <Button variant="outline" asChild>
                  <Link to="/cobranzas/nuevo">Registrar cobro</Link>
                </Button>
              </Si>
              <Si permiso="facturacion.emitir">
                <Button asChild>
                  <Link to="/facturacion/nueva">
                    <Plus className="size-4" /> Nueva factura
                  </Link>
                </Button>
              </Si>
            </>
          ) : (
            <Si permiso="remitos.emitir">
              <Button asChild>
                <Link to="/remitos/nuevo">
                  <Plus className="size-4" /> Nuevo remito
                </Link>
              </Button>
            </Si>
          )
        }
      />
      <QueryState isLoading={isLoading} error={error} onRetry={refetch}>
        {data && (
          <>
            <PrimerosPasos pasos={data.primerosPasos} />

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4" data-testid="kpis-inicio">
              {data.ventas && data.cobranzas && (
                <>
                  <KpiCard label="Ventas del mes" value={formatMoneyShort(data.ventas.mes)} icon={Receipt} hint={<Variacion actual={data.ventas.mes} anterior={data.ventas.mesAnterior} />} />
                  <KpiCard
                    label="Por cobrar"
                    value={formatMoneyShort(data.cobranzas.porCobrar)}
                    icon={Wallet}
                    tone="warning"
                    hint={data.cobranzas.vencido > 0 ? <span className="text-destructive">{formatMoney(data.cobranzas.vencido)} vencido</span> : "Nada vencido"}
                  />
                </>
              )}
              <KpiCard label="Stock bajo mínimo" value={`${data.stock.bajoMinimo} ${data.stock.bajoMinimo === 1 ? "producto" : "productos"}`} icon={Boxes} tone="danger" hint={`${data.stock.sinStock} sin stock`} />
              <KpiCard label="Remitos de hoy" value={String(data.remitosHoy)} icon={Truck} tone="highlight" hint={formatDate(new Date())} />
            </div>

            {data.ventas && (
              <div className="mt-6 grid grid-cols-1 gap-6 lg:grid-cols-3">
                <Card className="shadow-none lg:col-span-2">
                  <CardHeader>
                    <CardTitle>Ventas mensuales</CardTitle>
                    <CardDescription>Últimos 12 meses · facturas menos notas de crédito, IVA incluido</CardDescription>
                    <CardAction>
                      <Button variant="ghost" size="sm" asChild>
                        <Link to="/facturacion">Ver comprobantes</Link>
                      </Button>
                    </CardAction>
                  </CardHeader>
                  <CardContent>
                    <VentasChart data={data.ventas.serie} />
                  </CardContent>
                </Card>
                <Card className="gap-0 pb-0 shadow-none">
                  <CardHeader className="pb-4">
                    <CardTitle>Últimos comprobantes</CardTitle>
                  </CardHeader>
                  {data.ultimos && data.ultimos.length > 0 ? (
                    <ul className="border-t">
                      {data.ultimos.map((u) => (
                        <li key={u.id} className="border-b last:border-b-0">
                          <Link to={`/facturacion/${u.id}`} className="flex items-center justify-between gap-3 px-6 py-2.5 text-sm hover:bg-muted/40">
                            <span className="min-w-0">
                              <span className="block truncate font-medium">{u.cliente}</span>
                              <span className="block text-xs text-muted-foreground">{u.comprobante}</span>
                            </span>
                            <span className={cn("tabular shrink-0 font-medium", u.total < 0 && "text-destructive")}>{formatMoney(u.total)}</span>
                          </Link>
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <CardContent className="pb-6 text-sm text-muted-foreground">Todavía no emitiste comprobantes.</CardContent>
                  )}
                </Card>
              </div>
            )}

            <div className={cn("mt-6 grid grid-cols-1 gap-6 lg:grid-cols-2", data.cobranzas && "2xl:grid-cols-3")}>
              {puede("agenda.ver") && <AgendaHoy />}
              {data.cobranzas && (
                <Card className="gap-0 pb-0 shadow-none">
                  <CardHeader className="pb-4">
                    <CardTitle className="flex items-center gap-2">
                      <AlertTriangle className="size-4 text-destructive" /> Facturas vencidas
                    </CardTitle>
                    <CardDescription>{data.cobranzas.vencidas.length === 0 ? "No hay facturas vencidas" : `Total vencido ${formatMoney(data.cobranzas.vencido)}`}</CardDescription>
                    <CardAction>
                      <Button variant="ghost" size="sm" asChild>
                        <Link to="/cobranzas?tab=vencidas">Ir a cobranzas</Link>
                      </Button>
                    </CardAction>
                  </CardHeader>
                  {data.cobranzas.vencidas.length > 0 && (
                    <ul className="border-t">
                      {data.cobranzas.vencidas.map((v) => (
                        <li key={v.id} className="border-b last:border-b-0">
                          <Link to={`/facturacion/${v.id}`} className="flex items-center justify-between gap-3 px-6 py-2.5 text-sm hover:bg-muted/40">
                            <span className="min-w-0">
                              <span className="block truncate font-medium">{v.cliente}</span>
                              <span className="block text-xs text-muted-foreground">
                                {v.comprobante} · vencida hace {v.diasVencida} {v.diasVencida === 1 ? "día" : "días"}
                              </span>
                            </span>
                            <span className="tabular shrink-0 font-medium">{formatMoney(v.saldo)}</span>
                          </Link>
                        </li>
                      ))}
                    </ul>
                  )}
                </Card>
              )}
              <Card className="gap-0 pb-0 shadow-none">
                <CardHeader className="pb-4">
                  <CardTitle>Reponer stock</CardTitle>
                  <CardDescription>{data.stock.bajoMinimo === 0 ? "Todo el stock está por encima del mínimo" : "Productos por debajo del mínimo"}</CardDescription>
                  <CardAction>
                    <Button variant="ghost" size="sm" asChild>
                      <Link to="/productos">Ver productos</Link>
                    </Button>
                  </CardAction>
                </CardHeader>
                {data.stock.productos.length > 0 && (
                  <ul className="border-t">
                    {data.stock.productos.map((p) => (
                      <li key={p.id} className="border-b last:border-b-0">
                        <Link to={`/productos/${p.id}`} className="flex items-center justify-between gap-3 px-6 py-2.5 text-sm hover:bg-muted/40">
                          <span className="min-w-0">
                            <span className="block truncate font-medium">{p.descripcion}</span>
                            <span className="block text-xs text-muted-foreground">{p.codigo}</span>
                          </span>
                          <span className={cn("tabular shrink-0", p.stock <= 0 ? "font-medium text-destructive" : "text-muted-foreground")}>
                            {formatCantidad(p.stock)} / mín. {formatCantidad(p.stockMinimo)} {p.unidad}
                          </span>
                        </Link>
                      </li>
                    ))}
                  </ul>
                )}
              </Card>
            </div>
          </>
        )}
      </QueryState>
    </>
  );
}
