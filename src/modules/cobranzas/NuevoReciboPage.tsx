import { useEffect, useState } from "react";
import { ArrowLeft, Loader2, Plus, Save, Trash2 } from "lucide-react";
import { Link, useNavigate, useSearchParams } from "react-router";
import { toast } from "sonner";
import { ApiError } from "@/api/client";
import { useClientes, useCrearRecibo, usePendientes } from "@/api/hooks";
import { MEDIOS_PAGO } from "@/api/types";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { PageHeader } from "@/components/shared/PageHeader";
import { StatusBadge } from "@/components/shared/StatusBadge";
import { formatDate, formatMoney } from "@/lib/format";
import { r2 } from "@/lib/facturacion";
import { aNumero } from "@/lib/numeros";
import { cn } from "@/lib/utils";

const hoyLocal = () => {
  const d = new Date();
  return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
};
const texto = (n: number) => n.toLocaleString("es-AR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

interface Medio {
  medio: string;
  importe: string;
  referencia: string;
}

export function NuevoReciboPage() {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const { data: clientes = [] } = useClientes();
  const crear = useCrearRecibo();
  const [clienteId, setClienteId] = useState(params.get("cliente") ?? "");
  const { data: pendientes = [], isFetching } = usePendientes({ clienteId }, !!clienteId);
  const [fecha, setFecha] = useState(hoyLocal());
  /** facturaId → importe a aplicar (texto) */
  const [aplicar, setAplicar] = useState<Record<string, string>>({});
  const [medios, setMedios] = useState<Medio[]>([{ medio: "Transferencia", importe: "", referencia: "" }]);
  const [observaciones, setObservaciones] = useState("");
  const [errores, setErrores] = useState<Record<string, string>>({});

  // Si se pidió una factura puntual (desde su detalle), viene tildada
  useEffect(() => {
    const f = params.get("factura");
    const p = pendientes.find((x) => x.id === f);
    if (p) setAplicar({ [p.id]: texto(p.saldo) });
  }, [pendientes, params]);

  useEffect(() => setAplicar({}), [clienteId]);

  const aplicado = r2(Object.values(aplicar).reduce((a, v) => a + (aNumero(v) || 0), 0));
  const cobrado = r2(medios.reduce((a, m) => a + (aNumero(m.importe) || 0), 0));
  const aCuenta = r2(cobrado - aplicado);

  // Si hay un solo medio y todavía no se tocó, se completa con lo aplicado
  const [medioTocado, setMedioTocado] = useState(false);
  useEffect(() => {
    if (!medioTocado && medios.length === 1) setMedios((ms) => [{ ...ms[0]!, importe: aplicado ? texto(aplicado) : "" }]);
  }, [aplicado]); // eslint-disable-line react-hooks/exhaustive-deps

  const tildar = (id: string, saldo: number, marcado: boolean) =>
    setAplicar((a) => {
      const n = { ...a };
      if (marcado) n[id] = texto(saldo);
      else delete n[id];
      return n;
    });

  const cambiarMedio = (i: number, patch: Partial<Medio>) => {
    setMedioTocado(true);
    setMedios((ms) => ms.map((m, k) => (k === i ? { ...m, ...patch } : m)));
  };

  const submit = async () => {
    setErrores({});
    try {
      const r = await crear.mutateAsync({
        clienteId,
        fecha,
        observaciones: observaciones || null,
        medios: medios.filter((m) => m.importe.trim()).map((m) => ({ medio: m.medio, importe: aNumero(m.importe), referencia: m.referencia || null })),
        imputaciones: Object.entries(aplicar)
          .filter(([, v]) => aNumero(v) > 0)
          .map(([comprobanteId, v]) => ({ comprobanteId, importe: aNumero(v) })),
      });
      toast.success(`Recibo ${String(r.numero).padStart(8, "0")} registrado`);
      navigate(`/cobranzas/recibos/${r.id}`);
    } catch (err) {
      if (!(err instanceof ApiError)) throw err;
      setErrores(err.details);
      toast.error(err.message, { duration: 8000 });
    }
  };

  return (
    <>
      <Button variant="ghost" size="sm" asChild className="mb-3 -ml-2 text-muted-foreground">
        <Link to="/cobranzas">
          <ArrowLeft className="size-4" /> Cobranzas
        </Link>
      </Button>
      <PageHeader
        title="Registrar cobro"
        description="Elegí qué facturas paga el cliente y con qué. Lo que sobre queda a su favor."
        actions={
          <Button onClick={submit} disabled={crear.isPending || !clienteId}>
            {crear.isPending ? <Loader2 className="size-4 animate-spin" /> : <Save className="size-4" />}
            Registrar recibo
          </Button>
        }
      />

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)]">
        <div className="flex min-w-0 flex-col gap-6">
          <Card className="shadow-none">
            <CardContent className="grid gap-4 pt-6 sm:grid-cols-[1fr_180px]">
              <div className="grid gap-1.5">
                <Label htmlFor="rec-cliente">Cliente</Label>
                <Select value={clienteId} onValueChange={setClienteId}>
                  <SelectTrigger id="rec-cliente" className="w-full" aria-invalid={!!errores.clienteId}>
                    <SelectValue placeholder="Elegí un cliente" />
                  </SelectTrigger>
                  <SelectContent>
                    {clientes.map((c) => (
                      <SelectItem key={c.id} value={c.id}>
                        {c.razonSocial}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="grid gap-1.5">
                <Label htmlFor="rec-fecha">Fecha</Label>
                <Input id="rec-fecha" type="date" value={fecha} onChange={(e) => setFecha(e.target.value)} />
              </div>
            </CardContent>
          </Card>

          <Card className="gap-0 pb-0 shadow-none">
            <CardHeader className="pb-4">
              <CardTitle>Facturas pendientes</CardTitle>
            </CardHeader>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[560px] text-sm">
                <thead>
                  <tr className="border-y bg-muted/40 text-left text-xs text-muted-foreground">
                    <th className="w-10 px-4 py-2" />
                    <th className="px-2 py-2 font-medium">Comprobante</th>
                    <th className="px-2 py-2 font-medium">Vence</th>
                    <th className="px-2 py-2 text-right font-medium">Saldo</th>
                    <th className="w-36 px-4 py-2 font-medium">Aplicar</th>
                  </tr>
                </thead>
                <tbody>
                  {pendientes.map((p, i) => {
                    const marcado = p.id in aplicar;
                    const error = errores[`imputaciones.${Object.keys(aplicar).indexOf(p.id)}.importe`];
                    return (
                      <tr key={p.id} className={cn("border-b", marcado && "bg-primary/5")} data-testid="factura-pendiente">
                        <td className="px-4 py-2">
                          <Checkbox checked={marcado} onCheckedChange={(v) => tildar(p.id, p.saldo, v === true)} aria-label={`Aplicar a ${p.comprobante}`} />
                        </td>
                        <td className="px-2 py-2">
                          <div className="font-medium whitespace-nowrap">{p.comprobante}</div>
                          <div className="text-xs text-muted-foreground">Total {formatMoney(p.total)}</div>
                          {error && <div className="text-xs text-destructive">{error}</div>}
                          {i === 0 && errores[`imputaciones.0.comprobanteId`] && <div className="text-xs text-destructive">{errores[`imputaciones.0.comprobanteId`]}</div>}
                        </td>
                        <td className="px-2 py-2 whitespace-nowrap">
                          <div className="tabular">{formatDate(p.vencimiento)}</div>
                          <StatusBadge status={p.estadoCobro} />
                        </td>
                        <td className="tabular px-2 py-2 text-right font-medium whitespace-nowrap">{formatMoney(p.saldo)}</td>
                        <td className="px-4 py-2">
                          <Input
                            aria-label={`Importe a aplicar a ${p.comprobante}`}
                            inputMode="decimal"
                            value={aplicar[p.id] ?? ""}
                            disabled={!marcado}
                            onChange={(e) => setAplicar((a) => ({ ...a, [p.id]: e.target.value }))}
                            className="h-8"
                          />
                        </td>
                      </tr>
                    );
                  })}
                  {clienteId && !isFetching && pendientes.length === 0 && (
                    <tr>
                      <td colSpan={5} className="px-6 py-8 text-center text-muted-foreground">
                        Este cliente no tiene facturas pendientes. Lo que cobres queda a su favor.
                      </td>
                    </tr>
                  )}
                  {!clienteId && (
                    <tr>
                      <td colSpan={5} className="px-6 py-8 text-center text-muted-foreground">
                        Elegí un cliente para ver sus facturas.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </Card>
        </div>

        <div className="flex min-w-0 flex-col gap-6">
          <Card className="shadow-none">
            <CardHeader>
              <CardTitle>Medios de pago</CardTitle>
            </CardHeader>
            <CardContent className="grid gap-3">
              {medios.map((m, i) => (
                <div key={i} className="grid gap-2 rounded-lg border p-3 sm:grid-cols-[1fr_130px_auto]" data-testid="medio-pago">
                  <Select value={m.medio} onValueChange={(v) => cambiarMedio(i, { medio: v })}>
                    <SelectTrigger className="w-full" aria-label={`Medio de pago ${i + 1}`}>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {MEDIOS_PAGO.map((x) => (
                        <SelectItem key={x} value={x}>
                          {x}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Input aria-label={`Importe del medio ${i + 1}`} inputMode="decimal" placeholder="Importe" value={m.importe} onChange={(e) => cambiarMedio(i, { importe: e.target.value })} />
                  <Button variant="ghost" size="icon" disabled={medios.length === 1} onClick={() => setMedios((ms) => ms.filter((_, k) => k !== i))} aria-label={`Quitar medio ${i + 1}`}>
                    <Trash2 className="size-4 text-muted-foreground" />
                  </Button>
                  <Input
                    aria-label={`Referencia del medio ${i + 1}`}
                    className="sm:col-span-3"
                    placeholder={m.medio === "Cheque" ? "Banco y N° de cheque" : "N° de operación (opcional)"}
                    value={m.referencia}
                    onChange={(e) => cambiarMedio(i, { referencia: e.target.value })}
                  />
                </div>
              ))}
              {errores.medios && <p className="text-xs text-destructive">{errores.medios}</p>}
              <Button variant="outline" onClick={() => { setMedioTocado(true); setMedios((ms) => [...ms, { medio: "Efectivo", importe: "", referencia: "" }]); }}>
                <Plus className="size-4" /> Agregar otro medio
              </Button>
              <div className="grid gap-1.5">
                <Label htmlFor="rec-obs">Observaciones</Label>
                <Textarea id="rec-obs" rows={2} value={observaciones} onChange={(e) => setObservaciones(e.target.value)} />
              </div>
            </CardContent>
          </Card>

          <Card className="shadow-none">
            <CardContent className="pt-6">
              <dl className="tabular grid grid-cols-[1fr_auto] gap-y-1.5 text-sm" data-testid="resumen-recibo">
                <dt className="text-muted-foreground">Total cobrado</dt>
                <dd className="text-right text-base font-semibold">{formatMoney(cobrado)}</dd>
                <dt className="text-muted-foreground">Aplicado a facturas</dt>
                <dd className="text-right">{formatMoney(aplicado)}</dd>
                <dt className="text-muted-foreground">Queda a favor del cliente</dt>
                <dd className={cn("text-right", aCuenta < 0 ? "text-destructive" : aCuenta > 0 && "text-success")}>{formatMoney(aCuenta)}</dd>
              </dl>
              {aCuenta < 0 && <p className="mt-2 text-xs text-destructive">Estás aplicando más de lo que cobrás.</p>}
            </CardContent>
          </Card>
        </div>
      </div>
    </>
  );
}
