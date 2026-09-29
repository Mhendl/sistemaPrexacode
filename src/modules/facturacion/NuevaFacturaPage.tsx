import { useEffect, useRef, useState } from "react";
import { ArrowLeft, Loader2, Send } from "lucide-react";
import { Link, useNavigate, useSearchParams } from "react-router";
import { toast } from "sonner";
import { ApiError } from "@/api/client";
import { useClientes, useComprobante, useConfigFacturacion, useEmitirComprobante, usePresupuesto, useProductos } from "@/api/hooks";
import { MEDIOS_PAGO } from "@/api/types";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { PageHeader } from "@/components/shared/PageHeader";
import { PaperFit } from "@/components/shared/PaperFit";
import { useRole } from "@/context/AuthProvider";
import { letraSegun, numeroComprobante } from "@/lib/facturacion";
import { AvisoModoPrueba } from "./FacturacionPage";
import { ComprobanteHoja } from "./ComprobanteHoja";
import { ItemsEditor, useRenglones, itemsDesdeParametro } from "./ItemsEditor";

const hoyLocal = () => {
  const d = new Date();
  return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
};
const numPresupuesto = (n: number) => String(n).padStart(8, "0");

/** Valor del selector de cliente para la venta de mostrador a un consumidor final sin identificar */
export const CONSUMIDOR_FINAL = "consumidor-final";
const TOPE_SIN_IDENTIFICAR = 10_000_000; // RG 5700/2025 (el servidor usa el mismo tope)

