import { useState } from "react";
import { ArrowLeft, Ban, ChevronLeft, ChevronRight, FileSpreadsheet, Lock, LockOpen, Plus, Printer, Wallet } from "lucide-react";
import { Link, useNavigate, useParams } from "react-router";
import { toast } from "sonner";
import { ApiError } from "@/api/client";
import { KpiCard } from "@/components/shared/KpiCard";
import { PageHeader } from "@/components/shared/PageHeader";
import { PaperFit } from "@/components/shared/PaperFit";
import { QueryState } from "@/components/shared/QueryState";
import { Button } from "@/components/ui/button";
import { Card, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useRole } from "@/context/AuthProvider";
import { formatDate, formatMoney, formatMoneyShort } from "@/lib/format";
import { aNumero } from "@/lib/numeros";
import { exportarReporte } from "@/lib/planillas";
import { cn } from "@/lib/utils";
import { useObrasSociales } from "@/modules/pacientes/api";
import { PacienteSelector } from "@/modules/pacientes/PacienteSelector";
import { CATEGORIAS_GASTO, hoyIso, MEDIOS_DENTAL, mesDe, useAccionConsultorio, useCaja, useCobrosConsultorio, useCuenta, useGastos, useLiquidacion, useRecibo, useResumenConsultorio, type MedioDental } from "./api";
import { PagoDialog } from "./CuentaPaciente";
import { numeroDoc, ReciboPacienteHoja } from "./Hojas";

const sumarDias = (f: string, d: number) => {
  const x = new Date(`${f}T00:00:00Z`);
  x.setUTCDate(x.getUTCDate() + d);
  return x.toISOString().slice(0, 10);
};
const fechaLarga = (f: string) => new Date(`${f}T00:00:00`).toLocaleDateString("es-AR", { weekday: "long", day: "numeric", month: "long", year: "numeric" });
const nombreMes = (f: string) => {
  const s = new Date(`${f}T00:00:00`).toLocaleDateString("es-AR", { month: "long", year: "numeric" });
  return s.charAt(0).toUpperCase() + s.slice(1);
};
const moverMes = (f: string, d: number) => {
  const [a, m] = f.split("-").map(Number) as [number, number];
  return new Date(Date.UTC(a, m - 1 + d, 1)).toISOString().slice(0, 10);
};

function useHacer() {
  const accion = useAccionConsultorio();
  const hacer = async (url: string, body: object, exito: string) => {
    try {
      await accion.mutateAsync({ url, body });
      toast.success(exito);
      return true;
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : "No se pudo", { duration: 8000 });
      return false;
    }
  };
  return { hacer, pendiente: accion.isPending };
}

// ---------------------------------------------------------------- recibo

export function ReciboPacientePage() {
  const { id, pagoId } = useParams();
  const { empresa } = useRole();
  const { data: r, isLoading, error, refetch } = useRecibo(id!, pagoId!);
  return (
    <>
      <Button variant="ghost" size="sm" asChild className="mb-3 -ml-2 text-muted-foreground print:hidden">
        <Link to={`/pacientes/${id}?tab=cuenta`}>
          <ArrowLeft className="size-4" /> Cuenta del paciente
        </Link>
      </Button>
      <QueryState isLoading={isLoading} error={error} onRetry={refetch}>
        {r && (
          <>
            <div className="mb-5 flex items-center justify-between gap-3 print:hidden">
              <h1 className="text-2xl font-semibold tracking-tight">Recibo N° {numeroDoc(r.numero)}</h1>
              <Button onClick={() => window.print()}>
                <Printer className="size-4" /> Imprimir / PDF
              </Button>
            </div>
            <div className="zona-impresion rounded-xl bg-muted p-3 sm:p-5">
              <PaperFit>
                <ReciboPacienteHoja r={r} empresa={empresa} />
              </PaperFit>
            </div>
          </>
        )}
      </QueryState>
    </>
  );
}

// ---------------------------------------------------------------- cobros (deudas de pacientes)

