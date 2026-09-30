import { useEffect, useState } from "react";
import { ChevronLeft, ChevronRight, Loader2, Percent, Plus, Wallet } from "lucide-react";
import { toast } from "sonner";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api, ApiError } from "@/api/client";
import { KpiCard } from "@/components/shared/KpiCard";
import { PageHeader } from "@/components/shared/PageHeader";
import { QueryState } from "@/components/shared/QueryState";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useRole } from "@/context/AuthProvider";
import { formatDate, formatMoney } from "@/lib/format";
import { aNumero } from "@/lib/numeros";
import { hoyIso, MEDIOS_DENTAL, type GastoApi, type MedioDental } from "./api";

interface FilaHonorarios {
  usuarioId: string;
  nombre: string;
  porcentaje: number | null;
  descontarLaboratorio: boolean;
  version: number | null;
  prestaciones: number;
  producido: number;
  laboratorio: number;
  base: number;
  corresponde: number;
  pagado: number;
  saldo: number;
}

interface HonorariosApi {
  mes: string;
  nombreMes: string;
  profesionales: FilaHonorarios[];
  totales: { producido: number; corresponde: number; pagado: number; saldo: number };
  usuarios: { id: string; nombre: string }[];
}

interface DetalleHonorariosApi extends HonorariosApi {
  profesional: FilaHonorarios | null;
  detalle: { id: string; fecha: string; paciente: string; prestacion: string; codigo: string; pieza: number | null; obraSocial: string | null; importe: number }[];
  trabajos: { id: string; fecha: string; descripcion: string; importe: number; estado: string }[];
  pagos: GastoApi[];
}

const useHonorarios = (mes: string) => useQuery({ queryKey: ["honorarios", mes], queryFn: () => api<HonorariosApi>(`/honorarios?mes=${mes}`) });
const useDetalle = (usuarioId: string | null, mes: string) =>
  useQuery({ queryKey: ["honorarios", mes, usuarioId], queryFn: () => api<DetalleHonorariosApi>(`/honorarios/${usuarioId}?mes=${mes}`), enabled: !!usuarioId });

function useAccionHonorarios() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ url, body, metodo = "POST" }: { url: string; body: object; metodo?: "POST" | "PUT" }) => api<unknown>(`/honorarios${url}`, { method: metodo, body }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["honorarios"] });
      qc.invalidateQueries({ queryKey: ["consultorio"] });
    },
  });
}

const sumarMes = (mes: string, n: number) => {
  const d = new Date(Date.UTC(Number(mes.slice(0, 4)), Number(mes.slice(5, 7)) - 1 + n, 1));
  return d.toISOString().slice(0, 7);
};
const pct = (n: number) => `${n.toLocaleString("es-AR", { maximumFractionDigits: 2 })} %`;

