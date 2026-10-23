import { useNavigate } from "react-router";
import { DataTable, type Column } from "@/components/shared/DataTable";
import { PageHeader } from "@/components/shared/PageHeader";
import { QueryState } from "@/components/shared/QueryState";
import { formatCuit, formatDate, formatMoney } from "@/lib/format";
import { useEmpresasAdmin, type EmpresaAdmin } from "./api";
import { cn } from "@/lib/utils";
import { EstadoEmpresa, fechaHora, haceCuanto, nombreEstado, nombrePlan, usd } from "./comun";

const columnas: Column<EmpresaAdmin>[] = [
  {
    key: "empresa",
    header: "Empresa",
    sortValue: (e) => e.razonSocial,
    cell: (e) => (
      <div className="min-w-0">
        <div className="flex items-center gap-2 font-medium">
          {e.razonSocial}
          {e.producto === "dental" && <span className="rounded bg-highlight/15 px-1.5 py-0.5 text-[10px] font-semibold text-highlight uppercase">CoreDental</span>}
        </div>
        <div className="text-xs text-muted-foreground">
          {formatCuit(e.cuit)} · {e.admin?.email ?? "sin administrador"}
        </div>
      </div>
    ),
  },
  { key: "estado", header: "Estado", sortValue: (e) => (e.suspendida ? "Suspendido" : nombreEstado[e.estado]), cell: (e) => <EstadoEmpresa estado={e.estado} suspendida={e.suspendida} baja={e.bajaSolicitada} /> },
  {
    key: "plan",
    header: "Plan",
    sortValue: (e) => e.mensualUsd,
    cell: (e) => (
      <div>
        <div>
          {e.planNombre} {e.periodo === "anual" && <span className="text-xs text-muted-foreground">(anual)</span>}
        </div>
        <div className="text-xs text-muted-foreground">
          {usd(e.mensualUsd)}/mes{e.planProximo && ` · pasa a ${nombrePlan[e.planProximo]}`}
        </div>
      </div>
    ),
  },
  {
    key: "usuarios",
    header: "Usuarios",
    align: "right",
    sortValue: (e) => e.usuariosActivos,
    cell: (e) => (
      <span className={e.usuariosActivos >= e.limiteUsuarios ? "font-medium text-warning-ink" : undefined}>
        {e.usuariosActivos} / {e.limiteUsuarios}
        {e.sesionesPisadas > 0 && (
          <span className="block text-xs text-warning-ink" title="Veces que alguien siguió usando un usuario que ya estaba abierto en otro dispositivo">
            ¿compartido? ({e.sesionesPisadas})
          </span>
        )}
      </span>
    ),
  },
  { key: "vence", header: "Vence", sortValue: (e) => e.vence, hideBelow: "md", cell: (e) => <span className="whitespace-nowrap">{formatDate(e.vence)} <span className="text-xs text-muted-foreground">({e.diasRestantes} d)</span></span> },
  { key: "uso", header: "Facturó este mes", align: "right", sortValue: (e) => e.facturadoMes, hideBelow: "lg", cell: (e) => <span className="tabular whitespace-nowrap">{formatMoney(e.facturadoMes)}</span> },
  { key: "pagado", header: "Nos pagó", align: "right", sortValue: (e) => e.pagadoTotal, hideBelow: "md", cell: (e) => <span className="tabular whitespace-nowrap">{formatMoney(e.pagadoTotal)}</span> },
  {
    key: "actividad",
    header: "Actividad",
    sortValue: (e) => e.ultimaActividad ?? "",
    hideBelow: "md",
    cell: (e) => (
      <span className="block whitespace-nowrap text-xs" title={e.ultimaActividad ? `Última vez: ${fechaHora(e.ultimaActividad)}` : "Nadie usó el sistema todavía"} data-testid="actividad-empresa-lista">
        <span className={cn("font-medium", !e.ultimaActividad ? "text-muted-foreground" : e.diasActivos7 >= 3 ? "text-success" : e.diasActivos7 === 0 ? "text-warning-ink" : "")}>{haceCuanto(e.ultimaActividad)}</span>
        <span className="block text-muted-foreground">
          {e.diasActivos7} de 7 días{e.cambios7 > 0 && ` · ${e.cambios7} cambios`}
        </span>
      </span>
    ),
  },
];

export function AdminEmpresas() {
  const navigate = useNavigate();
  const { data, isLoading, error, refetch } = useEmpresasAdmin();
  return (
    <>
      <PageHeader title="Empresas" description="Todas las empresas registradas. Tocá una para ver el detalle y administrarla." />
      <QueryState isLoading={isLoading} error={error} onRetry={refetch}>
        <DataTable
          data={data ?? []}
          columns={columnas}
          rowKey={(e) => e.id}
          searchText={(e) => `${e.razonSocial} ${e.cuit} ${e.admin?.email ?? ""} ${e.admin?.nombre ?? ""}`}
          searchPlaceholder="Buscar por nombre, CUIT o email…"
          filters={[
            { key: "estado", label: "Estado", options: ["Prueba gratis", "Activa", "Vencida (en gracia)", "Solo lectura", "Suspendido"], value: (e) => (e.suspendida ? "Suspendido" : nombreEstado[e.estado]) },
            { key: "producto", label: "Producto", options: ["Prexacode", "CoreDental"], value: (e) => (e.producto === "dental" ? "CoreDental" : "Prexacode") },
            { key: "plan", label: "Plan", options: ["Básico", "Profesional", "Empresa"], value: (e) => nombrePlan[e.plan] ?? e.planNombre },
          ]}
          onRowClick={(e) => navigate(`/admin/empresas/${e.id}`)}
          pageSize={25}
          emptyText="No hay empresas con esos filtros."
        />
      </QueryState>
    </>
  );
}