function PagoRapido() {
  const [pacienteId, setPacienteId] = useState<string | null>(null);
  const [nombre, setNombre] = useState("");
  const [abierto, setAbierto] = useState(false);
  const cuenta = useCuenta(pacienteId ?? "", !!pacienteId);
  return (
    <>
      <Button onClick={() => setAbierto(true)}>
        <Wallet className="size-4" /> Registrar pago
      </Button>
      <Dialog open={abierto && !pacienteId} onOpenChange={setAbierto}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Registrar pago</DialogTitle>
            <DialogDescription>¿Quién paga?</DialogDescription>
          </DialogHeader>
          <PacienteSelector
            value={pacienteId}
            onChange={(id, n) => {
              setPacienteId(id);
              setNombre(n ?? "");
            }}
          />
        </DialogContent>
      </Dialog>
      {pacienteId && cuenta.data && (
        <PagoDialog
          pacienteId={pacienteId}
          nombre={nombre}
          saldo={cuenta.data.saldo}
          open={abierto}
          onOpenChange={(o) => {
            setAbierto(o);
            if (!o) setPacienteId(null);
          }}
        />
      )}
    </>
  );
}

export function CobrosConsultorioPage() {
  const navigate = useNavigate();
  const { puede } = useRole();
  const { data, isLoading, error, refetch } = useCobrosConsultorio();
  return (
    <>
      <PageHeader title="Cobros" description="Quién debe, quién tiene saldo a favor y los últimos pagos de pacientes." actions={puede("cobranzas.cobrar") && <PagoRapido />} />
      <QueryState isLoading={isLoading} error={error} onRetry={refetch}>
        {data && (
          <div className="grid gap-6">
            <div className="grid gap-4 sm:grid-cols-3">
              <KpiCard label="Adeudado por pacientes" value={formatMoneyShort(data.totalAdeudado)} icon={Wallet} tone={data.totalAdeudado ? "warning" : "default"} hint={`${data.deudores.length} ${data.deudores.length === 1 ? "paciente" : "pacientes"}`} />
              <KpiCard label="Saldo a favor de pacientes" value={formatMoneyShort(-data.aFavor.reduce((a, x) => a + x.saldo, 0))} icon={Wallet} hint={`${data.aFavor.length} con saldo a favor`} />
              <KpiCard label="Últimos pagos" value={String(data.ultimosPagos.filter((p) => !p.anuladoEn).length)} icon={Wallet} tone="success" hint="Los 30 más recientes" />
            </div>
            <Tabs defaultValue="deudores">
              <TabsList className="mb-3">
                <TabsTrigger value="deudores">Deben ({data.deudores.length})</TabsTrigger>
                <TabsTrigger value="pagos">Últimos pagos</TabsTrigger>
                <TabsTrigger value="favor">A favor ({data.aFavor.length})</TabsTrigger>
              </TabsList>
              <TabsContent value="deudores">
                <Card className="overflow-hidden p-0 shadow-none">
                  {data.deudores.length === 0 ? (
                    <div className="py-10 text-center text-sm text-muted-foreground">Ningún paciente debe nada.</div>
                  ) : (
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Paciente</TableHead>
                          <TableHead className="hidden sm:table-cell">Teléfono</TableHead>
                          <TableHead className="text-right">Debe</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {data.deudores.map((d) => (
                          <TableRow key={d.id} className="cursor-pointer" onClick={() => navigate(`/pacientes/${d.id}?tab=cuenta`)} data-testid="deudor">
                            <TableCell className="font-medium">{`${d.apellido}, ${d.nombre}`}</TableCell>
                            <TableCell className="hidden text-muted-foreground sm:table-cell">{d.telefono ?? "—"}</TableCell>
                            <TableCell className="text-right font-semibold text-destructive tabular">{formatMoney(d.saldo)}</TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  )}
                </Card>
              </TabsContent>
              <TabsContent value="pagos">
                <Card className="overflow-hidden p-0 shadow-none">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Fecha</TableHead>
                        <TableHead>Paciente</TableHead>
                        <TableHead className="hidden sm:table-cell">Medio</TableHead>
                        <TableHead className="text-right">Importe</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {data.ultimosPagos.map((p) => (
                        <TableRow key={p.id} className={cn("cursor-pointer", p.anuladoEn && "opacity-55")} onClick={() => navigate(`/pacientes/${p.pacienteId}/recibos/${p.id}`)}>
                          <TableCell className="whitespace-nowrap">{formatDate(p.fecha)}</TableCell>
                          <TableCell>{p.paciente}</TableCell>
                          <TableCell className="hidden sm:table-cell">{p.medio}</TableCell>
                          <TableCell className={cn("text-right tabular", p.anuladoEn && "line-through")}>{formatMoney(p.importe)}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </Card>
              </TabsContent>
              <TabsContent value="favor">
                <Card className="overflow-hidden p-0 shadow-none">
                  <ul className="divide-y">
                    {data.aFavor.map((d) => (
                      <li key={d.id}>
                        <Link to={`/pacientes/${d.id}?tab=cuenta`} className="flex justify-between px-4 py-3 hover:bg-accent">
                          <span>{`${d.apellido}, ${d.nombre}`}</span>
                          <span className="font-semibold text-success tabular">{formatMoney(-d.saldo)}</span>
                        </Link>
                      </li>
                    ))}
                    {data.aFavor.length === 0 && <li className="py-10 text-center text-sm text-muted-foreground">Nadie tiene saldo a favor.</li>}
                  </ul>
                </Card>
              </TabsContent>
            </Tabs>
          </div>
        )}
      </QueryState>
    </>
  );
}

// ---------------------------------------------------------------- caja diaria

function OtroIngresoDialog({ fecha, open, onOpenChange }: { fecha: string; open: boolean; onOpenChange: (o: boolean) => void }) {
  const { hacer, pendiente } = useHacer();
  const [d, setD] = useState({ concepto: "", importe: "", medio: "Efectivo" as MedioDental });
  const guardar = async () => {
    if (await hacer("/ingresos", { concepto: d.concepto, importe: aNumero(d.importe), medio: d.medio, fecha }, "Ingreso registrado")) {
      onOpenChange(false);
      setD({ concepto: "", importe: "", medio: "Efectivo" });
    }
  };
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Otro ingreso</DialogTitle>
          <DialogDescription>Plata que entra a la caja y no es un pago de paciente (por ejemplo, cambio o un aporte).</DialogDescription>
        </DialogHeader>
        <div className="grid gap-3">
          <div className="grid gap-1.5">
            <Label htmlFor="ing-concepto">Concepto</Label>
            <Input id="ing-concepto" value={d.concepto} onChange={(e) => setD({ ...d, concepto: e.target.value })} autoFocus />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="grid gap-1.5">
              <Label htmlFor="ing-importe">Importe</Label>
              <Input id="ing-importe" inputMode="decimal" value={d.importe} onChange={(e) => setD({ ...d, importe: e.target.value })} />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="ing-medio">Medio</Label>
              <Select value={d.medio} onValueChange={(v) => setD({ ...d, medio: v as MedioDental })}>
                <SelectTrigger id="ing-medio" className="w-full">
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
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          <Button onClick={guardar} disabled={pendiente || d.concepto.trim().length < 2}>
            Registrar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function CajaPage() {
  const { puede, esAdmin } = useRole();
  const [fecha, setFecha] = useState(hoyIso());
  const { data: c, isLoading, error, refetch } = useCaja(fecha);
  const { hacer, pendiente } = useHacer();
  const [apertura, setApertura] = useState("");
  const [cerrando, setCerrando] = useState(false);
  const [contado, setContado] = useState("");
  const [notas, setNotas] = useState("");
  const [ingreso, setIngreso] = useState(false);
  const [gasto, setGasto] = useState(false);
  const operar = puede("cobranzas.cobrar");
  const cerrada = !!c?.caja?.cerradaEn;

  const movimientos = c
    ? [
        ...c.pagos.map((p) => ({ id: p.id, hora: p.createdAt, detalle: `Pago de ${p.paciente} · recibo ${numeroDoc(p.numero)}`, medio: p.medio, importe: p.importe, quien: p.cobradoPor })),
        ...c.ingresos.map((i) => ({ id: i.id, hora: i.createdAt, detalle: i.concepto, medio: i.medio, importe: i.importe, quien: i.cargadoPor })),
        ...c.gastos.map((g) => ({ id: g.id, hora: g.createdAt, detalle: `${g.categoria}: ${g.descripcion}`, medio: g.medio, importe: -g.importe, quien: g.cargadoPor })),
      ].sort((a, b) => a.hora.localeCompare(b.hora))
    : [];

  const cerrar = async () => {
    const n = aNumero(contado);
    if (Number.isNaN(n)) return toast.error("Poné el efectivo que contaste");
    if (await hacer("/caja/cerrar", { fecha, contadoEfectivo: n, notas: notas.trim() || null }, "Caja cerrada")) {
      setCerrando(false);
      setContado("");
      setNotas("");
    }
  };

  return (
    <>
      <PageHeader
        title="Caja diaria"
        description="Apertura, todo lo que entra y sale por medio de pago, y el arqueo al cerrar."
        actions={
          operar &&
          !cerrada && (
            <>
              <Button variant="outline" onClick={() => setGasto(true)}>
                Gasto
              </Button>
              <Button variant="outline" onClick={() => setIngreso(true)}>
                <Plus className="size-4" /> Otro ingreso
              </Button>
            </>
          )
        }
      />
      <div className="mb-5 flex flex-wrap items-center gap-2">
        <Button variant="outline" size="icon-sm" onClick={() => setFecha((f) => sumarDias(f, -1))} aria-label="Día anterior">
          <ChevronLeft className="size-4" />
        </Button>
        <Input type="date" value={fecha} max={hoyIso()} onChange={(e) => e.target.value && setFecha(e.target.value)} className="w-44" aria-label="Día" />
        <Button variant="outline" size="icon-sm" onClick={() => setFecha((f) => sumarDias(f, 1))} disabled={fecha >= hoyIso()} aria-label="Día siguiente">
          <ChevronRight className="size-4" />
        </Button>
        <span className="text-sm text-muted-foreground first-letter:uppercase">{fechaLarga(fecha)}</span>
      </div>
      <QueryState isLoading={isLoading} error={error} onRetry={refetch}>
        {c && (
          <div className="grid gap-6">
            {!c.caja ? (
              <Card className="flex-row flex-wrap items-end justify-between gap-4 p-5 shadow-none">
                <div>
                  <div className="font-medium">La caja de este día no se abrió</div>
                  <p className="text-sm text-muted-foreground">Abrila con el efectivo que hay al empezar el día. Los cobros se registran igual aunque no esté abierta.</p>
                </div>
                {operar && (
                  <div className="flex items-end gap-2">
                    <div className="grid gap-1.5">
                      <Label htmlFor="caja-apertura">Efectivo inicial</Label>
                      <Input id="caja-apertura" inputMode="decimal" value={apertura} onChange={(e) => setApertura(e.target.value)} className="w-36" placeholder="0" />
                    </div>
                    <Button onClick={() => hacer("/caja/abrir", { fecha, aperturaEfectivo: aNumero(apertura || "0") }, "Caja abierta")} disabled={pendiente}>
                      <LockOpen className="size-4" /> Abrir caja
                    </Button>
                  </div>
                )}
              </Card>
            ) : (
              <Card className={cn("flex-row flex-wrap items-center justify-between gap-4 p-5 shadow-none", cerrada && "border-success/40 bg-success/5")} data-testid="estado-caja">
                <div className="text-sm">
                  <div className="font-medium">{cerrada ? "Caja cerrada" : "Caja abierta"}</div>
                  <div className="text-muted-foreground">
                    Abrió {c.caja.abiertaPor} con {formatMoney(c.caja.aperturaEfectivo)}
                    {cerrada && ` · cerró ${c.caja.cerradaPor}: contó ${formatMoney(c.caja.contadoEfectivo ?? 0)} de ${formatMoney(c.caja.esperadoEfectivo ?? 0)}`}
                  </div>
                  {cerrada && (
                    <div className={cn("mt-1 font-semibold", (c.caja.diferencia ?? 0) === 0 ? "text-success" : "text-destructive")} data-testid="diferencia-caja">
                      {(c.caja.diferencia ?? 0) === 0 ? "Cerró justo" : `${(c.caja.diferencia ?? 0) > 0 ? "Sobran" : "Faltan"} ${formatMoney(Math.abs(c.caja.diferencia ?? 0))}`}
                      {c.caja.notas && <span className="font-normal text-muted-foreground"> · {c.caja.notas}</span>}
                    </div>
                  )}
                </div>
                {cerrada
                  ? esAdmin && (
                      <Button variant="outline" onClick={() => hacer("/caja/reabrir", { fecha }, "Caja reabierta")} disabled={pendiente}>
                        <LockOpen className="size-4" /> Reabrir
                      </Button>
                    )
                  : operar && (
                      <Button onClick={() => setCerrando(true)}>
                        <Lock className="size-4" /> Cerrar caja
                      </Button>
                    )}
              </Card>
            )}

            <div className="grid gap-4 sm:grid-cols-3">
              <KpiCard label="Efectivo que tiene que haber" value={formatMoney(c.esperadoEfectivo)} icon={Wallet} tone="highlight" hint="Inicial + entradas − salidas en efectivo" />
              <KpiCard label="Entró en el día" value={formatMoney(c.totalIngresos)} icon={Wallet} tone="success" hint="Todos los medios" />
              <KpiCard label="Salió en el día" value={formatMoney(c.totalEgresos)} icon={Wallet} tone={c.totalEgresos ? "warning" : "default"} hint="Gastos" />
            </div>

            <Card className="gap-0 overflow-hidden pb-0 shadow-none">
              <CardHeader className="pb-3">
                <CardTitle>Por medio de pago</CardTitle>
              </CardHeader>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Medio</TableHead>
                    <TableHead className="text-right">Entró</TableHead>
                    <TableHead className="text-right">Salió</TableHead>
                    <TableHead className="text-right">Neto</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {c.porMedio.map((m) => (
                    <TableRow key={m.medio} data-testid="medio-caja">
                      <TableCell className="font-medium">{m.medio}</TableCell>
                      <TableCell className="text-right tabular">{formatMoney(m.ingresos)}</TableCell>
                      <TableCell className="text-right tabular">{formatMoney(m.egresos)}</TableCell>
                      <TableCell className="text-right font-semibold tabular">{formatMoney(m.ingresos - m.egresos)}</TableCell>
                    </TableRow>
                  ))}
                  {c.porMedio.length === 0 && (
                    <TableRow>
                      <TableCell colSpan={4} className="py-8 text-center text-muted-foreground">
                        Todavía no hubo movimientos este día.
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </Card>

            {movimientos.length > 0 && (
              <Card className="gap-0 overflow-hidden pb-0 shadow-none">
                <CardHeader className="pb-3">
                  <CardTitle>Movimientos</CardTitle>
                </CardHeader>
                <ul className="divide-y border-t">
                  {movimientos.map((m) => (
                    <li key={m.id} className="flex items-center justify-between gap-3 px-6 py-2.5 text-sm">
                      <div className="min-w-0">
                        <div className="truncate">{m.detalle}</div>
                        <div className="text-xs text-muted-foreground">
                          {new Date(m.hora).toLocaleTimeString("es-AR", { hour: "2-digit", minute: "2-digit" })} · {m.medio} · {m.quien}
                        </div>
                      </div>
                      <span className={cn("font-semibold tabular", m.importe < 0 ? "text-destructive" : "text-success")}>{formatMoney(m.importe)}</span>
                    </li>
                  ))}
                </ul>
              </Card>
            )}
          </div>
        )}
      </QueryState>

      <Dialog open={cerrando} onOpenChange={setCerrando}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Cerrar la caja</DialogTitle>
            <DialogDescription>Contá el efectivo y cargalo: queda registrada la diferencia. Después ya no se puede mover efectivo con fecha de este día.</DialogDescription>
          </DialogHeader>
          <div className="grid gap-3">
            <div className="grid gap-1.5">
              <Label htmlFor="caja-contado">Efectivo contado</Label>
              <Input id="caja-contado" inputMode="decimal" value={contado} onChange={(e) => setContado(e.target.value)} autoFocus />
              {c && <p className="text-xs text-muted-foreground">Tendría que haber {formatMoney(c.esperadoEfectivo)}</p>}
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="caja-notas">Notas (opcional)</Label>
              <Input id="caja-notas" value={notas} onChange={(e) => setNotas(e.target.value)} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCerrando(false)}>
              Cancelar
            </Button>
            <Button onClick={cerrar} disabled={pendiente}>
              <Lock className="size-4" /> Cerrar caja
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <OtroIngresoDialog fecha={fecha} open={ingreso} onOpenChange={setIngreso} />
      <GastoDialog fecha={fecha} open={gasto} onOpenChange={setGasto} />
    </>
  );
}

// ---------------------------------------------------------------- gastos

function GastoDialog({ fecha, open, onOpenChange }: { fecha?: string; open: boolean; onOpenChange: (o: boolean) => void }) {
  const { hacer, pendiente } = useHacer();
  const vacio = { fecha: fecha ?? hoyIso(), categoria: "", descripcion: "", proveedor: "", importe: "", medio: "Efectivo" as MedioDental, comprobante: "" };
  const [d, setD] = useState(vacio);
  const guardar = async () => {
    const ok = await hacer("/gastos", { ...d, fecha: fecha ?? d.fecha, importe: aNumero(d.importe), proveedor: d.proveedor || null, comprobante: d.comprobante || null }, "Gasto registrado");
    if (ok) {
      onOpenChange(false);
      setD(vacio);
    }
  };
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Registrar gasto</DialogTitle>
          <DialogDescription>Si se pagó en efectivo, sale de la caja de ese día.</DialogDescription>
        </DialogHeader>
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="grid gap-1.5">
            <Label htmlFor="gasto-categoria">Categoría</Label>
            <Select value={d.categoria} onValueChange={(v) => setD({ ...d, categoria: v })}>
              <SelectTrigger id="gasto-categoria" className="w-full">
                <SelectValue placeholder="Elegí" />
              </SelectTrigger>
              <SelectContent>
                {CATEGORIAS_GASTO.map((c) => (
                  <SelectItem key={c} value={c}>
                    {c}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          {!fecha && (
            <div className="grid gap-1.5">
              <Label htmlFor="gasto-fecha">Fecha</Label>
              <Input id="gasto-fecha" type="date" max={hoyIso()} value={d.fecha} onChange={(e) => setD({ ...d, fecha: e.target.value })} />
            </div>
          )}
          <div className="grid gap-1.5 sm:col-span-2">
            <Label htmlFor="gasto-desc">Descripción</Label>
            <Input id="gasto-desc" value={d.descripcion} onChange={(e) => setD({ ...d, descripcion: e.target.value })} placeholder="Ej.: guantes y barbijos" />
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="gasto-prov">Proveedor</Label>
            <Input id="gasto-prov" value={d.proveedor} onChange={(e) => setD({ ...d, proveedor: e.target.value })} />
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="gasto-comp">N° de comprobante</Label>
            <Input id="gasto-comp" value={d.comprobante} onChange={(e) => setD({ ...d, comprobante: e.target.value })} />
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="gasto-importe">Importe</Label>
            <Input id="gasto-importe" inputMode="decimal" value={d.importe} onChange={(e) => setD({ ...d, importe: e.target.value })} />
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="gasto-medio">Cómo se pagó</Label>
            <Select value={d.medio} onValueChange={(v) => setD({ ...d, medio: v as MedioDental })}>
              <SelectTrigger id="gasto-medio" className="w-full">
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
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          <Button onClick={guardar} disabled={pendiente}>
            Registrar gasto
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function GastosPage() {
  const { puede } = useRole();
  const [mes, setMes] = useState(`${hoyIso().slice(0, 7)}-01`);
  const { desde, hasta } = mesDe(mes);
  const gastos = useGastos(desde, hasta);
  const resumen = useResumenConsultorio(desde, hasta);
  const { hacer } = useHacer();
  const [nuevo, setNuevo] = useState(false);
  const [verAnulados, setVerAnulados] = useState(false);

  const anular = async (id: string) => {
    const motivo = window.prompt("¿Por qué se anula este gasto?");
    if (motivo && motivo.trim().length >= 3) await hacer(`/gastos/${id}/anular`, { motivo }, "Gasto anulado");
  };

  const r = resumen.data;
  const lista = (gastos.data?.gastos ?? []).filter((g) => verAnulados || !g.anuladoEn);

  return (
    <>
      <PageHeader
        title="Gastos y resultado"
        description="Lo que gasta el consultorio y cómo cierra el mes."
        actions={
          puede("cobranzas.cobrar") && (
            <Button onClick={() => setNuevo(true)}>
              <Plus className="size-4" /> Registrar gasto
            </Button>
          )
        }
      />
      <div className="mb-5 flex items-center gap-2">
        <Button variant="outline" size="icon-sm" onClick={() => setMes((m) => moverMes(m, -1))} aria-label="Mes anterior">
          <ChevronLeft className="size-4" />
        </Button>
        <div className="w-44 text-center font-medium" data-testid="mes-gastos">
          {nombreMes(mes)}
        </div>
        <Button variant="outline" size="icon-sm" onClick={() => setMes((m) => moverMes(m, 1))} aria-label="Mes siguiente">
          <ChevronRight className="size-4" />
        </Button>
      </div>
      {r && (
        <div className="mb-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-4" data-testid="resumen-mes">
          <KpiCard label="Cobrado a pacientes" value={formatMoneyShort(r.cobradoPacientes)} icon={Wallet} tone="success" hint={r.otrosIngresos ? `+ ${formatMoneyShort(r.otrosIngresos)} otros ingresos` : `${r.prestaciones} prestaciones realizadas`} />
          <KpiCard label="Gastos" value={formatMoneyShort(r.gastos)} icon={Wallet} tone={r.gastos ? "warning" : "default"} />
          <KpiCard label="Resultado del mes" value={formatMoneyShort(r.resultado)} icon={Wallet} tone={r.resultado >= 0 ? "highlight" : "danger"} hint="Lo cobrado menos lo gastado" />
          <KpiCard label="A liquidar a obras sociales" value={formatMoneyShort(r.aLiquidarObrasSociales)} icon={Wallet} hint="Prestaciones de afiliados del mes" />
        </div>
      )}
      <QueryState isLoading={gastos.isLoading} error={gastos.error} onRetry={gastos.refetch}>
        <div className="grid gap-6 lg:grid-cols-[1fr_280px]">
          <Card className="gap-0 overflow-hidden pb-0 shadow-none">
            <CardHeader className="flex flex-row items-center justify-between pb-3">
              <CardTitle>Gastos del mes</CardTitle>
              <label className="flex items-center gap-2 text-sm font-normal text-muted-foreground">
                <Switch checked={verAnulados} onCheckedChange={setVerAnulados} aria-label="Ver anulados" /> Ver anulados
              </label>
            </CardHeader>
            {lista.length === 0 ? (
              <div className="border-t py-10 text-center text-sm text-muted-foreground">No hay gastos este mes.</div>
            ) : (
              <div className="overflow-x-auto border-t">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Fecha</TableHead>
                      <TableHead>Detalle</TableHead>
                      <TableHead className="hidden md:table-cell">Medio</TableHead>
                      <TableHead className="text-right">Importe</TableHead>
                      <TableHead />
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {lista.map((g) => (
                      <TableRow key={g.id} className={cn(g.anuladoEn && "opacity-55")} data-testid="gasto">
                        <TableCell className="whitespace-nowrap">{formatDate(g.fecha)}</TableCell>
                        <TableCell>
                          <div className={cn(g.anuladoEn && "line-through")}>{g.descripcion}</div>
                          <div className="text-xs text-muted-foreground">
                            {g.categoria}
                            {g.proveedor && ` · ${g.proveedor}`}
                            {g.anuladoEn && ` · anulado: ${g.motivoAnulacion}`}
                          </div>
                        </TableCell>
                        <TableCell className="hidden md:table-cell">{g.medio}</TableCell>
                        <TableCell className="text-right tabular">{formatMoney(g.importe)}</TableCell>
                        <TableCell className="text-right">
                          {!g.anuladoEn && puede("cobranzas.anular") && (
                            <Button size="icon-sm" variant="ghost" onClick={() => anular(g.id)} aria-label={`Anular ${g.descripcion}`}>
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
          <Card className="h-fit gap-3 p-5 shadow-none">
            <div className="font-medium">Por categoría</div>
            {(gastos.data?.porCategoria ?? []).map((c) => (
              <div key={c.categoria} className="flex justify-between gap-2 text-sm">
                <span className="text-muted-foreground">{c.categoria}</span>
                <span className="tabular">{formatMoney(c.total)}</span>
              </div>
            ))}
            <div className="flex justify-between gap-2 border-t pt-3 font-semibold">
              <span>Total</span>
              <span className="tabular" data-testid="total-gastos">
                {formatMoney(gastos.data?.total ?? 0)}
              </span>
            </div>
          </Card>
        </div>
      </QueryState>
      <GastoDialog open={nuevo} onOpenChange={setNuevo} />
    </>
  );
}

// ---------------------------------------------------------------- liquidación a obras sociales

export function LiquidacionPage() {
  const { data: obras = [] } = useObrasSociales();
  const [obraId, setObraId] = useState("");
  const [mes, setMes] = useState(`${hoyIso().slice(0, 7)}-01`);
  const { desde, hasta } = mesDe(mes);
  const liq = useLiquidacion(obraId, desde, hasta);

  const exportar = async () => {
    if (!liq.data) return;
    const l = liq.data;
    await exportarReporte(`liquidacion-${l.obraSocial}-${mes.slice(0, 7)}`.replace(/\s+/g, "-").toLowerCase(), [
      {
        nombre: "Liquidación",
        filas: [
          ["Fecha", "Paciente", "DNI", "Plan", "N° afiliado", "Código", "Prestación", "Pieza", "Caras", "Profesional", "Importe obra social", "Coseguro paciente"],
          ...l.prestaciones.map((p) => [formatDate(p.fecha), p.paciente, p.dni ?? "", p.plan ?? "", p.numeroAfiliado ?? "", p.codigo, p.prestacion, p.pieza ?? "", p.caras.join(" "), p.profesional, p.importeObraSocial, p.importePaciente]),
          [],
          ["", "", "", "", "", "", "", "", "", "Total", l.total, ""],
        ],
      },
    ]);
  };

  return (
    <>
      <PageHeader
        title="Liquidación a obras sociales"
        description="Lo que hay que facturarle a cada obra social en el mes: las prestaciones realizadas a sus afiliados."
        actions={
          liq.data && liq.data.prestaciones.length > 0 && (
            <Button variant="outline" onClick={exportar}>
              <FileSpreadsheet className="size-4" /> Exportar a Excel
            </Button>
          )
        }
      />
      <div className="mb-5 flex flex-wrap items-end gap-3">
        <div className="grid gap-1.5">
          <Label htmlFor="liq-obra">Obra social</Label>
          <Select value={obraId} onValueChange={setObraId}>
            <SelectTrigger id="liq-obra" className="w-64">
              <SelectValue placeholder="Elegí la obra social" />
            </SelectTrigger>
            <SelectContent>
              {obras.map((o) => (
                <SelectItem key={o.id} value={o.id}>
                  {o.nombre}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="icon-sm" onClick={() => setMes((m) => moverMes(m, -1))} aria-label="Mes anterior">
            <ChevronLeft className="size-4" />
          </Button>
          <div className="w-40 text-center font-medium">{nombreMes(mes)}</div>
          <Button variant="outline" size="icon-sm" onClick={() => setMes((m) => moverMes(m, 1))} aria-label="Mes siguiente">
            <ChevronRight className="size-4" />
          </Button>
        </div>
      </div>
      {!obraId ? (
        <Card className="py-12 text-center text-sm text-muted-foreground shadow-none">Elegí una obra social para ver lo que hay que liquidarle.</Card>
      ) : (
        <QueryState isLoading={liq.isLoading} error={liq.error} onRetry={liq.refetch}>
          {liq.data && (
            <div className="grid gap-4">
              <div className="grid gap-4 sm:grid-cols-3">
                <KpiCard label="A facturarle" value={formatMoney(liq.data.total)} icon={Wallet} tone="highlight" />
                <KpiCard label="Prestaciones" value={String(liq.data.prestaciones.length)} icon={Wallet} />
                <KpiCard label="Afiliados atendidos" value={String(liq.data.pacientes)} icon={Wallet} />
              </div>
              <Card className="overflow-hidden p-0 shadow-none">
                {liq.data.prestaciones.length === 0 ? (
                  <div className="py-10 text-center text-sm text-muted-foreground">No hay prestaciones a afiliados de {liq.data.obraSocial} este mes.</div>
                ) : (
                  <div className="overflow-x-auto">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Fecha</TableHead>
                          <TableHead>Afiliado</TableHead>
                          <TableHead>Prestación</TableHead>
                          <TableHead className="hidden md:table-cell">Pieza</TableHead>
                          <TableHead className="text-right">Importe</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {liq.data.prestaciones.map((p) => (
                          <TableRow key={p.id} data-testid="fila-liquidacion">
                            <TableCell className="whitespace-nowrap">{formatDate(p.fecha)}</TableCell>
                            <TableCell>
                              <div>{p.paciente}</div>
                              <div className="text-xs text-muted-foreground">{[p.numeroAfiliado && `Afiliado ${p.numeroAfiliado}`, p.plan && `Plan ${p.plan}`].filter(Boolean).join(" · ") || "Sin n° de afiliado"}</div>
                            </TableCell>
                            <TableCell>
                              <span className="text-muted-foreground tabular">{p.codigo}</span> {p.prestacion}
                            </TableCell>
                            <TableCell className="hidden md:table-cell">{p.pieza ? `${p.pieza}${p.caras.length ? ` · ${p.caras.join(", ")}` : ""}` : "—"}</TableCell>
                            <TableCell className="text-right tabular">{formatMoney(p.importeObraSocial)}</TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                )}
              </Card>
            </div>
          )}
        </QueryState>
      )}
    </>
  );
}