export function NuevaFacturaPage() {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const ncDe = params.get("nc") ?? undefined;
  const presupuestoId = params.get("presupuesto") ?? undefined;
  const { empresa } = useRole();
  const { data: config } = useConfigFacturacion();
  const { data: clientes = [] } = useClientes();
  const { data: productos = [] } = useProductos();
  const { data: factura } = useComprobante(ncDe);
  const { data: presupuesto } = usePresupuesto(presupuestoId);
  const emitir = useEmitirComprobante();
  const esNc = !!ncDe;

  const [clienteId, setClienteId] = useState(params.get("cliente") ?? "");
  const [puntoVenta, setPuntoVenta] = useState("1");
  const [fecha, setFecha] = useState(hoyLocal());
  const [condicionVenta, setCondicionVenta] = useState<"Contado" | "Cuenta corriente">("Contado");
  const [observaciones, setObservaciones] = useState("");
  const [moverStock, setMoverStock] = useState(true);
  const [cobrarAhora, setCobrarAhora] = useState(true);
  const [medioCobro, setMedioCobro] = useState<string>("Efectivo");
  const [errores, setErrores] = useState<Record<string, string>>({});

  const anonimo = clienteId === CONSUMIDOR_FINAL;
  const cliente = anonimo
    ? { razonSocial: "Consumidor final", cuit: "", condicionIva: "Consumidor Final" as const, domicilio: "", localidad: "" }
    : clientes.find((c) => c.id === clienteId);
  const letra = letraSegun(config?.condicionIvaEmisor ?? empresa.condicionIva, cliente?.condicionIva ?? "Consumidor Final");
  const editor = useRenglones(letra, productos);
  const { cargar } = editor;
  const tipo = `${esNc ? "Nota de crédito" : "Factura"} ${letra}`;
  const puntos = config?.puntosVenta.filter((p) => p.activo) ?? [];

  // Nota de crédito: arranca con el cliente y los ítems de la factura
  useEffect(() => {
    if (!factura || productos.length === 0 && factura.items.some((i) => i.productoId)) return;
    setClienteId(factura.receptor.cuit ? factura.clienteId : CONSUMIDOR_FINAL);
    setPuntoVenta(String(factura.puntoVenta));
    setCondicionVenta(factura.condicionVenta);
    setMoverStock(factura.descontoStock);
    cargar(factura.items);
  }, [factura, productos]); // eslint-disable-line react-hooks/exhaustive-deps

  // Desde "Productos que usa" del cliente: precarga esos productos (una sola vez)
  const productosParam = params.get("productos");
  const precargado = useRef(false);
  useEffect(() => {
    if (precargado.current || !productosParam || ncDe || presupuestoId || productos.length === 0) return;
    precargado.current = true;
    cargar(itemsDesdeParametro(productosParam, productos));
  }, [productos]); // eslint-disable-line react-hooks/exhaustive-deps

  // Factura desde un presupuesto: mismo cliente, ítems y precios cotizados
  useEffect(() => {
    if (!presupuesto || productos.length === 0 && presupuesto.items.some((i) => i.productoId)) return;
    setClienteId(presupuesto.clienteId);
    setObservaciones(`Según presupuesto N° ${numPresupuesto(presupuesto.numero)}${presupuesto.condiciones ? `. ${presupuesto.condiciones}` : ""}`);
    cargar(presupuesto.items);
  }, [presupuesto, productos]); // eslint-disable-line react-hooks/exhaustive-deps

  const submit = async () => {
    setErrores({});
    try {
      const c = await emitir.mutateAsync({
        clase: esNc ? "nota_credito" : "factura",
        asociadoId: ncDe,
        presupuestoId,
        ...(anonimo ? { consumidorFinal: true } : { clienteId }),
        puntoVenta: Number(puntoVenta),
        fecha,
        condicionVenta: anonimo ? "Contado" : condicionVenta,
        observaciones: observaciones || null,
        moverStock: editor.hayStock && moverStock,
        cobro: !esNc && (anonimo || (condicionVenta === "Contado" && cobrarAhora)) ? { medio: medioCobro } : undefined,
        items: editor.paraEnviar(),
      });
      if (c.estado === "Autorizado") toast.success(`${c.tipo} ${numeroComprobante(c.puntoVenta, c.numero)} autorizada · CAE ${c.cae}`);
      else toast.error("ARCA rechazó el comprobante. Revisá el motivo.");
      navigate(`/facturacion/${c.id}`);
    } catch (err) {
      if (!(err instanceof ApiError)) throw err;
      setErrores(err.details);
      toast.error(err.message, { duration: 8000 });
    }
  };

  const volver = esNc && ncDe ? { to: `/facturacion/${ncDe}`, label: "Volver a la factura" } : presupuestoId ? { to: `/presupuestos/${presupuestoId}`, label: "Volver al presupuesto" } : { to: "/facturacion", label: "Facturación" };

  return (
    <>
      <Button variant="ghost" size="sm" asChild className="mb-3 -ml-2 text-muted-foreground">
        <Link to={volver.to}>
          <ArrowLeft className="size-4" /> {volver.label}
        </Link>
      </Button>
      <AvisoModoPrueba modo={config?.modo} />
      <PageHeader
        title={esNc ? "Nueva nota de crédito" : "Nueva factura"}
        description={
          esNc && factura
            ? `Ajusta la ${factura.tipo} ${numeroComprobante(factura.puntoVenta, factura.numero)}. Podés bajar cantidades o quitar ítems.`
            : presupuesto
              ? `A partir del presupuesto N° ${numPresupuesto(presupuesto.numero)}. Revisá y emití.`
              : "El tipo de comprobante se elige solo según tu condición de IVA y la del cliente."
        }
        actions={
          <Button onClick={submit} disabled={emitir.isPending}>
            {emitir.isPending ? <Loader2 className="size-4 animate-spin" /> : <Send className="size-4" />}
            {emitir.isPending ? "Pidiendo CAE a ARCA…" : "Emitir y obtener CAE"}
          </Button>
        }
      />

      <div className="grid gap-6 2xl:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
        <div className="flex min-w-0 flex-col gap-6">
          <Card className="shadow-none">
            <CardHeader>
              <CardTitle>Datos del comprobante</CardTitle>
            </CardHeader>
            <CardContent className="grid gap-4 sm:grid-cols-2">
              <div className="grid gap-1.5 sm:col-span-2">
                <Label htmlFor="fac-cliente">Cliente</Label>
                <Select value={clienteId} onValueChange={setClienteId} disabled={esNc || !!presupuestoId}>
                  <SelectTrigger id="fac-cliente" className="w-full" aria-invalid={!!errores.clienteId}>
                    <SelectValue placeholder="Elegí un cliente" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={CONSUMIDOR_FINAL}>Consumidor final (sin identificar)</SelectItem>
                    {clientes
                      .filter((c) => c.estado === "Activo" || c.id === clienteId)
                      .map((c) => (
                        <SelectItem key={c.id} value={c.id}>
                          {c.razonSocial}
                        </SelectItem>
                      ))}
                  </SelectContent>
                </Select>
                {errores.clienteId && <p className="text-xs text-destructive">{errores.clienteId}</p>}
                {anonimo && !esNc && (
                  <p className="text-xs text-muted-foreground" data-testid="aviso-consumidor-final">
                    Venta de mostrador: de contado y cobrada en el momento. Desde $ {TOPE_SIN_IDENTIFICAR.toLocaleString("es-AR")} ARCA pide identificar al comprador.
                  </p>
                )}
                {errores.presupuestoId && <p className="text-xs text-destructive">{errores.presupuestoId}</p>}
              </div>
              <div className="grid gap-1.5">
                <Label>Tipo</Label>
                <div className="flex h-9 items-center gap-2 rounded-md border bg-muted/50 px-3 text-sm" data-testid="tipo-comprobante">
                  <span className="flex size-6 items-center justify-center rounded bg-primary text-xs font-bold text-primary-foreground">{letra}</span>
                  {tipo}
                </div>
              </div>
              <div className="grid gap-1.5">
                <Label htmlFor="fac-pv">Punto de venta</Label>
                <Select value={puntoVenta} onValueChange={setPuntoVenta} disabled={esNc}>
                  <SelectTrigger id="fac-pv" className="w-full" aria-invalid={!!errores.puntoVenta}>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {puntos.map((p) => (
                      <SelectItem key={p.id} value={String(p.numero)}>
                        {String(p.numero).padStart(4, "0")} · {p.nombre}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="grid gap-1.5">
                <Label htmlFor="fac-fecha">Fecha</Label>
                <Input id="fac-fecha" type="date" value={fecha} onChange={(e) => setFecha(e.target.value)} aria-invalid={!!errores.fecha} />
                {errores.fecha && <p className="text-xs text-destructive">{errores.fecha}</p>}
              </div>
              <div className="grid gap-1.5">
                <Label htmlFor="fac-condicion">Condición de venta</Label>
                <Select value={anonimo ? "Contado" : condicionVenta} onValueChange={(v) => setCondicionVenta(v as typeof condicionVenta)} disabled={anonimo}>
                  <SelectTrigger id="fac-condicion" className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="Contado">Contado</SelectItem>
                    <SelectItem value="Cuenta corriente">Cuenta corriente (30 días)</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              {!esNc && (anonimo || condicionVenta === "Contado") && (
                <div className="flex flex-col gap-3 rounded-lg border bg-muted/30 p-3 sm:col-span-2 sm:flex-row sm:items-center">
                  <label className="flex flex-1 items-center gap-2 text-sm">
                    <Checkbox checked={anonimo || cobrarAhora} disabled={anonimo} onCheckedChange={(v) => setCobrarAhora(v === true)} aria-label="Cobrada en el momento" />
                    Cobrada en el momento (genera el recibo solo)
                  </label>
                  {(anonimo || cobrarAhora) && (
                    <Select value={medioCobro} onValueChange={setMedioCobro}>
                      <SelectTrigger className="w-full sm:w-52" aria-label="Medio de cobro">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {MEDIOS_PAGO.filter((m) => m !== "Retención").map((m) => (
                          <SelectItem key={m} value={m}>
                            {m}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  )}
                </div>
              )}
              <div className="grid gap-1.5 sm:col-span-2">
                <Label htmlFor="fac-obs">Observaciones</Label>
                <Textarea id="fac-obs" rows={2} value={observaciones} onChange={(e) => setObservaciones(e.target.value)} />
              </div>
            </CardContent>
          </Card>

          <ItemsEditor
            editor={editor}
            productos={productos}
            letra={letra}
            errores={errores}
            pie={
              editor.hayStock ? (
                <label className="flex items-start gap-2 text-sm">
                  <Checkbox checked={moverStock} onCheckedChange={(v) => setMoverStock(v === true)} className="mt-0.5" aria-label={esNc ? "Reingresar la mercadería al stock" : "Descontar stock"} />
                  <span>
                    {esNc ? "Reingresar la mercadería al stock" : "Descontar stock"}
                    <span className="block text-xs text-muted-foreground">{esNc ? "Si el cliente devolvió los productos." : "Destildalo si ya se entregó con un remito."}</span>
                  </span>
                </label>
              ) : undefined
            }
          />
        </div>

        <div className="min-w-0">
          <div className="mb-2 text-sm font-medium text-muted-foreground">Vista previa</div>
          <div className="rounded-xl bg-muted p-3 sm:p-5 2xl:sticky 2xl:top-20">
            <PaperFit>
              <ComprobanteHoja
                empresa={empresa}
                c={{
                  tipo,
                  letra,
                  tipoCbte: esNc ? { A: 3, B: 8, C: 13 }[letra] : { A: 1, B: 6, C: 11 }[letra],
                  puntoVenta: Number(puntoVenta),
                  numero: null,
                  fecha,
                  vencimiento: fecha,
                  condicionVenta: anonimo ? "Contado" : condicionVenta,
                  concepto: editor.renglones.every((r) => r.controlaStock) ? 1 : editor.hayStock ? 3 : 2,
                  fechaServicioDesde: fecha,
                  fechaServicioHasta: fecha,
                  receptor: cliente
                    ? { razonSocial: cliente.razonSocial, cuit: cliente.cuit, condicionIva: cliente.condicionIva, domicilio: [cliente.domicilio, cliente.localidad].filter(Boolean).join(", ") || null }
                    : { razonSocial: "", cuit: "", condicionIva: "", domicilio: null },
                  items: editor.paraHoja(),
                  ...editor.totales,
                  modo: config?.modo ?? "simulado",
                  estado: "Borrador",
                  observaciones,
                  asociado: factura ? `${factura.tipo} ${numeroComprobante(factura.puntoVenta, factura.numero)}` : null,
                }}
              />
            </PaperFit>
          </div>
        </div>
      </div>
    </>
  );
}
