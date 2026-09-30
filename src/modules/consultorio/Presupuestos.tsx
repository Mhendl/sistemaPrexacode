import { useEffect, useMemo, useState } from "react";
import { ArrowLeft, Check, FileText, Loader2, Plus, Printer, Stethoscope, Trash2, X } from "lucide-react";
import { Link, useNavigate, useParams } from "react-router";
import { toast } from "sonner";
import { ApiError } from "@/api/client";
import { DataTable, type Column } from "@/components/shared/DataTable";
import { PageHeader } from "@/components/shared/PageHeader";
import { PaperFit } from "@/components/shared/PaperFit";
import { QueryState } from "@/components/shared/QueryState";
import { StatusBadge } from "@/components/shared/StatusBadge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Textarea } from "@/components/ui/textarea";
import { useRole } from "@/context/AuthProvider";
import { formatDate, formatMoney } from "@/lib/format";
import { aNumero } from "@/lib/numeros";
import { cn } from "@/lib/utils";
import { CARAS, useOdontograma, usePaciente, usePrestaciones, type Cara, type PacienteApi } from "@/modules/pacientes/api";
import { PacienteSelector } from "@/modules/pacientes/PacienteSelector";
import { useAccionPresupuestoDental, useGuardarPresupuestoDental, usePrecios, usePresupuestoDental, usePresupuestosDentales, type PresupuestoDentalApi, type PresupuestoDentalFila } from "./api";
import { numeroDoc, PresupuestoDentalHoja } from "./Hojas";

interface Renglon {
  clave: number;
  prestacionId: string;
  pieza: string;
  caras: Cara[];
  odontogramaId: string | null;
  importe: string;
  descuento: string;
}

let secuencia = 0;
const nuevoRenglon = (x: Partial<Renglon> = {}): Renglon => ({ clave: ++secuencia, prestacionId: "", pieza: "", caras: [], odontogramaId: null, importe: "", descuento: "", ...x });

