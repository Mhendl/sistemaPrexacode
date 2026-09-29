import { useEffect, useRef, useState } from "react";
import { AlertCircle, CheckCircle2, FileUp, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { ApiError } from "@/api/client";
import { useImportar } from "@/api/hooks";
import type { ResumenImportacion } from "@/api/types";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import { COLUMNAS, leerArchivo, mapearFilas, type Entidad, type Mapeo } from "@/lib/planillas";

const nombreEntidad: Record<Entidad, { plural: string; clave: string }> = {
  clientes: { plural: "clientes", clave: "CUIT" },
  productos: { plural: "productos", clave: "código" },
};

type Paso = { tipo: "elegir" } | { tipo: "revisar"; archivo: string; mapeo: Mapeo; resumen: ResumenImportacion } | { tipo: "listo"; resumen: ResumenImportacion };

export function ImportarDialog({ entidad, open, onOpenChange }: { entidad: Entidad; open: boolean; onOpenChange: (o: boolean) => void }) {
  const importar = useImportar();
  const input = useRef<HTMLInputElement>(null);
  const [paso, setPaso] = useState<Paso>({ tipo: "elegir" });
  const [siExiste, setSiExiste] = useState<"actualizar" | "omitir">("omitir");
  const [leyendo, setLeyendo] = useState(false);
  const { plural, clave } = nombreEntidad[entidad];
  const nombreCampo = (campo: string) => COLUMNAS[entidad].find((c) => c.campo === campo)?.encabezado ?? campo;

  useEffect(() => {
    if (open) {
      setPaso({ tipo: "elegir" });
      setSiExiste("omitir");
    }
  }, [open]);

  const simular = async (mapeo: Mapeo, modo: "actualizar" | "omitir", archivo: string) => {
    const resumen = await importar.mutateAsync({ entidad, filas: mapeo.filas, siExiste: modo, simular: true });
    setPaso({ tipo: "revisar", archivo, mapeo, resumen });
  };

  const elegirArchivo = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const archivo = e.target.files?.[0];
    e.target.value = "";
    if (!archivo) return;
    setLeyendo(true);
    try {
      const mapeo = mapearFilas(entidad, await leerArchivo(archivo));
      if (mapeo.filas.length === 0) throw new Error("El archivo no tiene filas con datos");
      if (mapeo.faltantes.length) throw new Error(`Falta la columna ${mapeo.faltantes.join(", ")}: con ella se sabe a qué registro corresponde cada fila. Descargá la plantilla para ver el formato.`);
      // Una planilla parcial (ej. solo Código y Stock) sirve para actualizar los que ya existen
      const modo = mapeo.completo ? siExiste : "actualizar";
      setSiExiste(modo);
      await simular(mapeo, modo, archivo.name);
    } catch (err) {
      toast.error(err instanceof ApiError || err instanceof Error ? err.message : "No se pudo leer el archivo");
    } finally {
      setLeyendo(false);
    }
  };

  const cambiarModo = async (modo: "actualizar" | "omitir") => {
    setSiExiste(modo);
    if (paso.tipo === "revisar") await simular(paso.mapeo, modo, paso.archivo);
  };

  const confirmar = async () => {
    if (paso.tipo !== "revisar") return;
    try {
      const resumen = await importar.mutateAsync({ entidad, filas: paso.mapeo.filas, siExiste, simular: false });
      setPaso({ tipo: "listo", resumen });
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "No se pudo importar");
    }
  };

  const aImportar = paso.tipo === "revisar" ? paso.resumen.crear + paso.resumen.actualizar : 0;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[92svh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Importar {plural}</DialogTitle>
          <DialogDescription>
            Subí un Excel (.xlsx, .xls) o CSV. Antes de guardar vas a ver qué se crea, qué se actualiza y qué filas tienen errores.
            {entidad === "productos"
              ? " Para cambiar solo el stock o los precios, alcanza con una planilla de dos columnas: Código y Stock (o Código y Precio sin IVA)."
              : " Para cambiar solo algunos datos, alcanza con el CUIT y las columnas a cambiar."}
          </DialogDescription>
        </DialogHeader>

        <input ref={input} type="file" accept=".xlsx,.xls,.csv" className="sr-only" onChange={elegirArchivo} aria-label="Archivo a importar" />

        <div className="grid gap-2">
          <div className="text-sm font-medium">Si un registro ya existe (mismo {clave})</div>
          <div className="grid grid-cols-2 gap-2" role="radiogroup" aria-label="Si ya existe">
            {(
              [
                { id: "omitir", titulo: "Dejarlo como está", desc: "Solo se agregan los nuevos" },
                { id: "actualizar", titulo: "Actualizarlo", desc: "Se pisan los datos con los del archivo" },
              ] as const
            ).map((o) => (
              <button
                key={o.id}
                type="button"
                role="radio"
                aria-checked={siExiste === o.id}
                onClick={() => cambiarModo(o.id)}
                disabled={paso.tipo === "listo" || importar.isPending}
                className={cn("rounded-lg border p-3 text-left text-sm", siExiste === o.id ? "border-primary bg-primary/5 ring-1 ring-primary" : "hover:bg-muted/50")}
              >
                <div className="font-medium">{o.titulo}</div>
                <div className="text-xs text-muted-foreground">{o.desc}</div>
              </button>
            ))}
          </div>
        </div>

        {paso.tipo === "elegir" && (
          <button
            type="button"
            onClick={() => input.current?.click()}
            disabled={leyendo || importar.isPending}
            className="flex flex-col items-center justify-center gap-2 rounded-lg border-2 border-dashed py-10 text-sm text-muted-foreground hover:border-primary hover:text-primary"
          >
            {leyendo || importar.isPending ? <Loader2 className="size-6 animate-spin" /> : <FileUp className="size-6" />}
            Elegir archivo
          </button>
        )}

        {paso.tipo === "revisar" && (
          <div className="grid gap-4" data-testid="vista-previa">
            <div className="text-sm text-muted-foreground">
              {!paso.mapeo.completo && (
                <div className="mb-2 rounded-lg border border-info/30 bg-info/8 px-3 py-2 text-foreground" data-testid="planilla-parcial">
                  Planilla parcial: se actualizan solo las columnas que trae. Lo que no está en el archivo queda como estaba.
                </div>
              )}
              <b className="text-foreground">{paso.archivo}</b> · {paso.resumen.total} filas · columnas reconocidas: {paso.mapeo.reconocidas.map((r) => r.nombre).join(", ")}
              {paso.mapeo.ignoradas.length > 0 && <> · se ignoran: {paso.mapeo.ignoradas.join(", ")}</>}
            </div>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
              <Dato label="Nuevos" valor={paso.resumen.crear} />
              <Dato label="Se actualizan" valor={paso.resumen.actualizar} />
              <Dato label="Ya existen (se omiten)" valor={paso.resumen.omitir} />
              <Dato label="Con errores" valor={paso.resumen.errores.length} error />
            </div>
            {paso.resumen.errores.length > 0 && (
              <div className="rounded-lg border border-destructive/30">
                <div className="flex items-center gap-2 border-b border-destructive/20 bg-destructive/5 px-3 py-2 text-sm font-medium text-destructive">
                  <AlertCircle className="size-4" /> Estas filas no se van a importar. Corregilas en el archivo y volvé a subirlo, o seguí sin ellas.
                </div>
                <div className="max-h-56 overflow-y-auto">
                  <table className="w-full text-sm">
                    <tbody>
                      {paso.resumen.errores.slice(0, 100).map((e) => (
                        <tr key={e.fila} className="border-b last:border-b-0" data-testid="error-fila">
                          <td className="w-20 px-3 py-1.5 align-top whitespace-nowrap text-muted-foreground">Fila {e.fila}</td>
                          <td className="px-3 py-1.5">
                            {Object.entries(e.errores).map(([campo, msg]) => (
                              <div key={campo}>
                                <b>{nombreCampo(campo)}:</b> {msg}
                              </div>
                            ))}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </div>
        )}

        {paso.tipo === "listo" && (
          <div className="flex items-start gap-3 rounded-lg border border-success/30 bg-success/10 p-4 text-sm" role="status">
            <CheckCircle2 className="mt-0.5 size-5 shrink-0 text-success" />
            <div>
              <div className="font-medium">Importación terminada</div>
              <div className="text-muted-foreground">
                {paso.resumen.crear} nuevos · {paso.resumen.actualizar} actualizados · {paso.resumen.omitir} sin cambios · {paso.resumen.errores.length} con errores
              </div>
            </div>
          </div>
        )}

        <DialogFooter>
          {paso.tipo === "revisar" && (
            <>
              <Button variant="outline" onClick={() => input.current?.click()} disabled={importar.isPending}>
                Elegir otro archivo
              </Button>
              <Button onClick={confirmar} disabled={aImportar === 0 || importar.isPending}>
                {importar.isPending && <Loader2 className="size-4 animate-spin" />}
                Importar {aImportar} {aImportar === 1 ? "registro" : "registros"}
              </Button>
            </>
          )}
          {paso.tipo === "listo" && <Button onClick={() => onOpenChange(false)}>Listo</Button>}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function Dato({ label, valor, error }: { label: string; valor: number; error?: boolean }) {
  return (
    <div className="rounded-lg border p-3">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className={cn("tabular text-xl font-semibold", error && valor > 0 && "text-destructive")}>{valor}</div>
    </div>
  );
}
