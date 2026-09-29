import { Link } from "react-router";
import { DataTable, type Column } from "@/components/shared/DataTable";
import { PageHeader } from "@/components/shared/PageHeader";
import { QueryState } from "@/components/shared/QueryState";
import { StatusBadge } from "@/components/shared/StatusBadge";
import { formatDate, formatMoney } from "@/lib/format";
import { usePagosAdmin, type PagoAdmin } from "./api";
import { fechaHora, nombrePlan, usd, usuariosTxt } from "./comun";

const nombreProveedor: Record<string, string> = { mercadopago: "Mercado Pago", simulado: "Simulado", manual: "Manual" };
const concepto = (p: PagoAdmin) => (p.tipo === "cambio" ? "Cambio de plan / usuarios" : p.periodo === "anual" ? "12 meses" : "1 mes");

const columnas: Column<PagoAdmin>[] = [
  { key: "fecha", header: "Fecha", sortValue: (p) => p.createdAt, cell: (p) => <span className="whitespace-nowrap">{fechaHora(p.createdAt)}</span> },
  {
    key: "empresa",
    header: "Empresa",
    sortValue: (p) => p.empresa,
    cell: (p) => (
      <Link to={`/admin/empresas/${p.empresaId}`} className="font-medium hover:underline" onClick={(e) => e.stopPropagation()}>
        {p.empresa}
      </Link>
    ),
  },
  {
    key: "concepto",
    header: "Concepto",
    sortValue: concepto,
    cell: (p) => (
      <div>
        <div>
          {nombrePlan[p.plan]} · {concepto(p)}
          {p.usuariosAdicionales > 0 && <span className="text-muted-foreground"> · +{usuariosTxt(p.usuariosAdicionales)}</span>}
        </div>
        {p.desde && p.hasta && (
          <div className="text-xs text-muted-foreground">
            {formatDate(p.desde)} al {formatDate(p.hasta)}
          </div>
        )}
      </div>
    ),
  },
  { key: "proveedor", header: "Medio", sortValue: (p) => p.proveedor, hideBelow: "md", cell: (p) => nombreProveedor[p.proveedor] ?? p.proveedor },
  { key: "usd", header: "USD", align: "right", sortValue: (p) => p.importeUsd, hideBelow: "lg", cell: (p) => <span className="tabular">{usd(p.importeUsd)}</span> },
  { key: "importe", header: "Importe", align: "right", sortValue: (p) => p.importeArs, cell: (p) => <span className="tabular font-medium">{formatMoney(p.importeArs)}</span> },
  { key: "estado", header: "Estado", sortValue: (p) => p.estado, cell: (p) => <StatusBadge status={p.estado} /> },
];

export function AdminPagos() {
  const { data = [], isLoading, error, refetch } = usePagosAdmin();
  const aprobados = data.filter((p) => p.estado === "Aprobado");
  const total = aprobados.reduce((s, p) => s + p.importeArs, 0);
  return (
    <>
      <PageHeader title="Pagos" description="Todos los cobros de suscripciones: Mercado Pago y los que registraste a mano." />
      <QueryState isLoading={isLoading} error={error} onRetry={refetch}>
        <p className="mb-3 text-sm text-muted-foreground" data-testid="total-pagos">
          {aprobados.length} pagos aprobados por <b className="text-foreground">{formatMoney(total)}</b>
        </p>
        <DataTable
          data={data}
          columns={columnas}
          rowKey={(p) => p.id}
          searchText={(p) => `${p.empresa} ${p.referencia}`}
          searchPlaceholder="Buscar por empresa o referencia…"
          filters={[
            { key: "estado", label: "Estado", options: ["Aprobado", "Pendiente", "Rechazado"], value: (p) => p.estado },
            { key: "medio", label: "Medio", options: ["Mercado Pago", "Manual", "Simulado"], value: (p) => nombreProveedor[p.proveedor] ?? p.proveedor },
          ]}
          pageSize={25}
          emptyText="Todavía no hay pagos."
        />
      </QueryState>
    </>
  );
}
