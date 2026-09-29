import { useState } from "react";
import { Loader2 } from "lucide-react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { api, ApiError } from "@/api/client";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { formatMoney } from "@/lib/format";
import { aNumero } from "@/lib/numeros";

interface Vista {
  productos: number;
  cambian: number;
  ejemplos: { codigo: string; descripcion: string; antes: number; despues: number }[];
  aplicado: boolean;
}

const TODAS = "__todas";
const mensaje = (e: unknown) => (e instanceof ApiError ? e.message : "No se pudo completar");

/**
 * Aumento o baja de precios por porcentaje.
 * Con `ids`: solo esos productos (los tildados). Sin `ids`: todo el catálogo activo o una categoría.
 */
export function ActualizarPreciosDialog({ open, onOpenChange, ids, categorias }: { open: boolean; onOpenChange: (o: boolean) => void; ids?: string[]; categorias: string[] }) {
  const qc = useQueryClient();
  const [porcentaje, setPorcentaje] = useState("");
  const [categoria, setCategoria] = useState(TODAS);
  const [redondeo, setRedondeo] = useState("0");
  const [vista, setVista] = useState<Vista | null>(null);
  const pedir = useMutation({
    mutationFn: (simular: boolean) =>
      api<Vista>("/productos/actualizar-precios", {
        method: "POST",
        body: { porcentaje: aNumero(porcentaje), redondeo: Number(redondeo), simular, ...(ids ? { ids } : { categoria: categoria === TODAS ? null : categoria }) },
      }),
    onSuccess: (r) => r.aplicado && qc.invalidateQueries({ queryKey: ["productos"] }),
  });
  const cerrar = (o: boolean) => {
    if (!o) {
      setVista(null);
      setPorcentaje("");
    }
    onOpenChange(o);
  };
  const ver = async () => {
    try {
      setVista(await pedir.mutateAsync(true));
    } catch (e) {
      toast.error(mensaje(e));
    }
  };
  const aplicar = async () => {
    try {
      const r = await pedir.mutateAsync(false);
      toast.success(`Precios actualizados: ${r.cambian} ${r.cambian === 1 ? "producto" : "productos"}`);
      cerrar(false);
    } catch (e) {
      toast.error(mensaje(e));
    }
  };
  return (
    <Dialog open={open} onOpenChange={cerrar}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Actualizar precios</DialogTitle>
          <DialogDescription>
            {ids ? `A los ${ids.length} productos elegidos.` : "A todo el catálogo activo o a una categoría."} Poné un porcentaje positivo para aumentar o negativo para bajar. Antes de aplicar ves cómo quedan.
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="grid gap-1.5">
            <Label htmlFor="ap-porcentaje">Porcentaje</Label>
            <Input
              id="ap-porcentaje"
              inputMode="decimal"
              placeholder="Ej.: 8 o -5"
              value={porcentaje}
              onChange={(e) => {
                setPorcentaje(e.target.value);
                setVista(null);
              }}
            />
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="ap-redondeo">Redondear a</Label>
            <Select
              value={redondeo}
              onValueChange={(v) => {
                setRedondeo(v);
                setVista(null);
              }}
            >
              <SelectTrigger id="ap-redondeo" className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="0">Centavos (sin redondear)</SelectItem>
                <SelectItem value="1">Pesos enteros</SelectItem>
                <SelectItem value="10">De a $ 10</SelectItem>
                <SelectItem value="100">De a $ 100</SelectItem>
              </SelectContent>
            </Select>
          </div>
          {!ids && (
            <div className="grid gap-1.5 sm:col-span-2">
              <Label htmlFor="ap-categoria">Productos</Label>
              <Select
                value={categoria}
                onValueChange={(v) => {
                  setCategoria(v);
                  setVista(null);
                }}
              >
                <SelectTrigger id="ap-categoria" className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={TODAS}>Todos los activos</SelectItem>
                  {categorias.map((c) => (
                    <SelectItem key={c} value={c}>
                      Categoría: {c}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}
        </div>
        {vista && (
          <div className="rounded-lg border p-3 text-sm" data-testid="vista-precios">
            <p className="mb-2">
              Cambian <b>{vista.cambian}</b> de {vista.productos} productos. Por ejemplo:
            </p>
            <ul className="grid gap-1">
              {vista.ejemplos.map((e) => (
                <li key={e.codigo} className="flex flex-wrap justify-between gap-x-3">
                  <span className="min-w-0 [overflow-wrap:anywhere]">
                    {e.codigo} · {e.descripcion}
                  </span>
                  <span className="tabular whitespace-nowrap">
                    {formatMoney(e.antes)} → <b>{formatMoney(e.despues)}</b>
                  </span>
                </li>
              ))}
            </ul>
          </div>
        )}
        <DialogFooter>
          <Button variant="outline" onClick={() => cerrar(false)}>
            Cancelar
          </Button>
          {vista ? (
            <Button onClick={aplicar} disabled={pedir.isPending || vista.cambian === 0}>
              {pedir.isPending && <Loader2 className="size-4 animate-spin" />}
              Aplicar a {vista.cambian} {vista.cambian === 1 ? "producto" : "productos"}
            </Button>
          ) : (
            <Button onClick={ver} disabled={pedir.isPending || !porcentaje.trim()}>
              {pedir.isPending && <Loader2 className="size-4 animate-spin" />}
              Ver cómo quedan
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

const SIN_CAMBIO = "__igual";

/** Cambiar categoría, IVA, stock mínimo o activo a los productos elegidos */
export function EditarProductosDialog({ open, onOpenChange, ids, categorias, alTerminar }: { open: boolean; onOpenChange: (o: boolean) => void; ids: string[]; categorias: string[]; alTerminar: () => void }) {
  const qc = useQueryClient();
  const [categoria, setCategoria] = useState("");
  const [cambiarCategoria, setCambiarCategoria] = useState(false);
  const [iva, setIva] = useState(SIN_CAMBIO);
  const [minimo, setMinimo] = useState("");
  const [activo, setActivo] = useState(SIN_CAMBIO);
  const guardar = useMutation({
    mutationFn: (cambios: Record<string, unknown>) => api<{ actualizados: number }>("/productos/masivo", { method: "POST", body: { ids, cambios } }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["productos"] }),
  });
  const cambios: Record<string, unknown> = {};
  if (cambiarCategoria) cambios.categoria = categoria.trim() || null;
  if (iva !== SIN_CAMBIO) cambios.alicuotaIva = Number(iva);
  if (minimo.trim()) cambios.stockMinimo = aNumero(minimo);
  if (activo !== SIN_CAMBIO) cambios.activo = activo === "si";
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Editar {ids.length} productos</DialogTitle>
          <DialogDescription>Completá solo lo que quieras cambiar: el resto queda como está en cada producto.</DialogDescription>
        </DialogHeader>
        <div className="grid gap-4">
          <div className="grid gap-1.5">
            <div className="flex items-center justify-between">
              <Label htmlFor="em-categoria">Categoría</Label>
              <label className="flex items-center gap-2 text-xs text-muted-foreground">
                <Switch checked={cambiarCategoria} onCheckedChange={setCambiarCategoria} aria-label="Cambiar la categoría" /> Cambiarla
              </label>
            </div>
            <Input id="em-categoria" list="em-categorias" value={categoria} disabled={!cambiarCategoria} onChange={(e) => setCategoria(e.target.value)} placeholder="Vacío = sin categoría" />
            <datalist id="em-categorias">
              {categorias.map((c) => (
                <option key={c} value={c} />
              ))}
            </datalist>
          </div>
          <div className="grid gap-4 sm:grid-cols-3">
            <div className="grid gap-1.5">
              <Label htmlFor="em-iva">IVA</Label>
              <Select value={iva} onValueChange={setIva}>
                <SelectTrigger id="em-iva" className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={SIN_CAMBIO}>Sin cambios</SelectItem>
                  {[0, 2.5, 5, 10.5, 21, 27].map((a) => (
                    <SelectItem key={a} value={String(a)}>
                      {String(a).replace(".", ",")} %
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="em-minimo">Stock mínimo</Label>
              <Input id="em-minimo" inputMode="decimal" value={minimo} onChange={(e) => setMinimo(e.target.value)} placeholder="Sin cambios" />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="em-activo">Estado</Label>
              <Select value={activo} onValueChange={setActivo}>
                <SelectTrigger id="em-activo" className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={SIN_CAMBIO}>Sin cambios</SelectItem>
                  <SelectItem value="si">Activos</SelectItem>
                  <SelectItem value="no">Inactivos</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          <Button
            disabled={guardar.isPending || Object.keys(cambios).length === 0}
            onClick={async () => {
              try {
                const r = await guardar.mutateAsync(cambios);
                toast.success(`${r.actualizados} ${r.actualizados === 1 ? "producto actualizado" : "productos actualizados"}`);
                onOpenChange(false);
                alTerminar();
              } catch (e) {
                toast.error(mensaje(e));
              }
            }}
          >
            {guardar.isPending && <Loader2 className="size-4 animate-spin" />}
            Aplicar a {ids.length}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
