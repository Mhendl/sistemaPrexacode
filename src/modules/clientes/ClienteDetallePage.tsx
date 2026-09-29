import { useState } from "react";
import { ArrowLeft, Building2, FileText, Mail, MapPin, Pencil, Phone, Plus, Trash2, Truck, User, Wallet } from "lucide-react";
import { Link, useNavigate, useParams } from "react-router";
import { toast } from "sonner";
import { ApiError } from "@/api/client";
import { useCliente, useComprobantes, useCuentaCorriente, useEliminarCliente, usePresupuestos, useRemitos } from "@/api/hooks";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { QueryState } from "@/components/shared/QueryState";
import { StatusBadge } from "@/components/shared/StatusBadge";
import { useRole, Si } from "@/context/AuthProvider";
import { formatCuit, formatDate, formatMoney } from "@/lib/format";
import { numeroComprobante } from "@/lib/facturacion";
import { AgendaCliente } from "@/modules/agenda/AgendaCliente";
import { OportunidadesCliente } from "@/modules/oportunidades/OportunidadesCliente";
import { numeroPresupuesto } from "@/modules/presupuestos/PresupuestoHoja";
import { numeroRemito } from "@/modules/remitos/RemitoHoja";
import { ClienteFormDialog } from "./ClienteFormDialog";
import { NotasCliente } from "./NotasCliente";
import { ProductosCliente } from "./ProductosCliente";

