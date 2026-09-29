import { Link } from "react-router";
import { DataTable, type Column } from "@/components/shared/DataTable";
import { PageHeader } from "@/components/shared/PageHeader";
import { QueryState } from "@/components/shared/QueryState";
import { useAuditoriaAdmin, type AuditoriaAdmin } from "./api";
import { fechaHora } from "./comun";

export const nombreAccion: Record<string, string> = {
  extender: "Extendió el plazo",
  "pago-manual": "Registró un pago",
  "cambiar-plan": "Cambió el plan",
  suspender: "Suspendió la empresa",
  reactivar: "Reactivó la empresa",
  "resolver-solicitud": "Resolvió una solicitud",
  "responder-ticket": "Respondió un pedido de soporte",
  "estado-ticket": "Cambió el estado de un pedido de soporte",
};

/** Detalle legible de una acción (solo los valores simples) */
export const detalleAccion = (a: AuditoriaAdmin) =>
  Object.entries(a.detalle)
    .filter(([, v]) => v !== null && typeof v !== "object")
    .map(([k, v]) => `${k}: ${String(v)}`)
    .join(" · ");

const columnas: Column<AuditoriaAdmin>[] = [
  { key: "fecha", header: "Fecha", sortValue: (a) => a.createdAt, cell: (a) => <span className="whitespace-nowrap">{fechaHora(a.createdAt)}</span> },
  { key: "admin", header: "Quién", sortValue: (a) => a.adminEmail, hideBelow: "md", cell: (a) => a.adminEmail },
  { key: "accion", header: "Acción", sortValue: (a) => a.accion, cell: (a) => nombreAccion[a.accion] ?? a.accion },
  {
    key: "empresa",
    header: "Empresa",
    sortValue: (a) => a.empresa ?? "",
    cell: (a) =>
      a.empresaId ? (
        <Link to={`/admin/empresas/${a.empresaId}`} className="hover:underline">
          {a.empresa}
        </Link>
      ) : (
        "—"
      ),
  },
  { key: "detalle", header: "Detalle", hideBelow: "lg", cell: (a) => <span className="line-clamp-2 text-xs text-muted-foreground">{detalleAccion(a)}</span> },
];

export function AdminAuditoria() {
  const { data = [], isLoading, error, refetch } = useAuditoriaAdmin();
  return (
    <>
      <PageHeader title="Auditoría" description="Todo lo que se hizo desde este panel, quién lo hizo y cuándo. No se puede borrar." />
      <QueryState isLoading={isLoading} error={error} onRetry={refetch}>
        <DataTable
          data={data}
          columns={columnas}
          rowKey={(a) => a.id}
          searchText={(a) => `${a.adminEmail} ${a.empresa ?? ""} ${nombreAccion[a.accion] ?? a.accion} ${detalleAccion(a)}`}
          searchPlaceholder="Buscar por empresa, persona o acción…"
          filters={[{ key: "accion", label: "Acción", options: Object.values(nombreAccion), value: (a) => nombreAccion[a.accion] ?? a.accion }]}
          pageSize={25}
          emptyText="Todavía no hay acciones registradas."
        />
      </QueryState>
    </>
  );
}
