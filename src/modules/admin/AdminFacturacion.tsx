import { useEffect, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { CheckCircle2, Download, ExternalLink, Loader2, PlugZap, Receipt, Upload } from "lucide-react";
import { toast } from "sonner";
import { ApiError } from "@/api/client";
import { PageHeader } from "@/components/shared/PageHeader";
import { QueryState } from "@/components/shared/QueryState";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { formatCuit, formatMoney } from "@/lib/format";
import { cn } from "@/lib/utils";
import { apiAdmin, useAccionAdmin } from "./api";
import { fechaHora } from "./comun";

interface EstadoApi {
  facturarSuscripciones: boolean;
  emisor: { id: string; razonSocial: string; cuit: string; condicionIva: string; domicilio: string | null; localidad: string | null; nombreFantasia: string | null } | null;
  modoArca: "simulado" | "homologacion" | "produccion" | null;
  puntosVenta: number[];
  pagos: { id: string; empresa: string; producto: string; plan: string; periodo: string; importeArs: number; proveedor: string; aprobadoAt: string | null; facturaNumero: string | null; facturaError: string | null; facturado: boolean }[];
}
interface ArcaApi {
  modo: "simulado" | "homologacion" | "produccion";
  certificado: { alias: string; vence: string; deHomologacion: boolean } | null;
  csrPendiente: boolean;
  aliasSugerido: string;
  ultimaConexion: string | null;
  ultimoError: string | null;
}

const mensaje = (e: unknown) => (e instanceof ApiError ? (Object.values(e.details)[0] ?? e.message) : "No se pudo");
const useEstado = () => useQuery({ queryKey: ["admin", "facturacion"], queryFn: () => apiAdmin<EstadoApi>("/plataforma/facturacion") });

/** La facturación de las suscripciones: la Factura C del dueño a cada empresa que paga Prexacode o CoreDental */
export function AdminFacturacion() {
  const { data, isLoading, error, refetch } = useEstado();
  return (
    <>
      <PageHeader title="Facturación propia" description="Las facturas de lo que cobrás por las suscripciones de Prexacode y CoreDental, a tu nombre y con tu CUIT. Se conectan una sola vez con ARCA y después salen solas." />
      <QueryState isLoading={isLoading} error={error} onRetry={refetch}>
        {data && (
          <div className="grid gap-6">
            <Emisor e={data} />
            {data.emisor && <Arca estado={data} />}
            {data.emisor && <Automatica e={data} />}
            <Pagos e={data} />
          </div>
        )}
      </QueryState>
    </>
  );
}

function Emisor({ e }: { e: EstadoApi }) {
  const accion = useAccionAdmin();
  const [cuit, setCuit] = useState("");
  const [d, setD] = useState({ razonSocial: "", nombreFantasia: "", domicilio: "", localidad: "" });
  const [pv, setPv] = useState("");
  useEffect(() => {
    if (e.emisor) setD({ razonSocial: e.emisor.razonSocial, nombreFantasia: e.emisor.nombreFantasia ?? "", domicilio: e.emisor.domicilio ?? "", localidad: e.emisor.localidad ?? "" });
    setPv(String(e.puntosVenta[0] ?? 1));
  }, [e]);
  const hacer = async (url: string, metodo: "POST" | "PUT", body: object, ok: string) => {
    try {
      await accion.mutateAsync({ url, metodo, body });
      toast.success(ok);
    } catch (err) {
      toast.error(mensaje(err));
    }
  };
  if (!e.emisor)
    return (
      <Card className="gap-3 p-4 shadow-none">
        <h3 className="font-semibold">¿Quién factura?</h3>
        <p className="text-sm text-muted-foreground">Poné el CUIT de la cuenta de Prexacode a tu nombre (la que usás para facturar como monotributista).</p>
        <div className="flex flex-wrap gap-2">
          <Input value={cuit} onChange={(x) => setCuit(x.target.value)} placeholder="24-35324876-2" aria-label="CUIT de la cuenta que factura" className="w-56" />
          <Button onClick={() => hacer("/plataforma/facturacion/emisor", "POST", { cuit }, "Cuenta emisora elegida")} disabled={accion.isPending}>
            Usar esta cuenta
          </Button>
        </div>
      </Card>
    );
  return (
    <Card className="gap-4 p-4 shadow-none" data-testid="emisor">
      <div>
        <h3 className="font-semibold">Quién factura</h3>
        <p className="text-sm text-muted-foreground">
          CUIT {formatCuit(e.emisor.cuit)} · {e.emisor.condicionIva}. El nombre tiene que ser exactamente el que figura en ARCA.
        </p>
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="grid gap-1.5">
          <Label htmlFor="fp-rs">Nombre o razón social (como en ARCA)</Label>
          <Input id="fp-rs" value={d.razonSocial} onChange={(x) => setD({ ...d, razonSocial: x.target.value })} />
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor="fp-nf">Nombre de fantasía</Label>
          <Input id="fp-nf" value={d.nombreFantasia} onChange={(x) => setD({ ...d, nombreFantasia: x.target.value })} />
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor="fp-dom">Domicilio fiscal</Label>
          <Input id="fp-dom" value={d.domicilio} onChange={(x) => setD({ ...d, domicilio: x.target.value })} />
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor="fp-loc">Localidad</Label>
          <Input id="fp-loc" value={d.localidad} onChange={(x) => setD({ ...d, localidad: x.target.value })} />
        </div>
      </div>
      <div className="flex flex-wrap items-end gap-3">
        <Button onClick={() => hacer("/plataforma/facturacion/emisor", "PUT", d, "Datos del emisor guardados")} disabled={accion.isPending}>
          Guardar datos
        </Button>
        <div className="grid gap-1.5">
          <Label htmlFor="fp-pv">Punto de venta (Web Services)</Label>
          <div className="flex gap-2">
            <Input id="fp-pv" inputMode="numeric" className="w-24" value={pv} onChange={(x) => setPv(x.target.value.replace(/\D/g, "").slice(0, 5))} />
            <Button variant="outline" onClick={() => hacer("/plataforma/facturacion/punto-venta", "PUT", { numero: Number(pv) }, `Punto de venta ${pv}`)} disabled={accion.isPending || !pv}>
              Guardar
            </Button>
          </div>
        </div>
      </div>
    </Card>
  );
}

function Arca({ estado }: { estado: EstadoApi }) {
  const arca = useQuery({ queryKey: ["admin", "facturacion", "arca"], queryFn: () => apiAdmin<ArcaApi>("/plataforma/facturacion/arca") });
  const accion = useAccionAdmin();
  const archivo = useRef<HTMLInputElement>(null);
  const [probando, setProbando] = useState(false);
  const [prueba, setPrueba] = useState<string | null>(null);
  const a = arca.data;

  const bajar = (texto: string, nombre: string) => {
    const url = URL.createObjectURL(new Blob([texto], { type: "application/pkcs10" }));
    const el = document.createElement("a");
    el.href = url;
    el.download = nombre;
    el.click();
    URL.revokeObjectURL(url);
  };
  const generar = async () => {
    try {
      const r = await apiAdmin<{ csr: string; alias: string; archivo: string }>("/plataforma/facturacion/arca/csr", { method: "POST", body: {} });
      bajar(r.csr, r.archivo);
      toast.success("Pedido de certificado descargado", { description: `Subilo en ARCA con el alias ${r.alias}.` });
      arca.refetch();
    } catch (e) {
      toast.error(mensaje(e));
    }
  };
  const subir = async (ev: React.ChangeEvent<HTMLInputElement>) => {
    const f = ev.target.files?.[0];
    ev.target.value = "";
    if (!f) return;
    try {
      await accion.mutateAsync({ url: "/plataforma/facturacion/arca/certificado", body: { pem: await f.text() } });
      toast.success("Certificado cargado");
      arca.refetch();
    } catch (e) {
      toast.error(mensaje(e), { duration: 10000 });
    }
  };
  const produccion = async () => {
    try {
      await accion.mutateAsync({ url: "/plataforma/facturacion/arca/modo", metodo: "PUT", body: { modo: "produccion" } });
      toast.success("Conectado a ARCA producción");
      arca.refetch();
    } catch (e) {
      toast.error(mensaje(e), { duration: 10000 });
    }
  };
  const probar = async () => {
    setProbando(true);
    setPrueba(null);
    try {
      const r = await apiAdmin<{ puntoVenta: number; tipo: string; ultimoNumero: number }>("/plataforma/facturacion/arca/probar", { method: "POST", body: {} });
      setPrueba(`Conexión correcta. Punto de venta ${r.puntoVenta}: la última ${r.tipo} autorizada es la N° ${r.ultimoNumero}.`);
      arca.refetch();
    } catch (e) {
      setPrueba(null);
      toast.error(mensaje(e), { duration: 12000 });
    } finally {
      setProbando(false);
    }
  };

  return (
    <Card className="gap-4 p-4 shadow-none" data-testid="arca-propia">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="font-semibold">Conexión con ARCA</h3>
        {a && (
          <span className={cn("rounded-full px-2.5 py-0.5 text-xs font-medium", a.modo === "produccion" ? "bg-success/12 text-success" : "bg-warning/15 text-warning-ink")}>
            {a.modo === "produccion" ? "ARCA producción" : a.modo === "homologacion" ? "ARCA homologación (prueba)" : "Sin conectar (modo de prueba)"}
          </span>
        )}
      </div>
      {a && (
        <ol className="grid gap-3 text-sm">
          <li className="grid gap-1.5">
            <span>
              <b>1.</b> Descargá el pedido de certificado y subilo en ARCA → «Administración de Certificados Digitales» con el alias <code className="rounded bg-muted px-1">{a.aliasSugerido}</code>. Usá el servicio común, no el de homologación.
            </span>
            <Button variant="outline" size="sm" className="w-fit" onClick={generar}>
              <Download className="size-4" /> Descargar pedido (.csr)
            </Button>
          </li>
          <li className="grid gap-1.5">
            <span>
              <b>2.</b> Descargá de ARCA el certificado (.crt) y subilo acá.
            </span>
            <input ref={archivo} type="file" accept=".crt,.pem,.cer,.txt" className="sr-only" onChange={subir} aria-label="Certificado de ARCA" />
            <div className="flex flex-wrap items-center gap-2">
              <Button variant="outline" size="sm" className="w-fit" onClick={() => archivo.current?.click()} disabled={accion.isPending}>
                <Upload className="size-4" /> Subir certificado (.crt)
              </Button>
              {a.certificado && (
                <span className="flex items-center gap-1 text-xs text-success">
                  <CheckCircle2 className="size-3.5" /> {a.certificado.alias} · {a.certificado.deHomologacion ? "de homologación" : "de producción"} · vence {new Date(a.certificado.vence).toLocaleDateString("es-AR")}
                </span>
              )}
            </div>
          </li>
          <li>
            <b>3.</b> En ARCA → «Administrador de Relaciones de Clave Fiscal» → Nueva relación → «Facturación Electrónica» (Web Services) → elegí como representante el certificado con el alias <code className="rounded bg-muted px-1">{a.certificado?.alias ?? a.aliasSugerido}</code>.
          </li>
          <li className="grid gap-1.5">
            <span>
              <b>4.</b> Conectá con ARCA producción y probá. El punto de venta es el {estado.puntosVenta.join(", ") || "—"}: tiene que ser el que creaste en ARCA como «Web Services».
            </span>
            <div className="flex flex-wrap items-center gap-2">
              {a.modo !== "produccion" && (
                <Button size="sm" className="w-fit" onClick={produccion} disabled={!a.certificado || accion.isPending}>
                  <PlugZap className="size-4" /> Conectar a producción
                </Button>
              )}
              <Button variant="outline" size="sm" className="w-fit" onClick={probar} disabled={probando || a.modo === "simulado"}>
                {probando && <Loader2 className="size-4 animate-spin" />} Probar conexión
              </Button>
            </div>
            {prueba && (
              <p className="text-sm text-success" data-testid="prueba-arca">
                {prueba}
              </p>
            )}
            {a.ultimoError && !prueba && <p className="text-sm text-destructive">Último error de ARCA: {a.ultimoError}</p>}
            {a.ultimaConexion && !prueba && <p className="text-xs text-muted-foreground">Última conexión correcta: {fechaHora(a.ultimaConexion)}</p>}
          </li>
        </ol>
      )}
    </Card>
  );
}

function Automatica({ e }: { e: EstadoApi }) {
  const accion = useAccionAdmin();
  const cambiar = async (activa: boolean) => {
    try {
      await accion.mutateAsync({ url: "/plataforma/facturacion/automatica", metodo: "PUT", body: { activa } });
      toast.success(activa ? "Listo: cada pago de suscripción se factura solo" : "Facturación automática apagada");
    } catch (err) {
      toast.error(mensaje(err), { duration: 10000 });
    }
  };
  return (
    <Card className="flex-row items-start gap-3 p-4 shadow-none">
      <Switch checked={e.facturarSuscripciones} onCheckedChange={cambiar} aria-label="Facturar solo cada pago de suscripción" className="mt-0.5" />
      <div className="text-sm">
        <b className="font-medium">Facturar sola cada suscripción que se cobra</b>
        <p className="text-muted-foreground">Cuando Mercado Pago aprueba un pago (o cargás uno a mano), sale tu Factura C a nombre de la empresa que pagó y le llega por email. Se activa con ARCA en producción y la conexión probada.</p>
      </div>
    </Card>
  );
}

function Pagos({ e }: { e: EstadoApi }) {
  const qc = useQueryClient();
  const [haciendo, setHaciendo] = useState<string | null>(null);
  const facturar = async (id: string, forzar = false) => {
    setHaciendo(id);
    try {
      const r = await apiAdmin<{ numero: string }>(`/plataforma/facturacion/pagos/${id}/facturar`, { method: "POST", body: { forzar } });
      toast.success(`${r.numero} emitida`);
      await qc.invalidateQueries({ queryKey: ["admin", "facturacion"] });
    } catch (err) {
      toast.error(mensaje(err), { duration: 12000 });
    } finally {
      setHaciendo(null);
    }
  };
  const ver = async (id: string) => {
    const ventana = window.open("", "_blank");
    try {
      const r = await apiAdmin<{ url: string }>(`/plataforma/facturacion/pagos/${id}/factura`);
      if (ventana) ventana.location.href = r.url;
    } catch (err) {
      ventana?.close();
      toast.error(mensaje(err));
    }
  };
  return (
    <Card className="gap-0 p-0 shadow-none">
      <div className="flex items-center gap-2 border-b p-4">
        <Receipt className="size-4 text-primary" />
        <h3 className="font-semibold">Pagos de suscripciones</h3>
      </div>
      {e.pagos.length === 0 ? (
        <p className="p-4 text-sm text-muted-foreground">Todavía no hay pagos aprobados.</p>
      ) : (
        <div className="divide-y">
          {e.pagos.map((p) => (
            <div key={p.id} className="flex flex-wrap items-center gap-3 px-4 py-3 text-sm" data-testid="pago-suscripcion">
              <span className="min-w-0 flex-1">
                <span className="block truncate font-medium">{p.empresa}</span>
                <span className="block text-xs text-muted-foreground">
                  {p.producto === "dental" ? "CoreDental" : "Prexacode"} · {p.periodo} · {p.aprobadoAt ? fechaHora(p.aprobadoAt) : ""} · {p.proveedor === "mercadopago" ? "Mercado Pago" : p.proveedor}
                </span>
              </span>
              <span className="tabular font-medium">{formatMoney(p.importeArs)}</span>
              {p.facturado ? (
                <Button size="sm" variant="ghost" onClick={() => ver(p.id)}>
                  {p.facturaNumero} <ExternalLink className="size-3.5" />
                </Button>
              ) : (
                <span className="flex items-center gap-2">
                  {p.facturaError && <span className={cn("max-w-64 truncate text-xs", p.facturaError === "Facturando…" ? "text-muted-foreground" : "text-destructive")} title={p.facturaError}>{p.facturaError}</span>}
                  <Button size="sm" variant="outline" onClick={() => facturar(p.id, p.facturaError === "Facturando…")} disabled={!!haciendo || !e.emisor}>
                    {haciendo === p.id && <Loader2 className="size-4 animate-spin" />}
                    {p.facturaError ? "Reintentar" : "Facturar"}
                  </Button>
                </span>
              )}
            </div>
          ))}
        </div>
      )}
    </Card>
  );
}
