import { useEffect, useState } from "react";
import { Loader2, Plus, X } from "lucide-react";
import { toast } from "sonner";
import { ApiError } from "@/api/client";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { formatMoney } from "@/lib/format";
import { aNumero } from "@/lib/numeros";
import { MEDIOS, TIPOS_PAGO, useAccionEmpleado, useLiquidacion, type EmpleadoApi, type PagoEmpleadoApi } from "./api";
import { nombreMes } from "./EmpleadosPage";

type Tipo = (typeof TIPOS_PAGO)[number];
type Renglon = { concepto: string; importe: string };

const mesActual = () => new Date(Date.now() - 3 * 3600_000).toISOString().slice(0, 7);

/** Renglones con los que arranca cada tipo de pago */
function renglonesIniciales(tipo: Tipo, e: EmpleadoApi): Renglon[] {
  const basico = String(e.sueldo).replace(".", ",");
  switch (tipo) {
    case "Sueldo":
      return e.modalidad === "Por hora" ? [{ concepto: "Horas trabajadas", importe: "" }] : [{ concepto: "Sueldo básico", importe: basico }];
    case "Adelanto":
      return [{ concepto: "Adelanto de sueldo", importe: "" }];
    case "Aguinaldo":
      // Sugerencia: la mitad del mejor sueldo del semestre (acá, del básico)
      return [{ concepto: "Aguinaldo (SAC)", importe: e.modalidad === "Mensual" ? String(Math.round((e.sueldo / 2) * 100) / 100).replace(".", ",") : "" }];
    case "Vacaciones":
      return [{ concepto: "Vacaciones", importe: "" }];
    case "Bono":
      return [{ concepto: "Bono", importe: "" }];
    default:
      return [{ concepto: "", importe: "" }];
  }
}

