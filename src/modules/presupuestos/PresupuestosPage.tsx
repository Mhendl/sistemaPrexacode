import { CheckCircle2, Clock, FileText, Plus } from "lucide-react";
import { Link, useNavigate } from "react-router";
import { usePresupuestos } from "@/api/hooks";
import type { PresupuestoApi } from "@/api/types";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { DataTable, type Column } from "@/components/shared/DataTable";
import { KpiCard } from "@/components/shared/KpiCard";
import { PageHeader } from "@/components/shared/PageHeader";
import { QueryState } from "@/components/shared/QueryState";
import { StatusBadge } from "@/components/shared/StatusBadge";
import { formatDate, formatMoney, formatMoneyShort } from "@/lib/format";
import { numeroPresupuesto } from "./PresupuestoHoja";
import { Si } from "@/context/AuthProvider";

const columns: Column<PresupuestoApi>[] = [
  { key: "numero", header: "Número", sortValue: (p) => p.numero, cell: (p) => <span className="tabular font-medium">{numeroPresupuesto(p.numero)}</span> },
  { key: "fecha", header: "Fecha", sortValue: (p) => p.fecha, cell: (p) => <span className="tabular text-muted-foreground">{formatDate(p.fecha)}</span>, hideBelow: "sm" },
  { key: "cliente", header: "Cliente", sortValue: (p) => p.clienteRazonSocial ?? "", cell: (p) => p.clienteRazonSocial },
  { key: "total", header: "Total", align: "right", sortValue: (p) => p.total, cell: (p) => <span className="tabular font-medium whitespace-nowrap">{formatMoney(p.total)}</span> },
  { key: "valido", header: "Válido hasta", sortValue: (p) => p.validoHasta, cell: (p) => <span className="tabular text-muted-foreground">{formatDate(p.validoHasta)}</span>, hideBelow: "md" },
  { key: "estado", header: "Estado", cell: (p) => <StatusBadge status={p.estado} /> },
];

export function PresupuestosPage() {
  const navigate = useNavigate();
  const { data, isLoading, error, refetch } = usePresupuestos();
  const lista = data ?? [];
  const abiertos = lista.filter((p) => p.estado === "Pendiente" || p.estado === "Aceptado");
  const cerrados = lista.filter((p) => ["Aceptado", "Facturado", "Rechazado"].includes(p.estado));
  const ganados = cerrados.filter((p) => p.estado !== "Rechazado").length;

  return (
    <>
      <PageHeader
        title="Presupuestos"
        description="Cotizaciones a clientes. Cuando te aceptan, se pasan a factura con un clic."
        actions={
          <Si permiso="presupuestos.editar">
            <Button asChild>
              <Link to="/presupuestos/nuevo">
                <Plus className="size-4" /> Nuevo presupuesto
              </Link>
            </Button>
          </Si>
        }
      />
      <QueryState isLoading={isLoading} error={error} onRetry={refetch}>
        {lista.length === 0 ? (
          <Card className="items-center gap-3 py-16 text-center shadow-none">
            <div className="flex size-12 items-center justify-center rounded-full bg-primary/10 text-primary">
              <FileText className="size-6" />
            </div>
            <div className="text-lg font-semibold">Todavía no hiciste presupuestos</div>
            <p className="max-w-sm text-sm text-muted-foreground">Armá uno con tus productos o ítems libres, imprimilo o guardalo en PDF para mandárselo al cliente.</p>
            <Button asChild>
              <Link to="/presupuestos/nuevo">
                <Plus className="size-4" /> Hacer el primero
              </Link>
            </Button>
          </Card>
        ) : (
          <>
            <div className="mb-6 grid gap-4 sm:grid-cols-3">
              <KpiCard label="En juego" value={formatMoneyShort(abiertos.reduce((a, p) => a + p.total, 0))} icon={Clock} hint={`${abiertos.length} pendientes o aceptados sin facturar`} />
              <KpiCard label="Tasa de aceptación" value={cerrados.length ? `${Math.round((ganados / cerrados.length) * 100)} %` : "—"} icon={CheckCircle2} tone="success" hint="Aceptados o facturados sobre los que ya tienen respuesta" />
              <KpiCard label="Presupuestos" value={String(lista.length)} icon={FileText} tone="highlight" />
            </div>
            <DataTable
              data={lista}
              columns={columns}
              rowKey={(p) => p.id}
              searchText={(p) => `${numeroPresupuesto(p.numero)} ${p.numero} ${p.clienteRazonSocial ?? ""}`}
              searchPlaceholder="Buscar por número o cliente…"
              filters={[{ key: "estado", label: "Estado", options: ["Pendiente", "Aceptado", "Rechazado", "Vencido", "Facturado"], value: (p) => p.estado }]}
              onRowClick={(p) => navigate(`/presupuestos/${p.id}`)}
              pageSize={20}
            />
          </>
        )}
      </QueryState>
    </>
  );
}
