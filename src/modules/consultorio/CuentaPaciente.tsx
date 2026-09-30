import { useState } from "react";
import { Ban, Loader2, Plus, Receipt, Wallet } from "lucide-react";
import { Link } from "react-router";
import { toast } from "sonner";
import { ApiError } from "@/api/client";
import { QueryState } from "@/components/shared/QueryState";
import { Button } from "@/components/ui/button";
import { Card, CardAction, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useRole } from "@/context/AuthProvider";
import { formatDate, formatMoney } from "@/lib/format";
import { aNumero } from "@/lib/numeros";
import { cn } from "@/lib/utils";
import { usePrestaciones, type PacienteApi } from "@/modules/pacientes/api";
import { hoyIso, MEDIOS_DENTAL, useAnularEnCuenta, useCargarPrestacion, useCuenta, usePrecios, useRegistrarPago, type MedioDental } from "./api";
import { numeroDoc } from "./Hojas";

/** Registrar un pago del paciente (también se usa desde Cobros) */
export function PagoDialog({ pacienteId, nombre, saldo, open, onOpenChange }: { pacienteId: string; nombre: string; saldo: number; open: boolean; onOpenChange: (o: boolean) => void }) {
  const pagar = useRegistrarPago(pacienteId);
  const [importe, setImporte] = useState("");
  const [medio, setMedio] = useState<MedioDental>("Efectivo");
  const [referencia, setReferencia] = useState("");
  const [errores, setErrores] = useState<Record<string, string>>({});

  const guardar = async () => {
    setErrores({});
    const n = aNumero(importe);
    if (Number.isNaN(n) || n <= 0) return setErrores({ importe: "Poné el importe" });
    try {
      const r = await pagar.mutateAsync({ importe: n, medio, referencia: referencia.trim() || null });
      toast.success(`Pago registrado · recibo N° ${numeroDoc(r.numero)}`, { description: r.saldo > 0 ? `Queda debiendo ${formatMoney(r.saldo)}` : r.saldo < 0 ? `Queda a favor ${formatMoney(-r.saldo)}` : "Quedó al día" });
      onOpenChange(false);
      setImporte("");
      setReferencia("");
    } catch (e) {
      if (!(e instanceof ApiError)) throw e;
      setErrores(e.details);
      toast.error(e.message);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Registrar pago</DialogTitle>
          <DialogDescription>
            {nombre}
            {saldo > 0 ? ` · debe ${formatMoney(saldo)}` : saldo < 0 ? ` · tiene ${formatMoney(-saldo)} a favor` : " · está al día"}
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-4">
          <div className="grid grid-cols-2 gap-3">
            <div className="grid gap-1.5">
              <Label htmlFor="pago-importe">Importe</Label>
              <Input id="pago-importe" inputMode="decimal" value={importe} onChange={(e) => setImporte(e.target.value)} placeholder={saldo > 0 ? saldo.toLocaleString("es-AR") : "0"} aria-invalid={!!errores.importe} autoFocus />
              {errores.importe && <p className="text-xs text-destructive">{errores.importe}</p>}
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="pago-medio">Medio</Label>
              <Select value={medio} onValueChange={(v) => setMedio(v as MedioDental)}>
                <SelectTrigger id="pago-medio" className="w-full">
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
          {saldo > 0 && (
            <button type="button" className="justify-self-start text-sm text-primary hover:underline" onClick={() => setImporte(saldo.toLocaleString("es-AR"))}>
              Paga todo lo que debe ({formatMoney(saldo)})
            </button>
          )}
          {medio !== "Efectivo" && (
            <div className="grid gap-1.5">
              <Label htmlFor="pago-ref">Referencia (opcional)</Label>
              <Input id="pago-ref" value={referencia} onChange={(e) => setReferencia(e.target.value)} placeholder="N° de operación, últimos dígitos…" />
            </div>
          )}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          <Button onClick={guardar} disabled={pagar.isPending}>
            {pagar.isPending && <Loader2 className="size-4 animate-spin" />}
            Registrar pago
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/** Cargar a la cuenta una prestación hecha que no pasa por el odontograma (consulta, limpieza, radiografía…) */
function CargarDialog({ paciente, open, onOpenChange }: { paciente: PacienteApi; open: boolean; onOpenChange: (o: boolean) => void }) {
  const { data: prestaciones = [] } = usePrestaciones();
  const lista = usePrecios(paciente.obraSocialId ?? "particular");
  const particular = usePrecios("particular");
  const cargar = useCargarPrestacion(paciente.id);
  const [prestacionId, setPrestacionId] = useState("");
  const [importe, setImporte] = useState("");
  const [fecha, setFecha] = useState(hoyIso());

  const precioDe = (id: string) => lista.data?.find((p) => p.id === id)?.precioPaciente ?? particular.data?.find((p) => p.id === id)?.precioPaciente ?? 0;
  const elegir = (id: string) => {
    setPrestacionId(id);
    setImporte(precioDe(id).toLocaleString("es-AR"));
  };

  const guardar = async () => {
    const n = aNumero(importe);
    if (Number.isNaN(n) || n < 0) return toast.error("Revisá el importe");
    try {
      await cargar.mutateAsync({ prestacionId, fecha, importePaciente: n });
      toast.success("Prestación cargada a la cuenta");
      onOpenChange(false);
      setPrestacionId("");
      setImporte("");
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : "No se pudo cargar");
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Cargar prestación</DialogTitle>
          <DialogDescription>Una consulta, una limpieza o lo que no se marca en el odontograma. Lo que va en una pieza conviene marcarlo en el odontograma: se carga solo.</DialogDescription>
        </DialogHeader>
        <div className="grid gap-4">
          <div className="grid gap-1.5">
            <Label htmlFor="cargo-prest">Prestación</Label>
            <Select value={prestacionId} onValueChange={elegir}>
              <SelectTrigger id="cargo-prest" className="w-full">
                <SelectValue placeholder="Elegí la prestación" />
              </SelectTrigger>
              <SelectContent>
                {prestaciones
                  .filter((p) => p.activa)
                  .map((p) => (
                    <SelectItem key={p.id} value={p.id}>
                      {p.codigo} · {p.nombre}
                    </SelectItem>
                  ))}
              </SelectContent>
            </Select>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="grid gap-1.5">
              <Label htmlFor="cargo-importe">A cargo del paciente</Label>
              <Input id="cargo-importe" inputMode="decimal" value={importe} onChange={(e) => setImporte(e.target.value)} />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="cargo-fecha">Fecha</Label>
              <Input id="cargo-fecha" type="date" max={hoyIso()} value={fecha} onChange={(e) => setFecha(e.target.value)} />
            </div>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          <Button onClick={guardar} disabled={!prestacionId || cargar.isPending}>
            Cargar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function CuentaPaciente({ paciente }: { paciente: PacienteApi }) {
  const { puede } = useRole();
  const cuenta = useCuenta(paciente.id);
  const anular = useAnularEnCuenta(paciente.id);
  const [pagando, setPagando] = useState(false);
  const [cargando, setCargando] = useState(false);
  const [verAnulados, setVerAnulados] = useState(false);
  const [anulando, setAnulando] = useState<{ tipo: "cargos" | "pagos"; id: string; titulo: string } | null>(null);
  const [motivo, setMotivo] = useState("");
  const nombre = `${paciente.apellido}, ${paciente.nombre}`;

  const confirmarAnulacion = async () => {
    try {
      await anular.mutateAsync({ ...anulando!, motivo });
      toast.success("Anulado. Queda en el historial.");
      setAnulando(null);
      setMotivo("");
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : "No se pudo anular", { duration: 8000 });
    }
  };

  const c = cuenta.data;
  const cargos = (c?.cargos ?? []).filter((x) => verAnulados || !x.anuladoEn);
  const pagos = (c?.pagos ?? []).filter((x) => verAnulados || !x.anuladoEn);

  return (
    <QueryState isLoading={cuenta.isLoading} error={cuenta.error} onRetry={cuenta.refetch}>
      {c && (
        <div className="grid gap-6">
          <Card className="flex-row flex-wrap items-center justify-between gap-4 p-5 shadow-none">
            <div>
              <div className="text-sm text-muted-foreground">{c.saldo > 0 ? "Debe" : c.saldo < 0 ? "Tiene a favor" : "Saldo"}</div>
              <div className={cn("text-3xl font-semibold tabular", c.saldo > 0 ? "text-destructive" : c.saldo < 0 ? "text-success" : "")} data-testid="saldo-paciente">
                {c.saldo === 0 ? "Al día" : formatMoney(Math.abs(c.saldo))}
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <label className="mr-2 flex items-center gap-2 text-sm text-muted-foreground">
                <Switch checked={verAnulados} onCheckedChange={setVerAnulados} aria-label="Ver anulados" /> Ver anulados
              </label>
              {puede("cobranzas.cobrar", "historia.editar") && (
                <Button variant="outline" onClick={() => setCargando(true)}>
                  <Plus className="size-4" /> Cargar prestación
                </Button>
              )}
              {puede("cobranzas.cobrar") && (
                <Button onClick={() => setPagando(true)}>
                  <Wallet className="size-4" /> Registrar pago
                </Button>
              )}
            </div>
          </Card>

          <Card className="gap-0 overflow-hidden pb-0 shadow-none">
            <CardHeader className="pb-3">
              <CardTitle>Prestaciones realizadas</CardTitle>
            </CardHeader>
            {cargos.length === 0 ? (
              <div className="border-t px-6 py-8 text-center text-sm text-muted-foreground">Todavía no hay prestaciones realizadas.</div>
            ) : (
              <div className="overflow-x-auto border-t">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Fecha</TableHead>
                      <TableHead>Prestación</TableHead>
                      <TableHead className="hidden md:table-cell">Profesional</TableHead>
                      <TableHead className="text-right">Paciente</TableHead>
                      <TableHead className="hidden text-right sm:table-cell">Obra social</TableHead>
                      <TableHead />
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {cargos.map((x) => (
                      <TableRow key={x.id} className={cn(x.anuladoEn && "opacity-55")} data-testid="cargo">
                        <TableCell className="whitespace-nowrap">{formatDate(x.fecha)}</TableCell>
                        <TableCell>
                          <div className={cn(x.anuladoEn && "line-through")}>
                            {x.prestacion}
                            {x.pieza && <span className="text-muted-foreground"> · pieza {x.pieza}</span>}
                          </div>
                          {x.anuladoEn && <div className="text-xs text-destructive">Anulada: {x.motivoAnulacion}</div>}
                        </TableCell>
                        <TableCell className="hidden text-muted-foreground md:table-cell">{x.profesional}</TableCell>
                        <TableCell className="text-right tabular">{formatMoney(x.importePaciente)}</TableCell>
                        <TableCell className="hidden text-right text-muted-foreground tabular sm:table-cell">{x.importeObraSocial ? formatMoney(x.importeObraSocial) : "—"}</TableCell>
                        <TableCell className="text-right">
                          {!x.anuladoEn && !x.odontogramaId && puede("cobranzas.anular") && (
                            <Button size="icon-sm" variant="ghost" onClick={() => setAnulando({ tipo: "cargos", id: x.id, titulo: x.prestacion })} aria-label={`Anular ${x.prestacion}`}>
                              <Ban className="size-4" />
                            </Button>
                          )}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </Card>

          <Card className="gap-0 overflow-hidden pb-0 shadow-none">
            <CardHeader className="pb-3">
              <CardTitle>Pagos</CardTitle>
              <CardAction className="text-sm text-muted-foreground">Total pagado: {formatMoney(c.pagos.filter((p) => !p.anuladoEn).reduce((a, p) => a + p.importe, 0))}</CardAction>
            </CardHeader>
            {pagos.length === 0 ? (
              <div className="border-t px-6 py-8 text-center text-sm text-muted-foreground">Todavía no hay pagos.</div>
            ) : (
              <div className="overflow-x-auto border-t">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Fecha</TableHead>
                      <TableHead>Recibo</TableHead>
                      <TableHead>Medio</TableHead>
                      <TableHead className="text-right">Importe</TableHead>
                      <TableHead />
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {pagos.map((p) => (
                      <TableRow key={p.id} className={cn(p.anuladoEn && "opacity-55")} data-testid="pago">
                        <TableCell className="whitespace-nowrap">{formatDate(p.fecha)}</TableCell>
                        <TableCell>
                          <Link to={`/pacientes/${paciente.id}/recibos/${p.id}`} className="inline-flex items-center gap-1 text-primary hover:underline">
                            <Receipt className="size-3.5" /> {numeroDoc(p.numero)}
                          </Link>
                          {p.anuladoEn && <div className="text-xs text-destructive">Anulado: {p.motivoAnulacion}</div>}
                        </TableCell>
                        <TableCell>{p.medio}</TableCell>
                        <TableCell className={cn("text-right tabular", p.anuladoEn && "line-through")}>{formatMoney(p.importe)}</TableCell>
                        <TableCell className="text-right">
                          {!p.anuladoEn && puede("cobranzas.anular") && (
                            <Button size="icon-sm" variant="ghost" onClick={() => setAnulando({ tipo: "pagos", id: p.id, titulo: `el recibo ${numeroDoc(p.numero)}` })} aria-label={`Anular recibo ${numeroDoc(p.numero)}`}>
                              <Ban className="size-4" />
                            </Button>
                          )}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </Card>

          <PagoDialog pacienteId={paciente.id} nombre={nombre} saldo={c.saldo} open={pagando} onOpenChange={setPagando} />
          <CargarDialog paciente={paciente} open={cargando} onOpenChange={setCargando} />
          <Dialog open={!!anulando} onOpenChange={(o) => !o && setAnulando(null)}>
            <DialogContent className="sm:max-w-md">
              <DialogHeader>
                <DialogTitle>Anular {anulando?.titulo}</DialogTitle>
                <DialogDescription>No se borra: queda en el historial como anulado, con el motivo, y cambia el saldo.</DialogDescription>
              </DialogHeader>
              <div className="grid gap-1.5">
                <Label htmlFor="cuenta-motivo">Motivo</Label>
                <Input id="cuenta-motivo" value={motivo} onChange={(e) => setMotivo(e.target.value)} autoFocus />
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setAnulando(null)}>
                  Cancelar
                </Button>
                <Button variant="destructive" onClick={confirmarAnulacion} disabled={motivo.trim().length < 3 || anular.isPending}>
                  Anular
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </div>
      )}
    </QueryState>
  );
}
