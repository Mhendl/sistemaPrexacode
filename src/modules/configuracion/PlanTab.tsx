import { useEffect, useRef, useState } from "react";
import { Check, CreditCard, Loader2, Minus, Plus, Sparkles } from "lucide-react";
import { useNavigate, useSearchParams } from "react-router";
import { toast } from "sonner";
import { ApiError } from "@/api/client";
import { useBajaSuscripcion, useCambiarPlan, usePagarSuscripcion, usePlanes, useResolverPago, useSuscripcion } from "@/api/hooks";
import type { PlanId, SuscripcionApi } from "@/api/types";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { Progress } from "@/components/ui/progress";
import { QueryState } from "@/components/shared/QueryState";
import { StatusBadge } from "@/components/shared/StatusBadge";
import { formatDate, formatMoney } from "@/lib/format";
import { cn } from "@/lib/utils";
import { Section } from "./parts";

const INCLUYE = ["Clientes, oportunidades y agenda", "Facturación electrónica ARCA", "Presupuestos, remitos y cobranzas", "Productos y stock", "Reportes y Libro IVA", "Envío por email y WhatsApp"];
export const nombreEstado: Record<SuscripcionApi["estado"], string> = { Prueba: "Prueba gratis", Activa: "Activa", Gracia: "Vencida (en gracia)", SoloLectura: "Solo lectura" };
const usd = (n: number) => `USD ${n.toLocaleString("es-AR", { maximumFractionDigits: 2 })}`;

