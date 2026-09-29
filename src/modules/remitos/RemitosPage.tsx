import { Plus, Truck } from "lucide-react";
import { Link, useNavigate } from "react-router";
import { useRemitos } from "@/api/hooks";
import type { RemitoListadoApi } from "@/api/types";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { DataTable, type Column } from "@/components/shared/DataTable";
import { PageHeader } from "@/components/shared/PageHeader";
import { QueryState } from "@/components/shared/QueryState";
import { StatusBadge } from "@/components/shared/StatusBadge";
import { formatDate } from "@/lib/format";
import { numeroRemito } from "./RemitoHoja";
import { Si } from "@/context/AuthProvider";

const columns: Column<RemitoListadoApi>[] = [
  { key: "numero", header: "Número", sortValue: (r) => r.numero, cell: (r) => <span className="tabular font-medium whitespace-nowrap">{numeroRemito(r)}</span> },
  { key: "fecha", header: "Fecha", sortValue: (r) => r.fecha, cell: (r) => <span className="tabular text-muted-foreground">{formatDate(r.fecha)}</span> },
  { key: "cliente", header: "Cliente", sortValue: (r) => r.clienteRazonSocial, cell: (r) => r.clienteRazonSocial },
  { key: "items", header: "Ítems", align: "right", cell: (r) => <span className="tabular">{r.items}</span>, hideBelow: "sm" },
  { key: "estado", header: "Estado", cell: (r) => <StatusBadge status={r.estado} /> },
];

export function RemitosPage() {
  const navigate = useNavigate();
  const { data, isLoading, error, refetch } = useRemitos();

  return (
    <>
      <PageHeader
        title="Remitos"
        description="Entregas de mercadería. Al emitir se descuenta el stock; al anular, se devuelve."
        actions={
          <Si permiso="remitos.emitir">
            <Button asChild>
              <Link to="/remitos/nuevo">
                <Plus className="size-4" /> Nuevo remito
              </Link>
            </Button>
          </Si>
        }
      />
      <QueryState isLoading={isLoading} error={error} onRetry={refetch}>
        {data && data.length === 0 ? (
          <Card className="items-center gap-3 py-16 text-center shadow-none">
            <div className="flex size-12 items-center justify-center rounded-full bg-primary/10 text-primary">
              <Truck className="size-6" />
            </div>
            <div className="text-lg font-semibold">Todavía no hay remitos</div>
            <p className="max-w-sm text-sm text-muted-foreground">Elegí un cliente y los productos a entregar: el sistema numera, descuenta stock y te deja imprimirlo.</p>
            <Button asChild>
              <Link to="/remitos/nuevo">
                <Plus className="size-4" /> Emitir el primero
              </Link>
            </Button>
          </Card>
        ) : (
          <DataTable
            data={data ?? []}
            columns={columns}
            rowKey={(r) => r.id}
            searchText={(r) => `${numeroRemito(r)} ${r.numero} ${r.clienteRazonSocial}`}
            searchPlaceholder="Buscar por número o cliente…"
            filters={[{ key: "estado", label: "Estado", options: ["Emitido", "Anulado"], value: (r) => r.estado }]}
            onRowClick={(r) => navigate(`/remitos/${r.id}`)}
            pageSize={20}
          />
        )}
      </QueryState>
    </>
  );
}
