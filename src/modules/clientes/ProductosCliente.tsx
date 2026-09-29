import { useState } from "react";
import { FileText, Loader2, Pencil, Plus, Receipt, Trash2 } from "lucide-react";
import { Link } from "react-router";
import { toast } from "sonner";
import { ApiError } from "@/api/client";
import { useGuardarProductoCliente, useProductos, useProductosCliente, useQuitarProductoCliente } from "@/api/hooks";
import { FRECUENCIAS_USO, type FrecuenciaUso, type ProductoClienteApi } from "@/api/types";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { StatusBadge } from "@/components/shared/StatusBadge";
import { useRole, Si } from "@/context/AuthProvider";
import { formatMoney } from "@/lib/format";
import { aNumero } from "@/lib/numeros";
import { estadoStock, formatCantidad } from "@/modules/productos/stock";

const SIN = "__sin";

/** "?productos=id:cant,id:cant" para precargar factura o presupuesto */
export const parametroProductos = (usos: ProductoClienteApi[]) => usos.filter((u) => u.producto.activo).map((u) => `${u.productoId}:${u.cantidad ?? 1}`).join(",");

interface Edicion {
  id?: string;
  productoId: string;
  cantidad: string;
  frecuencia: FrecuenciaUso | null;
  nota: string;
}

