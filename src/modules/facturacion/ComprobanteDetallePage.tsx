import { useState } from "react";
import { AlertCircle, ArrowLeft, FileMinus, Printer, Send, Wallet } from "lucide-react";
import { Link, useParams } from "react-router";
import { useComprobante } from "@/api/hooks";
import { Button } from "@/components/ui/button";
import { PaperFit } from "@/components/shared/PaperFit";
import { QueryState } from "@/components/shared/QueryState";
import { StatusBadge } from "@/components/shared/StatusBadge";
import { useRole, Si } from "@/context/AuthProvider";
import { formatDate, formatMoney } from "@/lib/format";
import { numeroComprobante } from "@/lib/facturacion";
import { CompartirDialog } from "@/modules/documentos/CompartirDialog";
import { ComprobanteHoja } from "./ComprobanteHoja";

export function ComprobanteDetallePage() {
  const { id } = useParams();
  const { empresa } = useRole();
  const { data: c, isLoading, error, refetch } = useComprobante(id);
  const [compartir, setCompartir] = useState(false);

  return (
    <>
      <Button variant="ghost" size="sm" asChild className="mb-3 -ml-2 text-muted-foreground">
        <Link to="/facturacion">
          <ArrowLeft className="size-4" /> Facturación
        </Link>
      </Button>
      <QueryState isLoading={isLoading} error={error} onRetry={refetch}>
        {c && (
          <>
            <div className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <h1 className="flex flex-wrap items-center gap-3 text-2xl font-semibold tracking-tight">
                  {c.tipo} {numeroComprobante(c.puntoVenta, c.numero)} <StatusBadge status={c.estado} />
                </h1>
                <Link to={`/clientes/${c.clienteId}`} className="text-sm text-muted-foreground hover:underline">
                  {c.receptor.razonSocial}
                </Link>
              </div>
              <div className="flex flex-wrap gap-2">
                {c.saldo !== null && c.saldo > 0 && (
                  <Si permiso="cobranzas.cobrar">
                    <Button asChild>
                      <Link to={`/cobranzas/nuevo?cliente=${c.clienteId}&factura=${c.id}`}>
                        <Wallet className="size-4" /> Registrar cobro
                      </Link>
                    </Button>
                  </Si>
                )}
                {c.clase === "factura" && c.estado === "Autorizado" && (
                  <Si permiso="facturacion.emitir">
                    <Button variant="outline" asChild>
                      <Link to={`/facturacion/nueva?nc=${c.id}`}>
                        <FileMinus className="size-4" /> Nota de crédito
                      </Link>
                    </Button>
                  </Si>
                )}
                {c.estado === "Autorizado" && (
                  <Button variant="outline" onClick={() => setCompartir(true)}>
                    <Send className="size-4" /> Enviar
                  </Button>
                )}
                <Button onClick={() => window.print()}>
                  <Printer className="size-4" /> Imprimir / PDF
                </Button>
              </div>
            </div>

            {c.estadoCobro && (
              <div className="mb-5 flex flex-wrap items-center gap-x-6 gap-y-2 rounded-lg border bg-card px-4 py-3 text-sm" data-testid="estado-cobro">
                <span className="flex items-center gap-2">
                  Cobro: <StatusBadge status={c.estadoCobro} />
                </span>
                <span className="tabular">
                  Total <b>{formatMoney(c.total)}</b>
                </span>
                {c.cobrado > 0 && <span className="tabular">Cobrado {formatMoney(c.cobrado)}</span>}
                {c.notasCredito > 0 && <span className="tabular">Notas de crédito {formatMoney(c.notasCredito)}</span>}
                <span className="tabular">
                  Saldo <b className={c.saldo ? "text-destructive" : "text-success"}>{formatMoney(c.saldo ?? 0)}</b>
                </span>
                {c.saldo !== null && c.saldo > 0 && <span className="text-muted-foreground">Vence {formatDate(c.vencimiento)}</span>}
              </div>
            )}

            {c.estado === "Rechazado" && (
              <div className="mb-5 rounded-lg border border-destructive/30 bg-destructive/10 p-4 text-sm" role="alert">
                <div className="flex items-center gap-2 font-semibold text-destructive">
                  <AlertCircle className="size-4" /> ARCA rechazó el comprobante
                </div>
                <ul className="mt-1 list-disc pl-6">
                  {c.errores.map((e) => (
                    <li key={e.codigo}>
                      {e.mensaje} <span className="text-muted-foreground">(código {e.codigo})</span>
                    </li>
                  ))}
                </ul>
                <p className="mt-2 text-muted-foreground">No se asignó número ni se movió stock. Corregí los datos y emití uno nuevo.</p>
              </div>
            )}

            <div className="zona-impresion rounded-xl bg-muted p-3 sm:p-6">
              <PaperFit>
                <ComprobanteHoja
                  empresa={empresa}
                  c={{ ...c, asociado: c.asociado ? `${c.asociado.tipo} ${numeroComprobante(c.asociado.puntoVenta, c.asociado.numero)}` : null }}
                />
              </PaperFit>
            </div>
            {c.estado === "Autorizado" && <CompartirDialog open={compartir} onOpenChange={setCompartir} tipo="comprobante" id={c.id} />}
          </>
        )}
      </QueryState>
    </>
  );
}
