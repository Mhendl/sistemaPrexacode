import { useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { ApiError } from "@/api/client";
import { useRegistrarMovimiento } from "@/api/hooks";
import type { ProductoApi, TipoMovimiento } from "@/api/types";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import { aNumero } from "@/lib/numeros";
import { formatCantidad } from "./stock";

const tipos: { id: TipoMovimiento; label: string; ayuda: string; motivo: string }[] = [
  { id: "ingreso", label: "Ingreso", ayuda: "Entra mercadería (compra, devolución)", motivo: "Compra a proveedor" },
  { id: "egreso", label: "Egreso", ayuda: "Sale mercadería (venta, rotura, consumo)", motivo: "Venta" },
  { id: "ajuste", label: "Ajuste", ayuda: "Corregir según lo que contaste en el depósito", motivo: "Inventario físico" },
];

export function MovimientoDialog({
  producto,
  open,
  onOpenChange,
  tipoInicial = "ingreso",
}: {
  producto: ProductoApi;
  open: boolean;
  onOpenChange: (o: boolean) => void;
  tipoInicial?: TipoMovimiento;
}) {
  const registrar = useRegistrarMovimiento();
  const [tipo, setTipo] = useState<TipoMovimiento>("ingreso");
  const [cantidad, setCantidad] = useState("");
  const [motivo, setMotivo] = useState("");
  const [errores, setErrores] = useState<Record<string, string>>({});

  useEffect(() => {
    if (!open) return;
    setTipo(tipoInicial);
    setCantidad("");
    setMotivo("");
    setErrores({});
  }, [open, tipoInicial]);

  const n = aNumero(cantidad);
  const resultante = Number.isNaN(n) ? null : tipo === "ingreso" ? producto.stock + n : tipo === "egreso" ? producto.stock - n : n;

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrores({});
    try {
      const datos = tipo === "ajuste" ? { tipo, stockContado: n, motivo: motivo || tipos[2].motivo } : { tipo, cantidad: n, motivo: motivo || tipos.find((t) => t.id === tipo)!.motivo };
      const r = await registrar.mutateAsync({ productoId: producto.id, datos });
      toast.success(`Stock actualizado: ${formatCantidad(r.producto.stock)} ${producto.unidad}`);
      onOpenChange(false);
    } catch (err) {
      if (err instanceof ApiError) {
        setErrores(err.details);
        toast.error(err.message);
      } else throw err;
    }
  };

  const errorCantidad = errores.cantidad ?? errores.stockContado;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Movimiento de stock</DialogTitle>
          <DialogDescription>
            {producto.descripcion} · stock actual {formatCantidad(producto.stock)} {producto.unidad}
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={submit} className="grid gap-4" noValidate>
          <div className="grid grid-cols-3 gap-2" role="radiogroup" aria-label="Tipo de movimiento">
            {tipos.map((t) => (
              <button
                key={t.id}
                type="button"
                role="radio"
                aria-checked={tipo === t.id}
                onClick={() => setTipo(t.id)}
                className={cn("rounded-lg border px-2 py-2 text-sm font-medium transition-colors", tipo === t.id ? "border-primary bg-primary/5 text-primary ring-1 ring-primary" : "hover:bg-muted/60")}
              >
                {t.label}
              </button>
            ))}
          </div>
          <p className="-mt-2 text-xs text-muted-foreground">{tipos.find((t) => t.id === tipo)!.ayuda}</p>

          <div className="grid gap-1.5">
            <Label htmlFor="mov-cantidad">{tipo === "ajuste" ? "Stock contado" : "Cantidad"}</Label>
            <Input id="mov-cantidad" inputMode="decimal" value={cantidad} onChange={(e) => setCantidad(e.target.value)} autoFocus aria-invalid={!!errorCantidad} />
            {errorCantidad && <p className="text-xs text-destructive">{errorCantidad}</p>}
            {resultante !== null && !errorCantidad && (
              <p className={cn("text-xs", resultante < 0 ? "text-destructive" : "text-muted-foreground")}>
                Quedaría en {formatCantidad(resultante)} {producto.unidad}
              </p>
            )}
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="mov-motivo">Motivo</Label>
            <Input id="mov-motivo" value={motivo} onChange={(e) => setMotivo(e.target.value)} placeholder={tipos.find((t) => t.id === tipo)!.motivo} />
            {errores.motivo && <p className="text-xs text-destructive">{errores.motivo}</p>}
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancelar
            </Button>
            <Button type="submit" disabled={registrar.isPending}>
              {registrar.isPending && <Loader2 className="size-4 animate-spin" />}
              Registrar
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
