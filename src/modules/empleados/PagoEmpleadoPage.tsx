import { useState } from "react";
import { ArrowLeft, Ban, Loader2, Printer } from "lucide-react";
import { Link, useParams } from "react-router";
import { toast } from "sonner";
import { ApiError } from "@/api/client";
import type { EmpresaApi } from "@/api/types";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { urlLogo } from "@/components/shared/EmpresaLogo";
import { PaperFit } from "@/components/shared/PaperFit";
import { QueryState } from "@/components/shared/QueryState";
import { StatusBadge } from "@/components/shared/StatusBadge";
import { brand } from "@/config/brand";
import { Si, useRole } from "@/context/AuthProvider";
import { formatCuit, formatDate, formatMoney } from "@/lib/format";
import { useAccionEmpleado, usePagoEmpleado } from "./api";
import { nombreMes } from "./EmpleadosPage";

type Pago = NonNullable<ReturnType<typeof usePagoEmpleado>["data"]>;
const numero = (n: number) => `P-${String(n).padStart(6, "0")}`;

/** Comprobante interno de pago, tal como se imprime (con copia para firmar) */
function Hoja({ p, empresa }: { p: Pago; empresa: EmpresaApi }) {
  const logo = urlLogo(empresa);
  return (
    <div className="hoja relative w-full bg-white text-[12px] leading-snug text-neutral-900 shadow-sm ring-1 ring-black/10">
      {p.estado === "Anulado" && (
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center" aria-hidden>
          <span className="-rotate-12 rounded-lg border-4 border-red-500/60 px-8 py-2 text-7xl font-black tracking-widest text-red-500/40">ANULADO</span>
        </div>
      )}
      <div className="flex items-start justify-between gap-6 border-b border-neutral-300 p-5">
        <div className="flex gap-4">
          {logo && <img src={logo} alt="" className="size-14 shrink-0 object-contain" />}
          <div>
            <div className="text-lg font-bold">{empresa.nombreFantasia ?? empresa.razonSocial}</div>
            <div className="text-neutral-600">CUIT {formatCuit(empresa.cuit)}</div>
          </div>
        </div>
        <div className="text-right">
          <div className="text-lg font-bold">COMPROBANTE DE PAGO</div>
          <div className="text-neutral-600">
            N° <span data-testid="pago-numero">{numero(p.numero)}</span> · {formatDate(p.fecha)}
          </div>
        </div>
      </div>
      <div className="grid grid-cols-2 gap-x-6 border-b border-neutral-300 px-5 py-3">
        <div>
          <b>Empleado:</b> {p.empleado.apellido}, {p.empleado.nombre}
        </div>
        <div>
          <b>CUIL:</b> {p.empleado.cuil ? formatCuit(p.empleado.cuil) : "—"}
        </div>
        <div>
          <b>Puesto:</b> {p.empleado.puesto ?? "—"}
        </div>
        <div>
          <b>Ingreso:</b> {formatDate(p.empleado.fechaIngreso)}
        </div>
        <div>
          <b>Concepto:</b> {p.tipo} de {nombreMes(p.periodo)}
        </div>
        <div>
          <b>Forma de pago:</b> {p.medio}
        </div>
      </div>
      <table className="w-full">
        <thead>
          <tr className="bg-neutral-100 text-left">
            <th className="px-5 py-1.5">Detalle</th>
            <th className="px-5 py-1.5 text-right">Importe</th>
          </tr>
        </thead>
        <tbody>
          {p.conceptos.map((c, i) => (
            <tr key={i} className="border-t border-neutral-200">
              <td className="px-5 py-1.5">{c.concepto}</td>
              <td className="tabular px-5 py-1.5 text-right whitespace-nowrap">{formatMoney(c.importe)}</td>
            </tr>
          ))}
          <tr className="border-t-2 border-neutral-400 text-[14px] font-bold">
            <td className="px-5 py-2">Total pagado</td>
            <td className="tabular px-5 py-2 text-right" data-testid="pago-total">
              {formatMoney(p.total)}
            </td>
          </tr>
        </tbody>
      </table>
      {p.nota && <div className="border-t border-neutral-300 px-5 py-2">Nota: {p.nota}</div>}
      {p.estado === "Anulado" && p.motivoAnulacion && <div className="border-t border-neutral-300 px-5 py-2 text-red-700">Anulado: {p.motivoAnulacion}</div>}
      <div className="flex justify-between gap-8 px-5 pt-16 pb-4">
        <div className="w-56 border-t border-neutral-400 pt-1 text-center text-[11px] text-neutral-600">Firma del empleado</div>
        <div className="w-56 border-t border-neutral-400 pt-1 text-center text-[11px] text-neutral-600">Firma del empleador</div>
      </div>
      <div className="border-t border-neutral-200 px-5 py-1.5 text-center text-[9px] text-neutral-500">
        Comprobante interno de pago. No reemplaza el recibo de haberes del art. 138 de la Ley de Contrato de Trabajo. · Generado con {brand.nombre}
      </div>
    </div>
  );
}