export function ClienteDetallePage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { data: cliente, isLoading, error, refetch } = useCliente(id);
  const { puede } = useRole();
  // Cada parte de la ficha se muestra (y se pide al servidor) solo si el rol la puede ver
  const verCobranzas = puede("cobranzas.ver");
  const ver = { remitos: puede("remitos.ver"), facturas: puede("facturacion.ver"), presupuestos: puede("presupuestos.ver"), oportunidades: puede("oportunidades.ver"), agenda: puede("agenda.ver") };
  const { data: remitos = [] } = useRemitos(id, ver.remitos);
  const { data: comprobantes = [] } = useComprobantes(id, ver.facturas);
  const { data: cuenta } = useCuentaCorriente(id, verCobranzas);
  const { data: presupuestos = [] } = usePresupuestos(id, ver.presupuestos);
  const eliminar = useEliminarCliente();
  const [editar, setEditar] = useState(false);
  const [confirmar, setConfirmar] = useState(false);

  const borrar = async () => {
    try {
      await eliminar.mutateAsync(cliente!.id);
      toast.success("Cliente eliminado");
      navigate("/clientes");
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : "No se pudo eliminar");
    }
  };

  return (
    <>
      <Button variant="ghost" size="sm" asChild className="mb-3 -ml-2 text-muted-foreground">
        <Link to="/clientes">
          <ArrowLeft className="size-4" /> Clientes
        </Link>
      </Button>

      <QueryState isLoading={isLoading} error={error} onRetry={refetch}>
        {cliente && (
          <>
            <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
              <div className="flex items-start gap-4">
                <div className="flex size-14 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-primary to-highlight text-lg font-bold text-white">
                  {cliente.razonSocial.slice(0, 2).toUpperCase()}
                </div>
                <div>
                  <h1 className="text-2xl font-semibold tracking-tight">{cliente.razonSocial}</h1>
                  <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-muted-foreground">
                    <span className="tabular">CUIT {formatCuit(cliente.cuit)}</span>
                    <span>{cliente.condicionIva}</span>
                    <StatusBadge status={cliente.estado} />
                  </div>
                </div>
              </div>
              <div className="flex flex-wrap gap-2">
                <Si permiso="clientes.editar">
                  <Button variant="outline" onClick={() => setEditar(true)}>
                    <Pencil className="size-4" /> Editar
                  </Button>
                </Si>
                <Si permiso="clientes.editar">
                  <Button variant="outline" onClick={() => setConfirmar(true)} aria-label="Eliminar cliente">
                    <Trash2 className="size-4" />
                  </Button>
                </Si>
                <Si permiso="facturacion.emitir">
                  <Button asChild>
                    <Link to={`/facturacion/nueva?cliente=${cliente.id}`}>
                      <Plus className="size-4" /> Facturar
                    </Link>
                  </Button>
                </Si>
              </div>
            </div>

            <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
              <Card className="shadow-none">
                <CardHeader>
                  <CardTitle>Datos de contacto</CardTitle>
                </CardHeader>
                <CardContent className="grid gap-4 text-sm sm:grid-cols-2">
                  <Dato icon={User} label="Contacto" value={cliente.contacto} />
                  <Dato icon={Phone} label="Teléfono / WhatsApp" value={cliente.telefono} />
                  <Dato icon={Mail} label="Email" value={cliente.email} />
                  <Dato icon={MapPin} label="Domicilio" value={[cliente.domicilio, cliente.localidad].filter(Boolean).join(", ")} />
                  <Dato icon={Building2} label="Rubro" value={cliente.rubro} />
                  <Dato label="Cliente desde" value={formatDate(new Date(cliente.createdAt))} />
                  {cliente.notas && <Dato icon={FileText} label="Notas" value={cliente.notas} className="sm:col-span-2" />}
                </CardContent>
              </Card>

              {ver.remitos && (
                <Card className="gap-0 pb-0 shadow-none">
                  <CardHeader className="flex flex-row items-center justify-between pb-4">
                    <CardTitle>Remitos</CardTitle>
                    <Si permiso="remitos.emitir">
                      <Button variant="outline" size="sm" asChild>
                        <Link to={`/remitos/nuevo?cliente=${cliente.id}`}>
                          <Truck className="size-4" /> Nuevo remito
                        </Link>
                      </Button>
                    </Si>
                  </CardHeader>
                  {remitos.length === 0 ? (
                    <CardContent className="pb-6 text-sm text-muted-foreground">Todavía no tiene remitos.</CardContent>
                  ) : (
                    <ul className="border-t">
                      {remitos.slice(0, 8).map((r) => (
                        <li key={r.id} className="border-b last:border-b-0">
                          <Link to={`/remitos/${r.id}`} className="flex items-center justify-between gap-3 px-6 py-2.5 text-sm hover:bg-muted/40">
                            <span>
                              <span className="tabular font-medium">{numeroRemito(r)}</span>
                              <span className="text-muted-foreground"> · {formatDate(r.fecha)} · {r.items} {r.items === 1 ? "ítem" : "ítems"}</span>
                            </span>
                            <StatusBadge status={r.estado} />
                          </Link>
                        </li>
                      ))}
                    </ul>
                  )}
                </Card>
              )}

              <NotasCliente clienteId={cliente.id} />
              <ProductosCliente clienteId={cliente.id} />

              {ver.agenda && <AgendaCliente clienteId={cliente.id} />}

              {ver.oportunidades && <OportunidadesCliente clienteId={cliente.id} />}

              {ver.presupuestos && (
                <Card className="gap-0 pb-0 shadow-none lg:col-span-2" data-testid="presupuestos-cliente">
                  <CardHeader className="flex flex-row items-center justify-between pb-4">
                    <CardTitle>Presupuestos</CardTitle>
                    <Si permiso="presupuestos.editar">
                      <Button variant="outline" size="sm" asChild>
                        <Link to={`/presupuestos/nuevo?cliente=${cliente.id}`}>
                          <FileText className="size-4" /> Nuevo presupuesto
                        </Link>
                      </Button>
                    </Si>
                  </CardHeader>
                  {presupuestos.length === 0 ? (
                    <CardContent className="pb-6 text-sm text-muted-foreground">Todavía no tiene presupuestos.</CardContent>
                  ) : (
                    <ul className="border-t">
                      {presupuestos.slice(0, 8).map((p) => (
                        <li key={p.id} className="border-b last:border-b-0">
                          <Link to={`/presupuestos/${p.id}`} className="flex items-center justify-between gap-3 px-6 py-2.5 text-sm hover:bg-muted/40">
                            <span>
                              <span className="tabular font-medium">{numeroPresupuesto(p.numero)}</span>
                              <span className="text-muted-foreground"> · {formatDate(p.fecha)} · </span>
                              <span className="tabular whitespace-nowrap">{formatMoney(p.total)}</span>
                            </span>
                            <StatusBadge status={p.estado} />
                          </Link>
                        </li>
                      ))}
                    </ul>
                  )}
                </Card>
              )}

              {ver.facturas && (
                <Card className="gap-0 pb-0 shadow-none lg:col-span-2">
                  <CardHeader className="flex flex-row items-center justify-between pb-4">
                    <CardTitle>Comprobantes</CardTitle>
                    <Si permiso="facturacion.emitir">
                      <Button variant="outline" size="sm" asChild>
                        <Link to={`/facturacion/nueva?cliente=${cliente.id}`}>
                          <Plus className="size-4" /> Nueva factura
                        </Link>
                      </Button>
                    </Si>
                  </CardHeader>
                  {comprobantes.length === 0 ? (
                    <CardContent className="pb-6 text-sm text-muted-foreground">Todavía no tiene comprobantes.</CardContent>
                  ) : (
                    <ul className="border-t">
                      {comprobantes.slice(0, 10).map((c) => (
                        <li key={c.id} className="border-b last:border-b-0">
                          <Link to={`/facturacion/${c.id}`} className="flex items-center justify-between gap-3 px-6 py-2.5 text-sm hover:bg-muted/40">
                            <span>
                              <span className="font-medium">{c.tipo}</span> <span className="tabular">{numeroComprobante(c.puntoVenta, c.numero)}</span>
                              <span className="text-muted-foreground"> · {formatDate(c.fecha)}</span>
                            </span>
                            <span className="flex items-center gap-3">
                              <span className="tabular font-medium">{formatMoney(c.clase === "nota_credito" ? -c.total : c.total)}</span>
                              <StatusBadge status={c.estado} />
                            </span>
                          </Link>
                        </li>
                      ))}
                    </ul>
                  )}
                </Card>
              )}
              <Card className="gap-0 pb-0 shadow-none lg:col-span-2" data-testid="cuenta-corriente">
                <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-2 pb-4">
                  <div>
                    <CardTitle>Cuenta corriente</CardTitle>
                    {cuenta && (
                      <div className="mt-1 text-sm">
                        Saldo:{" "}
                        <b className={cuenta.saldo > 0 ? "text-destructive" : "text-success"} data-testid="saldo-cliente">
                          {formatMoney(cuenta.saldo)}
                        </b>
                        {cuenta.aCuenta > 0 && <span className="text-muted-foreground"> · a favor sin aplicar {formatMoney(cuenta.aCuenta)}</span>}
                      </div>
                    )}
                  </div>
                  <Si permiso="cobranzas.cobrar">
                    <Button size="sm" asChild>
                      <Link to={`/cobranzas/nuevo?cliente=${cliente.id}`}>
                        <Wallet className="size-4" /> Registrar cobro
                      </Link>
                    </Button>
                  </Si>
                </CardHeader>
                {!cuenta || cuenta.movimientos.length === 0 ? (
                  <CardContent className="pb-6 text-sm text-muted-foreground">Sin movimientos.</CardContent>
                ) : (
                  <div className="overflow-x-auto border-t">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b bg-muted/40 text-left text-xs text-muted-foreground">
                          <th className="px-6 py-2 font-medium">Fecha</th>
                          <th className="px-3 py-2 font-medium">Movimiento</th>
                          <th className="px-3 py-2 text-right font-medium">Debe</th>
                          <th className="px-3 py-2 text-right font-medium">Haber</th>
                          <th className="px-6 py-2 text-right font-medium">Saldo</th>
                        </tr>
                      </thead>
                      <tbody>
                        {cuenta.movimientos.slice(-15).map((m, i) => (
                          <tr key={i} className="border-b last:border-b-0 hover:bg-muted/40" data-testid="movimiento-cc">
                            <td className="tabular px-6 py-2 text-muted-foreground">{formatDate(m.fecha)}</td>
                            <td className="px-3 py-2">
                              <Link to={m.link} className="hover:underline">
                                {m.descripcion}
                              </Link>
                            </td>
                            <td className="tabular px-3 py-2 text-right">{m.debe ? formatMoney(m.debe) : ""}</td>
                            <td className="tabular px-3 py-2 text-right">{m.haber ? formatMoney(m.haber) : ""}</td>
                            <td className="tabular px-6 py-2 text-right font-medium">{formatMoney(m.saldo)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </Card>
            </div>

            <ClienteFormDialog open={editar} onOpenChange={setEditar} cliente={cliente} />

            <Dialog open={confirmar} onOpenChange={setConfirmar}>
              <DialogContent className="sm:max-w-md">
                <DialogHeader>
                  <DialogTitle>¿Eliminar a {cliente.razonSocial}?</DialogTitle>
                  <DialogDescription>Esta acción no se puede deshacer. Si solo querés dejar de verlo, editalo y marcalo como Inactivo.</DialogDescription>
                </DialogHeader>
                <DialogFooter>
                  <Button variant="outline" onClick={() => setConfirmar(false)}>
                    Cancelar
                  </Button>
                  <Button variant="destructive" onClick={borrar} disabled={eliminar.isPending}>
                    Eliminar
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
          </>
        )}
      </QueryState>
    </>
  );
}

function Dato({ icon: Icon, label, value, className }: { icon?: typeof User; label: string; value: string | null; className?: string }) {
  return (
    <div className={`flex items-start gap-3 ${className ?? ""}`}>
      {Icon ? <Icon className="mt-0.5 size-4 text-muted-foreground" /> : <span className="w-4" />}
      <div className="min-w-0">
        <div className="text-xs text-muted-foreground">{label}</div>
        <div className="break-words">{value || "—"}</div>
      </div>
    </div>
  );
}
