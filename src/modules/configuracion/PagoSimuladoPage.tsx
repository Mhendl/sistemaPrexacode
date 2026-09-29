import { CreditCard, FlaskConical, Loader2 } from "lucide-react";
import { Link, useNavigate, useParams } from "react-router";
import { toast } from "sonner";
import { ApiError } from "@/api/client";
import { usePagoSuscripcion, useResolverPago } from "@/api/hooks";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { QueryState } from "@/components/shared/QueryState";
import { StatusBadge } from "@/components/shared/StatusBadge";
import { formatDate, formatMoney } from "@/lib/format";

const nombrePlan: Record<string, string> = { basico: "Básico", profesional: "Profesional", empresa: "Empresa" };

/** "Checkout" de prueba: reemplaza a Mercado Pago mientras no hay credenciales configuradas */
export function PagoSimuladoPage() {
  const { referencia } = useParams();
  const navigate = useNavigate();
  const { data: p, isLoading, error, refetch } = usePagoSuscripcion(referencia);
  const resolver = useResolverPago();

  const resolverPago = async (simular: "Aprobado" | "Rechazado") => {
    try {
      const r = await resolver.mutateAsync({ referencia: referencia!, simular });
      if (r.estado === "Aprobado") toast.success("Pago de prueba aprobado", { description: r.tipo === "cambio" ? "El cambio ya está aplicado." : `Plan pago hasta el ${formatDate(r.hasta!)}.` });
      else toast.error("Pago de prueba rechazado");
      navigate("/configuracion?tab=plan");
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : "No se pudo procesar");
    }
  };

  return (
    <div className="mx-auto max-w-md py-8">
      <QueryState isLoading={isLoading} error={error} onRetry={refetch}>
        {p && (
          <Card className="gap-5 p-6 shadow-none" data-testid="pago-simulado">
            <div className="flex items-start gap-3 rounded-lg border border-warning/50 bg-warning/10 p-3 text-sm">
              <FlaskConical className="mt-0.5 size-4 shrink-0 text-warning-ink" />
              <span>
                <b>Pago de prueba.</b> Mercado Pago todavía no está configurado en esta instalación: no se cobra nada.
              </span>
            </div>
            <div>
              <div className="text-sm text-muted-foreground">Estás pagando</div>
              <div className="text-lg font-semibold">
                Plan {nombrePlan[p.plan] ?? p.plan}
                {p.usuariosAdicionales > 0 && ` + ${p.usuariosAdicionales} usuario${p.usuariosAdicionales === 1 ? "" : "s"}`}
                {p.tipo === "cambio" ? "" : ` · ${p.periodo === "anual" ? "12 meses" : "1 mes"}`}
              </div>
              {p.tipo === "cambio" && <div className="text-sm text-muted-foreground">Diferencia proporcional por los días que faltan para tu vencimiento{p.hasta ? ` (${formatDate(p.hasta)})` : ""}.</div>}
            </div>
            <div className="rounded-lg bg-muted p-4">
              <div className="tabular text-3xl font-bold" data-testid="importe-pago">
                {formatMoney(p.importeArs)}
              </div>
              <div className="text-xs text-muted-foreground">
                USD {p.importeUsd.toLocaleString("es-AR")} × dólar {formatMoney(p.tipoCambio)}
              </div>
            </div>
            {p.estado === "Pendiente" ? (
              <div className="grid gap-2">
                <Button onClick={() => resolverPago("Aprobado")} disabled={resolver.isPending}>
                  {resolver.isPending ? <Loader2 className="size-4 animate-spin" /> : <CreditCard className="size-4" />}
                  Aprobar pago de prueba
                </Button>
                <Button variant="outline" onClick={() => resolverPago("Rechazado")} disabled={resolver.isPending}>
                  Rechazar
                </Button>
              </div>
            ) : (
              <div className="flex items-center justify-between">
                <StatusBadge status={p.estado} />
                <Link to="/configuracion?tab=plan" className="text-sm text-primary hover:underline">
                  Volver al plan
                </Link>
              </div>
            )}
          </Card>
        )}
      </QueryState>
    </div>
  );
}