export function PagoEmpleadoPage() {
  const { id } = useParams();
  const { empresa } = useRole();
  const { data: p, isLoading, error, refetch } = usePagoEmpleado(id);
  const accion = useAccionEmpleado();
  const [confirmar, setConfirmar] = useState(false);
  const [motivo, setMotivo] = useState("");

  return (
    <>
      <Button variant="ghost" size="sm" asChild className="mb-3 -ml-2 text-muted-foreground">
        <Link to={p ? `/empleados/${p.empleado.id}` : "/empleados"}>
          <ArrowLeft className="size-4" /> {p ? `${p.empleado.nombre} ${p.empleado.apellido}` : "Empleados"}
        </Link>
      </Button>
      <QueryState isLoading={isLoading} error={error} onRetry={refetch}>
        {p && (
          <>
            <div className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <h1 className="flex flex-wrap items-center gap-3 text-2xl font-semibold tracking-tight">
                {p.tipo} {nombreMes(p.periodo)} <StatusBadge status={p.estado} />
              </h1>
              <div className="flex flex-wrap gap-2">
                <Si permiso="empleados.editar">
                  {p.estado === "Emitido" && (
                    <Button variant="outline" onClick={() => setConfirmar(true)}>
                      <Ban className="size-4" /> Anular
                    </Button>
                  )}
                </Si>
                <Button onClick={() => window.print()}>
                  <Printer className="size-4" /> Imprimir / PDF
                </Button>
              </div>
            </div>
            <div className="zona-impresion rounded-xl bg-muted p-3 sm:p-6">
              <PaperFit>
                <Hoja p={p} empresa={empresa} />
              </PaperFit>
            </div>
            <Dialog open={confirmar} onOpenChange={setConfirmar}>
              <DialogContent className="sm:max-w-md">
                <DialogHeader>
                  <DialogTitle>¿Anular este pago?</DialogTitle>
                  <DialogDescription>Queda registrado como anulado (no se borra). Si era el sueldo, después lo podés cargar de nuevo.</DialogDescription>
                </DialogHeader>
                <div className="grid gap-1.5">
                  <Label htmlFor="anular-pago-motivo">Motivo</Label>
                  <Input id="anular-pago-motivo" value={motivo} onChange={(e) => setMotivo(e.target.value)} placeholder="Ej.: faltaba el presentismo" autoFocus />
                </div>
                <DialogFooter>
                  <Button variant="outline" onClick={() => setConfirmar(false)}>
                    Cancelar
                  </Button>
                  <Button
                    variant="destructive"
                    disabled={accion.isPending}
                    onClick={async () => {
                      try {
                        await accion.mutateAsync({ url: `/empleados/pagos/${p.id}/anular`, body: { motivo } });
                        toast.success("Pago anulado");
                        setConfirmar(false);
                      } catch (e) {
                        toast.error(e instanceof ApiError ? e.message : "No se pudo anular");
                      }
                    }}
                  >
                    {accion.isPending && <Loader2 className="size-4 animate-spin" />}
                    Anular pago
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

