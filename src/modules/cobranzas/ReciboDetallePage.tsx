import { useState } from "react";
import { ArrowLeft, Ban, Loader2, Printer } from "lucide-react";
import { Link, useParams } from "react-router";
import { toast } from "sonner";
import { ApiError } from "@/api/client";
import { useAnularRecibo, useRecibo } from "@/api/hooks";
import type { EmpresaApi, ReciboApi } from "@/api/types";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { urlLogo } from "@/components/shared/EmpresaLogo";
import { PaperFit } from "@/components/shared/PaperFit";
import { QueryState } from "@/components/shared/QueryState";
import { StatusBadge } from "@/components/shared/StatusBadge";
import { brand } from "@/config/brand";
import { useRole } from "@/context/AuthProvider";
import { formatCuit, formatDate, formatMoney } from "@/lib/format";

const numero = (n: number) => `0001-${String(n).padStart(8, "0")}`;

/** Recibo tal como se imprime */
function ReciboHoja({ r, empresa }: { r: ReciboApi; empresa: EmpresaApi }) {
  const logo = urlLogo(empresa);
  return (
    <div className="hoja relative w-full bg-white text-[12px] leading-snug text-neutral-900 shadow-sm ring-1 ring-black/10">
      {r.estado === "Anulado" && (
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center" aria-hidden>
          <span className="-rotate-12 rounded-lg border-4 border-red-500/60 px-8 py-2 text-7xl font-black tracking-widest text-red-500/40">ANULADO</span>
        </div>
      )}
      <div className="relative grid grid-cols-2 border-b border-neutral-300">
        <div className="flex gap-4 border-r border-neutral-300 p-5 pr-10">
          {logo && <img src={logo} alt="" className="size-16 shrink-0 object-contain" />}
          <div>
            <div className="text-lg font-bold">{empresa.nombreFantasia ?? empresa.razonSocial}</div>
            <div className="mt-1 space-y-0.5 text-neutral-600">
              {empresa.nombreFantasia && <div>{empresa.razonSocial}</div>}
              {(empresa.domicilio || empresa.localidad) && <div>{[empresa.domicilio, empresa.localidad].filter(Boolean).join(", ")}</div>}
              <div>
                <b className="text-neutral-800">CUIT:</b> {formatCuit(empresa.cuit)}
              </div>
            </div>
          </div>
        </div>
        <div className="p-5 pl-10">
          <div className="text-lg font-bold">RECIBO</div>
          <div className="mt-1 space-y-0.5 text-neutral-600">
            <div>
              <b className="text-neutral-800">N°:</b> <span data-testid="recibo-numero">{numero(r.numero)}</span>
            </div>
            <div>
              <b className="text-neutral-800">Fecha:</b> {formatDate(r.fecha)}
            </div>
          </div>
        </div>
        <div className="absolute top-0 left-1/2 flex -translate-x-1/2 flex-col items-center border border-t-0 border-neutral-400 bg-white px-3 pt-1 pb-1.5">
          <span className="text-3xl leading-none font-bold">X</span>
        </div>
      </div>
      <div className="border-b border-neutral-300 py-1 text-center text-[10px] font-semibold tracking-wide text-neutral-600 uppercase">Documento no válido como factura</div>

      <div className="border-b border-neutral-300 px-5 py-4 text-[13px]">
        Recibimos de <b>{r.cliente.razonSocial}</b> {r.cliente.cuit && ` (CUIT ${formatCuit(r.cliente.cuit)})`} la suma de <b data-testid="recibo-total">{formatMoney(r.total)}</b> en concepto de pago
        {r.imputaciones.length > 0 ? " de los comprobantes detallados abajo" : " a cuenta"}.
      </div>

      <div className="grid grid-cols-2 border-b border-neutral-300">
        <div className="border-r border-neutral-300">
          <div className="bg-neutral-100 px-5 py-1.5 font-semibold">Medios de pago</div>
          <table className="w-full">
            <tbody>
              {r.medios.map((m) => (
                <tr key={m.id} className="border-t border-neutral-200">
                  <td className="px-5 py-1.5">
                    {m.medio}
                    {m.referencia && <span className="text-neutral-500"> · {m.referencia}</span>}
                  </td>
                  <td className="tabular px-5 py-1.5 text-right whitespace-nowrap">{formatMoney(m.importe)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div>
          <div className="bg-neutral-100 px-5 py-1.5 font-semibold">Aplicado a</div>
          <table className="w-full">
            <tbody>
              {r.imputaciones.map((i) => (
                <tr key={i.comprobanteId} className="border-t border-neutral-200">
                  <td className="px-5 py-1.5">{i.comprobante}</td>
                  <td className="tabular px-5 py-1.5 text-right whitespace-nowrap">{formatMoney(i.importe)}</td>
                </tr>
              ))}
              {r.aCuenta > 0 && (
                <tr className="border-t border-neutral-200">
                  <td className="px-5 py-1.5">A cuenta (saldo a favor)</td>
                  <td className="tabular px-5 py-1.5 text-right whitespace-nowrap">{formatMoney(r.aCuenta)}</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
      {r.observaciones && (
        <div className="border-b border-neutral-300 px-5 py-2">
          <b>Observaciones:</b> {r.observaciones}
        </div>
      )}
      {r.estado === "Anulado" && r.motivoAnulacion && (
        <div className="border-b border-neutral-300 px-5 py-2 text-red-700">
          <b>Anulado:</b> {r.motivoAnulacion}
        </div>
      )}
      <div className="flex justify-end px-5 pt-16 pb-6">
        <div className="w-56 border-t border-neutral-400 pt-1 text-center text-[11px] text-neutral-600">Firma y aclaración</div>
      </div>
      <div className="border-t border-neutral-200 px-5 py-1.5 text-center text-[9px] text-neutral-400">
        Generado con {brand.nombre} · {brand.web}
      </div>
    </div>
  );
}

export function ReciboDetallePage() {
  const { id } = useParams();
  const { empresa, puede } = useRole();
  const { data: r, isLoading, error, refetch } = useRecibo(id);
  const anular = useAnularRecibo();
  const [confirmar, setConfirmar] = useState(false);
  const [motivo, setMotivo] = useState("");
  const [errorMotivo, setErrorMotivo] = useState("");

  const confirmarAnulacion = async () => {
    setErrorMotivo("");
    try {
      await anular.mutateAsync({ id: r!.id, motivo });
      toast.success("Recibo anulado. Las facturas vuelven a quedar con saldo.");
      setConfirmar(false);
    } catch (e) {
      if (!(e instanceof ApiError)) throw e;
      setErrorMotivo(e.details.motivo ?? e.message);
    }
  };

  return (
    <>
      <Button variant="ghost" size="sm" asChild className="mb-3 -ml-2 text-muted-foreground">
        <Link to="/cobranzas?tab=recibos">
          <ArrowLeft className="size-4" /> Recibos
        </Link>
      </Button>
      <QueryState isLoading={isLoading} error={error} onRetry={refetch}>
        {r && (
          <>
            <div className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <h1 className="flex items-center gap-3 text-2xl font-semibold tracking-tight">
                  Recibo {numero(r.numero)} <StatusBadge status={r.estado} />
                </h1>
                <Link to={`/clientes/${r.cliente.id}`} className="text-sm text-muted-foreground hover:underline">
                  {r.cliente.razonSocial}
                </Link>
              </div>
              <div className="flex flex-wrap gap-2">
                {puede("cobranzas.anular") && r.estado === "Emitido" && (
                  <Button variant="outline" onClick={() => { setMotivo(""); setErrorMotivo(""); setConfirmar(true); }}>
                    <Ban className="size-4" /> Anular
                  </Button>
                )}
                <Button onClick={() => window.print()}>
                  <Printer className="size-4" /> Imprimir / PDF
                </Button>
              </div>
            </div>
            <div className="zona-impresion rounded-xl bg-muted p-3 sm:p-6">
              <PaperFit>
                <ReciboHoja r={r} empresa={empresa} />
              </PaperFit>
            </div>
            <Dialog open={confirmar} onOpenChange={setConfirmar}>
              <DialogContent className="sm:max-w-md">
                <DialogHeader>
                  <DialogTitle>¿Anular el recibo {numero(r.numero)}?</DialogTitle>
                  <DialogDescription>Lo cobrado deja de aplicarse: las facturas vuelven a quedar con saldo. Usalo, por ejemplo, si un cheque fue rechazado.</DialogDescription>
                </DialogHeader>
                <div className="grid gap-1.5">
                  <Label htmlFor="anular-motivo">Motivo</Label>
                  <Input id="anular-motivo" value={motivo} onChange={(e) => setMotivo(e.target.value)} placeholder="Ej.: cheque rechazado" autoFocus />
                  {errorMotivo && <p className="text-xs text-destructive">{errorMotivo}</p>}
                </div>
                <DialogFooter>
                  <Button variant="outline" onClick={() => setConfirmar(false)}>
                    Cancelar
                  </Button>
                  <Button variant="destructive" onClick={confirmarAnulacion} disabled={anular.isPending}>
                    {anular.isPending && <Loader2 className="size-4 animate-spin" />}
                    Anular recibo
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
          </>
        )}
      </QueryState>
    </>
  );
}
