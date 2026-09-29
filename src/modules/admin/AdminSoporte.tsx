import { ArrowLeft, CheckCircle2 } from "lucide-react";
import { Link, useNavigate, useParams } from "react-router";
import { toast } from "sonner";
import { ApiError } from "@/api/client";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { DataTable, type Column } from "@/components/shared/DataTable";
import { PageHeader } from "@/components/shared/PageHeader";
import { QueryState } from "@/components/shared/QueryState";
import { StatusBadge } from "@/components/shared/StatusBadge";
import { Conversacion, Responder } from "@/modules/soporte/Conversacion";
import { useAccionAdmin, useTicketAdmin, useTicketsAdmin, type TicketAdmin } from "./api";
import { fechaHora } from "./comun";

const columnas: Column<TicketAdmin>[] = [
  { key: "numero", header: "#", sortValue: (t) => t.numero, cell: (t) => <span className="font-mono text-xs">#{t.numero}</span> },
  {
    key: "asunto",
    header: "Pedido",
    sortValue: (t) => t.asunto,
    cell: (t) => (
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-2 font-medium">
          {t.asunto}
          {t.sinLeerSoporte && <span className="rounded-full bg-primary px-2 py-0.5 text-[11px] font-semibold text-primary-foreground">Nuevo</span>}
        </div>
        <div className="text-xs text-muted-foreground">
          {t.empresa} · {t.usuario ?? "usuario borrado"} · {t.categoria}
        </div>
      </div>
    ),
  },
  { key: "estado", header: "Estado", sortValue: (t) => t.estado, cell: (t) => <StatusBadge status={t.estado} /> },
  { key: "actualizado", header: "Último movimiento", sortValue: (t) => t.updatedAt, hideBelow: "md", cell: (t) => <span className="text-xs whitespace-nowrap text-muted-foreground">{fechaHora(t.updatedAt)}</span> },
];

export function AdminSoporte() {
  const { data = [], isLoading, error, refetch } = useTicketsAdmin();
  const navigate = useNavigate();
  const abiertos = data.filter((t) => t.estado === "Abierto").length;
  return (
    <>
      <PageHeader title="Soporte" description={`Pedidos de ayuda de las empresas. ${abiertos ? `${abiertos} esperando tu respuesta.` : "Nada esperando respuesta."}`} />
      <QueryState isLoading={isLoading} error={error} onRetry={refetch}>
        <DataTable
          data={data}
          columns={columnas}
          rowKey={(t) => t.id}
          searchText={(t) => `${t.numero} ${t.asunto} ${t.empresa} ${t.usuario ?? ""} ${t.email ?? ""}`}
          searchPlaceholder="Buscar por número, asunto o empresa…"
          filters={[
            { key: "estado", label: "Estado", options: ["Abierto", "Respondido", "Cerrado"], value: (t) => t.estado },
            { key: "tipo", label: "Tipo", options: ["Problema", "Consulta", "Facturación y pagos", "Sugerencia"], value: (t) => t.categoria },
          ]}
          onRowClick={(t) => navigate(`/admin/soporte/${t.id}`)}
          pageSize={25}
          emptyText="No hay pedidos de soporte."
        />
      </QueryState>
    </>
  );
}

export function AdminTicket() {
  const { id } = useParams();
  const { data: t, isLoading, error, refetch } = useTicketAdmin(id);
  const accion = useAccionAdmin();
  const hacer = async (url: string, body: object, ok: string) => {
    try {
      await accion.mutateAsync({ url, body });
      toast.success(ok);
      return true;
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : "No se pudo completar");
      return false;
    }
  };
  return (
    <>
      <Button variant="ghost" size="sm" asChild className="mb-3 -ml-2 text-muted-foreground">
        <Link to="/admin/soporte">
          <ArrowLeft className="size-4" /> Soporte
        </Link>
      </Button>
      <QueryState isLoading={isLoading} error={error} onRetry={refetch}>
        {t && (
          <div className="grid gap-5 xl:grid-cols-[1fr_280px]">
            <div className="grid min-w-0 content-start gap-5">
              <div>
                <h1 className="text-2xl font-semibold tracking-tight [overflow-wrap:anywhere]">
                  <span className="font-mono text-lg text-muted-foreground">#{t.numero}</span> {t.asunto}
                </h1>
                <p className="text-sm text-muted-foreground">
                  {t.categoria} · abierto el {fechaHora(t.createdAt)}
                </p>
              </div>
              <Conversacion mensajes={t.mensajes} yo="soporte" />
              <Responder
                enviando={accion.isPending}
                placeholder="Tu respuesta (le llega en la campanita y por email)"
                onEnviar={(texto) => hacer(`/plataforma/tickets/${t.id}/responder`, { texto }, "Respuesta enviada")}
                extra={(texto, limpiar) => (
                  <Button
                    type="button"
                    variant="outline"
                    disabled={accion.isPending || texto.trim().length < 2}
                    onClick={async () => {
                      if (await hacer(`/plataforma/tickets/${t.id}/responder`, { texto, cerrar: true }, "Respondido y cerrado")) limpiar();
                    }}
                  >
                    <CheckCircle2 className="size-4" /> Responder y cerrar
                  </Button>
                )}
              />
            </div>
            <Card className="content-start gap-3 p-5 text-sm shadow-none">
              <div className="flex items-center justify-between gap-2">
                <span className="text-muted-foreground">Estado</span>
                <Select value={t.estado} onValueChange={(estado) => hacer(`/plataforma/tickets/${t.id}/estado`, { estado }, `Quedó ${estado.toLowerCase()}`)}>
                  <SelectTrigger className="w-36" aria-label="Estado del pedido">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="Abierto">Abierto</SelectItem>
                    <SelectItem value="Respondido">Respondido</SelectItem>
                    <SelectItem value="Cerrado">Cerrado</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="border-t pt-3">
                <div className="text-muted-foreground">Empresa</div>
                <Link to={`/admin/empresas/${t.empresaId}`} className="font-medium text-primary [overflow-wrap:anywhere] hover:underline">
                  {t.empresa}
                </Link>
              </div>
              <div>
                <div className="text-muted-foreground">Lo pidió</div>
                <div className="[overflow-wrap:anywhere]">
                  {t.usuario ?? "—"}
                  {t.email && <div className="text-xs text-muted-foreground">{t.email}</div>}
                </div>
              </div>
              {t.pantalla && (
                <div>
                  <div className="text-muted-foreground">Pantalla</div>
                  <code className="text-xs [overflow-wrap:anywhere]">{t.pantalla}</code>
                </div>
              )}
            </Card>
          </div>
        )}
      </QueryState>
    </>
  );
}
