import { useMemo, useState, type ReactNode } from "react";
import { Plus, Trash2 } from "lucide-react";
import type { ProductoApi } from "@/api/types";
import { Button } from "@/components/ui/button";
import { Card, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { formatMoney } from "@/lib/format";
import { ALICUOTAS_IVA, calcularTotales, type Letra } from "@/lib/facturacion";
import { aNumero } from "@/lib/numeros";

/** Renglón en edición: los números se guardan como texto (formato argentino) */
export interface Renglon {
  clave: string;
  productoId: string | null;
  codigo: string | null;
  descripcion: string;
  unidad: string;
  controlaStock: boolean;
  stock: number;
  cantidad: string;
  precio: string;
  bonificacion: string;
  alicuotaIva: number;
}

/** Ítem ya guardado (de una factura o un presupuesto) para precargar el editor */
export interface ItemGuardado {
  productoId: string | null;
  codigo: string | null;
  descripcion: string;
  unidad: string;
  cantidad: number;
  precioUnitario: number;
  bonificacion: number;
  alicuotaIva: number;
}

/**
 * "?productos=id:cantidad,id:cantidad" (desde "Productos que usa" del cliente) → ítems para precargar,
 * con el precio actual de cada producto. Los que no existan o estén inactivos se ignoran.
 */
export function itemsDesdeParametro(param: string | null, productos: ProductoApi[]): ItemGuardado[] {
  if (!param) return [];
  return param
    .split(",")
    .map((par): ItemGuardado | null => {
      const [id, cant] = par.split(":");
      const p = productos.find((x) => x.id === id && x.activo);
      const cantidad = Number(cant);
      if (!p) return null;
      return { productoId: p.id, codigo: p.codigo, descripcion: p.descripcion, unidad: p.unidad, cantidad: cantidad > 0 ? cantidad : 1, precioUnitario: p.precio, bonificacion: 0, alicuotaIva: p.alicuotaIva };
    })
    .filter((x): x is ItemGuardado => x !== null);
}

const texto = (n: number) => String(n).replace(".", ",");
let claves = 0;
const nuevaClave = () => `r${++claves}`;

/** Estado del editor de ítems y los totales calculados como en el servidor */
export function useRenglones(letra: Letra, productos: ProductoApi[]) {
  const [renglones, setRenglones] = useState<Renglon[]>([]);

  const items = renglones.map((r) => ({
    cantidad: aNumero(r.cantidad) || 0,
    precioUnitario: aNumero(r.precio) || 0,
    bonificacion: aNumero(r.bonificacion) || 0,
    alicuotaIva: r.alicuotaIva,
  }));
  const clave = JSON.stringify(items);
  const totales = useMemo(() => calcularTotales(items, letra), [clave, letra]); // eslint-disable-line react-hooks/exhaustive-deps

  const agregarProducto = (id: string) => {
    const p = productos.find((x) => x.id === id);
    if (!p) return;
    setRenglones((rs) => [
      ...rs,
      { clave: nuevaClave(), productoId: p.id, codigo: p.codigo, descripcion: p.descripcion, unidad: p.unidad, controlaStock: p.controlaStock, stock: p.stock, cantidad: "1", precio: texto(p.precio), bonificacion: "0", alicuotaIva: p.alicuotaIva },
    ]);
  };
  const agregarLibre = () =>
    setRenglones((rs) => [...rs, { clave: nuevaClave(), productoId: null, codigo: null, descripcion: "", unidad: "u.", controlaStock: false, stock: 0, cantidad: "1", precio: "", bonificacion: "0", alicuotaIva: 21 }]);
  const cambiar = (i: number, patch: Partial<Renglon>) => setRenglones((rs) => rs.map((r, k) => (k === i ? { ...r, ...patch } : r)));
  const quitar = (i: number) => setRenglones((rs) => rs.filter((_, k) => k !== i));

  /** Carga ítems guardados (con sus precios y bonificaciones, no los de lista) */
  const cargar = (guardados: ItemGuardado[]) =>
    setRenglones(
      guardados.map((i) => {
        const p = productos.find((x) => x.id === i.productoId);
        return {
          clave: nuevaClave(),
          productoId: i.productoId,
          codigo: i.codigo,
          descripcion: i.descripcion,
          unidad: i.unidad,
          controlaStock: !!p?.controlaStock,
          stock: p?.stock ?? 0,
          cantidad: texto(i.cantidad),
          precio: texto(i.precioUnitario),
          bonificacion: texto(i.bonificacion),
          alicuotaIva: i.alicuotaIva,
        };
      }),
    );

  /** Para mandar a la API */
  const paraEnviar = () =>
    renglones.map((r, i) => ({
      productoId: r.productoId,
      descripcion: r.descripcion || undefined,
      cantidad: items[i]!.cantidad,
      precioUnitario: items[i]!.precioUnitario,
      alicuotaIva: r.alicuotaIva,
      bonificacion: items[i]!.bonificacion,
    }));

  /** Para la hoja de vista previa */
  const paraHoja = () => renglones.map((r, i) => ({ ...items[i]!, codigo: r.codigo, descripcion: r.descripcion || "—", unidad: r.unidad, subtotal: totales.subtotales[i] ?? 0 }));

  return { renglones, totales, agregarProducto, agregarLibre, cambiar, quitar, cargar, paraEnviar, paraHoja, hayStock: renglones.some((r) => r.controlaStock) };
}

type Editor = ReturnType<typeof useRenglones>;

export function ItemsEditor({
  editor,
  productos,
  letra,
  errores,
  pie,
  testidTotal = "total-factura",
}: {
  editor: Editor;
  productos: ProductoApi[];
  letra: Letra;
  errores: Record<string, string>;
  /** Contenido a la izquierda de los totales (ej. "Descontar stock") */
  pie?: ReactNode;
  testidTotal?: string;
}) {
  const { renglones, totales, cambiar } = editor;
  return (
    <Card className="gap-0 pb-0 shadow-none">
      <CardHeader className="pb-4">
        <CardTitle>Ítems</CardTitle>
      </CardHeader>
      <div className="flex flex-col gap-2 px-6 pb-4 sm:flex-row">
        <Select value="" onValueChange={editor.agregarProducto}>
          <SelectTrigger className="w-full" aria-label="Agregar producto">
            <Plus className="size-4" />
            <SelectValue placeholder="Agregar producto o servicio" />
          </SelectTrigger>
          <SelectContent>
            {productos
              .filter((p) => p.activo)
              .map((p) => (
                <SelectItem key={p.id} value={p.id}>
                  {p.descripcion} <span className="text-muted-foreground">· {formatMoney(p.precio)}</span>
                </SelectItem>
              ))}
          </SelectContent>
        </Select>
        <Button variant="outline" onClick={editor.agregarLibre} className="shrink-0">
          <Plus className="size-4" /> Ítem libre
        </Button>
      </div>
      {errores.items && <p className="px-6 pb-2 text-xs text-destructive">{errores.items}</p>}
      <div className="overflow-x-auto">
        <table className="w-full min-w-[640px] text-sm">
          <thead>
            <tr className="border-y bg-muted/40 text-left text-xs text-muted-foreground">
              <th className="px-6 py-2 font-medium">Descripción</th>
              <th className="w-20 px-1.5 py-2 font-medium">Cant.</th>
              <th className="w-28 px-1.5 py-2 font-medium">Precio s/IVA</th>
              <th className="w-16 px-1.5 py-2 font-medium">Bonif. %</th>
              <th className="w-24 px-1.5 py-2 font-medium">IVA</th>
              <th className="px-1.5 py-2 text-right font-medium">Subtotal</th>
              <th className="w-10" />
            </tr>
          </thead>
          <tbody>
            {renglones.map((r, i) => {
              const error = errores[`items.${i}.cantidad`] ?? errores[`items.${i}.descripcion`] ?? errores[`items.${i}.productoId`];
              const nombre = r.descripcion || "ítem";
              return (
                <tr key={r.clave} className="border-b align-top" data-testid="renglon-factura">
                  <td className="px-6 py-2">
                    {r.productoId ? (
                      <div className="pt-1.5 font-medium">{r.descripcion}</div>
                    ) : (
                      <Input aria-label="Descripción del ítem" value={r.descripcion} onChange={(e) => cambiar(i, { descripcion: e.target.value })} placeholder="Descripción" className="h-8" />
                    )}
                    {r.controlaStock && (
                      <div className="text-xs text-muted-foreground">
                        Stock: {r.stock.toLocaleString("es-AR")} {r.unidad}
                      </div>
                    )}
                    {error && <div className="text-xs text-destructive">{error}</div>}
                  </td>
                  <td className="px-1.5 py-2">
                    <Input aria-label={`Cantidad de ${nombre}`} inputMode="decimal" value={r.cantidad} onChange={(e) => cambiar(i, { cantidad: e.target.value })} className="h-8" />
                  </td>
                  <td className="px-1.5 py-2">
                    <Input aria-label={`Precio de ${nombre}`} inputMode="decimal" value={r.precio} onChange={(e) => cambiar(i, { precio: e.target.value })} className="h-8" />
                  </td>
                  <td className="px-1.5 py-2">
                    <Input aria-label={`Bonificación de ${nombre}`} inputMode="decimal" value={r.bonificacion} onChange={(e) => cambiar(i, { bonificacion: e.target.value })} className="h-8" />
                  </td>
                  <td className="px-1.5 py-2">
                    <Select value={String(r.alicuotaIva)} onValueChange={(v) => cambiar(i, { alicuotaIva: Number(v) })}>
                      <SelectTrigger className="h-8 w-full" aria-label={`IVA de ${nombre}`}>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {ALICUOTAS_IVA.map((a) => (
                          <SelectItem key={a} value={String(a)}>
                            {a.toLocaleString("es-AR")} %
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </td>
                  <td className="tabular px-1.5 py-3.5 text-right whitespace-nowrap">{formatMoney(totales.subtotales[i] ?? 0)}</td>
                  <td className="px-1.5 py-2">
                    <Button variant="ghost" size="icon-sm" onClick={() => editor.quitar(i)} aria-label={`Quitar ${nombre}`}>
                      <Trash2 className="size-4 text-muted-foreground" />
                    </Button>
                  </td>
                </tr>
              );
            })}
            {renglones.length === 0 && (
              <tr>
                <td colSpan={7} className="px-6 py-8 text-center text-muted-foreground">
                  Todavía no agregaste ítems.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
      <div className="flex flex-col gap-4 px-6 py-4 sm:flex-row sm:items-start sm:justify-between">
        {pie ?? <span />}
        <dl className="tabular grid w-full max-w-xs grid-cols-[1fr_auto] gap-x-6 gap-y-1 text-sm">
          {letra !== "C" && (
            <>
              <dt className="text-muted-foreground">Neto gravado</dt>
              <dd className="text-right">{formatMoney(totales.neto)}</dd>
              {totales.iva.map((v) => (
                <FilaTotal key={v.alicuota} label={`IVA ${v.alicuota.toLocaleString("es-AR")} %`} valor={v.importe} />
              ))}
              {totales.exento > 0 && <FilaTotal label="Exento" valor={totales.exento} />}
            </>
          )}
          <dt className="mt-1 border-t pt-2 text-base font-semibold">Total</dt>
          <dd className="mt-1 border-t pt-2 text-right text-base font-semibold" data-testid={testidTotal}>
            {formatMoney(totales.total)}
          </dd>
        </dl>
      </div>
    </Card>
  );
}

function FilaTotal({ label, valor }: { label: string; valor: number }) {
  return (
    <>
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="text-right">{formatMoney(valor)}</dd>
    </>
  );
}
