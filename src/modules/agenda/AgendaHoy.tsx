import { CalendarDays } from "lucide-react";
import { Link } from "react-router";
import { useConfigAgenda, useEventos } from "@/api/hooks";
import { Button } from "@/components/ui/button";
import { Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { StatusBadge } from "@/components/shared/StatusBadge";
import { useRole, Si } from "@/context/AuthProvider";
import { cn } from "@/lib/utils";

const hoyLocal = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};

/** Lo agendado para hoy, con lo propio primero a la vista */
export function AgendaHoy() {
  const { usuario } = useRole();
  const hoy = hoyLocal();
  const { data: config } = useConfigAgenda();
  const { data: eventos = [] } = useEventos(hoy, hoy);
  if (!config) return null;

  const activos = eventos.filter((e) => e.estado !== "Cancelado");
  const mios = new Set(config.recursos.filter((r) => r.usuarioId === usuario.id).map((r) => r.id));
  const cantMios = activos.filter((e) => mios.has(e.recursoId)).length;
  const recurso = (id: string) => config.recursos.find((r) => r.id === id);

  return (
    <Card className="gap-0 pb-0 shadow-none" data-testid="agenda-hoy">
      <CardHeader className="pb-4">
        <CardTitle className="flex items-center gap-2">
          <CalendarDays className="size-4 text-primary" /> Agenda de hoy
        </CardTitle>
        <CardDescription>{activos.length === 0 ? "No hay nada agendado para hoy" : `${activos.length} en total${mios.size ? ` · ${cantMios} ${cantMios === 1 ? "tuyo" : "tuyos"}` : ""}`}</CardDescription>
        <CardAction>
          <Button variant="ghost" size="sm" asChild>
            <Link to="/agenda">Ver agenda</Link>
          </Button>
        </CardAction>
      </CardHeader>
      {activos.length > 0 ? (
        <ul className="border-t">
          {activos.slice(0, 8).map((e) => (
            <li key={e.id} className="border-b last:border-b-0">
              <Link to={`/agenda?fecha=${e.fecha}&evento=${e.id}`} className={cn("flex items-center justify-between gap-3 px-6 py-2.5 text-sm hover:bg-muted/40", mios.has(e.recursoId) && "bg-primary/[0.04]")}>
                <span className="flex min-w-0 items-center gap-2.5">
                  <span className="size-2.5 shrink-0 rounded-full" style={{ background: recurso(e.recursoId)?.color }} />
                  <span className="min-w-0">
                    <span className="block truncate font-medium">
                      <span className="tabular">{e.inicio}</span> · {e.titulo}
                    </span>
                    <span className="block truncate text-xs text-muted-foreground">
                      {e.clienteRazonSocial ?? "Interno"} · {recurso(e.recursoId)?.nombre}
                    </span>
                  </span>
                </span>
                <StatusBadge status={e.estado} />
              </Link>
            </li>
          ))}
        </ul>
      ) : (
        <CardContent className="pb-6">
          <Si permiso="agenda.editar">
            <Button variant="outline" size="sm" asChild>
              <Link to="/agenda">Agendar {config.nombreEvento.toLowerCase()}</Link>
            </Button>
          </Si>
        </CardContent>
      )}
    </Card>
  );
}