/** Armar o corregir un presupuesto: los precios salen de la lista de la obra social del paciente */
export function PresupuestoDialog({ open, onOpenChange, paciente: pacienteFijo, presupuesto, onSaved }: { open: boolean; onOpenChange: (o: boolean) => void; paciente?: PacienteApi; presupuesto?: PresupuestoDentalApi; onSaved?: (p: PresupuestoDentalApi) => void }) {
  const [pacienteId, setPacienteId] = useState<string | null>(pacienteFijo?.id ?? presupuesto?.pacienteId ?? null);
  const { data: paciente } = usePaciente(pacienteId ?? undefined);
  const { data: prestaciones = [] } = usePrestaciones();
  const lista = usePrecios(paciente?.obraSocialId ?? "particular");
  const particular = usePrecios("particular");
  const odontograma = useOdontograma(pacienteId ?? "");
  const guardar = useGuardarPresupuestoDental();
  const [renglones, setRenglones] = useState<Renglon[]>([nuevoRenglon()]);
  const [observaciones, setObservaciones] = useState("");
  const [errores, setErrores] = useState<Record<string, string>>({});

  useEffect(() => {
    if (!open) return;
    setErrores({});
    setPacienteId(pacienteFijo?.id ?? presupuesto?.pacienteId ?? null);
    setObservaciones(presupuesto?.observaciones ?? "");
    setRenglones(
      presupuesto
        ? presupuesto.items.map((i) =>
            nuevoRenglon({ prestacionId: i.prestacionId, pieza: i.pieza ? String(i.pieza) : "", caras: i.caras, odontogramaId: i.odontogramaId, importe: (i.descuento >= 100 ? 0 : i.importePaciente / (1 - i.descuento / 100)).toLocaleString("es-AR", { maximumFractionDigits: 2 }), descuento: i.descuento ? String(i.descuento) : "" }),
          )
        : [nuevoRenglon()],
    );
  }, [open]); // eslint-disable-line react-hooks/exhaustive-deps

  const precioDe = (id: string) => lista.data?.find((p) => p.id === id)?.precioPaciente ?? particular.data?.find((p) => p.id === id)?.precioPaciente ?? 0;
  const set = (clave: number, cambios: Partial<Renglon>) => setRenglones((rs) => rs.map((r) => (r.clave === clave ? { ...r, ...cambios } : r)));
  const subtotal = (r: Renglon) => {
    const n = aNumero(r.importe || "0");
    const d = aNumero(r.descuento || "0");
    return Number.isNaN(n) ? 0 : Math.round(n * (1 - (Number.isNaN(d) ? 0 : d) / 100) * 100) / 100;
  };
  const total = renglones.reduce((a, r) => a + (r.prestacionId ? subtotal(r) : 0), 0);

  // Lo pendiente del odontograma que todavía no está en el presupuesto
  const pendientes = (odontograma.data ?? []).filter((m) => !m.anuladoEn && m.estado === "a_realizar" && !renglones.some((r) => r.odontogramaId === m.id));
  const traerPendientes = () => {
    const nuevos = pendientes.map((m) => nuevoRenglon({ prestacionId: m.prestacionId, pieza: String(m.pieza), caras: m.caras, odontogramaId: m.id, importe: precioDe(m.prestacionId).toLocaleString("es-AR") }));
    setRenglones((rs) => [...rs.filter((r) => r.prestacionId), ...nuevos]);
  };

  const enviar = async () => {
    setErrores({});
    if (!pacienteId) return setErrores({ pacienteId: "Elegí el paciente" });
    const items = renglones
      .filter((r) => r.prestacionId)
      .map((r) => ({
        prestacionId: r.prestacionId,
        pieza: r.pieza ? Number(r.pieza) : null,
        caras: r.caras,
        odontogramaId: r.odontogramaId,
        importePaciente: aNumero(r.importe || "0"),
        descuento: r.descuento ? aNumero(r.descuento) : 0,
      }));
    try {
      const p = await guardar.mutateAsync({ id: presupuesto?.id, pacienteId, observaciones: observaciones.trim() || null, items });
      toast.success(presupuesto ? "Presupuesto actualizado" : `Presupuesto N° ${numeroDoc(p.numero)} creado`);
      onOpenChange(false);
      onSaved?.(p);
    } catch (e) {
      if (!(e instanceof ApiError)) throw e;
      setErrores(e.details);
      toast.error(e.message);
    }
  };

  const activas = prestaciones.filter((p) => p.activa);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[92svh] overflow-y-auto sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle>{presupuesto ? `Editar presupuesto N° ${numeroDoc(presupuesto.numero)}` : "Nuevo presupuesto"}</DialogTitle>
          <DialogDescription>
            {paciente ? `Precios de la lista ${paciente.obraSocial ?? "particular"}: podés cambiarlos o hacer un descuento en cada renglón.` : "Elegí el paciente para tomar los precios de su obra social."}
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-4">
          {!pacienteFijo && !presupuesto && (
            <div className="grid gap-1.5">
              <Label htmlFor="ev-paciente">Paciente</Label>
              <PacienteSelector value={pacienteId} onChange={(id) => setPacienteId(id)} invalido={!!errores.pacienteId} />
              {errores.pacienteId && <p className="text-xs text-destructive">{errores.pacienteId}</p>}
            </div>
          )}
          {pacienteId && pendientes.length > 0 && (
            <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-primary/30 bg-primary/5 px-3 py-2 text-sm">
              <span>
                Tiene {pendientes.length} {pendientes.length === 1 ? "prestación pendiente" : "prestaciones pendientes"} en el odontograma.
              </span>
              <Button size="sm" variant="outline" onClick={traerPendientes}>
                <Stethoscope className="size-4" /> Traer lo pendiente
              </Button>
            </div>
          )}

          <div className="grid gap-2">
            {renglones.map((r, i) => {
              const p = activas.find((x) => x.id === r.prestacionId);
              return (
                <div key={r.clave} className="grid gap-2 rounded-lg border p-3 md:grid-cols-[1.6fr_80px_1fr_110px_70px_32px] md:items-start" data-testid="renglon-presupuesto">
                  <Select value={r.prestacionId} onValueChange={(v) => set(r.clave, { prestacionId: v, importe: precioDe(v).toLocaleString("es-AR"), caras: [], pieza: activas.find((x) => x.id === v)?.alcance === "general" ? "" : r.pieza })}>
                    <SelectTrigger className="w-full" aria-label={`Prestación del renglón ${i + 1}`} aria-invalid={!!errores[`items.${i}.prestacionId`]}>
                      <SelectValue placeholder="Prestación" />
                    </SelectTrigger>
                    <SelectContent>
                      {activas.map((x) => (
                        <SelectItem key={x.id} value={x.id}>
                          {x.codigo} · {x.nombre}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Input placeholder="Pieza" inputMode="numeric" value={r.pieza} onChange={(e) => set(r.clave, { pieza: e.target.value.replace(/\D/g, "").slice(0, 2) })} disabled={!p || p.alcance === "general"} aria-label={`Pieza del renglón ${i + 1}`} aria-invalid={!!errores[`items.${i}.pieza`]} />
                  <div className="flex flex-wrap gap-1" role="group" aria-label={`Caras del renglón ${i + 1}`}>
                    {p?.alcance === "cara" ? (
                      CARAS.map((c) => (
                        <button
                          key={c}
                          type="button"
                          aria-pressed={r.caras.includes(c)}
                          onClick={() => set(r.clave, { caras: r.caras.includes(c) ? r.caras.filter((x) => x !== c) : [...r.caras, c] })}
                          className={cn("h-8 w-8 rounded-md border text-xs font-medium", r.caras.includes(c) ? "border-primary bg-primary text-primary-foreground" : "hover:bg-accent")}
                        >
                          {c}
                        </button>
                      ))
                    ) : (
                      <span className="self-center text-xs text-muted-foreground">{p ? (p.alcance === "pieza" ? "Toda la pieza" : "Sin pieza") : ""}</span>
                    )}
                  </div>
                  <Input className="text-right tabular" inputMode="decimal" placeholder="Precio" value={r.importe} onChange={(e) => set(r.clave, { importe: e.target.value })} aria-label={`Precio del renglón ${i + 1}`} />
                  <Input className="text-right tabular" inputMode="decimal" placeholder="% bonif." value={r.descuento} onChange={(e) => set(r.clave, { descuento: e.target.value })} aria-label={`Bonificación del renglón ${i + 1}`} />
                  <Button size="icon-sm" variant="ghost" onClick={() => setRenglones((rs) => (rs.length > 1 ? rs.filter((x) => x.clave !== r.clave) : [nuevoRenglon()]))} aria-label={`Quitar renglón ${i + 1}`}>
                    <X className="size-4" />
                  </Button>
                  {(errores[`items.${i}.pieza`] || errores[`items.${i}.prestacionId`]) && <p className="text-xs text-destructive md:col-span-6">{errores[`items.${i}.pieza`] ?? errores[`items.${i}.prestacionId`]}</p>}
                </div>
              );
            })}
            <Button variant="outline" className="justify-self-start" onClick={() => setRenglones((rs) => [...rs, nuevoRenglon()])}>
              <Plus className="size-4" /> Agregar prestación
            </Button>
          </div>

          <div className="grid gap-1.5">
            <Label htmlFor="pres-obs">Observaciones</Label>
            <Textarea id="pres-obs" rows={2} value={observaciones} onChange={(e) => setObservaciones(e.target.value)} placeholder="Ej.: se puede pagar en 3 cuotas" />
          </div>
          <div className="flex items-center justify-end gap-4 text-lg">
            <span className="text-muted-foreground">Total a cargo del paciente</span>
            <b className="tabular" data-testid="total-presupuesto-form">
              {formatMoney(total)}
            </b>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          <Button onClick={enviar} disabled={guardar.isPending}>
            {guardar.isPending && <Loader2 className="size-4 animate-spin" />}
            Guardar presupuesto
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

const estadoVisible = (p: Pick<PresupuestoDentalFila, "estado" | "vencido">) => (p.vencido ? "Vencido" : p.estado);

const columnas = (conPaciente: boolean): Column<PresupuestoDentalFila>[] => [
  { key: "numero", header: "N°", sortValue: (p) => p.numero, cell: (p) => <span className="tabular">{numeroDoc(p.numero)}</span> },
  { key: "fecha", header: "Fecha", sortValue: (p) => p.fecha, cell: (p) => formatDate(p.fecha), hideBelow: "sm" },
  ...(conPaciente ? [{ key: "paciente", header: "Paciente", sortValue: (p: PresupuestoDentalFila) => p.paciente, cell: (p: PresupuestoDentalFila) => p.paciente }] : []),
  { key: "profesional", header: "Profesional", cell: (p) => p.profesional, hideBelow: "lg" },
  { key: "estado", header: "Estado", cell: (p) => <StatusBadge status={estadoVisible(p)} /> },
  { key: "total", header: "Total", sortValue: (p) => p.total, cell: (p) => <span className="tabular">{formatMoney(p.total)}</span>, align: "right" },
];

/** Presupuestos de un paciente (pestaña de su ficha) */
export function PresupuestosPaciente({ paciente }: { paciente: PacienteApi }) {
  const { puede } = useRole();
  const navigate = useNavigate();
  const { data = [], isLoading, error, refetch } = usePresupuestosDentales(paciente.id);
  const [nuevo, setNuevo] = useState(false);
  return (
    <div className="grid gap-4">
      {puede("presupuestos.editar") && (
        <div className="flex justify-end">
          <Button onClick={() => setNuevo(true)}>
            <Plus className="size-4" /> Nuevo presupuesto
          </Button>
        </div>
      )}
      <QueryState isLoading={isLoading} error={error} onRetry={refetch}>
        {data.length === 0 ? (
          <Card className="py-10 text-center text-sm text-muted-foreground shadow-none">Todavía no tiene presupuestos.</Card>
        ) : (
          <DataTable data={data} columns={columnas(false)} rowKey={(p) => p.id} searchText={(p) => `${numeroDoc(p.numero)} ${p.profesional}`} searchPlaceholder="Buscar por número…" onRowClick={(p) => navigate(`/presupuestos/${p.id}`)} />
        )}
      </QueryState>
      <PresupuestoDialog open={nuevo} onOpenChange={setNuevo} paciente={paciente} onSaved={(p) => navigate(`/presupuestos/${p.id}`)} />
    </div>
  );
}

/** Todos los presupuestos del consultorio */
export function PresupuestosDentalesPage() {
  const navigate = useNavigate();
  const { puede } = useRole();
  const { data, isLoading, error, refetch } = usePresupuestosDentales();
  const [nuevo, setNuevo] = useState(false);
  return (
    <>
      <PageHeader
        title="Presupuestos"
        description="Los tratamientos propuestos a cada paciente, con el precio de su obra social."
        actions={
          puede("presupuestos.editar") && (
            <Button onClick={() => setNuevo(true)}>
              <Plus className="size-4" /> Nuevo presupuesto
            </Button>
          )
        }
      />
      <QueryState isLoading={isLoading} error={error} onRetry={refetch}>
        {data && data.length === 0 ? (
          <Card className="items-center gap-3 py-16 text-center shadow-none">
            <div className="flex size-12 items-center justify-center rounded-full bg-primary/10 text-primary">
              <FileText className="size-6" />
            </div>
            <div className="text-lg font-semibold">Todavía no hay presupuestos</div>
            <p className="max-w-sm text-sm text-muted-foreground">Armalos desde acá o desde la ficha del paciente: con lo pendiente del odontograma se arman solos.</p>
          </Card>
        ) : (
          <DataTable
            data={data ?? []}
            columns={columnas(true)}
            rowKey={(p) => p.id}
            searchText={(p) => `${numeroDoc(p.numero)} ${p.paciente} ${p.profesional}`}
            searchPlaceholder="Buscar por número o paciente…"
            filters={[{ key: "estado", label: "Estado", options: ["Pendiente", "Aceptado", "Rechazado", "Vencido"], value: (p) => estadoVisible(p) }]}
            onRowClick={(p) => navigate(`/presupuestos/${p.id}`)}
            pageSize={25}
          />
        )}
      </QueryState>
      <PresupuestoDialog open={nuevo} onOpenChange={setNuevo} onSaved={(p) => navigate(`/presupuestos/${p.id}`)} />
    </>
  );
}

/** Detalle: aceptar o rechazar, ir realizando cada renglón, imprimir */
export function PresupuestoDentalPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { empresa, puede } = useRole();
  const { data: p, isLoading, error, refetch } = usePresupuestoDental(id);
  const accion = useAccionPresupuestoDental();
  const [editar, setEditar] = useState(false);

  const hacer = async (url: string, exito: string, body?: object, metodo: "POST" | "DELETE" = "POST") => {
    try {
      await accion.mutateAsync({ url, body, metodo });
      toast.success(exito);
      return true;
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : "No se pudo", { duration: 8000 });
      return false;
    }
  };

  const pendientes = useMemo(() => (p?.items ?? []).filter((i) => !i.realizado).length, [p]);

  return (
    <>
      <Button variant="ghost" size="sm" asChild className="mb-3 -ml-2 text-muted-foreground print:hidden">
        <Link to={p ? `/pacientes/${p.pacienteId}?tab=presupuestos` : "/presupuestos"}>
          <ArrowLeft className="size-4" /> {p ? p.paciente : "Presupuestos"}
        </Link>
      </Button>
      <QueryState isLoading={isLoading} error={error} onRetry={refetch}>
        {p && (
          <>
            <div className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between print:hidden">
              <div>
                <h1 className="flex flex-wrap items-center gap-3 text-2xl font-semibold tracking-tight">
                  Presupuesto N° {numeroDoc(p.numero)} <StatusBadge status={estadoVisible(p)} />
                </h1>
                <p className="text-sm text-muted-foreground">
                  {p.realizados} de {p.items.length} prestaciones realizadas · válido hasta el {formatDate(p.validoHasta)}
                </p>
              </div>
              <div className="flex flex-wrap gap-2">
                {puede("presupuestos.editar") && p.estado === "Pendiente" && (
                  <>
                    <Button variant="outline" onClick={() => setEditar(true)}>
                      Editar
                    </Button>
                    <Button variant="outline" onClick={() => hacer(`/${p.id}/estado`, "Presupuesto rechazado", { estado: "Rechazado" })}>
                      <X className="size-4" /> Rechazado
                    </Button>
                    <Button onClick={() => hacer(`/${p.id}/estado`, "Presupuesto aceptado", { estado: "Aceptado" })}>
                      <Check className="size-4" /> Aceptado
                    </Button>
                  </>
                )}
                {puede("presupuestos.editar") && p.realizados === 0 && p.estado !== "Pendiente" && (
                  <Button variant="outline" onClick={() => hacer(`/${p.id}/estado`, "Volvió a pendiente", { estado: "Pendiente" })}>
                    Volver a pendiente
                  </Button>
                )}
                {puede("presupuestos.editar") && p.realizados === 0 && (
                  <Button
                    variant="outline"
                    size="icon"
                    aria-label="Eliminar presupuesto"
                    onClick={async () => {
                      if (window.confirm("¿Eliminar este presupuesto?") && (await hacer(`/${p.id}`, "Presupuesto eliminado", undefined, "DELETE"))) navigate(`/pacientes/${p.pacienteId}?tab=presupuestos`);
                    }}
                  >
                    <Trash2 className="size-4" />
                  </Button>
                )}
                <Button variant="outline" onClick={() => window.print()}>
                  <Printer className="size-4" /> Imprimir / PDF
                </Button>
              </div>
            </div>

            {p.estado === "Aceptado" && (
              <Card className="mb-6 gap-0 overflow-hidden p-0 shadow-none print:hidden">
                <div className="border-b px-4 py-3 font-medium">
                  Tratamiento {pendientes ? `· faltan ${pendientes}` : "· completo"}
                </div>
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Prestación</TableHead>
                        <TableHead>Pieza</TableHead>
                        <TableHead className="text-right">Paciente</TableHead>
                        <TableHead />
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {p.items.map((i) => (
                        <TableRow key={i.id} data-testid="item-tratamiento">
                          <TableCell>{i.prestacion}</TableCell>
                          <TableCell>{i.pieza ? `${i.pieza}${i.caras.length ? ` · ${i.caras.join(", ")}` : ""}` : "—"}</TableCell>
                          <TableCell className="text-right tabular">{formatMoney(i.importePaciente)}</TableCell>
                          <TableCell className="text-right">
                            {i.realizado ? (
                              <span className="inline-flex items-center gap-1 text-sm text-success">
                                <Check className="size-4" /> Realizado
                              </span>
                            ) : (
                              puede("historia.editar") && (
                                <Button size="sm" variant="outline" onClick={() => hacer(`/${p.id}/items/${i.id}/realizar`, `${i.prestacion}: realizado y cargado a la cuenta`)} disabled={accion.isPending}>
                                  <Check className="size-4" /> Realizado
                                </Button>
                              )
                            )}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              </Card>
            )}

            <div className="zona-impresion rounded-xl bg-muted p-3 sm:p-5">
              <PaperFit>
                <PresupuestoDentalHoja p={p} empresa={empresa} />
              </PaperFit>
            </div>
            <PresupuestoDialog open={editar} onOpenChange={setEditar} presupuesto={p} />
          </>
        )}
      </QueryState>
    </>
  );
}
