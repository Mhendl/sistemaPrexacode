import { FlaskConical, Plus, Receipt } from "lucide-react";
import { Link, useNavigate } from "react-router";
import { useComprobantes, useConfigFacturacion } from "@/api/hooks";
import type { ComprobanteApi } from "@/api/types";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { DataTable, type Column } from "@/components/shared/DataTable";
import { PageHeader } from "@/components/shared/PageHeader";
import { QueryState } from "@/components/shared/QueryState";
import { StatusBadge } from "@/components/shared/StatusBadge";
import { useRole, Si } from "@/context/AuthProvider";
import { formatDate, formatMoney } from "@/lib/format";
import { numeroComprobante } from "@/lib/facturacion";
import { cn } from "@/lib/utils";

const firmado = (c: ComprobanteApi) => (c.clase === "nota_credito" ? -c.total : c.total);

const columns: Column<ComprobanteApi>[] = [
  { key: "fecha", header: "Fecha", sortValue: (c) => c.fecha, cell: (c) => <span className="tabular text-muted-foreground">{formatDate(c.fecha)}</span> },
  {
    key: "comp",
    header: "Comprobante",
    sortValue: (c) => `${c.tipoCbte}-${c.puntoVenta}-${String(c.numero ?? 0).padStart(8, "0")}`,
    cell: (c) => (
      <div>
        <div className="font-medium whitespace-nowrap">{c.tipo}</div>
        <div className="tabular text-xs text-muted-foreground">{numeroComprobante(c.puntoVenta, c.numero)}</div>
      </div>
    ),
  },
  { key: "cliente", header: "Cliente", sortValue: (c) => c.receptor.razonSocial, cell: (c) => c.receptor.razonSocial, hideBelow: "md" },
  {
    key: "total",
    header: "Total",
    align: "right",
    sortValue: firmado,
    cell: (c) => <span className={cn("tabular font-medium whitespace-nowrap", c.clase === "nota_credito" && "text-destructive")}>{formatMoney(firmado(c))}</span>,
  },
  { key: "estado", header: "ARCA", cell: (c) => <StatusBadge status={c.estado} />, hideBelow: "sm" },
  {
    key: "cobro",
    header: "Cobro",
    sortValue: (c) => c.saldo ?? -1,
    cell: (c) =>
      c.estadoCobro ? (
        <div className="whitespace-nowrap">
          <StatusBadge status={c.estadoCobro} />
          {c.saldo !== null && c.saldo > 0 && c.estadoCobro !== "Impaga" && <div className="tabular mt-0.5 text-xs text-muted-foreground">Debe {formatMoney(c.saldo)}</div>}
        </div>
      ) : (
        <span className="text-muted-foreground">—</span>
      ),
  },
];

/** Aviso cuando la empresa todavía factura con el simulador */
export function AvisoModoPrueba({ modo }: { modo?: string }) {
  const { puede } = useRole();
  if (!modo || modo === "produccion") return null;
  return (
    <div className="mb-5 flex items-start gap-2.5 rounded-lg border border-warning/50 bg-warning/10 px-3 py-2.5 text-sm" data-testid="aviso-modo-prueba">
      <FlaskConical className="mt-0.5 size-4 shrink-0 text-warning-ink" />
      <span>
        <b>{modo === "simulado" ? "Facturación en modo de prueba." : "Conectado a ARCA homologación."}</b>{" "}
        <span className="text-muted-foreground">
          Los comprobantes que emitas no tienen validez fiscal.
          {puede("configuracion") && (
            <>
              {" "}
              Para facturar de verdad, conectá tu certificado en{" "}
              <Link to="/configuracion?tab=arca" className="text-primary hover:underline">
                Configuración → Facturación ARCA
              </Link>
              .
            </>
          )}
        </span>
      </span>
    </div>
  );
}

export function FacturacionPage() {
  const navigate = useNavigate();
  const { data: config } = useConfigFacturacion();
  const { data, isLoading, error, refetch } = useComprobantes();

  return (
    <>
      <AvisoModoPrueba modo={config?.modo} />
      <PageHeader
        title="Facturación"
        description="Facturas y notas de crédito electrónicas"
        actions={
          <Si permiso="facturacion.emitir">
            <Button asChild>
              <Link to="/facturacion/nueva">
                <Plus className="size-4" /> Nueva factura
              </Link>
            </Button>
          </Si>
        }
      />
      <QueryState isLoading={isLoading} error={error} onRetry={refetch}>
        {data && data.length === 0 ? (
          <Card className="items-center gap-3 py-16 text-center shadow-none">
            <div className="flex size-12 items-center justify-center rounded-full bg-primary/10 text-primary">
              <Receipt className="size-6" />
            </div>
            <div className="text-lg font-semibold">Todavía no emitiste comprobantes</div>
            <p className="max-w-sm text-sm text-muted-foreground">El tipo (A, B o C) se elige solo según tu condición de IVA y la del cliente.</p>
            <Button asChild>
              <Link to="/facturacion/nueva">
                <Plus className="size-4" /> Emitir la primera
              </Link>
            </Button>
          </Card>
        ) : (
          <DataTable
            data={data ?? []}
            columns={columns}
            rowKey={(c) => c.id}
            searchText={(c) => `${c.tipo} ${numeroComprobante(c.puntoVenta, c.numero)} ${c.receptor.razonSocial} ${c.receptor.cuit} ${c.cae ?? ""}`}
            searchPlaceholder="Buscar por número, cliente, CUIT o CAE…"
            filters={[
              { key: "tipo", label: "Tipo", options: [...new Set((data ?? []).map((c) => c.tipo))].sort(), value: (c) => c.tipo },
              { key: "estado", label: "ARCA", options: ["Autorizado", "Rechazado"], value: (c) => c.estado },
              { key: "cobro", label: "Cobro", options: ["Impaga", "Parcial", "Vencida", "Pagada"], value: (c) => c.estadoCobro ?? "" },
            ]}
            onRowClick={(c) => navigate(`/facturacion/${c.id}`)}
            pageSize={20}
          />
        )}
      </QueryState>
    </>
  );
}