export function PlanTab() {
  const { data: s, isLoading, error, refetch } = useSuscripcion();
  const { data: catalogo } = usePlanes();
  const cambiar = useCambiarPlan();
  const pagar = usePagarSuscripcion();
  const resolver = useResolverPago();
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const [adicionales, setAdicionales] = useState(0);
  const verificado = useRef(false);

  useEffect(() => {
    if (s?.usuariosAdicionales !== undefined) setAdicionales(s.usuariosAdicionales);
  }, [s?.usuariosAdicionales]);

  // Vuelta de Mercado Pago: ?pago=<referencia>&payment_id=<id>
  useEffect(() => {
    const referencia = params.get("pago");
    if (!referencia || verificado.current) return;
    verificado.current = true;
    const pagoId = params.get("payment_id") ?? params.get("collection_id") ?? undefined;
    resolver
      .mutateAsync({ referencia, pagoId: pagoId && pagoId !== "null" ? pagoId : undefined })
      .then((p) => {
        if (p.estado === "Aprobado") toast.success("¡Pago acreditado! Gracias.", { description: p.tipo === "cambio" ? "El cambio de plan ya está aplicado." : `Tu plan queda pago hasta el ${formatDate(p.hasta!)}.` });
        else if (p.estado === "Rechazado") toast.error("El pago fue rechazado", { description: "Podés intentarlo de nuevo con otro medio." });
        else toast("El pago está en proceso", { description: "Te avisamos cuando se acredite." });
      })
      .catch((e) => toast.error(e instanceof ApiError ? e.message : "No se pudo verificar el pago"))
      .finally(() => setParams({ tab: "plan" }, { replace: true }));
  }, [params]); // eslint-disable-line react-hooks/exhaustive-deps

  const irA = (destino: string) => {
    const url = new URL(destino, window.location.origin);
    if (url.origin === window.location.origin) navigate(url.pathname + url.search);
    else window.location.href = destino;
  };

  const elegirPlan = async (plan: PlanId, extra = adicionales) => {
    try {
      const r = await cambiar.mutateAsync({ plan, usuariosAdicionales: extra, version: s?.version });
      if (r.aplicado === "pagar") {
        toast(`Pagá la diferencia: ${formatMoney(r.importeArs)}`, { description: `Es lo proporcional a los ${r.dias} días que faltan para tu vencimiento. Se habilita apenas se acredita.` });
        irA(r.url);
      } else if (r.aplicado === "proximo") {
        toast.success("Cambio programado", { description: `Hasta el vencimiento seguís con lo que pagaste. Desde el ${formatDate(r.desde)} se aplica el cambio y se cobra el precio nuevo.` });
      } else {
        toast.success("Plan actualizado", { description: "El precio nuevo se aplica desde el próximo pago." });
      }
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : "No se pudo cambiar el plan", { duration: 10_000 });
      if (s?.usuariosAdicionales !== undefined) setAdicionales(s.usuariosAdicionales);
    }
  };

  const irAPagar = async (periodo: "mensual" | "anual") => {
    try {
      const r = await pagar.mutateAsync(periodo);
      irA(r.url);
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : "No se pudo iniciar el pago");
    }
  };

  return (
    <QueryState isLoading={isLoading} error={error} onRetry={refetch}>
      {s && s.limites && s.usos && (
        <div className="grid gap-6">
          <Section title="Tu suscripción" description={`Plan ${s.planNombre}${s.periodo === "anual" && s.pagoHasta ? " · anual" : ""}`} action={<StatusBadge status={nombreEstado[s.estado]} />}>
            <div data-testid="estado-suscripcion" className="mb-5 text-sm">
              {s.estado === "Prueba" && (
                <p>
                  Te {s.diasRestantes === 1 ? "queda" : "quedan"} <b>{s.diasRestantes} {s.diasRestantes === 1 ? "día" : "días"}</b> de prueba gratis (hasta el {formatDate(s.vence)}). Si pagás ahora no perdés esos días: el pago arranca cuando termina la prueba.
                </p>
              )}
              {s.estado === "Activa" && <p>Pago hasta el <b>{formatDate(s.vence)}</b>.</p>}
              {s.estado === "Gracia" && (
                <p className="text-warning-ink">
                  Venció el {formatDate(s.vence)}. Podés seguir usando todo hasta el <b>{formatDate(s.graciaHasta)}</b>; después queda en modo solo lectura hasta que se renueve.
                </p>
              )}
              {s.estado === "SoloLectura" && (
                <p className="text-destructive">
                  Venció el {formatDate(s.vence)}. Podés ver y exportar todos tus datos, pero para cargar o modificar hay que renovar.
                </p>
              )}
            </div>

            {s.planProximo && catalogo && (
              <div className="mb-5 flex flex-wrap items-center justify-between gap-2 rounded-lg border border-info/30 bg-info/8 px-4 py-3 text-sm" data-testid="cambio-programado">
                <span>
                  Desde la próxima renovación pasás a <b>{catalogo.planes.find((p) => p.id === s.planProximo)?.nombre}</b>
                  {s.adicionalesProximos ? ` con ${s.adicionalesProximos} usuario${s.adicionalesProximos === 1 ? "" : "s"} adicional${s.adicionalesProximos === 1 ? "" : "es"}` : ""}. Hasta entonces seguís con lo que pagaste.
                </span>
                <Button variant="outline" size="sm" onClick={() => elegirPlan(s.plan, s.usuariosAdicionales ?? 0)} disabled={cambiar.isPending}>
                  Cancelar el cambio
                </Button>
              </div>
            )}

            <div className="grid gap-6 sm:grid-cols-3">
              <Uso titulo="Usuarios activos" usados={s.usos.usuarios} limite={s.limites.usuarios} testid="uso-usuarios" />
              <Uso titulo="Puntos de venta" usados={s.usos.puntosVenta} limite={s.limites.puntosVenta} testid="uso-puntos-venta" />
              {catalogo && (
                <div>
                  <div className="text-sm text-muted-foreground">Precio</div>
                  <div className="mt-1 text-xl font-semibold" data-testid="precio-mensual">
                    {usd((catalogo.planes.find((p) => p.id === s.plan)?.precioUsd ?? 0) + (s.usuariosAdicionales ?? 0) * catalogo.precioUsuarioAdicionalUsd)} / mes
                  </div>
                  {catalogo.dolar && <div className="text-xs text-muted-foreground">Se cobra en pesos al dólar oficial del Banco Central del día (hoy {formatMoney(catalogo.dolar)})</div>}
                </div>
              )}
            </div>

            <div className="mt-6 flex flex-wrap gap-2 border-t pt-5">
              <Button onClick={() => irAPagar("mensual")} disabled={pagar.isPending}>
                {pagar.isPending ? <Loader2 className="size-4 animate-spin" /> : <CreditCard className="size-4" />}
                Pagar 1 mes
              </Button>
              <Button variant="outline" onClick={() => irAPagar("anual")} disabled={pagar.isPending}>
                Pagar 12 meses <span className="text-success">(2 gratis)</span>
              </Button>
              {s.proveedor === "simulado" && <span className="self-center text-xs text-muted-foreground">Mercado Pago todavía no está configurado: el pago es de prueba.</span>}
              {s.proveedor === "deshabilitado" && (
                <span className="self-center text-xs text-muted-foreground" data-testid="pago-por-transferencia">
                  Por ahora el pago se coordina por transferencia: escribinos desde <a href="/soporte" className="underline">Ayuda y soporte</a> y te pasamos los datos.
                </span>
              )}
            </div>
          </Section>

          {catalogo && (
            <Section title="Usuarios adicionales" description={`Por encima de los incluidos en el plan: ${usd(catalogo.precioUsuarioAdicionalUsd)} por mes cada uno.`}>
              <div className="flex flex-wrap items-center gap-3">
                <div className="flex items-center rounded-lg border">
                  <Button variant="ghost" size="icon" onClick={() => setAdicionales((n) => Math.max(0, n - 1))} aria-label="Quitar un usuario adicional">
                    <Minus className="size-4" />
                  </Button>
                  <span className="tabular w-10 text-center font-semibold" data-testid="cantidad-adicionales">
                    {adicionales}
                  </span>
                  <Button variant="ghost" size="icon" onClick={() => setAdicionales((n) => n + 1)} aria-label="Sumar un usuario adicional">
                    <Plus className="size-4" />
                  </Button>
                </div>
                {adicionales !== s.usuariosAdicionales && (
                  <Button onClick={() => elegirPlan(s.plan, adicionales)} disabled={cambiar.isPending}>
                    Guardar ({adicionales > (s.usuariosAdicionales ?? 0) ? "+" : ""}
                    {usd((adicionales - (s.usuariosAdicionales ?? 0)) * catalogo.precioUsuarioAdicionalUsd)}/mes)
                  </Button>
                )}
              </div>
              {s.estado === "Activa" && (
                <p className="mt-3 text-xs text-muted-foreground">
                  Con el mes ya pago, sumar usuarios cobra solo la parte proporcional hasta el {formatDate(s.vence)}. Si quitás usuarios, el cambio se aplica en la próxima renovación.
                </p>
              )}
            </Section>
          )}

          {catalogo && (
            <div className="grid gap-4 lg:grid-cols-3">
              {catalogo.planes.map((p) => {
                const actual = p.id === s.plan;
                return (
                  <Card key={p.id} className={cn("relative gap-4 p-5 shadow-none", actual && "border-primary ring-1 ring-primary")} data-testid={`plan-${p.id}`}>
                    {p.id === "profesional" && (
                      <span className="absolute -top-2.5 right-4 flex items-center gap-1 rounded-full bg-highlight px-2 py-0.5 text-[11px] font-semibold text-white">
                        <Sparkles className="size-3" /> Más elegido
                      </span>
                    )}
                    <div>
                      <div className="text-lg font-semibold">{p.nombre}</div>
                      <div className="text-sm text-muted-foreground">{p.bajada}</div>
                    </div>
                    <div>
                      <span className="text-3xl font-bold tracking-tight">{usd(p.precioUsd)}</span>
                      <span className="text-sm text-muted-foreground"> / mes</span>
                      {catalogo.dolar && <div className="text-xs text-muted-foreground">≈ {formatMoney(p.precioUsd * catalogo.dolar)} por mes</div>}
                    </div>
                    <ul className="grid gap-1.5 text-sm">
                      <li className="flex gap-2">
                        <Check className="size-4 text-success" /> <b>{p.usuarios} usuarios</b> incluidos
                      </li>
                      <li className="flex gap-2">
                        <Check className="size-4 text-success" /> <b>{p.puntosVenta === null ? "Puntos de venta ilimitados" : `${p.puntosVenta} punto${p.puntosVenta === 1 ? "" : "s"} de venta`}</b>
                      </li>
                      {INCLUYE.map((i) => (
                        <li key={i} className="flex gap-2 text-muted-foreground">
                          <Check className="size-4 shrink-0 text-success" /> {i}
                        </li>
                      ))}
                    </ul>
                    {actual ? (
                      <Button variant="outline" disabled>
                        Tu plan
                      </Button>
                    ) : (
                      <Button variant={p.id === "profesional" ? "default" : "outline"} onClick={() => elegirPlan(p.id)} disabled={cambiar.isPending}>
                        Cambiar a {p.nombre}
                      </Button>
                    )}
                  </Card>
                );
              })}
            </div>
          )}

          <BajaSuscripcion s={s} />

          {s.pagos && s.pagos.length > 0 && (
            <Section title="Pagos">
              <div className="-mx-6 overflow-x-auto">
                <table className="w-full text-sm" data-testid="pagos-suscripcion">
                  <thead>
                    <tr className="border-y bg-muted/40 text-left text-xs text-muted-foreground">
                      <th className="px-6 py-2.5 font-medium">Fecha</th>
                      <th className="px-4 py-2.5 font-medium">Detalle</th>
                      <th className="px-4 py-2.5 font-medium">Cubre</th>
                      <th className="px-4 py-2.5 text-right font-medium">Importe</th>
                      <th className="px-6 py-2.5 text-right font-medium">Estado</th>
                    </tr>
                  </thead>
                  <tbody>
                    {s.pagos.map((p) => (
                      <tr key={p.id} className="border-b last:border-b-0">
                        <td className="tabular px-6 py-3">{new Date(p.createdAt).toLocaleDateString("es-AR")}</td>
                        <td className="px-4 py-3">
                          {catalogo?.planes.find((x) => x.id === p.plan)?.nombre ?? p.plan} · {p.tipo === "cambio" ? "cambio (proporcional)" : p.periodo === "anual" ? "12 meses" : "1 mes"}
                          {p.usuariosAdicionales > 0 && ` · +${p.usuariosAdicionales} usuario${p.usuariosAdicionales === 1 ? "" : "s"}`}
                        </td>
                        <td className="tabular px-4 py-3 text-muted-foreground">{p.desde && p.hasta ? `${formatDate(p.desde)} al ${formatDate(p.hasta)}` : "—"}</td>
                        <td className="tabular px-4 py-3 text-right whitespace-nowrap">
                          {formatMoney(p.importeArs)}
                          <div className="text-xs text-muted-foreground">{usd(p.importeUsd)}</div>
                        </td>
                        <td className="px-6 py-3 text-right">
                          <StatusBadge status={p.estado} />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Section>
          )}
        </div>
      )}
    </QueryState>
  );
}

function Uso({ titulo, usados, limite, testid }: { titulo: string; usados: number; limite: number | null; testid: string }) {
  return (
    <div data-testid={testid}>
      <div className="text-sm text-muted-foreground">{titulo}</div>
      <div className="mt-1 text-xl font-semibold">
        {usados} de {limite === null ? "ilimitados" : limite}
      </div>
      {limite !== null && <Progress className="mt-2" value={Math.min(100, (usados / Math.max(1, limite)) * 100)} />}
    </div>
  );
}

/** Botón de baja dentro de la app: deja constancia con código y se puede anular hasta el vencimiento */
function BajaSuscripcion({ s }: { s: SuscripcionApi }) {
  const baja = useBajaSuscripcion();
  const [abierto, setAbierto] = useState(false);
  const [motivo, setMotivo] = useState("");

  const pedir = async () => {
    try {
      const r = (await baja.mutateAsync({ motivo: motivo || undefined })) as { codigo: string; accesoHasta: string };
      setAbierto(false);
      toast.success(`Baja registrada. Código de constancia: ${r.codigo}`, { description: `Podés seguir usando todo hasta el ${formatDate(r.accesoHasta)}.`, duration: 15_000 });
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : "No se pudo registrar la baja");
    }
  };

  return (
    <Section title="Dar de baja" description="Podés darte de baja cuando quieras, sin costo.">
      {s.bajaCodigo ? (
        <div className="grid gap-3 text-sm" data-testid="baja-solicitada">
          <p>
            Pediste la baja (código de constancia <b className="font-mono">{s.bajaCodigo}</b>). Podés seguir usando todo hasta el <b>{formatDate(s.vence)}</b>; después vas a poder exportar tus datos durante 60 días.
          </p>
          <div>
            <Button variant="outline" size="sm" onClick={() => baja.mutate({ anular: true }, { onSuccess: () => toast.success("Baja anulada: tu suscripción sigue normalmente") })}>
              Anular la baja
            </Button>
          </div>
        </div>
      ) : (
        <Button variant="outline" className="text-destructive hover:text-destructive" onClick={() => setAbierto(true)}>
          Dar de baja la suscripción
        </Button>
      )}
      <Dialog open={abierto} onOpenChange={setAbierto}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>¿Dar de baja la suscripción?</DialogTitle>
            <DialogDescription>
              Vas a poder seguir usando todo hasta el {formatDate(s.vence)}. Después la cuenta queda en solo lectura y tenés 60 días para exportar tus datos. Te damos un código de constancia.
            </DialogDescription>
          </DialogHeader>
          <Textarea rows={3} value={motivo} onChange={(e) => setMotivo(e.target.value)} placeholder="Si querés, contanos por qué (nos ayuda a mejorar)" aria-label="Motivo de la baja" />
          <DialogFooter>
            <Button variant="outline" onClick={() => setAbierto(false)}>
              Volver
            </Button>
            <Button variant="destructive" onClick={pedir} disabled={baja.isPending}>
              Confirmar la baja
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Section>
  );
}
