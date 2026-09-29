import { useState } from "react";
import { ArrowLeft, Check, Copy, Pencil, Printer, Receipt, Send, Trash2, X } from "lucide-react";
import { Link, useNavigate, useParams } from "react-router";
import { toast } from "sonner";
import { ApiError } from "@/api/client";
import { useAccionPresupuesto, usePresupuesto } from "@/api/hooks";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { PaperFit } from "@/components/shared/PaperFit";
import { QueryState } from "@/components/shared/QueryState";
import { StatusBadge } from "@/components/shared/StatusBadge";
import { useRole, Si } from "@/context/AuthProvider";
import { numeroComprobante } from "@/lib/facturacion";
import { CompartirDialog } from "@/modules/documentos/CompartirDialog";
import { numeroPresupuesto, PresupuestoHoja } from "./PresupuestoHoja";

const nombreTipo: Record<number, string> = { 1: "Factura A", 6: "Factura B", 11: "Factura C" };

export function PresupuestoDetallePage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { empresa } = useRole();
  const { data: p, isLoading, error, refetch } = usePresupuesto(id);
  const accion = useAccionPresupuesto();
  const [borrar, setBorrar] = useState(false);
  const [compartir, setCompartir] = useState(false);

  const ejecutar = async (a: "estado" | "duplicar" | "eliminar", estado?: string) => {
    try {
      const r = await accion.mutateAsync({ id: p!.id, accion: a, estado });
      if (a === "duplicar" && r) {
        toast.success(`Se creó el presupuesto ${numeroPresupuesto(r.numero)}`);
        navigate(`/presupuestos/${r.id}`);
      } else if (a === "eliminar") {
        toast.success("Presupuesto eliminado");
        navigate("/presupuestos");
      } else toast.success(`Marcado como ${estado?.toLowerCase()}`);
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : "No se pudo completar");
    }
  };

  const editable = p && p.estado !== "Facturado";

  return (
    <>
      <Button variant="ghost" size="sm" asChild className="mb-3 -ml-2 text-muted-foreground">
        <Link to="/presupuestos">
          <ArrowLeft className="size-4" /> Presupuestos
        </Link>
      </Button>
      <QueryState isLoading={isLoading} error={error} onRetry={refetch}>
        {p && (
          <>
            <div className="mb-5 flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
              <div>
                <h1 className="flex flex-wrap items-center gap-3 text-2xl font-semibold tracking-tight">
                  Presupuesto {numeroPresupuesto(p.numero)} <StatusBadge status={p.estado} />
                </h1>
                <Link to={`/clientes/${p.clienteId}`} className="text-sm text-muted-foreground hover:underline">
                  {p.cliente.razonSocial}
                </Link>
                {p.factura && (
                  <div className="mt-1 text-sm">
                    Facturado con{" "}
                    <Link to={`/facturacion/${p.factura.id}`} className="font-medium text-primary hover:underline">
                      {nombreTipo[p.factura.tipoCbte]} {numeroComprobante(p.factura.puntoVenta, p.factura.numero)}
                    </Link>
                  </div>
                )}
              </div>
              <div className="flex flex-wrap gap-2">
                {editable && (
                  <>
                    {p.estado !== "Aceptado" && (
                      <Button variant="outline" onClick={() => ejecutar("estado", "Aceptado")} disabled={accion.isPending}>
                        <Check className="size-4" /> Aceptado
                      </Button>
                    )}
                    {p.estado !== "Rechazado" && (
                      <Button variant="outline" onClick={() => ejecutar("estado", "Rechazado")} disabled={accion.isPending}>
                        <X className="size-4" /> Rechazado
                      </Button>
                    )}
                    <Si permiso="presupuestos.editar">
                      <Button variant="outline" asChild>
                        <Link to={`/presupuestos/${p.id}/editar`}>
                          <Pencil className="size-4" /> Editar
                        </Link>
                      </Button>
                    </Si>
                  </>
                )}
                <Si permiso="presupuestos.editar">
                  <Button variant="outline" onClick={() => ejecutar("duplicar")} disabled={accion.isPending}>
                    <Copy className="size-4" /> Duplicar
                  </Button>
                </Si>
                {editable && (
                  <Si permiso="presupuestos.editar">
                    <Button variant="outline" onClick={() => setBorrar(true)} aria-label="Eliminar presupuesto">
                      <Trash2 className="size-4" />
                    </Button>
                  </Si>
                )}
                <Button variant="outline" onClick={() => setCompartir(true)}>
                  <Send className="size-4" /> Enviar
                </Button>
                <Button variant="outline" onClick={() => window.print()}>
                  <Printer className="size-4" /> Imprimir / PDF
                </Button>
                {editable && (
                  <Si permiso="facturacion.emitir">
                    <Button asChild>
                      <Link to={`/facturacion/nueva?presupuesto=${p.id}`}>
                        <Receipt className="size-4" /> Facturar
                      </Link>
                    </Button>
                  </Si>
                )}
              </div>
            </div>

            <div className="zona-impresion rounded-xl bg-muted p-3 sm:p-6">
              <PaperFit>
                <PresupuestoHoja
                  empresa={empresa}
                  p={{ ...p, cliente: { ...p.cliente, domicilio: [p.cliente.domicilio, p.cliente.localidad].filter(Boolean).join(", ") || null } }}
                />
              </PaperFit>
            </div>

            <CompartirDialog open={compartir} onOpenChange={setCompartir} tipo="presupuesto" id={p.id} />

            <Dialog open={borrar} onOpenChange={setBorrar}>
              <DialogContent className="sm:max-w-md">
                <DialogHeader>
                  <DialogTitle>¿Eliminar el presupuesto {numeroPresupuesto(p.numero)}?</DialogTitle>
                  <DialogDescription>No se puede deshacer. Si el cliente lo rechazó, podés marcarlo como Rechazado en lugar de borrarlo.</DialogDescription>
                </DialogHeader>
                <DialogFooter>
                  <Button variant="outline" onClick={() => setBorrar(false)}>
                    Cancelar
                  </Button>
                  <Button variant="destructive" onClick={() => ejecutar("eliminar")} disabled={accion.isPending}>
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