/** Honorarios de los profesionales: un porcentaje de lo que produjeron en el mes (CoreDental) */
export function HonorariosPage() {
  const { puede } = useRole();
  const mesActual = hoyIso().slice(0, 7);
  const [mes, setMes] = useState(mesActual);
  const { data, isLoading, error, refetch } = useHonorarios(mes);
  const [porcentaje, setPorcentaje] = useState<{ usuarioId: string; nombre: string; fila?: FilaHonorarios } | null>(null);
  const [pagar, setPagar] = useState<FilaHonorarios | null>(null);
  const [detalle, setDetalle] = useState<string | null>(null);
  const [agregar, setAgregar] = useState(false);
  const editar = puede("empleados.editar");

  return (
    <>
      <PageHeader
        title="Honorarios por porcentaje"
        description="A cada profesional le corresponde un porcentaje de lo que produjo en el mes (lo que paga el paciente más lo que paga la obra social), descontando el laboratorio si así lo acordaron."
        actions={
          editar && (
            <Button variant="outline" onClick={() => setAgregar(true)}>
              <Plus className="size-4" /> Cargar porcentaje
            </Button>
          )
        }
      />
      <div className="mb-4 flex items-center gap-1">
        <Button variant="outline" size="icon-sm" onClick={() => setMes(sumarMes(mes, -1))} aria-label="Mes anterior">
          <ChevronLeft className="size-4" />
        </Button>
        <Button variant="outline" size="icon-sm" onClick={() => setMes(sumarMes(mes, 1))} disabled={mes >= mesActual} aria-label="Mes siguiente">
          <ChevronRight className="size-4" />
        </Button>
        <span className="ml-2 text-sm font-semibold first-letter:uppercase" data-testid="mes-honorarios">
          {data?.nombreMes ?? mes}
        </span>
      </div>

      <QueryState isLoading={isLoading} error={error} onRetry={refetch}>
        {data && (
          <div className="grid gap-6">
            <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
              <KpiCard label="Producido en el mes" value={formatMoney(data.totales.producido)} icon={Wallet} />
              <KpiCard label="Honorarios del mes" value={formatMoney(data.totales.corresponde)} icon={Percent} />
              <KpiCard label="Pagado" value={formatMoney(data.totales.pagado)} icon={Wallet} tone="success" />
              <KpiCard label="Falta pagar" value={formatMoney(data.totales.saldo)} icon={Wallet} tone={data.totales.saldo > 0 ? "warning" : "default"} />
            </div>

            {data.profesionales.length === 0 ? (
              <Card className="items-center gap-3 py-14 text-center shadow-none">
                <Percent className="size-8 text-primary" />
                <p className="max-w-md text-sm text-muted-foreground">Todavía no hay prestaciones registradas este mes ni porcentajes cargados. Cargá el porcentaje de cada profesional y el sistema calcula solo cuánto le corresponde.</p>
              </Card>
            ) : (
              <Card className="gap-0 overflow-hidden p-0 shadow-none">
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Profesional</TableHead>
                        <TableHead className="text-right">%</TableHead>
                        <TableHead className="text-right">Producido</TableHead>
                        <TableHead className="text-right">Laboratorio</TableHead>
                        <TableHead className="text-right">Le corresponde</TableHead>
                        <TableHead className="text-right">Pagado</TableHead>
                        <TableHead className="text-right">Saldo</TableHead>
                        <TableHead />
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {data.profesionales.map((f) => (
                        <TableRow key={f.usuarioId} data-testid="fila-honorarios" className="cursor-pointer" onClick={() => setDetalle(f.usuarioId)}>
                          <TableCell>
                            <div className="font-medium">{f.nombre}</div>
                            <div className="text-xs text-muted-foreground">
                              {f.prestaciones} {f.prestaciones === 1 ? "prestación" : "prestaciones"}
                            </div>
                          </TableCell>
                          <TableCell className="tabular text-right">{f.porcentaje === null ? <span className="text-xs text-warning-ink">Sin cargar</span> : pct(f.porcentaje)}</TableCell>
                          <TableCell className="tabular text-right">{formatMoney(f.producido)}</TableCell>
                          <TableCell className="tabular text-right text-muted-foreground">{f.descontarLaboratorio && f.laboratorio > 0 ? `− ${formatMoney(f.laboratorio)}` : "—"}</TableCell>
                          <TableCell className="tabular text-right font-medium">{formatMoney(f.corresponde)}</TableCell>
                          <TableCell className="tabular text-right">{formatMoney(f.pagado)}</TableCell>
                          <TableCell className="tabular text-right font-semibold" data-testid="saldo-honorarios">
                            {formatMoney(f.saldo)}
                          </TableCell>
                          <TableCell className="text-right" onClick={(e) => e.stopPropagation()}>
                            {editar && (
                              <div className="flex justify-end gap-1">
                                <Button size="sm" variant="ghost" onClick={() => setPorcentaje({ usuarioId: f.usuarioId, nombre: f.nombre, fila: f })} aria-label={`Porcentaje de ${f.nombre}`}>
                                  <Percent className="size-4" />
                                </Button>
                                <Button size="sm" variant="outline" onClick={() => setPagar(f)} disabled={f.porcentaje === null || f.saldo <= 0 || mes > mesActual} aria-label={`Pagar a ${f.nombre}`}>
                                  Pagar
                                </Button>
                              </div>
                            )}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              </Card>
            )}
            <p className="text-xs text-muted-foreground">
              Cuenta las prestaciones que cada profesional registró como realizadas en el mes, y los trabajos de laboratorio que encargó. Los pagos quedan en Gastos, en «Sueldos y honorarios», y si son en efectivo salen de la caja.
            </p>
          </div>
        )}
      </QueryState>

      {data && <ElegirProfesional open={agregar} onOpenChange={setAgregar} usuarios={data.usuarios.filter((u) => !data.profesionales.some((p) => p.usuarioId === u.id && p.porcentaje !== null))} onElegir={(u) => setPorcentaje({ usuarioId: u.id, nombre: u.nombre })} />}
      <PorcentajeDialog datos={porcentaje} onClose={() => setPorcentaje(null)} />
      <PagarDialog fila={pagar} mes={mes} nombreMes={data?.nombreMes ?? mes} onClose={() => setPagar(null)} />
      <DetalleDialog usuarioId={detalle} mes={mes} onClose={() => setDetalle(null)} />
    </>
  );
}

function ElegirProfesional({ open, onOpenChange, usuarios, onElegir }: { open: boolean; onOpenChange: (o: boolean) => void; usuarios: { id: string; nombre: string }[]; onElegir: (u: { id: string; nombre: string }) => void }) {
  const [id, setId] = useState("");
  useEffect(() => setId(""), [open]);
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>Cargar porcentaje</DialogTitle>
          <DialogDescription>Elegí el profesional. Tiene que tener usuario en el sistema: sus prestaciones se cuentan por quién las registró.</DialogDescription>
        </DialogHeader>
        <Select value={id} onValueChange={setId}>
          <SelectTrigger aria-label="Profesional">
            <SelectValue placeholder="Elegí" />
          </SelectTrigger>
          <SelectContent>
            {usuarios.map((u) => (
              <SelectItem key={u.id} value={u.id}>
                {u.nombre}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <DialogFooter>
          <Button
            disabled={!id}
            onClick={() => {
              onElegir(usuarios.find((u) => u.id === id)!);
              onOpenChange(false);
            }}
          >
            Seguir
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function PorcentajeDialog({ datos, onClose }: { datos: { usuarioId: string; nombre: string; fila?: FilaHonorarios } | null; onClose: () => void }) {
  const accion = useAccionHonorarios();
  const [valor, setValor] = useState("");
  const [descontar, setDescontar] = useState(true);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    setValor(datos?.fila?.porcentaje != null ? String(datos.fila.porcentaje).replace(".", ",") : "");
    setDescontar(datos?.fila?.descontarLaboratorio ?? true);
    setError(null);
  }, [datos]);
  if (!datos) return null;

  const submit = async () => {
    const n = aNumero(valor);
    if (!Number.isFinite(n) || n < 0 || n > 100) return setError("Poné un porcentaje entre 0 y 100");
    try {
      await accion.mutateAsync({ url: `/${datos.usuarioId}/config`, body: { porcentaje: n, descontarLaboratorio: descontar, version: datos.fila?.version ?? undefined }, metodo: "PUT" });
      toast.success(`Porcentaje de ${datos.nombre}: ${pct(n)}`);
      onClose();
    } catch (e) {
      setError(e instanceof ApiError ? (e.details.porcentaje ?? e.message) : "No se pudo guardar");
    }
  };

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>Porcentaje de {datos.nombre}</DialogTitle>
          <DialogDescription>Lo que le corresponde de lo que produce cada mes. Si cambia, se recalcula todo el mes que estás viendo.</DialogDescription>
        </DialogHeader>
        <div className="grid gap-4">
          <div className="grid gap-1.5">
            <Label htmlFor="hn-porcentaje">Porcentaje</Label>
            <div className="flex items-center gap-2">
              <Input id="hn-porcentaje" inputMode="decimal" className="w-28" value={valor} onChange={(e) => setValor(e.target.value)} aria-invalid={!!error} autoFocus />
              <span className="text-sm text-muted-foreground">%</span>
            </div>
          </div>
          <label className="flex items-start gap-3 text-sm">
            <Switch checked={descontar} onCheckedChange={setDescontar} aria-label="Descontar el laboratorio" className="mt-0.5" />
            <span>
              <b className="font-medium">Descontar el laboratorio</b>
              <span className="block text-muted-foreground">Antes de calcular el porcentaje se resta lo que costaron los trabajos de laboratorio que encargó.</span>
            </span>
          </label>
          {error && (
            <p className="text-sm text-destructive" role="alert">
              {error}
            </p>
          )}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Cancelar
          </Button>
          <Button onClick={submit} disabled={accion.isPending}>
            {accion.isPending && <Loader2 className="size-4 animate-spin" />}
            Guardar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function PagarDialog({ fila, mes, nombreMes, onClose }: { fila: FilaHonorarios | null; mes: string; nombreMes: string; onClose: () => void }) {
  const accion = useAccionHonorarios();
  const [importe, setImporte] = useState("");
  const [medio, setMedio] = useState<MedioDental>("Transferencia");
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    setImporte(fila ? fila.saldo.toLocaleString("es-AR", { minimumFractionDigits: 0, maximumFractionDigits: 2 }) : "");
    setError(null);
  }, [fila]);
  if (!fila) return null;

  const submit = async () => {
    const n = aNumero(importe);
    if (!Number.isFinite(n) || n <= 0) return setError("Poné el importe");
    try {
      await accion.mutateAsync({ url: `/${fila.usuarioId}/pagos`, body: { mes, importe: n, medio } });
      toast.success(`Pago a ${fila.nombre} registrado`, { description: "Quedó en Gastos, en «Sueldos y honorarios»." });
      onClose();
    } catch (e) {
      setError(e instanceof ApiError ? (e.details.importe ?? e.message) : "No se pudo registrar");
    }
  };

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>Pagar a {fila.nombre}</DialogTitle>
          <DialogDescription>
            Honorarios de <span className="first-letter:uppercase">{nombreMes}</span>: le quedan {formatMoney(fila.saldo)}. Se puede pagar en partes.
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-4">
          <div className="grid gap-1.5">
            <Label htmlFor="hn-importe">Importe</Label>
            <Input id="hn-importe" inputMode="decimal" value={importe} onChange={(e) => setImporte(e.target.value)} aria-invalid={!!error} />
          </div>
          <div className="grid gap-1.5">
            <Label>Medio de pago</Label>
            <Select value={medio} onValueChange={(v) => setMedio(v as MedioDental)}>
              <SelectTrigger aria-label="Medio de pago">
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
          {error && (
            <p className="text-sm text-destructive" role="alert">
              {error}
            </p>
          )}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Cancelar
          </Button>
          <Button onClick={submit} disabled={accion.isPending}>
            {accion.isPending && <Loader2 className="size-4 animate-spin" />}
            Registrar pago
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function DetalleDialog({ usuarioId, mes, onClose }: { usuarioId: string | null; mes: string; onClose: () => void }) {
  const { data, isLoading, error, refetch } = useDetalle(usuarioId, mes);
  if (!usuarioId) return null;
  const f = data?.profesional;
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[92svh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>{f?.nombre ?? "Detalle"}</DialogTitle>
          <DialogDescription className="first-letter:uppercase">{data?.nombreMes}</DialogDescription>
        </DialogHeader>
        <QueryState isLoading={isLoading} error={error} onRetry={refetch}>
          {data && f && (
            <div className="grid gap-5 text-sm" data-testid="detalle-honorarios">
              <div className="rounded-lg bg-muted/50 p-3">
                Producido {formatMoney(f.producido)}
                {f.descontarLaboratorio && f.laboratorio > 0 && <> − laboratorio {formatMoney(f.laboratorio)}</>} = {formatMoney(f.base)}
                {f.porcentaje !== null && (
                  <>
                    {" "}
                    × {pct(f.porcentaje)} = <b>{formatMoney(f.corresponde)}</b>
                  </>
                )}
              </div>
              <section>
                <h3 className="mb-2 font-semibold">Prestaciones ({data.detalle.length})</h3>
                {data.detalle.length === 0 ? (
                  <p className="text-muted-foreground">Ninguna este mes.</p>
                ) : (
                  <ul className="divide-y rounded-lg border">
                    {data.detalle.map((x) => (
                      <li key={x.id} className="flex items-center gap-3 px-3 py-2">
                        <span className="tabular w-20 shrink-0 text-xs text-muted-foreground">{formatDate(x.fecha)}</span>
                        <span className="min-w-0 flex-1">
                          <span className="block truncate">
                            {x.prestacion}
                            {x.pieza ? ` · pieza ${x.pieza}` : ""}
                          </span>
                          <span className="block truncate text-xs text-muted-foreground">
                            {x.paciente}
                            {x.obraSocial ? ` · ${x.obraSocial}` : ""}
                          </span>
                        </span>
                        <span className="tabular">{formatMoney(x.importe)}</span>
                      </li>
                    ))}
                  </ul>
                )}
              </section>
              {data.trabajos.length > 0 && (
                <section>
                  <h3 className="mb-2 font-semibold">Laboratorio</h3>
                  <ul className="divide-y rounded-lg border">
                    {data.trabajos.map((t) => (
                      <li key={t.id} className="flex items-center gap-3 px-3 py-2">
                        <span className="tabular w-20 shrink-0 text-xs text-muted-foreground">{formatDate(t.fecha)}</span>
                        <span className="flex-1">{t.descripcion}</span>
                        <span className="tabular">{formatMoney(t.importe)}</span>
                      </li>
                    ))}
                  </ul>
                </section>
              )}
              <section>
                <h3 className="mb-2 font-semibold">Pagos</h3>
                {data.pagos.length === 0 ? (
                  <p className="text-muted-foreground">Todavía no se le pagó nada de este mes.</p>
                ) : (
                  <ul className="divide-y rounded-lg border">
                    {data.pagos.map((p) => (
                      <li key={p.id} className="flex items-center gap-3 px-3 py-2">
                        <span className="tabular w-20 shrink-0 text-xs text-muted-foreground">{formatDate(p.fecha)}</span>
                        <span className={p.anuladoEn ? "flex-1 text-muted-foreground line-through" : "flex-1"}>
                          {p.medio}
                          {p.anuladoEn ? " · anulado" : ""}
                        </span>
                        <span className="tabular">{formatMoney(p.importe)}</span>
                      </li>
                    ))}
                  </ul>
                )}
              </section>
            </div>
          )}
        </QueryState>
      </DialogContent>
    </Dialog>
  );
}
