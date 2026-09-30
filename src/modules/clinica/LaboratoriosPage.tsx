import { useState } from "react";
import { ArrowLeft, Check, FlaskConical, Plus, Wallet, X } from "lucide-react";
import { Link, useNavigate, useParams } from "react-router";
import { toast } from "sonner";
import { ApiError } from "@/api/client";
import { KpiCard } from "@/components/shared/KpiCard";
import { PageHeader } from "@/components/shared/PageHeader";
import { QueryState } from "@/components/shared/QueryState";
import { StatusBadge } from "@/components/shared/StatusBadge";
import { Button } from "@/components/ui/button";
import { Card, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useRole } from "@/context/AuthProvider";
import { formatDate, formatMoney } from "@/lib/format";
import { aNumero } from "@/lib/numeros";
import { cn } from "@/lib/utils";
import { MEDIOS_DENTAL, type MedioDental } from "@/modules/consultorio/api";
import { PacienteSelector } from "@/modules/pacientes/PacienteSelector";
import { useAccionLaboratorio, useLaboratorio, useLaboratorios, type TrabajoApi } from "./api";

const hoy = () => {
  const d = new Date();
  return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
};

function useHacer() {
  const accion = useAccionLaboratorio();
  const hacer = async (url: string, body: object, exito: string, metodo: "POST" | "PUT" = "POST") => {
    try {
      const r = await accion.mutateAsync({ url, body, metodo });
      toast.success(exito);
      return r ?? true;
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : "No se pudo", { duration: 8000 });
      return null;
    }
  };
  return { hacer, pendiente: accion.isPending };
}

