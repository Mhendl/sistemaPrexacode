import { useState, type ReactNode } from "react";
import { ArrowLeft, Ban, CalendarPlus, CircleCheck, Loader2, Receipt, Users, Wallet } from "lucide-react";
import { Link, useParams } from "react-router";
import { toast } from "sonner";
import { ApiError } from "@/api/client";
import type { PlanId } from "@/api/types";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { KpiCard } from "@/components/shared/KpiCard";
import { QueryState } from "@/components/shared/QueryState";
import { StatusBadge } from "@/components/shared/StatusBadge";
import { formatCuit, formatDate, formatMoney, formatMoneyShort } from "@/lib/format";
import { aNumero } from "@/lib/numeros";
import { useAccionAdmin, useEmpresaAdmin } from "./api";
import { detalleAccion, nombreAccion } from "./AdminAuditoria";
import { BarrasMes, EstadoEmpresa, fechaHora, nombrePlan, usuariosTxt } from "./comun";

const nombreProveedor: Record<string, string> = { mercadopago: "Mercado Pago", simulado: "Simulado", manual: "Manual" };

export function AdminEmpresa() {
  const { id } = useParams();
  const { data: d, isLoading, error, refetch } = useEmpresaAdmin(id);
  const accion = useAccionAdmin();
  const [dias, setDias] = useState("7");
  const [pago, setPago] = useState({ periodo: "mensual", importe: "", nota: "" });
  const [plan, setPlan] = useState<{ plan: PlanId; adicionales: string } | null>(null);
  const [motivo, setMotivo] = useState("");

  const hacer = async (url: string, body: object, ok: string, metodo: "POST" | "PUT" = "POST") => {
    try {
      await accion.mutateAsync({ url: `/plataforma/empresas/${id}${url}`, body, metodo });
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
        <Link to="/admin/empresas">
          <ArrowLeft className="size-4" /> Empresas
        </Link>
      </Button>
      <QueryState isLoading={isLoading} error={error} onRetry={refetch}>
        {d && (
          <div className="grid gap-6">
            <div>
              <h1 className="flex flex-wrap items-center gap-3 text-2xl font-semibold tracking-tight">
                <span className="min-w-0 [overflow-wrap:anywhere]">{d.empresa.razonSocial}</span>
                <EstadoEmpresa estado={d.suscripcion.estado} suspendida={!!d.empresa.suspendidaEn} baja={!!d.suscripcion.bajaCodigo} />
              </h1>
              <p className="mt-1 text-sm break-words text-muted-foreground">
                CUIT {formatCuit(d.empresa.cuit)} · {d.empresa.condicionIva} · alta el {new Date(d.empresa.createdAt).toLocaleDateString("es-AR")}
                {d.empresa.email && ` · ${d.empresa.email}`}
                {d.empresa.telefono && ` · ${d.empresa.telefono}`}
                {d.empresa.localidad && ` · ${d.empresa.localidad}`}
              </p>
              {d.empresa.suspendidaEn && <p className="mt-1 text-sm text-destructive">Suspendida el {fechaHora(d.empresa.suspendidaEn)}: {d.empresa.motivoSuspension}</p>}
            </div>

            <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
              <KpiCard
                label="Plan"
                value={d.suscripcion.planNombre}
                icon={Receipt}
                hint={`${d.suscripcion.periodo === "anual" ? "Anual" : "Mensual"}${d.suscripcion.planProximo ? ` · pasa a ${nombrePlan[d.suscripcion.planProximo]}` : ""}`}
              />
              <div data-testid="kpi-usuarios-empresa">
                <KpiCard
                  label="Usuarios"
                  value={`${d.uso.usuariosActivos} / ${d.suscripcion.limites.usuarios}`}
                  icon={Users}
                  tone={d.uso.usuariosActivos >= d.suscripcion.limites.usuarios ? "warning" : "default"}
                  hint={d.suscripcion.usuariosAdicionales ? `incluye ${d.suscripcion.usuariosAdicionales} adicionales` : "sin adicionales"}
                />
              </div>
              <KpiCard label="Vence" value={formatDate(d.suscripcion.vence)} icon={CalendarPlus} tone={d.suscripcion.diasRestantes < 0 ? "danger" : d.suscripcion.diasRestantes <= 7 ? "warning" : "default"} hint={`${d.suscripcion.diasRestantes} días`} />
              <KpiCard label="Nos pagó en total" value={formatMoneyShort(d.pagadoTotal)} icon={Wallet} tone="success" hint={`${d.pagos.filter((p) => p.estado === "Aprobado").length} pagos aprobados`} />
            </div>

            <div className="grid gap-6 lg:grid-cols-2">
              <Card className="shadow-none" data-testid="suscripcion-empresa">
                <CardHeader>
                  <CardTitle>Suscripción</CardTitle>
                </CardHeader>
                <CardContent className="grid gap-1.5 text-sm">
                  <Dato k="Plan">
                    {d.suscripcion.planNombre}
                    {d.suscripcion.usuariosAdicionales ? ` + ${usuariosTxt(d.suscripcion.usuariosAdicionales)}` : ""}
                  </Dato>
                  {d.suscripcion.planProximo && (
                    <Dato k="Desde la renovación">
                      {nombrePlan[d.suscripcion.planProximo]}
                      {d.suscripcion.adicionalesProximos ? ` + ${usuariosTxt(d.suscripcion.adicionalesProximos)}` : ""}
                    </Dato>
                  )}
                  <Dato k="Prueba hasta">{formatDate(d.suscripcion.pruebaHasta)}</Dato>
                  <Dato k="Pago hasta">{d.suscripcion.pagoHasta ? formatDate(d.suscripcion.pagoHasta) : "—"}</Dato>
                  <Dato k="Vence">
                    <b>{formatDate(d.suscripcion.vence)}</b> ({d.suscripcion.diasRestantes} días) · gracia hasta {formatDate(d.suscripcion.graciaHasta)}
                  </Dato>
                  <Dato k="Puntos de venta">{d.suscripcion.limites.puntosVenta ?? "sin límite"}</Dato>
                  <Dato k="Clientes / productos">
                    {d.uso.clientes} / {d.uso.productos}
                  </Dato>
                  {d.suscripcion.bajaCodigo && <div className="text-destructive">Baja pedida · {d.suscripcion.bajaCodigo}</div>}
                </CardContent>
              </Card>

              <Card className="shadow-none">
                <CardHeader>
                  <CardTitle>Acciones</CardTitle>
                </CardHeader>
                <CardContent className="grid gap-4">
                  <form
                    className="flex flex-wrap items-end gap-2"
                    onSubmit={(e) => {
                      e.preventDefault();
                      hacer("/extender", { dias: Number(dias) }, `Se extendió ${dias} días`);
                    }}
                  >
                    <div className="grid gap-1.5">
                      <Label htmlFor="pl-dias">Extender (días)</Label>
                      <Input id="pl-dias" inputMode="numeric" value={dias} onChange={(e) => setDias(e.target.value)} className="w-24" />
                    </div>
                    <Button type="submit" variant="outline" disabled={accion.isPending}>
                      <CalendarPlus className="size-4" /> Extender
                    </Button>
                  </form>

                  <form
                    className="grid gap-2 border-t pt-4"
                    onSubmit={async (e) => {
                      e.preventDefault();
                      const importe = aNumero(pago.importe);
                      if (!(importe > 0)) return toast.error("Importe inválido");
                      if (await hacer("/pago-manual", { periodo: pago.periodo, importeArs: importe, nota: pago.nota || undefined }, "Pago registrado")) setPago({ periodo: "mensual", importe: "", nota: "" });
                    }}
                  >
                    <div className="text-sm font-medium">Registrar pago recibido (transferencia, efectivo)</div>
                    <div className="grid gap-2 sm:grid-cols-2">
                      <Select value={pago.periodo} onValueChange={(v) => setPago({ ...pago, periodo: v })}>
                        <SelectTrigger aria-label="Período pagado" className="w-full">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="mensual">1 mes</SelectItem>
                          <SelectItem value="anual">12 meses</SelectItem>
                        </SelectContent>
                      </Select>
                      <Input value={pago.importe} onChange={(e) => setPago({ ...pago, importe: e.target.value })} placeholder="Importe en $" aria-label="Importe recibido" inputMode="decimal" />
                    </div>
                    <Input value={pago.nota} onChange={(e) => setPago({ ...pago, nota: e.target.value })} placeholder="Nota (ej. transferencia Banco Nación)" aria-label="Nota del pago" />
                    <Button type="submit" variant="outline" disabled={accion.isPending}>
                      <Wallet className="size-4" /> Registrar pago
                    </Button>
                  </form>

                  <div className="grid gap-2 border-t pt-4">
                    <div className="text-sm font-medium">Plan (sin cobrar la diferencia)</div>
                    <div className="flex flex-wrap items-center gap-2">
                      <Select value={plan?.plan ?? d.suscripcion.plan} onValueChange={(v) => setPlan({ plan: v as PlanId, adicionales: plan?.adicionales ?? String(d.suscripcion.usuariosAdicionales) })}>
                        <SelectTrigger className="w-40" aria-label="Plan">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="basico">Básico</SelectItem>
                          <SelectItem value="profesional">Profesional</SelectItem>
                          <SelectItem value="empresa">Empresa</SelectItem>
                        </SelectContent>
                      </Select>
                      <Input
                        className="w-28"
                        inputMode="numeric"
                        aria-label="Usuarios adicionales"
                        value={plan?.adicionales ?? String(d.suscripcion.usuariosAdicionales)}
                        onChange={(e) => setPlan({ plan: plan?.plan ?? d.suscripcion.plan, adicionales: e.target.value })}
                      />
                      {plan && (
                        <Button variant="outline" onClick={() => hacer("/plan", { plan: plan.plan, usuariosAdicionales: Number(plan.adicionales) || 0 }, "Plan actualizado", "PUT").then((ok) => ok && setPlan(null))}>
                          Guardar plan
                        </Button>
                      )}
                    </div>
                  </div>

                  <div className="grid gap-2 border-t pt-4">
                    {d.empresa.suspendidaEn ? (
                      <Button variant="outline" onClick={() => hacer("/reactivar", {}, "Empresa reactivada")}>
                        <CircleCheck className="size-4" /> Reactivar empresa
                      </Button>
                    ) : (
                      <form
                        className="flex flex-col gap-2 sm:flex-row"
                        onSubmit={(e) => {
                          e.preventDefault();
                          hacer("/suspender", { motivo }, "Empresa suspendida");
                        }}
                      >
                        <Input value={motivo} onChange={(e) => setMotivo(e.target.value)} placeholder="Motivo de la suspensión" aria-label="Motivo de la suspensión" />
                        <Button type="submit" variant="destructive" disabled={motivo.trim().length < 3 || accion.isPending}>
                          {accion.isPending ? <Loader2 className="size-4 animate-spin" /> : <Ban className="size-4" />} Suspender
                        </Button>
                      </form>
                    )}
                  </div>
                </CardContent>
              </Card>
            </div>

            <Card className="shadow-none" data-testid="actividad-empresa">
              <CardHeader>
                <CardTitle>Lo que facturó la empresa (últimos 12 meses)</CardTitle>
              </CardHeader>
              <CardContent>
                <BarrasMes dinero datos={d.uso.actividad.map((m) => ({ etiqueta: m.etiqueta, valor: m.facturado }))} />
                <p className="mt-2 text-xs text-muted-foreground">{d.uso.actividad.reduce((s, m) => s + m.comprobantes, 0)} comprobantes emitidos en el año.</p>
              </CardContent>
            </Card>

            <div className="grid gap-6 lg:grid-cols-2">
              <Lista titulo={`Usuarios (${d.usuarios.length})`} vacio="Sin usuarios">
                {d.usuarios.map((u) => (
                  <li key={u.id} className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1 px-6 py-2 text-sm">
                    <span className="min-w-0 break-words">
                      {u.nombre} <span className="text-muted-foreground">· {u.email} · {u.rol}</span>
                    </span>
                    <span className="flex items-center gap-2 text-xs text-muted-foreground">
                      {u.estado !== "Activo" && <StatusBadge status={u.estado} />}
                      {u.sesionesPisadas > 0 && (
                        <span className="text-warning-ink" data-testid="usuario-compartido" title="Veces que alguien siguió usando este usuario después de que se abriera en otro dispositivo">
                          ¿compartido? {u.sesionesPisadas} {u.sesionesPisadas === 1 ? "vez" : "veces"}
                        </span>
                      )}
                      {u.ultimoAcceso ? fechaHora(u.ultimoAcceso) : "nunca entró"}
                    </span>
                  </li>
                ))}
              </Lista>

              <Lista titulo="Pagos" vacio="Sin pagos">
                {d.pagos.map((p) => (
                  <li key={p.id} className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1 px-6 py-2 text-sm" data-testid="pago-empresa">
                    <span className="min-w-0">
                      {new Date(p.createdAt).toLocaleDateString("es-AR")} · {p.tipo === "cambio" ? "cambio de plan" : p.periodo === "anual" ? "12 meses" : "1 mes"} · {nombreProveedor[p.proveedor] ?? p.proveedor}
                      {p.desde && p.hasta && (
                        <span className="text-muted-foreground">
                          {" "}
                          · {formatDate(p.desde)} al {formatDate(p.hasta)}
                        </span>
                      )}
                    </span>
                    <span className="flex items-center gap-2">
                      <span className="tabular">{formatMoney(p.importeArs)}</span>
                      <StatusBadge status={p.estado} />
                    </span>
                  </li>
                ))}
              </Lista>

              <Lista titulo="Pedidos de soporte" vacio="Sin pedidos">
                {d.tickets.map((t) => (
                  <li key={t.id} className="px-6 py-2 text-sm">
                    <Link to={`/admin/soporte/${t.id}`} className="flex flex-wrap items-center justify-between gap-2 hover:underline">
                      <span className="min-w-0 [overflow-wrap:anywhere]">
                        #{t.numero} {t.asunto}
                      </span>
                      <StatusBadge status={t.estado} />
                    </Link>
                  </li>
                ))}
              </Lista>

              <Lista titulo="Aceptación de términos" vacio="Sin registros">
                {d.aceptaciones.map((a) => (
                  <li key={a.id} className="px-6 py-2 text-sm break-words">
                    Versión {formatDate(a.version)} · {fechaHora(a.aceptadoEn)} <span className="text-muted-foreground">· IP {a.ip ?? "—"}</span>
                  </li>
                ))}
              </Lista>

              <Lista titulo="Auditoría (acciones del panel)" vacio="Sin acciones registradas" testid="auditoria-empresa">
                {d.auditoria.map((a) => (
                  <li key={a.id} className="px-6 py-2 text-sm">
                    {nombreAccion[a.accion] ?? a.accion} <span className="text-muted-foreground">· {fechaHora(a.createdAt)} · {a.adminEmail}</span>
                    {detalleAccion(a) && <div className="text-xs text-muted-foreground [overflow-wrap:anywhere]">{detalleAccion(a)}</div>}
                  </li>
                ))}
              </Lista>
            </div>
          </div>
        )}
      </QueryState>
    </>
  );
}

function Dato({ k, children }: { k: string; children: ReactNode }) {
  return (
    <div className="flex flex-wrap justify-between gap-x-3">
      <span className="text-muted-foreground">{k}</span>
      <span className="text-right">{children}</span>
    </div>
  );
}

function Lista({ titulo, vacio, children, testid }: { titulo: string; vacio: string; children: ReactNode[]; testid?: string }) {
  return (
    <Card className="gap-0 pb-0 shadow-none" data-testid={testid}>
      <CardHeader className="pb-3">
        <CardTitle>{titulo}</CardTitle>
      </CardHeader>
      {children.length === 0 ? <CardContent className="pb-6 text-sm text-muted-foreground">{vacio}</CardContent> : <ul className="max-h-96 divide-y overflow-y-auto border-t">{children}</ul>}
    </Card>
  );
}