/** Productos que el cliente usa habitualmente, para tenerlos presentes y facturarlos rápido */
export function ProductosCliente({ clienteId }: { clienteId: string }) {
  const { puede } = useRole();
  const { data: usos = [] } = useProductosCliente(clienteId);
  const { data: productos = [] } = useProductos();
  const guardar = useGuardarProductoCliente(clienteId);
  const quitar = useQuitarProductoCliente(clienteId);
  const [ed, setEd] = useState<Edicion | null>(null);
  const [errores, setErrores] = useState<Record<string, string>>({});
  const puedeEditar = puede("clientes.editar");
  const verVentas = puede("facturacion.ver");

  const disponibles = productos.filter((p) => p.activo && (!usos.some((u) => u.productoId === p.id) || p.id === ed?.productoId));
  const param = parametroProductos(usos);

  const grabar = async () => {
    if (!ed) return;
    setErrores({});
    const cantidad = ed.cantidad.trim() ? aNumero(ed.cantidad) : null;
    if (cantidad !== null && (Number.isNaN(cantidad) || cantidad <= 0)) return setErrores({ cantidad: "Cantidad inválida" });
    try {
      await guardar.mutateAsync({ id: ed.id, productoId: ed.productoId, cantidad, frecuencia: ed.frecuencia, nota: ed.nota.trim() || null });
      toast.success(ed.id ? "Guardado" : "Producto agregado al cliente");
      setEd(null);
    } catch (e) {
      if (e instanceof ApiError) {
        setErrores(e.details ?? {});
        toast.error(e.message);
      } else toast.error("No se pudo guardar");
    }
  };

  return (
    <Card className="gap-0 shadow-none" data-testid="productos-cliente">
      <CardHeader className="pb-3">
        <CardTitle>Productos que usa</CardTitle>
        <CardDescription>Lo que este cliente compra habitualmente de tu catálogo.</CardDescription>
      </CardHeader>
      <CardContent className="grid gap-3">
        {usos.length > 0 && verVentas && param && (
          <div className="flex flex-wrap gap-2">
            <Si permiso="facturacion.emitir">
              <Button size="sm" asChild>
                <Link to={`/facturacion/nueva?cliente=${clienteId}&productos=${param}`}>
                  <Receipt className="size-4" /> Facturar estos
                </Link>
              </Button>
            </Si>
            <Button size="sm" variant="outline" asChild>
              <Link to={`/presupuestos/nuevo?cliente=${clienteId}&productos=${param}`}>
                <FileText className="size-4" /> Presupuestar
              </Link>
            </Button>
          </div>
        )}

        {usos.length === 0 && !ed && <p className="text-sm text-muted-foreground">Todavía no le asignaste productos.</p>}

        <ul className="grid gap-2">
          {usos.map((u) =>
            ed?.id === u.id ? null : (
              <li key={u.id} className="group rounded-lg border p-3 text-sm" data-testid="producto-cliente">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <Link to={`/productos/${u.productoId}`} className="font-medium hover:underline">
                      {u.producto.descripcion}
                    </Link>
                    <div className="text-xs text-muted-foreground">
                      {u.producto.codigo} · {formatMoney(u.producto.precio)} + IVA
                      {u.cantidad !== null && (
                        <>
                          {" · "}
                          <span className="font-medium text-foreground">
                            {formatCantidad(u.cantidad)} {u.producto.unidad}
                            {u.frecuencia ? ` ${u.frecuencia}` : ""}
                          </span>
                        </>
                      )}
                      {u.cantidad === null && u.frecuencia && ` · ${u.frecuencia}`}
                    </div>
                    {u.nota && <div className="mt-1 text-xs italic text-muted-foreground">{u.nota}</div>}
                  </div>
                  <div className="flex shrink-0 items-center gap-1">
                    {!u.producto.activo ? <StatusBadge status="Inactivo" /> : u.producto.controlaStock && <StatusBadge status={estadoStock(u.producto)} />}
                    {puedeEditar && (
                      <span className="flex opacity-60 group-hover:opacity-100">
                        <Button
                          size="icon-sm"
                          variant="ghost"
                          className="size-7"
                          aria-label={`Editar ${u.producto.descripcion}`}
                          onClick={() => setEd({ id: u.id, productoId: u.productoId, cantidad: u.cantidad === null ? "" : formatCantidad(u.cantidad), frecuencia: u.frecuencia, nota: u.nota ?? "" })}
                        >
                          <Pencil className="size-3.5" />
                        </Button>
                        <Button
                          size="icon-sm"
                          variant="ghost"
                          className="size-7 hover:text-destructive"
                          aria-label={`Quitar ${u.producto.descripcion}`}
                          onClick={async () => {
                            try {
                              await quitar.mutateAsync(u.id);
                            } catch {
                              toast.error("No se pudo quitar");
                            }
                          }}
                        >
                          <Trash2 className="size-3.5" />
                        </Button>
                      </span>
                    )}
                  </div>
                </div>
              </li>
            ),
          )}
        </ul>

        {ed ? (
          <form
            className="grid gap-3 rounded-lg border border-primary/40 p-3"
            onSubmit={(e) => {
              e.preventDefault();
              grabar();
            }}
          >
            {!ed.id && (
              <div className="grid gap-1.5">
                <Label htmlFor="uso-producto">Producto</Label>
                <Select value={ed.productoId} onValueChange={(v) => setEd({ ...ed, productoId: v })}>
                  <SelectTrigger id="uso-producto" className="w-full" aria-invalid={!!errores.productoId}>
                    <SelectValue placeholder="Elegí un producto" />
                  </SelectTrigger>
                  <SelectContent>
                    {disponibles.map((p) => (
                      <SelectItem key={p.id} value={p.id}>
                        {p.descripcion} · {p.codigo}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {errores.productoId && <p className="text-xs text-destructive">{errores.productoId}</p>}
              </div>
            )}
            <div className="grid grid-cols-2 gap-3">
              <div className="grid gap-1.5">
                <Label htmlFor="uso-cantidad">Cantidad habitual</Label>
                <Input id="uso-cantidad" inputMode="decimal" value={ed.cantidad} onChange={(e) => setEd({ ...ed, cantidad: e.target.value })} placeholder="Opcional" aria-invalid={!!errores.cantidad} />
                {errores.cantidad && <p className="text-xs text-destructive">{errores.cantidad}</p>}
              </div>
              <div className="grid gap-1.5">
                <Label htmlFor="uso-frecuencia">Cada cuánto</Label>
                <Select value={ed.frecuencia ?? SIN} onValueChange={(v) => setEd({ ...ed, frecuencia: v === SIN ? null : (v as FrecuenciaUso) })}>
                  <SelectTrigger id="uso-frecuencia" className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={SIN}>Sin indicar</SelectItem>
                    {FRECUENCIAS_USO.map((f) => (
                      <SelectItem key={f} value={f}>
                        {f}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="uso-nota">Comentario</Label>
              <Input id="uso-nota" value={ed.nota} onChange={(e) => setEd({ ...ed, nota: e.target.value })} placeholder="Ej.: para la impresora de recepción" />
            </div>
            <div className="flex justify-end gap-2">
              <Button type="button" size="sm" variant="ghost" onClick={() => setEd(null)}>
                Cancelar
              </Button>
              <Button type="submit" size="sm" disabled={!ed.productoId || guardar.isPending}>
                {guardar.isPending && <Loader2 className="size-4 animate-spin" />}
                {ed.id ? "Guardar" : "Agregar"}
              </Button>
            </div>
          </form>
        ) : (
          puedeEditar && (
            <Button type="button" variant="outline" size="sm" className="justify-self-start" onClick={() => setEd({ productoId: "", cantidad: "", frecuencia: null, nota: "" })} disabled={productos.length === 0}>
              <Plus className="size-4" /> Asignar producto
            </Button>
          )
        )}
      </CardContent>
    </Card>
  );
}
