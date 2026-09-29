import { useRef, useState } from "react";
import { AlertCircle, CheckCircle2, Download, FileKey2, FlaskConical, Loader2, PlugZap, ShieldCheck, Upload } from "lucide-react";
import { toast } from "sonner";
import { ApiError } from "@/api/client";
import { descargarCsr, useArca, useCargarCertificado, useGenerarCsr, useModoArca, useProbarArca } from "@/api/hooks";
import type { ModoArca } from "@/api/types";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { QueryState } from "@/components/shared/QueryState";
import { formatDate } from "@/lib/format";
import { cn } from "@/lib/utils";

const nombreModo: Record<ModoArca, string> = { simulado: "Modo de prueba (simulador)", homologacion: "ARCA homologación (prueba)", produccion: "ARCA producción" };

function bajar(texto: string, archivo: string) {
  const url = URL.createObjectURL(new Blob([texto], { type: "application/pkcs10" }));
  const a = document.createElement("a");
  a.href = url;
  a.download = archivo;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

const mensaje = (e: unknown) => (e instanceof ApiError ? e.message : "No se pudo completar");

/** Conexión real con ARCA: pedido de certificado, carga del certificado, modo y prueba */
export function ConexionArca() {
  const { data: a, isLoading, error, refetch } = useArca();
  const generar = useGenerarCsr();
  const cargar = useCargarCertificado();
  const cambiarModo = useModoArca();
  const probar = useProbarArca();
  const archivo = useRef<HTMLInputElement>(null);
  const [pegado, setPegado] = useState("");
  const [confirmarProduccion, setConfirmarProduccion] = useState(false);
  const [resultado, setResultado] = useState<string | null>(null);

  const generarPedido = async () => {
    try {
      const r = await generar.mutateAsync(undefined);
      bajar(r.csr, r.archivo);
      toast.success("Pedido de certificado generado", { description: `Se descargó ${r.archivo}. Subilo en ARCA con el alias ${r.alias}.` });
    } catch (e) {
      toast.error(mensaje(e));
    }
  };

  const volverABajar = async () => {
    try {
      bajar((await descargarCsr()).csr, `${a!.aliasSugerido}.csr`);
    } catch (e) {
      toast.error(mensaje(e));
    }
  };

  const subir = async (pem: string) => {
    try {
      const e = await cargar.mutateAsync(pem);
      setPegado("");
      toast.success("Certificado cargado", { description: e.certificado?.deHomologacion ? "Es de homologación: ya podés conectar el modo de prueba de ARCA." : "Es de producción." });
    } catch (e) {
      toast.error(mensaje(e), { duration: 10_000 });
    }
  };

  const elegirModo = async (modo: ModoArca) => {
    setResultado(null);
    try {
      await cambiarModo.mutateAsync(modo);
      toast.success(`Ahora: ${nombreModo[modo]}`);
      setConfirmarProduccion(false);
    } catch (e) {
      toast.error(mensaje(e), { duration: 10_000 });
    }
  };

  const probarConexion = async () => {
    setResultado(null);
    try {
      const r = await probar.mutateAsync();
      setResultado(`Conectado. Último ${r.tipo} autorizado en el punto de venta ${String(r.puntoVenta).padStart(4, "0")}: N° ${r.ultimoNumero}.`);
    } catch (e) {
      toast.error(mensaje(e), { duration: 12_000 });
    }
  };

  return (
    <QueryState isLoading={isLoading} error={error} onRetry={refetch}>
      {a && (
        <div className="grid gap-5">
          <div className="flex items-start gap-3 rounded-lg border p-4" data-testid="modo-arca">
            <div className={cn("flex size-10 shrink-0 items-center justify-center rounded-lg", a.modo === "produccion" ? "bg-success/12 text-success" : "bg-warning/15 text-warning-ink")}>
              {a.modo === "produccion" ? <ShieldCheck className="size-5" /> : <FlaskConical className="size-5" />}
            </div>
            <div className="text-sm">
              <div className="font-medium">{nombreModo[a.modo]}</div>
              <p className="text-muted-foreground">
                {a.modo === "produccion"
                  ? "Los comprobantes se autorizan en ARCA y tienen validez fiscal."
                  : a.modo === "homologacion"
                    ? "Conectado al ambiente de prueba de ARCA: los CAE son reales de prueba, sin validez fiscal."
                    : "Podés probar todo el circuito de facturación. Los comprobantes NO tienen validez fiscal y lo dicen en la hoja impresa."}
              </p>
              {a.ultimaConexion && <p className="mt-1 text-xs text-muted-foreground">Última conexión con ARCA: {new Date(a.ultimaConexion).toLocaleString("es-AR")}</p>}
            </div>
          </div>

          {/* Certificado */}
          <div className="grid gap-3 rounded-lg border p-4" data-testid="certificado-arca">
            <div className="flex items-center gap-2 text-sm font-medium">
              <FileKey2 className="size-4 text-primary" /> Certificado digital
            </div>
            {a.certificado ? (
              <div className="grid gap-1 text-sm">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-medium">{a.certificado.alias}</span>
                  <span className={cn("rounded px-1.5 py-0.5 text-xs", a.certificado.deHomologacion ? "bg-warning/15 text-warning-ink" : "bg-success/12 text-success")}>
                    {a.certificado.deHomologacion ? "De homologación (prueba)" : "De producción"}
                  </span>
                </div>
                <div className="text-muted-foreground">Vence el {formatDate(a.certificado.vence.slice(0, 10))}</div>
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">Todavía no hay certificado cargado.</p>
            )}

            <div className="grid gap-2 border-t pt-3">
              <div className="text-sm">
                <b>1.</b> Generá el pedido de certificado{a.certificado ? " (para renovarlo o pasar a producción)" : ""} y subilo en ARCA, en “Administración de Certificados Digitales”, con el alias <code className="rounded bg-muted px-1">{a.aliasSugerido}</code>.
              </div>
              <div className="flex flex-wrap gap-2">
                <Button variant="outline" size="sm" onClick={generarPedido} disabled={generar.isPending}>
                  {generar.isPending ? <Loader2 className="size-4 animate-spin" /> : <Download className="size-4" />}
                  {a.csrPendiente ? "Generar otro pedido" : "Generar pedido (.csr)"}
                </Button>
                {a.csrPendiente && (
                  <Button variant="ghost" size="sm" onClick={volverABajar}>
                    Volver a descargar el pedido
                  </Button>
                )}
              </div>
              {a.csrPendiente && <p className="text-xs text-muted-foreground" data-testid="csr-pendiente">Hay un pedido generado esperando el certificado.</p>}
            </div>

            <div className="grid gap-2 border-t pt-3">
              <div className="text-sm">
                <b>2.</b> Descargá de ARCA el certificado (.crt) y subilo acá.
              </div>
              <input
                ref={archivo}
                type="file"
                accept=".crt,.pem,.cer,.txt"
                className="hidden"
                aria-label="Archivo del certificado"
                onChange={async (e) => {
                  const f = e.target.files?.[0];
                  e.target.value = "";
                  if (f) await subir(await f.text());
                }}
              />
              <div className="flex flex-wrap gap-2">
                <Button variant="outline" size="sm" onClick={() => archivo.current?.click()} disabled={cargar.isPending}>
                  {cargar.isPending ? <Loader2 className="size-4 animate-spin" /> : <Upload className="size-4" />} Subir certificado
                </Button>
              </div>
              <details className="text-sm">
                <summary className="cursor-pointer text-xs text-muted-foreground">O pegá el texto del certificado</summary>
                <div className="mt-2 grid gap-2">
                  <Label htmlFor="arca-pem" className="sr-only">
                    Texto del certificado
                  </Label>
                  <Textarea id="arca-pem" rows={4} value={pegado} onChange={(e) => setPegado(e.target.value)} placeholder="-----BEGIN CERTIFICATE-----" className="font-mono text-xs" />
                  <div>
                    <Button size="sm" onClick={() => subir(pegado)} disabled={!pegado.trim() || cargar.isPending}>
                      Cargar
                    </Button>
                  </div>
                </div>
              </details>
            </div>
          </div>

          {/* Modo */}
          <div className="grid gap-3">
            <div className="text-sm font-medium">¿Con qué se autorizan las facturas?</div>
            <div className="grid gap-2 sm:grid-cols-3" role="radiogroup" aria-label="Modo de facturación">
              {(["simulado", "homologacion", "produccion"] as const).map((m) => {
                const habilitado = m === "simulado" || (!!a.certificado && a.certificado.deHomologacion === (m === "homologacion"));
                return (
                  <button
                    key={m}
                    type="button"
                    role="radio"
                    aria-checked={a.modo === m}
                    disabled={!habilitado || cambiarModo.isPending}
                    onClick={() => (m === "produccion" ? setConfirmarProduccion(true) : elegirModo(m))}
                    className={cn(
                      "rounded-lg border p-3 text-left text-sm transition-colors disabled:cursor-not-allowed disabled:opacity-50",
                      a.modo === m ? "border-primary bg-primary/5 ring-1 ring-primary" : "hover:bg-muted/50",
                    )}
                  >
                    <div className="font-medium">{m === "simulado" ? "Simulador" : m === "homologacion" ? "Homologación" : "Producción"}</div>
                    <div className="mt-0.5 text-xs text-muted-foreground">
                      {m === "simulado" ? "Sin ARCA, para practicar" : m === "homologacion" ? "ARCA de prueba (certificado de prueba)" : "Con validez fiscal (certificado de producción)"}
                    </div>
                  </button>
                );
              })}
            </div>
          </div>

          {a.modo !== "simulado" && (
            <div className="flex flex-wrap items-center gap-3">
              <Button variant="outline" onClick={probarConexion} disabled={probar.isPending}>
                {probar.isPending ? <Loader2 className="size-4 animate-spin" /> : <PlugZap className="size-4" />} Probar conexión
              </Button>
              {resultado && (
                <span className="flex items-center gap-1.5 text-sm text-success" data-testid="resultado-arca">
                  <CheckCircle2 className="size-4" /> {resultado}
                </span>
              )}
            </div>
          )}
          {a.ultimoError && !resultado && (
            <p className="flex items-start gap-2 text-sm text-destructive" data-testid="error-arca">
              <AlertCircle className="mt-0.5 size-4 shrink-0" /> Último error de ARCA: {a.ultimoError}
            </p>
          )}

          <Dialog open={confirmarProduccion} onOpenChange={setConfirmarProduccion}>
            <DialogContent className="sm:max-w-md">
              <DialogHeader>
                <DialogTitle>¿Pasar a producción?</DialogTitle>
                <DialogDescription>
                  Desde ahora cada factura que emitas se autoriza en ARCA con validez fiscal. Asegurate de que los puntos de venta estén dados de alta en ARCA como “Web Service”.
                </DialogDescription>
              </DialogHeader>
              <DialogFooter>
                <Button variant="outline" onClick={() => setConfirmarProduccion(false)}>
                  Cancelar
                </Button>
                <Button onClick={() => elegirModo("produccion")} disabled={cambiarModo.isPending}>
                  Sí, facturar en producción
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </div>
      )}
    </QueryState>
  );
}
