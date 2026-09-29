import { useState } from "react";
import { Pencil, Plus, Users } from "lucide-react";
import { useNavigate, useSearchParams } from "react-router";
import { useClientes } from "@/api/hooks";
import type { ClienteApi } from "@/api/types";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { DataTable, type Column } from "@/components/shared/DataTable";
import { PageHeader } from "@/components/shared/PageHeader";
import { QueryState } from "@/components/shared/QueryState";
import { StatusBadge } from "@/components/shared/StatusBadge";
import { formatCuit } from "@/lib/format";
import { EditarClientesDialog } from "./EditarClientesDialog";
import { ClienteFormDialog } from "./ClienteFormDialog";
import { Si, useRole } from "@/context/AuthProvider";

const columns: Column<ClienteApi>[] = [
  {
    key: "razonSocial",
    header: "Razón social",
    sortValue: (c) => c.razonSocial,
    cell: (c) => (
      <div>
        <div className="font-medium">{c.razonSocial}</div>
        <div className="text-xs text-muted-foreground">{[c.rubro, c.localidad].filter(Boolean).join(" · ") || "—"}</div>
      </div>
    ),
  },
  { key: "cuit", header: "CUIT", sortValue: (c) => c.cuit, cell: (c) => <span className="tabular whitespace-nowrap">{formatCuit(c.cuit)}</span>, hideBelow: "md" },
  { key: "iva", header: "Condición IVA", sortValue: (c) => c.condicionIva, cell: (c) => c.condicionIva, hideBelow: "lg" },
  {
    key: "contacto",
    header: "Contacto",
    cell: (c) => (
      <div>
        <div>{c.contacto ?? "—"}</div>
        <div className="text-xs text-muted-foreground">{c.telefono ?? c.email ?? ""}</div>
      </div>
    ),
    hideBelow: "lg",
  },
  { key: "estado", header: "Estado", cell: (c) => <StatusBadge status={c.estado} /> },
];

export function ClientesPage() {
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const [nuevo, setNuevo] = useState(params.get("nuevo") === "1");
  const { data, isLoading, error, refetch } = useClientes();
  const { puede } = useRole();
  const [elegidos, setElegidos] = useState<Set<string>>(new Set());
  const [editar, setEditar] = useState(false);

  const setOpen = (open: boolean) => {
    setNuevo(open);
    if (!open && params.has("nuevo")) setParams({}, { replace: true });
  };

  return (
    <>
      <PageHeader
        title="Clientes"
        description={data ? `${data.length} ${data.length === 1 ? "cliente" : "clientes"}` : undefined}
        actions={
          <Si permiso="clientes.editar">
            <Button onClick={() => setOpen(true)}>
              <Plus className="size-4" /> Nuevo cliente
            </Button>
          </Si>
        }
      />
      <QueryState isLoading={isLoading} error={error} onRetry={refetch}>
        {data && data.length === 0 ? (
          <Card className="items-center gap-3 py-16 text-center shadow-none">
            <div className="flex size-12 items-center justify-center rounded-full bg-primary/10 text-primary">
              <Users className="size-6" />
            </div>
            <div className="text-lg font-semibold">Todavía no cargaste clientes</div>
            <p className="max-w-sm text-sm text-muted-foreground">Cargá tu primer cliente para empezar a facturarle, agendar visitas y seguir oportunidades.</p>
            <Button onClick={() => setOpen(true)}>
              <Plus className="size-4" /> Cargar el primero
            </Button>
          </Card>
        ) : (
          <DataTable
            data={data ?? []}
            columns={columns}
            rowKey={(c) => c.id}
            searchText={(c) => `${c.razonSocial} ${c.cuit} ${formatCuit(c.cuit)} ${c.contacto ?? ""} ${c.email ?? ""} ${c.localidad ?? ""}`}
            searchPlaceholder="Buscar por nombre, CUIT, contacto…"
            filters={[
              { key: "iva", label: "Condición IVA", options: ["Responsable Inscripto", "Monotributista", "Exento", "Consumidor Final"], value: (c) => c.condicionIva },
              { key: "estado", label: "Estado", options: ["Activo", "Inactivo"], value: (c) => c.estado },
            ]}
            onRowClick={(c) => navigate(`/clientes/${c.id}`)}
            seleccion={
              puede("clientes.editar")
                ? {
                    elegidos,
                    cambiar: setElegidos,
                    acciones: (
                      <Button size="sm" variant="outline" onClick={() => setEditar(true)}>
                        <Pencil className="size-4" /> Editar datos
                      </Button>
                    ),
                  }
                : undefined
            }
          />
        )}
      </QueryState>
      <EditarClientesDialog open={editar} onOpenChange={setEditar} ids={[...elegidos]} alTerminar={() => setElegidos(new Set())} />
      <ClienteFormDialog open={nuevo} onOpenChange={setOpen} onSaved={(c) => navigate(`/clientes/${c.id}`)} />
    </>
  );
}
