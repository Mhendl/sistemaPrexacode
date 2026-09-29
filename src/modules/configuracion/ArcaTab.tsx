import { useState } from "react";
import { Loader2, Plus, ShieldCheck } from "lucide-react";
import { toast } from "sonner";
import { ApiError } from "@/api/client";
import { useConfigFacturacion, useCrearPuntoVenta, useEditarPuntoVenta } from "@/api/hooks";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { QueryState } from "@/components/shared/QueryState";
import { useRole } from "@/context/AuthProvider";
import { formatCuit } from "@/lib/format";
import { ConexionArca } from "./ConexionArca";
import { Field, Section } from "./parts";

const pasos = [
  "Entrá a ARCA con tu clave fiscal y adherí el servicio “Administración de Certificados Digitales”.",
  "Tocá “Generar pedido (.csr)” acá y subí ese archivo en ARCA con el alias sugerido. Para probar primero, usá el servicio de homologación (WSASS).",
  "Descargá el certificado (.crt) que te da ARCA y subilo acá.",
  "En “Administrador de Relaciones”, autorizá a ese certificado para “Facturación Electrónica”.",
  "Creá el punto de venta para Web Service en “Administración de puntos de venta y domicilios”, con el mismo número que cargues abajo.",
];

export function ArcaTab() {
  const { empresa } = useRole();
  const { data: cfg, isLoading, error, refetch } = useConfigFacturacion();
  const crear = useCrearPuntoVenta();
  const editar = useEditarPuntoVenta();
  const [numero, setNumero] = useState("");
  const [nombre, setNombre] = useState("");
  const [errores, setErrores] = useState<Record<string, string>>({});

  const agregar = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrores({});
    try {
      await crear.mutateAsync({ numero: Number(numero), nombre });
      toast.success("Punto de venta agregado");
      setNumero("");
      setNombre("");
    } catch (err) {
      if (!(err instanceof ApiError)) throw err;
      setErrores(err.details);
      toast.error(err.message);
    }
  };

  const cambiarActivo = async (id: string, activo: boolean) => {
    try {
      await editar.mutateAsync({ id, activo });
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "No se pudo guardar");
    }
  };

  return (
    <QueryState isLoading={isLoading} error={error} onRetry={refetch}>
      {cfg && (
        <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_380px]">
          <div className="grid gap-6">
            <Section title="Conexión con ARCA" description={`CUIT emisor ${formatCuit(empresa.cuit)} · ${empresa.condicionIva}`}>
              <ConexionArca />
            </Section>

            <Section title="Puntos de venta" description="Tienen que existir en ARCA con el mismo número, del tipo “Web Service”.">
              <div className="-mx-6 overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-y bg-muted/40 text-left text-xs text-muted-foreground">
                      <th className="px-6 py-2.5 font-medium">N°</th>
                      <th className="px-4 py-2.5 font-medium">Nombre</th>
                      <th className="px-6 py-2.5 text-right font-medium">Activo</th>
                    </tr>
                  </thead>
                  <tbody>
                    {cfg.puntosVenta.map((p) => (
                      <tr key={p.id} className="border-b last:border-b-0" data-testid={`pv-${p.numero}`}>
                        <td className="tabular px-6 py-3 font-medium">{String(p.numero).padStart(4, "0")}</td>
                        <td className="px-4 py-3">{p.nombre}</td>
                        <td className="px-6 py-3 text-right">
                          <Switch checked={p.activo} onCheckedChange={(v) => cambiarActivo(p.id, v)} aria-label={`Punto de venta ${p.numero} activo`} />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <form onSubmit={agregar} className="mt-4 grid gap-3 border-t pt-4 sm:grid-cols-[120px_1fr_auto] sm:items-end" noValidate>
                <Field label="Número" htmlFor="pv-numero">
                  <Input id="pv-numero" inputMode="numeric" value={numero} onChange={(e) => setNumero(e.target.value)} aria-invalid={!!errores.numero} />
                  {errores.numero && <p className="text-xs text-destructive">{errores.numero}</p>}
                </Field>
                <Field label="Nombre" htmlFor="pv-nombre">
                  <Input id="pv-nombre" value={nombre} onChange={(e) => setNombre(e.target.value)} placeholder="Ej.: Sucursal Belgrano" aria-invalid={!!errores.nombre} />
                  {errores.nombre && <p className="text-xs text-destructive">{errores.nombre}</p>}
                </Field>
                <Button type="submit" variant="outline" disabled={crear.isPending}>
                  {crear.isPending ? <Loader2 className="size-4 animate-spin" /> : <Plus className="size-4" />} Agregar
                </Button>
              </form>
            </Section>
          </div>

          <Section title="Cómo conectar ARCA" description="Se hace una sola vez. Lleva unos 15 minutos.">
            <ol className="grid gap-4">
              {pasos.map((p, i) => (
                <li key={i} className="flex gap-3 text-sm">
                  <span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-primary/10 text-xs font-semibold text-primary">{i + 1}</span>
                  <span className="text-muted-foreground">{p}</span>
                </li>
              ))}
            </ol>
            <div className="mt-5 flex items-start gap-2 rounded-lg bg-primary/5 p-3 text-xs text-muted-foreground">
              <ShieldCheck className="mt-0.5 size-4 shrink-0 text-primary" />
              La clave privada se genera y se guarda cifrada en el servidor. Nunca sale del sistema.
            </div>
          </Section>
        </div>
      )}
    </QueryState>
  );
}
