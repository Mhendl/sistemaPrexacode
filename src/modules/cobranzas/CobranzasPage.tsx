import { AlertTriangle, HandCoins, Plus, Users, Wallet } from "lucide-react";
import { Link, useNavigate, useSearchParams } from "react-router";
import { usePendientes, useRecibos, useResumenCobranzas } from "@/api/hooks";
import type { PendienteApi, ReciboListadoApi, ResumenCobranzasApi } from "@/api/types";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { DataTable, type Column } from "@/components/shared/DataTable";
import { KpiCard } from "@/components/shared/KpiCard";
import { PageHeader } from "@/components/shared/PageHeader";
import { QueryState } from "@/components/shared/QueryState";
import { StatusBadge } from "@/components/shared/StatusBadge";
import { formatDate, formatMoney, formatMoneyShort } from "@/lib/format";
import { cn } from "@/lib/utils";
import { Si } from "@/context/AuthProvider";

type FilaCliente = ResumenCobranzasApi["clientes"][number];

const TRAMOS: { clave: keyof FilaCliente["tramos"]; label: string; clase: string }[] = [
  { clave: "alDia", label: "Al día", clase: "bg-success" },
  { clave: "d1a30", label: "1–30 días", clase: "bg-warning" },
  { clave: "d31a60", label: "31–60 días", clase: "bg-orange-500" },
  { clave: "d61a90", label: "61–90 días", clase: "bg-destructive/80" },
  { clave: "mas90", label: "+90 días", clase: "bg-destructive" },
];

/** Barra con la deuda repartida por antigüedad */
function BarraAntiguedad({ fila }: { fila: FilaCliente }) {
  if (fila.deuda <= 0) return <span className="text-xs text-muted-foreground">Sin deuda</span>;
  return (
    <div className="w-40">
      <div className="flex h-2 overflow-hidden rounded-full bg-muted">
        {TRAMOS.map((t) => {
          const v = fila.tramos[t.clave];
          return v > 0 ? <div key={t.clave} className={t.clase} style={{ width: `${(v / fila.deuda) * 100}%` }} title={`${t.label}: ${formatMoney(v)}`} /> : null;
        })}
      </div>
      {fila.diasMaxAtraso > 0 && <div className="mt-1 text-[11px] text-destructive">Hasta {fila.diasMaxAtraso} días de atraso</div>}
    </div>
  );
}

