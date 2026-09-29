import { AlertTriangle, Bell, CalendarClock, Handshake, PackageX, Receipt, Settings } from "lucide-react";
import { useNavigate } from "react-router";
import { useMarcarLeida, useNotificaciones } from "@/api/hooks";
import type { NotificacionApi } from "@/api/types";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";

const icono: Record<string, { icon: typeof Bell; className: string }> = {
  stock_bajo: { icon: AlertTriangle, className: "bg-warning/15 text-warning-ink" },
  sin_stock: { icon: PackageX, className: "bg-destructive/10 text-destructive" },
  vencimiento_factura: { icon: Receipt, className: "bg-destructive/10 text-destructive" },
  agenda_asignacion: { icon: CalendarClock, className: "bg-primary/10 text-primary" },
  oportunidad_asignada: { icon: Handshake, className: "bg-highlight/15 text-highlight" },
};

/** "hace 5 min", "hace 2 h", "ayer"… */
function hace(iso: string) {
  const min = Math.round((Date.now() - new Date(iso).getTime()) / 60000);
  if (min < 1) return "recién";
  if (min < 60) return `hace ${min} min`;
  const h = Math.round(min / 60);
  if (h < 24) return `hace ${h} h`;
  const d = Math.round(h / 24);
  return d === 1 ? "ayer" : `hace ${d} días`;
}

export function NotificationsBell() {
  const navigate = useNavigate();
  const { data } = useNotificaciones();
  const marcar = useMarcarLeida();
  const items = data?.items ?? [];
  const noLeidas = data?.noLeidas ?? 0;

  const abrir = (n: NotificacionApi) => {
    if (!n.leida) marcar.mutate(n.id);
    if (n.link) navigate(n.link);
  };

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon" className="relative" aria-label={noLeidas ? `Notificaciones: ${noLeidas} sin leer` : "Notificaciones"}>
          <Bell className="size-5" />
          {noLeidas > 0 && (
            <span data-testid="notificaciones-contador" className="absolute top-1 right-1 flex min-w-4 items-center justify-center rounded-full bg-primary px-1 text-[10px] font-semibold text-primary-foreground">
              {noLeidas > 9 ? "9+" : noLeidas}
            </span>
          )}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-[22rem] max-w-[calc(100vw-2rem)]">
        <DropdownMenuLabel className="flex items-center justify-between">
          Notificaciones
          {noLeidas > 0 && (
            <button type="button" className="text-xs font-normal text-primary hover:underline" onClick={() => marcar.mutate("todas")}>
              Marcar todas como leídas
            </button>
          )}
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        {items.length === 0 ? (
          <div className="px-3 py-8 text-center text-sm text-muted-foreground">No tenés notificaciones.</div>
        ) : (
          <div className="max-h-96 overflow-y-auto">
            {items.map((n) => {
              const ic = icono[n.tipo] ?? { icon: Bell, className: "bg-primary/10 text-primary" };
              return (
                <DropdownMenuItem key={n.id} className="items-start gap-3 py-2" onClick={() => abrir(n)} data-testid="notificacion">
                  <span className={cn("mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-md", ic.className)}>
                    <ic.icon className="size-3.5" />
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className={cn("text-sm", !n.leida && "font-semibold")}>{n.titulo}</div>
                    <div className="text-xs whitespace-normal text-muted-foreground">{n.detalle}</div>
                    <div className="mt-0.5 text-[11px] text-muted-foreground">{hace(n.createdAt)}</div>
                  </div>
                  {!n.leida && <span className="mt-1.5 size-2 shrink-0 rounded-full bg-primary" aria-label="Sin leer" />}
                </DropdownMenuItem>
              );
            })}
          </div>
        )}
        <DropdownMenuSeparator />
        <DropdownMenuItem onClick={() => navigate("/cuenta/notificaciones")}>
          <Settings className="size-4" /> Configurar notificaciones
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
