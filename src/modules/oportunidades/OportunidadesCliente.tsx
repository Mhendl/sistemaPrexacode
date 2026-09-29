import { useState } from "react";
import { Target } from "lucide-react";
import { useOportunidades } from "@/api/hooks";
import type { OportunidadApi } from "@/api/types";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { StatusBadge } from "@/components/shared/StatusBadge";
import { formatMoney } from "@/lib/format";
import { cn } from "@/lib/utils";
import { OportunidadDialog } from "./OportunidadDialog";
import { Si } from "@/context/AuthProvider";

/** Negocios con este cliente: abiertos primero */
export function OportunidadesCliente({ clienteId }: { clienteId: string }) {
  const { data = [] } = useOportunidades(clienteId);
  const [dialogo, setDialogo] = useState<{ oportunidad?: OportunidadApi } | null>(null);
  const orden = [...data].sort((a, b) => Number(["Ganada", "Perdida"].includes(a.etapa)) - Number(["Ganada", "Perdida"].includes(b.etapa)));

  return (
    <Card className="gap-0 pb-0 shadow-none lg:col-span-2" data-testid="oportunidades-cliente">
      <CardHeader className="flex flex-row items-center justify-between pb-4">
        <CardTitle>Oportunidades</CardTitle>
        <Si permiso="oportunidades.editar">
          <Button variant="outline" size="sm" onClick={() => setDialogo({})}>
            <Target className="size-4" /> Nueva oportunidad
          </Button>
        </Si>
      </CardHeader>
      {orden.length === 0 ? (
        <CardContent className="pb-6 text-sm text-muted-foreground">No hay oportunidades con este cliente.</CardContent>
      ) : (
        <ul className="border-t">
          {orden.slice(0, 8).map((o) => (
            <li key={o.id} className="border-b last:border-b-0">
              <button
                type="button"
                onClick={() => setDialogo({ oportunidad: o })}
                className={cn("flex w-full items-center justify-between gap-3 px-6 py-2.5 text-left text-sm hover:bg-muted/40", o.etapa === "Perdida" && "opacity-60")}
              >
                <span className="min-w-0 truncate">
                  <span className="font-medium">{o.titulo}</span>
                  <span className="text-muted-foreground"> · {o.responsableNombre ?? "Sin asignar"}</span>
                </span>
                <span className="flex shrink-0 items-center gap-3">
                  <span className="tabular whitespace-nowrap">{formatMoney(o.monto)}</span>
                  <StatusBadge status={o.etapa} />
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
      <OportunidadDialog open={!!dialogo} onOpenChange={(v) => !v && setDialogo(null)} oportunidad={dialogo?.oportunidad} inicial={{ clienteId }} />
    </Card>
  );
}