export function PagoDialog({ empleado, tipo, open, onOpenChange, onPagado }: { empleado: EmpleadoApi; tipo: Tipo; open: boolean; onOpenChange: (o: boolean) => void; onPagado: (p: PagoEmpleadoApi) => void }) {
  const accion = useAccionEmpleado();
  const [periodo, setPeriodo] = useState(mesActual());
  const [renglones, setRenglones] = useState<Renglon[]>([]);
  const [medio, setMedio] = useState<string>("Transferencia");
  const [nota, setNota] = useState("");
  const [error, setError] = useState<string | null>(null);
  const { data: liq } = useLiquidacion(empleado.id, periodo, open && (tipo === "Sueldo" || tipo === "Adelanto"));

  useEffect(() => {
    if (!open) return;
    setPeriodo(mesActual());
    setRenglones(renglonesIniciales(tipo, empleado));
    setMedio(tipo === "Adelanto" ? "Efectivo" : "Transferencia");
    setNota("");
    setError(null);
  }, [open, tipo, empleado]);

  const conDescuento = tipo === "Sueldo";
  const importes = renglones.map((r) => aNumero(r.importe));
  const adelantos = conDescuento ? (liq?.totalAdelantos ?? 0) : 0;
  const total = Math.round((importes.reduce((a, n) => a + (Number.isNaN(n) ? 0 : n), 0) - adelantos) * 100) / 100;

  const cambiar = (i: number, campo: keyof Renglon, v: string) => setRenglones(renglones.map((r, j) => (j === i ? { ...r, [campo]: v } : r)));

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[92svh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>
            {tipo === "Sueldo" ? "Pagar sueldo" : tipo === "Adelanto" ? "Registrar adelanto" : `Registrar pago: ${tipo.toLowerCase()}`} · {empleado.nombre} {empleado.apellido}
          </DialogTitle>
          <DialogDescription>
            {tipo === "Sueldo"
              ? "Sumá horas extra, presentismo o bonos, y restá faltantes u otros descuentos (con signo menos). Los adelantos del mes se descuentan solos."
              : tipo === "Adelanto"
                ? "Se va a descontar automáticamente cuando pagues el sueldo de ese mes."
                : "Queda registrado con su comprobante."}
          </DialogDescription>
        </DialogHeader>
        <form
          className="grid gap-4"
          noValidate
          onSubmit={async (e) => {
            e.preventDefault();
            setError(null);
            const conceptos = renglones
              .map((r, i) => ({ concepto: r.concepto.trim(), importe: importes[i]! }))
              .filter((c) => c.concepto || !Number.isNaN(c.importe));
            if (conceptos.some((c) => Number.isNaN(c.importe) || !c.concepto)) return setError("Completá el concepto y el importe de cada renglón (solo números).");
            try {
              const p = (await accion.mutateAsync({ url: `/empleados/${empleado.id}/pagos`, body: { tipo, periodo, conceptos, medio, nota: nota || undefined } })) as PagoEmpleadoApi;
              toast.success(`${tipo} registrado: ${formatMoney(p.total)}`, { description: `Comprobante N° ${p.numero}` });
              onOpenChange(false);
              onPagado(p);
            } catch (err) {
              setError(err instanceof ApiError ? err.message : "No se pudo registrar");
            }
          }}
        >
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="grid gap-1.5">
              <Label htmlFor="pago-periodo">Mes</Label>
              <Input id="pago-periodo" type="month" value={periodo} onChange={(e) => setPeriodo(e.target.value)} />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="pago-medio">Cómo se paga</Label>
              <Select value={medio} onValueChange={setMedio}>
                <SelectTrigger id="pago-medio" className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {MEDIOS.map((m) => (
                    <SelectItem key={m} value={m}>
                      {m}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          {tipo === "Sueldo" && liq?.sueldoYaPagado && (
            <div className="rounded-lg border border-warning/40 bg-warning/10 px-3 py-2 text-sm text-warning-ink">
              El sueldo de {nombreMes(periodo)} ya se pagó (comprobante N° {liq.sueldoYaPagado.numero}).
            </div>
          )}
          {tipo === "Adelanto" && liq?.sueldoYaPagado && (
            <div className="rounded-lg border border-warning/40 bg-warning/10 px-3 py-2 text-sm text-warning-ink">
              El sueldo de {nombreMes(periodo)} ya se pagó: elegí el mes siguiente.
            </div>
          )}

          <div className="grid gap-2" data-testid="conceptos-pago">
            <div className="text-sm font-medium">Conceptos</div>
            {renglones.map((r, i) => (
              <div key={i} className="flex gap-2">
                <Input value={r.concepto} onChange={(e) => cambiar(i, "concepto", e.target.value)} placeholder="Ej.: Horas extra" aria-label={`Concepto ${i + 1}`} />
                <Input className="w-36 text-right" inputMode="decimal" value={r.importe} onChange={(e) => cambiar(i, "importe", e.target.value)} placeholder="$ 0" aria-label={`Importe ${i + 1}`} />
                {renglones.length > 1 && (
                  <Button type="button" variant="ghost" size="icon" onClick={() => setRenglones(renglones.filter((_, j) => j !== i))} aria-label={`Quitar renglón ${i + 1}`}>
                    <X className="size-4" />
                  </Button>
                )}
              </div>
            ))}
            {tipo !== "Adelanto" && (
              <Button type="button" variant="ghost" size="sm" className="justify-self-start" onClick={() => setRenglones([...renglones, { concepto: "", importe: "" }])}>
                <Plus className="size-4" /> Agregar concepto
              </Button>
            )}
            {conDescuento && adelantos > 0 && (
              <div className="flex justify-between rounded-md bg-muted px-3 py-2 text-sm" data-testid="descuento-adelantos">
                <span>Adelantos de {nombreMes(periodo)} (se descuentan)</span>
                <span className="tabular">− {formatMoney(adelantos)}</span>
              </div>
            )}
            <div className="flex justify-between border-t pt-2 text-base font-semibold">
              <span>Total a pagar</span>
              <span className="tabular" data-testid="total-pago">
                {formatMoney(total)}
              </span>
            </div>
          </div>

          <div className="grid gap-1.5">
            <Label htmlFor="pago-nota">Nota (opcional)</Label>
            <Input id="pago-nota" value={nota} onChange={(e) => setNota(e.target.value)} placeholder="Ej.: transferencia Banco Nación" />
          </div>
          {error && (
            <div role="alert" className="rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
              {error}
            </div>
          )}
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancelar
            </Button>
            <Button type="submit" disabled={accion.isPending || total <= 0}>
              {accion.isPending && <Loader2 className="size-4 animate-spin" />}
              Registrar {formatMoney(total)}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
