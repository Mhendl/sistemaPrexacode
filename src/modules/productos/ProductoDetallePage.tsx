import { useState } from "react";
import { ArrowDownRight, ArrowLeft, ArrowUpRight, ArrowLeftRight, Pencil, Trash2 } from "lucide-react";
import { Link, useNavigate, useParams } from "react-router";
import { toast } from "sonner";
import { ApiError } from "@/api/client";
import { useEliminarProducto, useMovimientosProducto, useProducto } from "@/api/hooks";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { QueryState } from "@/components/shared/QueryState";
import { StatusBadge } from "@/components/shared/StatusBadge";
import { useRole } from "@/context/AuthProvider";
import { formatDate, formatMoney } from "@/lib/format";
import { cn } from "@/lib/utils";
import { MovimientoDialog } from "./MovimientoDialog";
import { ProductoFormDialog } from "./ProductoFormDialog";
import { estadoStock, formatCantidad, tipoMovimientoLabel } from "./stock";

const hora = (iso: string) => new Date(iso).toLocaleTimeString("es-AR", { hour: "2-digit", minute: "2-digit" });

export function ProductoDetallePage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { puede } = useRole();
  const puedeEditar = puede("productos.editar");
  const puedeMover = puede("stock.movimientos");
  const { data: p, isLoading, error, refetch } = useProducto(id);
  const { data: movimientos = [] } = useMovimientosProducto(id);
  const eliminar = useEliminarProducto();
  const [editar, setEditar] = useState(false);
  const [mover, setMover] = useState<false | "ingreso" | "ajuste">(false);
  const [confirmar, setConfirmar] = useState(false);

  const borrar = async () => {
    try {
      await eliminar.mutateAsync(p!.id);
      toast.success("Producto eliminado");
      navigate("/productos");
    } catch (e) {
      setConfirmar(false);
      toast.error(e instanceof ApiError ? e.message : "No se pudo eliminar");
    }
  };

  const conIva = p ? p.precio * (1 + p.alicuotaIva / 100) : 0;

  return (
    <>
      <Button variant="ghost" size="sm" asChild className="mb-3 -ml-2 text-muted-foreground">
        <Link to="/productos">
          <ArrowLeft className="size-4" /> Productos
        </Link>
      </Button>

      <QueryState isLoading={isLoading} error={error} onRetry={refetch}>
        {p && (
          <>
            <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
              <div>
                <div className="text-sm text-muted-foreground tabular">{p.codigo}</div>
                <h1 className="text-2xl font-semibold tracking-tight">{p.descripcion}</h1>
                <div className="mt-1 flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
                  {p.categoria ?? "Sin categoría"}
                  <StatusBadge status={estadoStock(p)} />
                  {!p.activo && <StatusBadge status="Inactivo" />}
                </div>
              </div>
              {(puedeEditar || puedeMover) && (
                <div className="flex flex-wrap gap-2">
                  {puedeEditar && (
                    <>
                      <Button variant="outline" onClick={() => setEditar(true)}>
                        <Pencil className="size-4" /> Editar
                      </Button>
                      <Button variant="outline" onClick={() => setConfirmar(true)} aria-label="Eliminar producto">
                        <Trash2 className="size-4" />
                      </Button>
                    </>
                  )}
                  {puedeMover && p.controlaStock && (
                    <Button onClick={() => setMover("ingreso")}>
                      <ArrowLeftRight className="size-4" /> Movimiento de stock
                    </Button>
                  )}
                </div>
              )}
            </div>

            <div className="mb-6 grid gap-4 sm:grid-cols-3">
              <Card className="gap-1 p-4 shadow-none">
                <div className="text-sm text-muted-foreground">Stock actual</div>
                <div className={cn("tabular text-2xl font-semibold", p.controlaStock && p.stock < p.stockMinimo && "text-destructive")} data-testid="stock-actual">
                  {p.controlaStock ? `${formatCantidad(p.stock)} ${p.unidad}` : "No controla stock"}
                </div>
                {p.controlaStock && (
                  <div className="flex items-center justify-between gap-2 text-xs text-muted-foreground">
                    <span>
                      Mínimo: {formatCantidad(p.stockMinimo)} {p.unidad}
                    </span>
                    {puedeEditar && (
                      <Button variant="link" size="xs" className="h-auto p-0" onClick={() => setMover("ajuste")}>
                        Corregir stock
                      </Button>
                    )}
                  </div>
                )}
              </Card>
              <Card className="gap-1 p-4 shadow-none">
                <div className="text-sm text-muted-foreground">Precio sin IVA</div>
                <div className="tabular text-2xl font-semibold" data-testid="precio">
                  {formatMoney(p.precio)}
                </div>
                <div className="text-xs text-muted-foreground">IVA {p.alicuotaIva.toLocaleString("es-AR")} %</div>
              </Card>
              <Card className="gap-1 p-4 shadow-none">
                <div className="text-sm text-muted-foreground">Precio final con IVA</div>
                <div className="tabular text-2xl font-semibold">{formatMoney(conIva)}</div>
                <div className="text-xs text-muted-foreground">por {p.unidad}</div>
              </Card>
            </div>

            {p.controlaStock && (
              <Card className="gap-0 pb-0 shadow-none">
                <CardHeader className="pb-4">
                  <CardTitle>Historial de movimientos</CardTitle>
                </CardHeader>
                <CardContent className="p-0">
                  {movimientos.length === 0 ? (
                    <p className="px-6 pb-6 text-sm text-muted-foreground">Todavía no hay movimientos.</p>
                  ) : (
                    <div className="overflow-x-auto">
                      <table className="w-full text-sm">
                        <thead>
                          <tr className="border-y bg-muted/40 text-left text-xs text-muted-foreground">
                            <th className="px-6 py-2 font-medium">Fecha</th>
                            <th className="px-3 py-2 font-medium">Movimiento</th>
                            <th className="px-3 py-2 text-right font-medium">Cantidad</th>
                            <th className="px-6 py-2 text-right font-medium">Stock</th>
                          </tr>
                        </thead>
                        <tbody>
                          {movimientos.map((m) => (
                            <tr key={m.id} className="border-b last:border-b-0" data-testid="movimiento">
                              <td className="tabular px-6 py-2.5 whitespace-nowrap text-muted-foreground">
                                {formatDate(new Date(m.createdAt))} {hora(m.createdAt)}
                              </td>
                              <td className="px-3 py-2.5">
                                <div className="font-medium">{tipoMovimientoLabel[m.tipo]}</div>
                                <div className="text-xs text-muted-foreground">{m.motivo}</div>
                              </td>
                              <td className={cn("tabular px-3 py-2.5 text-right font-medium whitespace-nowrap", m.cantidad > 0 ? "text-success" : "text-destructive")}>
                                <span className="inline-flex items-center gap-0.5">
                                  {m.cantidad > 0 ? <ArrowUpRight className="size-3.5" /> : <ArrowDownRight className="size-3.5" />}
                                  {m.cantidad > 0 ? "+" : ""}
                                  {formatCantidad(m.cantidad)}
                                </span>
                              </td>
                              <td className="tabular px-6 py-2.5 text-right">{formatCantidad(m.stockResultante)}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </CardContent>
              </Card>
            )}

            <ProductoFormDialog open={editar} onOpenChange={setEditar} producto={p} />
            <MovimientoDialog open={!!mover} onOpenChange={(o) => !o && setMover(false)} producto={p} tipoInicial={mover || "ingreso"} />

            <Dialog open={confirmar} onOpenChange={setConfirmar}>
              <DialogContent className="sm:max-w-md">
                <DialogHeader>
                  <DialogTitle>¿Eliminar {p.descripcion}?</DialogTitle>
                  <DialogDescription>Si el producto ya tuvo movimientos de stock no se puede eliminar: en ese caso marcalo como inactivo.</DialogDescription>
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
