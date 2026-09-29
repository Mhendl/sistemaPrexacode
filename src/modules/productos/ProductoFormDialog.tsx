import { useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { useQueryClient } from "@tanstack/react-query";
import { manejarErrorGuardado } from "@/api/errores";
import { useCategorias, useGuardarProducto } from "@/api/hooks";
import type { ProductoApi } from "@/api/types";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { aNumero } from "@/lib/numeros";
import { cn } from "@/lib/utils";
import { ALICUOTAS_IVA } from "./stock";

/** En el formulario los números se editan como texto (acepta coma decimal) */
interface Form {
  codigo: string;
  descripcion: string;
  categoria: string;
  unidad: string;
  precio: string;
  alicuotaIva: string;
  controlaStock: boolean;
  stockMinimo: string;
  stockInicial: string;
  activo: boolean;
}

const vacio: Form = { codigo: "", descripcion: "", categoria: "", unidad: "u.", precio: "", alicuotaIva: "21", controlaStock: true, stockMinimo: "0", stockInicial: "0", activo: true };

const aTexto = (n: number) => String(n).replace(".", ",");

interface Props {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  producto?: ProductoApi;
  onSaved?: (p: ProductoApi) => void;
}

export function ProductoFormDialog({ open, onOpenChange, producto, onSaved }: Props) {
  const guardar = useGuardarProducto();
  const qc = useQueryClient();
  const { data: categorias = [] } = useCategorias();
  const [f, setF] = useState<Form>(vacio);
  const [errores, setErrores] = useState<Record<string, string>>({});

  useEffect(() => {
    if (!open) return;
    setErrores({});
    setF(
      producto
        ? {
            codigo: producto.codigo,
            descripcion: producto.descripcion,
            categoria: producto.categoria ?? "",
            unidad: producto.unidad,
            precio: aTexto(producto.precio),
            alicuotaIva: String(producto.alicuotaIva),
            controlaStock: producto.controlaStock,
            stockMinimo: aTexto(producto.stockMinimo),
            stockInicial: "0",
            activo: producto.activo,
          }
        : vacio,
    );
  }, [open, producto]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrores({});
    try {
      const p = await guardar.mutateAsync({
        id: producto?.id,
        datos: {
          codigo: f.codigo,
          descripcion: f.descripcion,
          categoria: f.categoria || null,
          unidad: f.unidad,
          precio: aNumero(f.precio),
          alicuotaIva: Number(f.alicuotaIva),
          controlaStock: f.controlaStock,
          stockMinimo: f.controlaStock ? aNumero(f.stockMinimo || "0") : 0,
          version: producto?.version,
          ...(producto ? { activo: f.activo } : { stockInicial: f.controlaStock ? aNumero(f.stockInicial || "0") : 0 }),
        },
      });
      toast.success(producto ? "Producto actualizado" : "Producto creado");
      onOpenChange(false);
      onSaved?.(p);
    } catch (err) {
      if (manejarErrorGuardado(err, { setErrores, qc, recargar: ["productos"] })) onOpenChange(false);
    }
  };

  const texto = (id: keyof Form, label: string, props: React.ComponentProps<typeof Input> = {}, className?: string) => (
    <div className={cn("grid gap-1.5", className)}>
      <Label htmlFor={`prod-${id}`}>{label}</Label>
      <Input id={`prod-${id}`} value={f[id] as string} onChange={(e) => setF({ ...f, [id]: e.target.value })} aria-invalid={!!errores[id]} {...props} />
      {errores[id] && <p className="text-xs text-destructive">{errores[id]}</p>}
    </div>
  );

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[92svh] overflow-y-auto sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>{producto ? "Editar producto" : "Nuevo producto"}</DialogTitle>
          <DialogDescription>El precio es sin IVA. El stock se mueve con ingresos, egresos o ajustes.</DialogDescription>
        </DialogHeader>
        <form onSubmit={submit} className="grid gap-4 sm:grid-cols-2" noValidate>
          {texto("codigo", "Código", { autoFocus: !producto, placeholder: "Ej.: RESMA-A4" })}
          <div className="grid gap-1.5">
            <Label htmlFor="prod-categoria">Categoría</Label>
            <Input id="prod-categoria" list="categorias-existentes" value={f.categoria} onChange={(e) => setF({ ...f, categoria: e.target.value })} placeholder="Ej.: Librería" />
            <datalist id="categorias-existentes">
              {categorias.map((c) => (
                <option key={c} value={c} />
              ))}
            </datalist>
          </div>
          {texto("descripcion", "Descripción", {}, "sm:col-span-2")}
          {texto("precio", "Precio sin IVA", { inputMode: "decimal", placeholder: "0,00" })}
          <div className="grid gap-1.5">
            <Label htmlFor="prod-alicuotaIva">Alícuota de IVA</Label>
            <Select value={f.alicuotaIva} onValueChange={(v) => setF({ ...f, alicuotaIva: v })}>
              <SelectTrigger id="prod-alicuotaIva" className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {ALICUOTAS_IVA.map((a) => (
                  <SelectItem key={a} value={String(a)}>
                    {a === 0 ? "Exento / 0 %" : `${a.toLocaleString("es-AR")} %`}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          {texto("unidad", "Unidad", { placeholder: "u., kg, m, caja…" })}

          <div className="flex items-center justify-between gap-3 rounded-lg border px-3 py-2 sm:col-span-2">
            <div>
              <Label htmlFor="prod-controlaStock">Controlar stock</Label>
              <p className="text-xs text-muted-foreground">Desactivalo para servicios (horas, abonos, envíos).</p>
            </div>
            <Switch id="prod-controlaStock" checked={f.controlaStock} onCheckedChange={(v) => setF({ ...f, controlaStock: v })} />
          </div>
          {errores.controlaStock && <p className="-mt-2 text-xs text-destructive sm:col-span-2">{errores.controlaStock}</p>}

          {f.controlaStock && (
            <>
              {!producto && texto("stockInicial", "Stock inicial", { inputMode: "decimal" })}
              {texto("stockMinimo", "Stock mínimo", { inputMode: "decimal" })}
            </>
          )}

          {producto && (
            <div className="flex items-center justify-between gap-3 rounded-lg border px-3 py-2 sm:col-span-2">
              <div>
                <Label htmlFor="prod-activo">Activo</Label>
                <p className="text-xs text-muted-foreground">Los inactivos no se ofrecen al facturar.</p>
              </div>
              <Switch id="prod-activo" checked={f.activo} onCheckedChange={(v) => setF({ ...f, activo: v })} />
            </div>
          )}

          <DialogFooter className="sm:col-span-2">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancelar
            </Button>
            <Button type="submit" disabled={guardar.isPending}>
              {guardar.isPending && <Loader2 className="size-4 animate-spin" />}
              Guardar producto
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