function NuevoLaboratorio({ open, onOpenChange }: { open: boolean; onOpenChange: (o: boolean) => void }) {
  const { hacer, pendiente } = useHacer();
  const navigate = useNavigate();
  const [d, setD] = useState({ nombre: "", telefono: "", email: "" });
  const guardar = async () => {
    const r = await hacer("", d, "Laboratorio agregado");
    if (r && typeof r === "object") {
      onOpenChange(false);
      setD({ nombre: "", telefono: "", email: "" });
      navigate(`/laboratorios/${r.id}`);
    }
  };
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Nuevo laboratorio</DialogTitle>
          <DialogDescription>El laboratorio al que le encargás trabajos (coronas, prótesis, placas…).</DialogDescription>
        </DialogHeader>
        <div className="grid gap-3">
          <div className="grid gap-1.5">
            <Label htmlFor="lab-nombre">Nombre</Label>
            <Input id="lab-nombre" value={d.nombre} onChange={(e) => setD({ ...d, nombre: e.target.value })} autoFocus />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="grid gap-1.5">
              <Label htmlFor="lab-tel">Teléfono</Label>
              <Input id="lab-tel" value={d.telefono} onChange={(e) => setD({ ...d, telefono: e.target.value })} />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="lab-email">Email</Label>
              <Input id="lab-email" type="email" value={d.email} onChange={(e) => setD({ ...d, email: e.target.value })} />
            </div>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          <Button onClick={guardar} disabled={pendiente || d.nombre.trim().length < 2}>
            Guardar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function LaboratoriosPage() {
  const navigate = useNavigate();
  const { puede } = useRole();
  const { data, isLoading, error, refetch } = useLaboratorios();
  const [nuevo, setNuevo] = useState(false);
  const deuda = (data ?? []).reduce((a, l) => a + Math.max(0, l.saldo), 0);
  const pendientes = (data ?? []).reduce((a, l) => a + l.pendientes, 0);
  return (
    <>
      <PageHeader
        title="Laboratorios"
        description="Los trabajos encargados, cuándo vuelven y cuánto se le debe a cada laboratorio."
        actions={
          puede("laboratorios.editar") && (
            <Button onClick={() => setNuevo(true)}>
              <Plus className="size-4" /> Nuevo laboratorio
            </Button>
          )
        }
      />
      <QueryState isLoading={isLoading} error={error} onRetry={refetch}>
        {data && data.length === 0 ? (
          <Card className="items-center gap-3 py-16 text-center shadow-none">
            <div className="flex size-12 items-center justify-center rounded-full bg-primary/10 text-primary">
              <FlaskConical className="size-6" />
            </div>
            <div className="text-lg font-semibold">Todavía no cargaste laboratorios</div>
            <p className="max-w-sm text-sm text-muted-foreground">Cargá los laboratorios con los que trabajás para seguir cada trabajo y lo que se les debe.</p>
          </Card>
        ) : (
          <div className="grid gap-6">
            <div className="grid gap-4 sm:grid-cols-2">
              <KpiCard label="Se les debe a los laboratorios" value={formatMoney(deuda)} icon={Wallet} tone={deuda ? "warning" : "default"} />
              <KpiCard label="Trabajos por recibir" value={String(pendientes)} icon={FlaskConical} />
            </div>
            <Card className="overflow-hidden p-0 shadow-none">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Laboratorio</TableHead>
                    <TableHead className="hidden sm:table-cell">Por recibir</TableHead>
                    <TableHead className="text-right">Saldo</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {data?.map((l) => (
                    <TableRow key={l.id} className={cn("cursor-pointer", !l.activo && "opacity-50")} onClick={() => navigate(`/laboratorios/${l.id}`)} data-testid="laboratorio">
                      <TableCell>
                        <div className="font-medium">{l.nombre}</div>
                        <div className="text-xs text-muted-foreground">{l.telefono ?? ""}</div>
                      </TableCell>
                      <TableCell className="hidden sm:table-cell">{l.pendientes || "—"}</TableCell>
                      <TableCell className={cn("text-right font-semibold tabular", l.saldo > 0 && "text-destructive")}>{formatMoney(l.saldo)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </Card>
          </div>
        )}
      </QueryState>
      <NuevoLaboratorio open={nuevo} onOpenChange={setNuevo} />
    </>
  );
}

function TrabajoDialog({ labId, open, onOpenChange }: { labId: string; open: boolean; onOpenChange: (o: boolean) => void }) {
  const { hacer, pendiente } = useHacer();
  const vacio = { descripcion: "", pacienteId: null as string | null, pieza: "", importe: "", fechaPrevista: "" };
  const [d, setD] = useState(vacio);
  const guardar = async () => {
    const ok = await hacer(`/${labId}/trabajos`, { descripcion: d.descripcion, pacienteId: d.pacienteId, pieza: d.pieza ? Number(d.pieza) : null, importe: aNumero(d.importe || "0"), fechaPrevista: d.fechaPrevista || null }, "Trabajo encargado");
    if (ok) {
      onOpenChange(false);
      setD(vacio);
    }
  };
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Encargar un trabajo</DialogTitle>
          <DialogDescription>Queda lo que se le debe al laboratorio y la fecha en que tiene que volver.</DialogDescription>
        </DialogHeader>
        <div className="grid gap-3">
          <div className="grid gap-1.5">
            <Label htmlFor="trab-desc">Trabajo</Label>
            <Input id="trab-desc" value={d.descripcion} onChange={(e) => setD({ ...d, descripcion: e.target.value })} placeholder="Ej.: corona de porcelana" autoFocus />
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="ev-paciente">Paciente (opcional)</Label>
            <PacienteSelector value={d.pacienteId} onChange={(id) => setD({ ...d, pacienteId: id })} />
          </div>
          <div className="grid grid-cols-3 gap-3">
            <div className="grid gap-1.5">
              <Label htmlFor="trab-pieza">Pieza</Label>
              <Input id="trab-pieza" inputMode="numeric" value={d.pieza} onChange={(e) => setD({ ...d, pieza: e.target.value.replace(/\D/g, "").slice(0, 2) })} />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="trab-importe">Importe</Label>
              <Input id="trab-importe" inputMode="decimal" value={d.importe} onChange={(e) => setD({ ...d, importe: e.target.value })} />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="trab-fecha">Vuelve el</Label>
              <Input id="trab-fecha" type="date" min={hoy()} value={d.fechaPrevista} onChange={(e) => setD({ ...d, fechaPrevista: e.target.value })} />
            </div>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          <Button onClick={guardar} disabled={pendiente || d.descripcion.trim().length < 2}>
            Encargar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function PagoLabDialog({ labId, saldo, open, onOpenChange }: { labId: string; saldo: number; open: boolean; onOpenChange: (o: boolean) => void }) {
  const { hacer, pendiente } = useHacer();
  const [d, setD] = useState({ importe: "", medio: "Transferencia" as MedioDental, comprobante: "" });
  const guardar = async () => {
    const ok = await hacer(`/${labId}/pagos`, { importe: aNumero(d.importe), medio: d.medio, comprobante: d.comprobante || null }, "Pago registrado (queda en Gastos)");
    if (ok) {
      onOpenChange(false);
      setD({ importe: "", medio: "Transferencia", comprobante: "" });
    }
  };
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Pagarle al laboratorio</DialogTitle>
          <DialogDescription>{saldo > 0 ? `Se le debe ${formatMoney(saldo)}.` : "No se le debe nada."} El pago queda en Gastos y, si es en efectivo, sale de la caja.</DialogDescription>
        </DialogHeader>
        <div className="grid gap-3">
          <div className="grid grid-cols-2 gap-3">
            <div className="grid gap-1.5">
              <Label htmlFor="plab-importe">Importe</Label>
              <Input id="plab-importe" inputMode="decimal" value={d.importe} onChange={(e) => setD({ ...d, importe: e.target.value })} autoFocus />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="plab-medio">Medio</Label>
              <Select value={d.medio} onValueChange={(v) => setD({ ...d, medio: v as MedioDental })}>
                <SelectTrigger id="plab-medio" className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {MEDIOS_DENTAL.map((m) => (
                    <SelectItem key={m} value={m}>
                      {m}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="plab-comp">N° de recibo o factura del laboratorio</Label>
            <Input id="plab-comp" value={d.comprobante} onChange={(e) => setD({ ...d, comprobante: e.target.value })} />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          <Button onClick={guardar} disabled={pendiente || !d.importe}>
            Registrar pago
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function LaboratorioPage() {
  const { id } = useParams();
  const { puede } = useRole();
  const { data: l, isLoading, error, refetch } = useLaboratorio(id);
  const { hacer } = useHacer();
  const [trabajo, setTrabajo] = useState(false);
  const [pago, setPago] = useState(false);

  const cancelar = async (t: TrabajoApi) => {
    const motivo = window.prompt(`¿Por qué se cancela "${t.descripcion}"?`);
    if (motivo && motivo.trim().length >= 3) await hacer(`/trabajos/${t.id}/cancelar`, { motivo }, "Trabajo cancelado");
  };

  return (
    <>
      <Button variant="ghost" size="sm" asChild className="mb-3 -ml-2 text-muted-foreground">
        <Link to="/laboratorios">
          <ArrowLeft className="size-4" /> Laboratorios
        </Link>
      </Button>
      <QueryState isLoading={isLoading} error={error} onRetry={refetch}>
        {l && (
          <div className="grid gap-6">
            <PageHeader
              title={l.nombre}
              description={[l.telefono, l.email].filter(Boolean).join(" · ") || undefined}
              actions={
                puede("laboratorios.editar") && (
                  <>
                    {puede("cobranzas.cobrar") && (
                      <Button variant="outline" onClick={() => setPago(true)}>
                        <Wallet className="size-4" /> Pagar
                      </Button>
                    )}
                    <Button onClick={() => setTrabajo(true)}>
                      <Plus className="size-4" /> Encargar trabajo
                    </Button>
                  </>
                )
              }
            />
            <div className="grid gap-4 sm:grid-cols-3" data-testid="saldo-laboratorio">
              <KpiCard label="Trabajos" value={formatMoney(l.totalTrabajos)} icon={FlaskConical} />
              <KpiCard label="Pagado" value={formatMoney(l.pagado)} icon={Wallet} tone="success" />
              <KpiCard label="Se le debe" value={formatMoney(l.saldo)} icon={Wallet} tone={l.saldo > 0 ? "warning" : "default"} />
            </div>
            <Card className="gap-0 overflow-hidden pb-0 shadow-none">
              <CardHeader className="pb-3">
                <CardTitle>Trabajos</CardTitle>
              </CardHeader>
              {l.trabajos.length === 0 ? (
                <div className="border-t py-10 text-center text-sm text-muted-foreground">Todavía no hay trabajos.</div>
              ) : (
                <div className="overflow-x-auto border-t">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Trabajo</TableHead>
                        <TableHead className="hidden md:table-cell">Envío</TableHead>
                        <TableHead>Estado</TableHead>
                        <TableHead className="text-right">Importe</TableHead>
                        <TableHead />
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {l.trabajos.map((t) => {
                        const atrasado = t.estado === "Enviado" && t.fechaPrevista && t.fechaPrevista < hoy();
                        return (
                          <TableRow key={t.id} className={cn(t.estado === "Cancelado" && "opacity-50")} data-testid="trabajo">
                            <TableCell>
                              <div className="font-medium">
                                {t.descripcion}
                                {t.pieza && <span className="text-muted-foreground"> · pieza {t.pieza}</span>}
                              </div>
                              <div className="text-xs text-muted-foreground">
                                {t.pacienteId ? (
                                  <Link to={`/pacientes/${t.pacienteId}`} className="hover:underline" onClick={(e) => e.stopPropagation()}>
                                    {t.paciente}
                                  </Link>
                                ) : (
                                  "Sin paciente"
                                )}{" "}
                                · {t.profesional}
                              </div>
                            </TableCell>
                            <TableCell className="hidden whitespace-nowrap md:table-cell">
                              {formatDate(t.fechaEnvio)}
                              {t.fechaPrevista && <div className={cn("text-xs", atrasado ? "font-semibold text-destructive" : "text-muted-foreground")}>vuelve {formatDate(t.fechaPrevista)}</div>}
                            </TableCell>
                            <TableCell>
                              <StatusBadge status={atrasado ? "Vencido" : t.estado === "Enviado" ? "Pendiente" : t.estado === "Recibido" ? "Realizado" : "Cancelado"} />
                              <div className="text-xs text-muted-foreground">{atrasado ? "Atrasado" : t.estado === "Recibido" && t.fechaRecibido ? `Recibido ${formatDate(t.fechaRecibido)}` : t.estado}</div>
                            </TableCell>
                            <TableCell className="text-right tabular">{formatMoney(t.importe)}</TableCell>
                            <TableCell className="text-right whitespace-nowrap">
                              {t.estado === "Enviado" && puede("laboratorios.editar") && (
                                <>
                                  <Button size="sm" variant="outline" onClick={() => hacer(`/trabajos/${t.id}/recibir`, {}, "Trabajo recibido")}>
                                    <Check className="size-4" /> Recibido
                                  </Button>
                                  <Button size="icon-sm" variant="ghost" onClick={() => cancelar(t)} aria-label={`Cancelar ${t.descripcion}`}>
                                    <X className="size-4" />
                                  </Button>
                                </>
                              )}
                            </TableCell>
                          </TableRow>
                        );
                      })}
                    </TableBody>
                  </Table>
                </div>
              )}
            </Card>
            {l.pagos.length > 0 && (
              <Card className="gap-0 overflow-hidden pb-0 shadow-none">
                <CardHeader className="pb-3">
                  <CardTitle>Pagos</CardTitle>
                </CardHeader>
                <ul className="divide-y border-t">
                  {l.pagos.map((p) => (
                    <li key={p.id} className={cn("flex justify-between gap-3 px-6 py-2.5 text-sm", p.anuladoEn && "opacity-50 line-through")}>
                      <span>
                        {formatDate(p.fecha)} · {p.medio}
                        {p.comprobante && ` · ${p.comprobante}`}
                      </span>
                      <span className="font-semibold tabular">{formatMoney(p.importe)}</span>
                    </li>
                  ))}
                </ul>
              </Card>
            )}
            <TrabajoDialog labId={l.id} open={trabajo} onOpenChange={setTrabajo} />
            <PagoLabDialog labId={l.id} saldo={l.saldo} open={pago} onOpenChange={setPago} />
          </div>
        )}
      </QueryState>
    </>
  );
}
