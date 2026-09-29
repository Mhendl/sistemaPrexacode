import { useNavigate } from "react-router";
import { useMovimientos } from "@/api/hooks";
import type { MovimientoListadoApi } from "@/api/types";
import { Card } from "@/components/ui/card";
import { DataTable, type Column } from "@/components/shared/DataTable";
import { PageHeader } from "@/components/shared/PageHeader";
import { QueryState } from "@/components/shared/QueryState";
import { formatDate } from "@/lib/format";
import { cn } from "@/lib/utils";
import { formatCantidad, tipoMovimientoLabel } from "./stock";

const columns: Column<MovimientoListadoApi>[] = [
  {
    key: "fecha",
    header: "Fecha",
    sortValue: (m) => m.createdAt,
    cell: (m) => (
      <span className="tabular whitespace-nowrap text-muted-foreground">
        {formatDate(new Date(m.createdAt))} {new Date(m.createdAt).toLocaleTimeString("es-AR", { hour: "2-digit", minute: "2-digit" })}
      </span>
    ),
  },
  {
    key: "producto",
    header: "Producto",
    sortValue: (m) => m.productoDescripcion,
    cell: (m) => (
      <div>
        <div className="font-medium">{m.productoDescripcion}</div>
        <div className="tabular text-xs text-muted-foreground">{m.productoCodigo}</div>
      </div>
    ),
  },
  {
    key: "tipo",
    header: "Movimiento",
    cell: (m) => (
      <div>
        <div>{tipoMovimientoLabel[m.tipo]}</div>
        <div className="text-xs text-muted-foreground">{m.motivo}</div>
      </div>
    ),
    hideBelow: "md",
  },
  {
    key: "cantidad",
    header: "Cantidad",
    align: "right",
    sortValue: (m) => m.cantidad,
    cell: (m) => (
      <span className={cn("tabular font-medium whitespace-nowrap", m.cantidad > 0 ? "text-success" : "text-destructive")}>
        {m.cantidad > 0 ? "+" : ""}
        {formatCantidad(m.cantidad)} {m.unidad}
      </span>
    ),
  },
  { key: "stock", header: "Stock", align: "right", cell: (m) => <span className="tabular">{formatCantidad(m.stockResultante)}</span>, hideBelow: "sm" },
  { key: "usuario", header: "Usuario", cell: (m) => m.usuarioNombre ?? "—", hideBelow: "lg" },
];

export function MovimientosPage() {
  const navigate = useNavigate();
  const { data, isLoading, error, refetch } = useMovimientos();

  return (
    <>
      <PageHeader title="Movimientos de stock" description="Ingresos, egresos y ajustes de todos los productos (últimos 200)." />
      <QueryState isLoading={isLoading} error={error} onRetry={refetch}>
        {data && data.length === 0 ? (
          <Card className="py-16 text-center text-sm text-muted-foreground shadow-none">Todavía no hay movimientos. Se registran desde la ficha de cada producto.</Card>
        ) : (
          <DataTable
            data={data ?? []}
            columns={columns}
            rowKey={(m) => m.id}
            searchText={(m) => `${m.productoCodigo} ${m.productoDescripcion} ${m.motivo} ${m.usuarioNombre ?? ""}`}
            searchPlaceholder="Buscar por producto o motivo…"
            filters={[{ key: "tipo", label: "Tipo", options: ["Ingreso", "Egreso", "Ajuste"], value: (m) => tipoMovimientoLabel[m.tipo] }]}
            onRowClick={(m) => navigate(`/productos/${m.productoId}`)}
            pageSize={20}
          />
        )}
      </QueryState>
    </>
  );
}
