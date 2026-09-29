import { toast } from "sonner";
import { useGuardarPreferencias, usePreferenciasNotificacion } from "@/api/hooks";
import { Card } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { PageHeader } from "@/components/shared/PageHeader";
import { QueryState } from "@/components/shared/QueryState";

/** Cada usuario elige qué avisos recibe (según su rol) */
export function PreferenciasNotificacionesPage() {
  const { data, isLoading, error, refetch } = usePreferenciasNotificacion();
  const guardar = useGuardarPreferencias();

  const cambiar = async (tipo: string, enSistema: boolean) => {
    await guardar.mutateAsync([{ tipo, enSistema }]);
    toast.success(enSistema ? "Aviso activado" : "Aviso desactivado");
  };

  return (
    <>
      <PageHeader title="Mis notificaciones" description="Elegí de qué querés que te avise el sistema. Aparecen en la campanita de arriba." />
      <QueryState isLoading={isLoading} error={error} onRetry={refetch}>
        <Card className="max-w-2xl gap-0 p-0 shadow-none">
          {data?.map((p) => (
            <div key={p.tipo} className="flex items-center justify-between gap-4 border-b px-5 py-4 last:border-b-0">
              <div>
                <Label htmlFor={`pref-${p.tipo}`} className="text-sm font-medium">
                  {p.nombre}
                </Label>
                <p className="text-sm text-muted-foreground">{p.descripcion}</p>
                {!p.disponible && <p className="mt-1 text-xs text-highlight">Se activa cuando esté disponible el módulo de Facturación</p>}
              </div>
              <Switch id={`pref-${p.tipo}`} checked={p.enSistema} disabled={!p.disponible || guardar.isPending} onCheckedChange={(v) => cambiar(p.tipo, v)} />
            </div>
          ))}
          <div className="bg-muted/40 px-5 py-3 text-xs text-muted-foreground">Próximamente también por email, cuando se configure el correo de la empresa.</div>
        </Card>
      </QueryState>
    </>
  );
}
