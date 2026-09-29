import { useEffect, useState } from "react";
import { FileText, Loader2, Trash2 } from "lucide-react";
import { Link } from "react-router";
import { toast } from "sonner";
import { useQueryClient } from "@tanstack/react-query";
import { ApiError } from "@/api/client";
import { manejarErrorGuardado } from "@/api/errores";
import { useClientes, useEliminarOportunidad, useGuardarOportunidad, useResponsables } from "@/api/hooks";
import type { EtapaOportunidad, OportunidadApi, OportunidadInput } from "@/api/types";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { StatusBadge } from "@/components/shared/StatusBadge";
import { useRole } from "@/context/AuthProvider";
import { aNumero } from "@/lib/numeros";
import { numeroPresupuesto } from "@/modules/presupuestos/PresupuestoHoja";

export const ETAPAS: EtapaOportunidad[] = ["Nuevo", "Contactado", "Propuesta", "Negociación", "Ganada", "Perdida"];
const PROSPECTO = "__prospecto";
const NADIE = "__nadie";

const montoTexto = (n: number) => (n ? n.toLocaleString("es-AR", { maximumFractionDigits: 2 }) : "");

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  oportunidad?: OportunidadApi | null;
  inicial?: Partial<OportunidadInput>;
}

export function OportunidadDialog({ open, onOpenChange, oportunidad, inicial }: Props) {
  const qc = useQueryClient();
  const { usuario } = useRole();
  const { data: clientes = [] } = useClientes(open);
  const { data: responsables = [] } = useResponsables(open);
  const guardar = useGuardarOportunidad();
  const eliminar = useEliminarOportunidad();

  const vacio = (): OportunidadInput => ({
    titulo: "",
    clienteId: null,
    prospecto: null,
    contacto: null,
    etapa: "Nuevo",
    monto: 0,
    responsableId: usuario.id,
    cierreEstimado: null,
    motivoPerdida: null,
    notas: null,
    ...inicial,
  });
  const [d, setD] = useState<OportunidadInput>(vacio);
  const [esProspecto, setEsProspecto] = useState(false);
  const [monto, setMonto] = useState("");
  const [errores, setErrores] = useState<Record<string, string>>({});
  const [confirmarBorrado, setConfirmarBorrado] = useState(false);

  useEffect(() => {
    if (!open) return;
    const base = oportunidad ? { ...oportunidad } : vacio();
    setD(base);
    setEsProspecto(!base.clienteId && !!base.prospecto);
    setMonto(montoTexto(base.monto));
    setErrores({});
    setConfirmarBorrado(false);
  }, [open, oportunidad]); // eslint-disable-line react-hooks/exhaustive-deps

  const set = <K extends keyof OportunidadInput>(k: K, v: OportunidadInput[K]) => setD((x) => ({ ...x, [k]: v }));

  const submit = async () => {
    setErrores({});
    const m = monto.trim() ? aNumero(monto) : 0;
    if (Number.isNaN(m)) return setErrores({ monto: "Monto inválido" });
    const datos: OportunidadInput = { ...d, monto: m, clienteId: esProspecto ? null : d.clienteId, prospecto: esProspecto ? d.prospecto : null, version: oportunidad?.version };
    try {
      await guardar.mutateAsync({ id: oportunidad?.id, datos });
      toast.success(oportunidad ? "Oportunidad actualizada" : "Oportunidad creada");
      onOpenChange(false);
    } catch (err) {
      if (manejarErrorGuardado(err, { setErrores, qc, recargar: ["oportunidades"] })) onOpenChange(false);
    }
  };

  const borrar = async () => {
    try {
      await eliminar.mutateAsync(oportunidad!.id);
      toast.success("Oportunidad eliminada");
      onOpenChange(false);
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "No se pudo eliminar");
    }
  };

  const activos = clientes.filter((c) => c.estado === "Activo" || c.id === d.clienteId);
  const responsableFuera = d.responsableId && !responsables.some((r) => r.id === d.responsableId);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[92svh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{oportunidad ? "Editar oportunidad" : "Nueva oportunidad"}</DialogTitle>
          <DialogDescription>Un negocio en curso: con un cliente o con alguien que todavía no lo es.</DialogDescription>
        </DialogHeader>

        <form
          className="grid gap-4 sm:grid-cols-2"
          onSubmit={(e) => {
            e.preventDefault();
            submit();
          }}
        >
          <div className="grid gap-1.5 sm:col-span-2">
            <Label htmlFor="op-titulo">Título</Label>
            <Input id="op-titulo" value={d.titulo} onChange={(e) => set("titulo", e.target.value)} placeholder="Ej.: Equipamiento para la sucursal nueva" aria-invalid={!!errores.titulo} autoFocus />
            {errores.titulo && <p className="text-xs text-destructive">{errores.titulo}</p>}
          </div>

          <div className="grid gap-1.5 sm:col-span-2">
            <Label htmlFor="op-cliente">Cliente</Label>
            <Select
              value={esProspecto ? PROSPECTO : (d.clienteId ?? "")}
              onValueChange={(v) => {
                setEsProspecto(v === PROSPECTO);
                if (v !== PROSPECTO) set("clienteId", v);
              }}
            >
              <SelectTrigger id="op-cliente" className="w-full" aria-invalid={!!errores.clienteId}>
                <SelectValue placeholder="Elegí un cliente" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={PROSPECTO}>Todavía no es cliente (prospecto)</SelectItem>
                {activos.map((c) => (
                  <SelectItem key={c.id} value={c.id}>
                    {c.razonSocial}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {errores.clienteId && <p className="text-xs text-destructive">{errores.clienteId}</p>}
          </div>

          {esProspecto && (
            <>
              <div className="grid gap-1.5">
                <Label htmlFor="op-prospecto">Nombre del prospecto</Label>
                <Input id="op-prospecto" value={d.prospecto ?? ""} onChange={(e) => set("prospecto", e.target.value || null)} placeholder="Empresa o persona" />
              </div>
              <div className="grid gap-1.5">
                <Label htmlFor="op-contacto">Contacto</Label>
                <Input id="op-contacto" value={d.contacto ?? ""} onChange={(e) => set("contacto", e.target.value || null)} placeholder="Nombre, teléfono o email" />
              </div>
            </>
          )}

          <div className="grid gap-1.5">
            <Label htmlFor="op-monto">Monto estimado</Label>
            <Input id="op-monto" inputMode="decimal" value={monto} onChange={(e) => setMonto(e.target.value)} placeholder="0" aria-invalid={!!errores.monto} />
            {errores.monto && <p className="text-xs text-destructive">{errores.monto}</p>}
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="op-cierre">Cierre estimado</Label>
            <Input id="op-cierre" type="date" value={d.cierreEstimado ?? ""} onChange={(e) => set("cierreEstimado", e.target.value || null)} />
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="op-etapa">Etapa</Label>
            <Select value={d.etapa} onValueChange={(v) => set("etapa", v as EtapaOportunidad)}>
              <SelectTrigger id="op-etapa" className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {ETAPAS.map((e) => (
                  <SelectItem key={e} value={e}>
                    {e}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="op-responsable">Responsable</Label>
            <Select value={d.responsableId ?? NADIE} onValueChange={(v) => set("responsableId", v === NADIE ? null : v)}>
              <SelectTrigger id="op-responsable" className="w-full" aria-invalid={!!errores.responsableId}>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={NADIE}>Sin asignar</SelectItem>
                {responsables.map((r) => (
                  <SelectItem key={r.id} value={r.id}>
                    {r.nombre}
                  </SelectItem>
                ))}
                {responsableFuera && oportunidad?.responsableNombre && <SelectItem value={d.responsableId!}>{oportunidad.responsableNombre}</SelectItem>}
              </SelectContent>
            </Select>
            {errores.responsableId && <p className="text-xs text-destructive">{errores.responsableId}</p>}
          </div>
          {d.etapa === "Perdida" && (
            <div className="grid gap-1.5 sm:col-span-2">
              <Label htmlFor="op-motivo">Motivo de la pérdida</Label>
              <Input id="op-motivo" value={d.motivoPerdida ?? ""} onChange={(e) => set("motivoPerdida", e.target.value || null)} placeholder="Ej.: precio, plazo de entrega, eligió otro proveedor" />
            </div>
          )}
          <div className="grid gap-1.5 sm:col-span-2">
            <Label htmlFor="op-notas">Notas</Label>
            <Textarea id="op-notas" rows={3} value={d.notas ?? ""} onChange={(e) => set("notas", e.target.value || null)} />
          </div>

          {oportunidad && (
            <div className="rounded-lg border bg-muted/30 p-3 text-sm sm:col-span-2" data-testid="oportunidad-presupuesto">
              {oportunidad.presupuesto ? (
                <div className="flex items-center justify-between gap-2">
                  <Link to={`/presupuestos/${oportunidad.presupuesto.id}`} className="flex items-center gap-2 font-medium text-primary hover:underline">
                    <FileText className="size-4" /> Presupuesto {numeroPresupuesto(oportunidad.presupuesto.numero)}
                  </Link>
                  <StatusBadge status={oportunidad.presupuesto.estado} />
                </div>
              ) : oportunidad.clienteId ? (
                <div className="flex items-center justify-between gap-2">
                  <span className="text-muted-foreground">Todavía no tiene presupuesto.</span>
                  <Button size="sm" variant="outline" asChild>
                    <Link to={`/presupuestos/nuevo?cliente=${oportunidad.clienteId}&oportunidad=${oportunidad.id}`}>
                      <FileText className="size-4" /> Hacer presupuesto
                    </Link>
                  </Button>
                </div>
              ) : (
                <span className="text-muted-foreground">
                  Para presupuestarle, primero{" "}
                  <Link to="/clientes?nuevo=1" className="text-primary hover:underline">
                    cargalo como cliente
                  </Link>{" "}
                  y elegilo acá.
                </span>
              )}
            </div>
          )}

          <DialogFooter className="gap-2 sm:col-span-2 sm:justify-between">
            {oportunidad ? (
              confirmarBorrado ? (
                <div className="flex items-center gap-2">
                  <span className="text-sm">¿Eliminar?</span>
                  <Button type="button" size="sm" variant="destructive" onClick={borrar} disabled={eliminar.isPending}>
                    Sí, eliminar
                  </Button>
                  <Button type="button" size="sm" variant="ghost" onClick={() => setConfirmarBorrado(false)}>
                    No
                  </Button>
                </div>
              ) : (
                <Button type="button" variant="ghost" className="text-destructive hover:text-destructive" onClick={() => setConfirmarBorrado(true)}>
                  <Trash2 className="size-4" /> Eliminar
                </Button>
              )
            ) : (
              <span />
            )}
            <div className="flex gap-2">
              <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
                Cerrar
              </Button>
              <Button type="submit" disabled={guardar.isPending}>
                {guardar.isPending && <Loader2 className="size-4 animate-spin" />}
                Guardar
              </Button>
            </div>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
