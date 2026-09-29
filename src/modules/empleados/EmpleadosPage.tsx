import { useState } from "react";
import { BadgeDollarSign, CalendarClock, Plus, Users } from "lucide-react";
import { useNavigate } from "react-router";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { DataTable, type Column } from "@/components/shared/DataTable";
import { KpiCard } from "@/components/shared/KpiCard";
import { PageHeader } from "@/components/shared/PageHeader";
import { QueryState } from "@/components/shared/QueryState";
import { StatusBadge } from "@/components/shared/StatusBadge";
import { Si } from "@/context/AuthProvider";
import { formatDate, formatMoney, formatMoneyShort } from "@/lib/format";
import { useEmpleados, type EmpleadoFila } from "./api";
import { EmpleadoFormDialog } from "./EmpleadoFormDialog";

export const nombreCompleto = (e: { nombre: string; apellido: string }) => `${e.apellido}, ${e.nombre}`;
const MESES = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"];
export const nombreMes = (periodo: string) => `${MESES[Number(periodo.slice(5, 7)) - 1]} ${periodo.slice(0, 4)}`;

/** Años y meses desde el ingreso */
export function antiguedad(desde: string, hasta = new Date().toISOString().slice(0, 10)) {
  const [a1, m1] = desde.split("-").map(Number) as [number, number];
  const [a2, m2] = hasta.split("-").map(Number) as [number, number];
  const meses = Math.max(0, (a2 - a1) * 12 + (m2 - m1));
  const anios = Math.floor(meses / 12);
  const resto = meses % 12;
  if (anios === 0) return `${resto} ${resto === 1 ? "mes" : "meses"}`;
  return `${anios} ${anios === 1 ? "año" : "años"}${resto ? ` y ${resto} ${resto === 1 ? "mes" : "meses"}` : ""}`;
}

const columnas: Column<EmpleadoFila>[] = [
  {
    key: "nombre",
    header: "Empleado",
    sortValue: (e) => nombreCompleto(e),
    cell: (e) => (
      <div className="min-w-0">
        <div className="font-medium">{nombreCompleto(e)}</div>
        <div className="text-xs text-muted-foreground">{e.puesto ?? "Sin puesto"}</div>
      </div>
    ),
  },
  { key: "ingreso", header: "Antigüedad", sortValue: (e) => e.fechaIngreso, hideBelow: "md", cell: (e) => <span className="whitespace-nowrap">{antiguedad(e.fechaIngreso, e.fechaEgreso ?? undefined)}</span> },
  {
    key: "sueldo",
    header: "Sueldo",
    align: "right",
    sortValue: (e) => e.sueldo,
    cell: (e) => (
      <span className="tabular whitespace-nowrap">
        {formatMoney(e.sueldo)}
        <span className="block text-xs text-muted-foreground">{e.modalidad === "Por hora" ? "por hora" : e.modalidad.toLowerCase()}</span>
      </span>
    ),
  },
  {
    key: "mes",
    header: "Este mes",
    sortValue: (e) => (e.estado !== "Activo" ? 2 : e.sueldoPagado ? 1 : 0),
    cell: (e) =>
      e.estado !== "Activo" ? (
        <StatusBadge status="Baja" />
      ) : (
        <div>
          <StatusBadge status={e.sueldoPagado ? "Pagado" : "Pendiente"} />
          {e.adelantosMes > 0 && <div className="mt-0.5 text-xs text-muted-foreground">Adelantos: {formatMoney(e.adelantosMes)}</div>}
        </div>
      ),
  },
];

export function EmpleadosPage() {
  const navigate = useNavigate();
  const { data, isLoading, error, refetch } = useEmpleados();
  const [nuevo, setNuevo] = useState(false);
  const r = data?.resumen;
  return (
    <>
      <PageHeader
        title="Empleados y sueldos"
        description="Legajos, pagos de sueldo, adelantos y vacaciones. No reemplaza la liquidación legal de tu contador."
        actions={
          <Si permiso="empleados.editar">
            <Button onClick={() => setNuevo(true)}>
              <Plus className="size-4" /> Nuevo empleado
            </Button>
          </Si>
        }
      />
      <QueryState isLoading={isLoading} error={error} onRetry={refetch}>
        {data && r && (
          <div className="grid gap-6">
            <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4" data-testid="kpis-empleados">
              <KpiCard label="Empleados activos" value={String(r.activos)} icon={Users} />
              <KpiCard label="Sueldos por mes" value={formatMoneyShort(r.sueldosMensuales)} icon={BadgeDollarSign} hint="Suma de los básicos (sin los por hora)" />
              <KpiCard label="Pagado este mes" value={formatMoneyShort(r.pagadoMes)} icon={BadgeDollarSign} tone="success" hint="Sueldos, adelantos y extras" />
              <KpiCard label="Sueldos por pagar" value={String(r.sueldosPendientes)} icon={CalendarClock} tone={r.sueldosPendientes ? "warning" : "default"} hint={`de ${nombreMes(r.mes)}`} />
            </div>
            {data.empleados.length === 0 ? (
              <Card className="items-center gap-3 py-16 text-center shadow-none">
                <Users className="size-8 text-primary" />
                <p className="text-sm text-muted-foreground">Todavía no cargaste empleados.</p>
                <Si permiso="empleados.editar">
                  <Button variant="outline" onClick={() => setNuevo(true)}>
                    Cargar el primero
                  </Button>
                </Si>
              </Card>
            ) : (
              <DataTable
                data={data.empleados}
                columns={columnas}
                rowKey={(e) => e.id}
                searchText={(e) => `${e.nombre} ${e.apellido} ${e.puesto ?? ""} ${e.cuil ?? ""}`}
                searchPlaceholder="Buscar por nombre, puesto o CUIL…"
                filters={[{ key: "estado", label: "Estado", options: ["Activo", "Baja"], value: (e) => e.estado }]}
                onRowClick={(e) => navigate(`/empleados/${e.id}`)}
                pageSize={20}
              />
            )}
            <p className="text-xs text-muted-foreground">Fecha de hoy: {formatDate(new Date())}. Los comprobantes de pago son internos: no reemplazan el recibo de sueldo legal.</p>
          </div>
        )}
      </QueryState>
      <EmpleadoFormDialog open={nuevo} onOpenChange={setNuevo} onGuardado={(e) => navigate(`/empleados/${e.id}`)} />
    </>
  );
}
