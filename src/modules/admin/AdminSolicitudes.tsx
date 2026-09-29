import { useState } from "react";
import { Link } from "react-router";
import { toast } from "sonner";
import { ApiError } from "@/api/client";
import type { SolicitudLegalApi } from "@/api/types";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { PageHeader } from "@/components/shared/PageHeader";
import { QueryState } from "@/components/shared/QueryState";
import { StatusBadge } from "@/components/shared/StatusBadge";
import { formatCuit } from "@/lib/format";
import { useAccionAdmin, useSolicitudesAdmin } from "./api";
import { fechaHora } from "./comun";

export function AdminSolicitudes() {
  const { data = [], isLoading, error, refetch } = useSolicitudesAdmin();
  const pendientes = data.filter((s) => s.estado === "Pendiente");
  const resueltas = data.filter((s) => s.estado !== "Pendiente");
  return (
    <>
      <PageHeader title="Baja y arrepentimiento" description="Pedidos hechos con los botones legales. Por ley hay que responderlos: dejá anotado cómo se resolvió cada uno." />
      <QueryState isLoading={isLoading} error={error} onRetry={refetch}>
        {data.length === 0 ? (
          <p className="py-10 text-center text-sm text-muted-foreground">No hay pedidos de baja ni de arrepentimiento.</p>
        ) : (
          <div className="grid gap-6">
            <section className="grid gap-3">
              <h2 className="text-sm font-semibold">Pendientes ({pendientes.length})</h2>
              {pendientes.length === 0 && <p className="text-sm text-muted-foreground">Nada pendiente.</p>}
              {pendientes.map((s) => (
                <SolicitudFila key={s.id} s={s} />
              ))}
            </section>
            {resueltas.length > 0 && (
              <section className="grid gap-3">
                <h2 className="text-sm font-semibold">Resueltas ({resueltas.length})</h2>
                {resueltas.map((s) => (
                  <SolicitudFila key={s.id} s={s} />
                ))}
              </section>
            )}
          </div>
        )}
      </QueryState>
    </>
  );
}

function SolicitudFila({ s }: { s: SolicitudLegalApi }) {
  const accion = useAccionAdmin();
  const [nota, setNota] = useState("");
  return (
    <Card className="gap-2 p-4 shadow-none" data-testid="solicitud-legal">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap items-center gap-2">
          <span className="font-mono text-sm font-semibold">{s.codigo}</span>
          <StatusBadge status={s.estado} />
          <span className="text-sm text-muted-foreground">{s.tipo === "baja" ? "Baja" : "Arrepentimiento"}</span>
        </div>
        <span className="text-xs text-muted-foreground">{fechaHora(s.createdAt)}</span>
      </div>
      <div className="text-sm break-words">
        {s.nombre} · {s.email}
        {s.cuit && ` · CUIT ${formatCuit(s.cuit)}`}
        {s.empresa && s.empresaId && (
          <>
            {" · "}
            <Link to={`/admin/empresas/${s.empresaId}`} className="text-primary hover:underline">
              {s.empresa}
            </Link>
          </>
        )}
      </div>
      {s.motivo && <p className="text-sm text-muted-foreground italic">"{s.motivo}"</p>}
      {s.estado === "Resuelta" ? (
        s.nota && (
          <p className="text-xs text-muted-foreground">
            Resuelta {s.resueltaEn ? `el ${fechaHora(s.resueltaEn)}` : ""}: {s.nota}
          </p>
        )
      ) : (
        <form
          className="mt-1 flex flex-col gap-2 sm:flex-row"
          onSubmit={async (e) => {
            e.preventDefault();
            try {
              await accion.mutateAsync({ url: `/plataforma/solicitudes/${s.id}/resolver`, body: { nota } });
              toast.success("Marcada como resuelta");
            } catch (err) {
              toast.error(err instanceof ApiError ? err.message : "No se pudo guardar");
            }
          }}
        >
          <Input value={nota} onChange={(e) => setNota(e.target.value)} placeholder="Cómo se resolvió (ej. reintegro hecho el …)" aria-label={`Resolución de ${s.codigo}`} />
          <Button type="submit" size="sm" className="h-9" disabled={nota.trim().length < 3 || accion.isPending}>
            Resolver
          </Button>
        </form>
      )}
    </Card>
  );
}
