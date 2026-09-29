import { useState } from "react";
import { CalendarPlus } from "lucide-react";
import { useConfigAgenda, useEventosCliente } from "@/api/hooks";
import type { EventoApi } from "@/api/types";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { StatusBadge } from "@/components/shared/StatusBadge";
import { useRole, Si } from "@/context/AuthProvider";
import { formatDate } from "@/lib/format";
import { cn } from "@/lib/utils";
import { EventoDialog } from "./EventoDialog";

const hoyLocal = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};

/** Próximos y últimos eventos de un cliente, con acceso directo para agendar */
export function AgendaCliente({ clienteId }: { clienteId: string }) {
  const { usuario } = useRole();
  const { data: config } = useConfigAgenda();
  const { data: eventos = [] } = useEventosCliente(clienteId);
  const [dialogo, setDialogo] = useState<{ evento?: EventoApi } | null>(null);
  if (!config) return null;

  const hoy = hoyLocal();
  const proximos = eventos.filter((e) => e.fecha >= hoy).reverse(); // la API los trae del más nuevo al más viejo
  const pasados = eventos.filter((e) => e.fecha < hoy).slice(0, 5);
  const recurso = (id: string) => config.recursos.find((r) => r.id === id);
  const miRecurso = config.recursos.find((r) => r.activo && r.usuarioId === usuario.id) ?? config.recursos.find((r) => r.activo);

  const fila = (e: EventoApi) => (
    <li key={e.id} className="border-b last:border-b-0">
      <button type="button" onClick={() => setDialogo({ evento: e })} className={cn("flex w-full items-center justify-between gap-3 px-6 py-2.5 text-left text-sm hover:bg-muted/40", e.estado === "Cancelado" && "opacity-60")}>
        <span className="flex min-w-0 items-center gap-2">
          <span className="size-2.5 shrink-0 rounded-full" style={{ background: recurso(e.recursoId)?.color }} />
          <span className="truncate">
            <span className="tabular font-medium">
              {formatDate(e.fecha)} {e.inicio}
            </span>
            <span className="text-muted-foreground">
              {" "}
              · {e.titulo} · {recurso(e.recursoId)?.nombre}
            </span>
          </span>
        </span>
        <StatusBadge status={e.estado} />
      </button>
    </li>
  );

  return (
    <Card className="gap-0 pb-0 shadow-none lg:col-span-2" data-testid="agenda-cliente">
      <CardHeader className="flex flex-row items-center justify-between pb-4">
        <CardTitle>Agenda</CardTitle>
        <Si permiso="agenda.editar">
          <Button variant="outline" size="sm" onClick={() => setDialogo({})} disabled={!miRecurso}>
            <CalendarPlus className="size-4" /> Agendar {config.nombreEvento.toLowerCase()}
          </Button>
        </Si>
      </CardHeader>
      {eventos.length === 0 ? (
        <CardContent className="pb-6 text-sm text-muted-foreground">No tiene nada agendado.</CardContent>
      ) : (
        <>
          {proximos.length > 0 && <ul className="border-t">{proximos.map(fila)}</ul>}
          {pasados.length > 0 && (
            <>
              <div className="border-t bg-muted/30 px-6 py-1.5 text-xs font-medium text-muted-foreground">Anteriores</div>
              <ul className="border-t">{pasados.map(fila)}</ul>
            </>
          )}
        </>
      )}
      <EventoDialog
        open={!!dialogo}
        onOpenChange={(o) => !o && setDialogo(null)}
        config={config}
        evento={dialogo?.evento}
        inicial={{ clienteId, fecha: hoy, recursoId: miRecurso?.id ?? "", tipo: config.tiposEvento[0] ?? null }}
      />
    </Card>
  );
}
