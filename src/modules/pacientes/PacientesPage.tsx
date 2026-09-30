import { useState } from "react";
import { Contact, Plus } from "lucide-react";
import { useNavigate } from "react-router";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { DataTable, type Column } from "@/components/shared/DataTable";
import { PageHeader } from "@/components/shared/PageHeader";
import { QueryState } from "@/components/shared/QueryState";
import { StatusBadge } from "@/components/shared/StatusBadge";
import { Si } from "@/context/AuthProvider";
import { nombreCompleto, usePacientes, type PacienteFila } from "./api";
import { PacienteFormDialog } from "./PacienteFormDialog";

export const formatDni = (dni: string | null) => (dni ? Number(dni).toLocaleString("es-AR") : "—");

const columnas: Column<PacienteFila>[] = [
  {
    key: "paciente",
    header: "Paciente",
    sortValue: (p) => `${p.apellido} ${p.nombre}`,
    cell: (p) => (
      <div>
        <div className="flex items-center gap-2 font-medium">
          {nombreCompleto(p)}
          {p.datosPendientes && <span className="rounded bg-warning/15 px-1.5 py-0.5 text-[10px] font-semibold text-warning uppercase">Faltan datos</span>}
        </div>
        <div className="text-xs text-muted-foreground">{p.edad !== null ? `${p.edad} años` : "Sin fecha de nacimiento"}</div>
      </div>
    ),
  },
  { key: "dni", header: "DNI", sortValue: (p) => p.dni ?? "", cell: (p) => <span className="tabular">{formatDni(p.dni)}</span>, hideBelow: "md" },
  {
    key: "cobertura",
    header: "Cobertura",
    sortValue: (p) => p.obraSocial ?? "",
    cell: (p) => (p.obraSocial ? `${p.obraSocial}${p.plan ? ` · ${p.plan}` : ""}` : <span className="text-muted-foreground">Particular</span>),
    hideBelow: "md",
  },
  { key: "telefono", header: "Teléfono", cell: (p) => p.telefono ?? "—", hideBelow: "lg" },
  { key: "estado", header: "Estado", cell: (p) => <StatusBadge status={p.estado} />, hideBelow: "sm" },
];

export function PacientesPage() {
  const navigate = useNavigate();
  const [nuevo, setNuevo] = useState(false);
  const { data, isLoading, error, refetch } = usePacientes();
  const coberturas = [...new Set((data ?? []).map((p) => p.obraSocial ?? "Particular"))].sort();

  return (
    <>
      <PageHeader
        title="Pacientes"
        description={data ? `${data.length} ${data.length === 1 ? "paciente" : "pacientes"}` : undefined}
        actions={
          <Si permiso="pacientes.editar">
            <Button onClick={() => setNuevo(true)}>
              <Plus className="size-4" /> Nuevo paciente
            </Button>
          </Si>
        }
      />
      <QueryState isLoading={isLoading} error={error} onRetry={refetch}>
        {data && data.length === 0 ? (
          <Card className="items-center gap-3 py-16 text-center shadow-none">
            <div className="flex size-12 items-center justify-center rounded-full bg-primary/10 text-primary">
              <Contact className="size-6" />
            </div>
            <div className="text-lg font-semibold">Todavía no cargaste pacientes</div>
            <p className="max-w-sm text-sm text-muted-foreground">Cargá tu primer paciente, o dale un turno a alguien nuevo desde Turnos y se da de alta solo.</p>
            <Si permiso="pacientes.editar">
              <Button onClick={() => setNuevo(true)}>
                <Plus className="size-4" /> Cargar el primero
              </Button>
            </Si>
          </Card>
        ) : (
          <DataTable
            data={data ?? []}
            columns={columnas}
            rowKey={(p) => p.id}
            searchText={(p) => `${p.apellido} ${p.nombre} ${p.nombre} ${p.apellido} ${p.dni ?? ""} ${formatDni(p.dni)} ${p.telefono ?? ""} ${p.obraSocial ?? ""}`}
            searchPlaceholder="Buscar por nombre, DNI o teléfono…"
            filters={[
              { key: "cobertura", label: "Cobertura", options: coberturas, value: (p) => p.obraSocial ?? "Particular" },
              { key: "estado", label: "Estado", options: ["Activo", "Inactivo"], value: (p) => p.estado },
            ]}
            onRowClick={(p) => navigate(`/pacientes/${p.id}`)}
            pageSize={25}
            emptyText="No hay pacientes con esos filtros."
          />
        )}
      </QueryState>
      <PacienteFormDialog open={nuevo} onOpenChange={setNuevo} onSaved={(p) => navigate(`/pacientes/${p.id}`)} />
    </>
  );
}