export function CobranzasPage() {
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const tab = params.get("tab") ?? "clientes";
  const resumen = useResumenCobranzas();
  const vencidas = usePendientes({ soloVencidas: true });
  const recibos = useRecibos();
  const t = resumen.data?.totales;

  const colClientes: Column<FilaCliente>[] = [
    {
      key: "cliente",
      header: "Cliente",
      sortValue: (f) => f.razonSocial,
      cell: (f) => (
        <div>
          <div className="font-medium">{f.razonSocial}</div>
          <div className="text-xs text-muted-foreground">
            {f.facturasPendientes} {f.facturasPendientes === 1 ? "factura pendiente" : "facturas pendientes"}
            {f.ultimoCobro && ` · último cobro ${formatDate(f.ultimoCobro)}`}
          </div>
        </div>
      ),
    },
    { key: "deuda", header: "Deuda", align: "right", sortValue: (f) => f.deuda, cell: (f) => <span className="tabular font-medium whitespace-nowrap">{formatMoney(f.deuda)}</span> },
    {
      key: "vencido",
      header: "Vencido",
      align: "right",
      sortValue: (f) => f.vencido,
      cell: (f) => <span className={cn("tabular whitespace-nowrap", f.vencido > 0 ? "font-medium text-destructive" : "text-muted-foreground")}>{formatMoney(f.vencido)}</span>,
    },
    { key: "antig", header: "Antigüedad", cell: (f) => <BarraAntiguedad fila={f} />, hideBelow: "md" },
    { key: "favor", header: "A favor", align: "right", cell: (f) => (f.aCuenta > 0 ? <span className="tabular text-success">{formatMoney(f.aCuenta)}</span> : <span className="text-muted-foreground">—</span>), hideBelow: "lg" },
    {
      key: "accion",
      header: "",
      cell: (f) => (
        <Button size="sm" variant="outline" asChild onClick={(e) => e.stopPropagation()}>
          <Link to={`/cobranzas/nuevo?cliente=${f.clienteId}`}>Cobrar</Link>
        </Button>
      ),
    },
  ];

  const colVencidas: Column<PendienteApi>[] = [
    { key: "venc", header: "Venció", sortValue: (p) => p.vencimiento, cell: (p) => <span className="tabular whitespace-nowrap text-muted-foreground">{formatDate(p.vencimiento)}</span> },
    { key: "comp", header: "Comprobante", cell: (p) => <span className="whitespace-nowrap">{p.comprobante}</span> },
    { key: "cliente", header: "Cliente", sortValue: (p) => p.clienteRazonSocial, cell: (p) => p.clienteRazonSocial, hideBelow: "md" },
    { key: "atraso", header: "Atraso", align: "right", sortValue: (p) => p.diasVencida, cell: (p) => <span className="tabular text-destructive">{p.diasVencida} días</span> },
    { key: "saldo", header: "Saldo", align: "right", sortValue: (p) => p.saldo, cell: (p) => <span className="tabular font-medium whitespace-nowrap">{formatMoney(p.saldo)}</span> },
  ];

  const colRecibos: Column<ReciboListadoApi>[] = [
    { key: "numero", header: "Recibo", sortValue: (r) => r.numero, cell: (r) => <span className="tabular font-medium">{String(r.numero).padStart(8, "0")}</span> },
    { key: "fecha", header: "Fecha", sortValue: (r) => r.fecha, cell: (r) => <span className="tabular text-muted-foreground">{formatDate(r.fecha)}</span> },
    { key: "cliente", header: "Cliente", sortValue: (r) => r.clienteRazonSocial, cell: (r) => r.clienteRazonSocial },
    { key: "total", header: "Importe", align: "right", sortValue: (r) => r.total, cell: (r) => <span className="tabular font-medium whitespace-nowrap">{formatMoney(r.total)}</span> },
    { key: "estado", header: "Estado", cell: (r) => <StatusBadge status={r.estado} />, hideBelow: "sm" },
  ];

  return (
    <>
      <PageHeader
        title="Cobranzas"
        description="Cuánto te deben, desde cuándo, y los cobros registrados."
        actions={
          <Si permiso="cobranzas.cobrar">
            <Button asChild>
              <Link to="/cobranzas/nuevo">
                <Plus className="size-4" /> Registrar cobro
              </Link>
            </Button>
          </Si>
        }
      />
      <QueryState isLoading={resumen.isLoading} error={resumen.error} onRetry={resumen.refetch}>
        {t && (
          <div className="mb-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-4" data-testid="kpis-cobranzas">
            <KpiCard label="Por cobrar" value={formatMoneyShort(t.porCobrar)} icon={Wallet} hint={t.clientesConDeuda === 1 ? "1 cliente con deuda" : `${t.clientesConDeuda} clientes con deuda`} />
            <KpiCard label="Vencido" value={formatMoneyShort(t.vencido)} icon={AlertTriangle} tone="danger" hint={t.facturasVencidas === 1 ? "1 factura vencida" : `${t.facturasVencidas} facturas vencidas`} />
            <KpiCard label="Saldos a favor de clientes" value={formatMoneyShort(t.aCuenta)} icon={HandCoins} tone="success" hint="Cobros sin aplicar a facturas" />
            <KpiCard label="Clientes con deuda" value={String(t.clientesConDeuda)} icon={Users} tone="highlight" />
          </div>
        )}
      </QueryState>

      <Tabs value={tab} onValueChange={(v) => setParams({ tab: v }, { replace: true })}>
        <TabsList>
          <TabsTrigger value="clientes">Por cliente</TabsTrigger>
          <TabsTrigger value="vencidas">Facturas vencidas{t?.facturasVencidas ? ` (${t.facturasVencidas})` : ""}</TabsTrigger>
          <TabsTrigger value="recibos">Recibos</TabsTrigger>
        </TabsList>

        <TabsContent value="clientes" className="mt-4">
          {resumen.data && resumen.data.clientes.length === 0 ? (
            <Card className="py-16 text-center text-sm text-muted-foreground shadow-none">Ningún cliente te debe plata. 🎉</Card>
          ) : (
            <DataTable
              data={resumen.data?.clientes ?? []}
              columns={colClientes}
              rowKey={(f) => f.clienteId}
              searchText={(f) => `${f.razonSocial} ${f.cuit}`}
              searchPlaceholder="Buscar cliente…"
              onRowClick={(f) => navigate(`/clientes/${f.clienteId}`)}
            />
          )}
          <div className="mt-3 flex flex-wrap gap-4 text-xs text-muted-foreground">
            {TRAMOS.map((x) => (
              <span key={x.clave} className="flex items-center gap-1.5">
                <span className={cn("size-2.5 rounded-full", x.clase)} /> {x.label}
              </span>
            ))}
          </div>
        </TabsContent>

        <TabsContent value="vencidas" className="mt-4">
          <QueryState isLoading={vencidas.isLoading} error={vencidas.error} onRetry={vencidas.refetch}>
            <DataTable
              data={vencidas.data ?? []}
              columns={colVencidas}
              rowKey={(p) => p.id}
              searchText={(p) => `${p.comprobante} ${p.clienteRazonSocial}`}
              searchPlaceholder="Buscar por cliente o número…"
              onRowClick={(p) => navigate(`/facturacion/${p.id}`)}
              emptyText="No hay facturas vencidas."
            />
          </QueryState>
        </TabsContent>

        <TabsContent value="recibos" className="mt-4">
          <QueryState isLoading={recibos.isLoading} error={recibos.error} onRetry={recibos.refetch}>
            <DataTable
              data={recibos.data ?? []}
              columns={colRecibos}
              rowKey={(r) => r.id}
              searchText={(r) => `${r.numero} ${r.clienteRazonSocial}`}
              searchPlaceholder="Buscar por número o cliente…"
              onRowClick={(r) => navigate(`/cobranzas/recibos/${r.id}`)}
              emptyText="Todavía no hay recibos."
            />
          </QueryState>
        </TabsContent>
      </Tabs>
    </>
  );
}
