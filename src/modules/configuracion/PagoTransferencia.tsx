import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Banknote, Copy, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { api, ApiError } from "@/api/client";
import type { PlanesApi, SuscripcionApi } from "@/api/types";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { formatDate, formatMoney } from "@/lib/format";
import { cn } from "@/lib/utils";

interface TransferenciaApi {
  datos: { titular: string; cuit: string | null; banco: string | null; cbu: string | null; alias: string | null } | null;
  pendiente: { referencia: string; importeArs: number; periodo: string; createdAt: string } | null;
}

/** Pagar la suscripción por transferencia: ve los datos y el importe, transfiere y avisa. La plataforma lo confirma. */
export function PagoTransferencia({ s, catalogo }: { s: SuscripcionApi; catalogo: PlanesApi | undefined }) {
  const qc = useQueryClient();
  const { data } = useQuery({ queryKey: ["suscripcion", "transferencia"], queryFn: () => api<TransferenciaApi>("/suscripcion/transferencia") });
  const [abierto, setAbierto] = useState(false);
  const [periodo, setPeriodo] = useState<"mensual" | "anual">("mensual");
  const [comprobante, setComprobante] = useState("");
  const [enviando, setEnviando] = useState(false);
  if (!data?.datos && !data?.pendiente) return null;

  if (data.pendiente)
    return (
      <div className="basis-full rounded-lg border border-warning/40 bg-warning/10 p-3 text-sm" data-testid="transferencia-avisada">
        Avisaste una transferencia de <b>{formatMoney(data.pendiente.importeArs)}</b> ({data.pendiente.periodo === "anual" ? "12 meses" : "1 mes"}) el {formatDate(data.pendiente.createdAt.slice(0, 10))}. Apenas la confirmemos se extiende tu plan; te avisamos por email.
      </div>
    );
  const d = data.datos!;
  const plan = s.planProximo ?? s.plan;
  const adicionales = s.adicionalesProximos ?? s.usuariosAdicionales ?? 0;
  const mensualUsd = (catalogo?.planes.find((p) => p.id === plan)?.precioUsd ?? 0) + adicionales * (catalogo?.precioUsuarioAdicionalUsd ?? 0);
  const usdTotal = periodo === "anual" ? mensualUsd * (catalogo?.mesesCobradosAnual ?? 10) : mensualUsd;
  const ars = catalogo?.dolar ? Math.round(usdTotal * catalogo.dolar * 100) / 100 : null;

  const copiar = async (t: string) => {
    try {
      await navigator.clipboard.writeText(t);
      toast.success("Copiado");
    } catch {
      toast.error("No se pudo copiar");
    }
  };
  const avisar = async () => {
    setEnviando(true);
    try {
      await api("/suscripcion/transferencia", { method: "POST", body: { periodo, comprobante: comprobante || null } });
      await qc.invalidateQueries({ queryKey: ["suscripcion"] });
      toast.success("¡Gracias! Avisamos tu transferencia", { description: "Apenas la confirmemos se extiende tu plan." });
      setAbierto(false);
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : "No se pudo avisar");
    } finally {
      setEnviando(false);
    }
  };
  const fila = (label: string, valor: string | null, copiable = false) =>
    valor && (
      <div className="flex items-center justify-between gap-2 py-1.5">
        <span className="text-muted-foreground">{label}</span>
        <span className="flex items-center gap-1 font-medium">
          <span className="break-all">{valor}</span>
          {copiable && (
            <Button size="icon-sm" variant="ghost" onClick={() => copiar(valor)} aria-label={`Copiar ${label}`}>
              <Copy className="size-3.5" />
            </Button>
          )}
        </span>
      </div>
    );

  return (
    <>
      <Button variant="outline" onClick={() => setAbierto(true)}>
        <Banknote className="size-4" /> Pagar por transferencia
      </Button>
      <Dialog open={abierto} onOpenChange={setAbierto}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Pagar por transferencia</DialogTitle>
            <DialogDescription>Transferí el importe a esta cuenta y avisanos. Apenas lo confirmemos se extiende tu plan.</DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 text-sm">
            <div className="flex w-fit rounded-lg bg-muted p-0.5">
              {(["mensual", "anual"] as const).map((p) => (
                <button key={p} type="button" onClick={() => setPeriodo(p)} aria-pressed={periodo === p} className={cn("rounded-md px-3 py-1.5", periodo === p ? "bg-background font-medium shadow-sm" : "text-muted-foreground")}>
                  {p === "mensual" ? "1 mes" : `12 meses (${12 - (catalogo?.mesesCobradosAnual ?? 10)} gratis)`}
                </button>
              ))}
            </div>
            <div className="rounded-lg bg-primary/5 p-3" data-testid="importe-transferencia">
              <div className="text-muted-foreground">Importe a transferir</div>
              <div className="text-2xl font-semibold tabular-nums">{ars !== null ? formatMoney(ars) : `USD ${usdTotal}`}</div>
              {ars !== null && <div className="text-xs text-muted-foreground">USD {usdTotal.toLocaleString("es-AR")} al dólar oficial de hoy ({formatMoney(catalogo!.dolar!)})</div>}
            </div>
            <div className="divide-y rounded-lg border px-3" data-testid="datos-cuenta">
              {fila("Titular", d.titular)}
              {fila("CUIT", d.cuit)}
              {fila("Banco", d.banco)}
              {fila("CBU / CVU", d.cbu, true)}
              {fila("Alias", d.alias, true)}
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="tr-comprobante">N° de operación o comprobante (opcional)</Label>
              <Input id="tr-comprobante" value={comprobante} onChange={(e) => setComprobante(e.target.value)} placeholder="Nos ayuda a encontrarla más rápido" maxLength={200} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAbierto(false)}>
              Cancelar
            </Button>
            <Button onClick={avisar} disabled={enviando}>
              {enviando && <Loader2 className="size-4 animate-spin" />} Ya transferí
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
