import { useState, type ReactNode } from "react";
import { ArrowLeft, CalendarPlus, ChevronDown, FileText, Loader2, Pencil, Trash2, UserMinus, UserPlus, Wallet } from "lucide-react";
import { Link, useNavigate, useParams } from "react-router";
import { toast } from "sonner";
import { ApiError } from "@/api/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { QueryState } from "@/components/shared/QueryState";
import { StatusBadge } from "@/components/shared/StatusBadge";
import { Si } from "@/context/AuthProvider";
import { formatCuit, formatDate, formatMoney } from "@/lib/format";
import { TIPOS_NOVEDAD, TIPOS_PAGO, useAccionEmpleado, useEmpleado } from "./api";
import { EmpleadoFormDialog } from "./EmpleadoFormDialog";
import { antiguedad, nombreMes } from "./EmpleadosPage";
import { PagoDialog } from "./PagoDialog";

const mensaje = (e: unknown) => (e instanceof ApiError ? e.message : "No se pudo completar");
const hoy = () => new Date(Date.now() - 3 * 3600_000).toISOString().slice(0, 10);

export function EmpleadoDetallePage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { data: e, isLoading, error, refetch } = useEmpleado(id);
  const accion = useAccionEmpleado();
  const [pago, setPago] = useState<(typeof TIPOS_PAGO)[number] | null>(null);
  const [editar, setEditar] = useState(false);
  const [novedad, setNovedad] = useState(false);
  const [baja, setBaja] = useState(false);

  const hacer = async (url: string, body: object | undefined, ok: string, metodo: "POST" | "DELETE" = "POST") => {
    try {
      await accion.mutateAsync({ url, body, metodo });
      toast.success(ok);
      return true;
    } catch (err) {
      toast.error(mensaje(err));
      return false;
    }
  };

  return (
    <>
      <Button variant="ghost" size="sm" asChild className="mb-3 -ml-2 text-muted-foreground">
        <Link to="/empleados">
          <ArrowLeft className="size-4" /> Empleados
        </Link>
      </Button>
      <QueryState isLoading={isLoading} error={error} onRetry={refetch}>
        {e && (
          <div className="grid gap-6">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
              <div className="min-w-0">
                <h1 className="flex flex-wrap items-center gap-3 text-2xl font-semibold tracking-tight">
                  <span className="[overflow-wrap:anywhere]">
                    {e.nombre} {e.apellido}
                  </span>
                  <StatusBadge status={e.estado === "Activo" ? "Activo" : "Baja"} />
                </h1>
                <p className="text-sm text-muted-foreground">
                  {e.puesto ?? "Sin puesto"} · ingresó el {formatDate(e.fechaIngreso)} ({antiguedad(e.fechaIngreso, e.fechaEgreso ?? undefined)})
                  {e.fechaEgreso && ` · baja el ${formatDate(e.fechaEgreso)}: ${e.motivoEgreso}`}
                </p>
              </div>
              <Si permiso="empleados.editar">
                <div className="flex flex-wrap gap-2">
                  {e.estado === "Activo" && (
                    <>
                      <Button onClick={() => setPago("Sueldo")}>
                        <Wallet className="size-4" /> Pagar sueldo
                      </Button>
                      <Button variant="outline" onClick={() => setPago("Adelanto")}>
                        Adelanto
                      </Button>
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="outline">
                            Otro pago <ChevronDown className="size-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          {TIPOS_PAGO.filter((t) => t !== "Sueldo" && t !== "Adelanto").map((t) => (
                            <DropdownMenuItem key={t} onClick={() => setPago(t)}>
                              {t}
                            </DropdownMenuItem>
                          ))}
                        </DropdownMenuContent>
                      </DropdownMenu>
                      <Button variant="outline" onClick={() => setNovedad(true)}>
                        <CalendarPlus className="size-4" /> Vacaciones o licencia
                      </Button>
                    </>
                  )}
                  <Button variant="outline" onClick={() => setEditar(true)}>
                    <Pencil className="size-4" /> Editar
                  </Button>
                  {e.estado === "Activo" ? (
                    <Button variant="outline" onClick={() => setBaja(true)}>
                      <UserMinus className="size-4" /> Dar de baja
                    </Button>
                  ) : (
                    <Button variant="outline" onClick={() => hacer(`/empleados/${e.id}/reactivar`, {}, "Empleado reactivado")}>
                      <UserPlus className="size-4" /> Reactivar
                    </Button>
                  )}
                </div>
              </Si>
            </div>

            <div className="grid gap-6 lg:grid-cols-3">
              <Card className="shadow-none">
                <CardHeader>
                  <CardTitle>Datos</CardTitle>
                </CardHeader>
                <CardContent className="grid gap-1.5 text-sm">
                  <Dato k="Sueldo">
                    <b>{formatMoney(e.sueldo)}</b> {e.modalidad === "Por hora" ? "por hora" : e.modalidad.toLowerCase()}
                  </Dato>
                  <Dato k="CUIL">{e.cuil ? formatCuit(e.cuil) : "—"}</Dato>
                  <Dato k="CBU / alias">{e.cbu ?? "—"}</Dato>
                  <Dato k="Teléfono">{e.telefono ?? "—"}</Dato>
                  <Dato k="Email">{e.email ?? "—"}</Dato>
                  <Dato k="Domicilio">{e.domicilio ?? "—"}</Dato>
                  <Dato k="Obra social">{e.obraSocial ?? "—"}</Dato>
                  {e.notas && <p className="mt-2 rounded-md bg-muted p-2 text-muted-foreground">{e.notas}</p>}
                </CardContent>
              </Card>

              <Card className="shadow-none" data-testid="vacaciones">
                <CardHeader>
                  <CardTitle>Vacaciones {e.vacaciones.anio}</CardTitle>
                </CardHeader>
                <CardContent className="grid gap-3 text-sm">
                  <div className="grid grid-cols-3 gap-2 text-center">
                    <Numero label="Le corresponden" valor={e.vacaciones.corresponden} />
                    <Numero label="Tomó" valor={e.vacaciones.tomadas} />
                    <Numero label="Le quedan" valor={e.vacaciones.quedan} />
                  </div>
                  <p className="text-xs text-muted-foreground">Días corridos según la antigüedad al 31/12 (Ley de Contrato de Trabajo).</p>
                  {e.novedades.length > 0 && (
                    <ul className="divide-y rounded-md border" data-testid="novedades">
                      {e.novedades.map((n) => (
                        <li key={n.id} className="flex items-center justify-between gap-2 px-3 py-2">
                          <span className="min-w-0">
                            <b>{n.tipo}</b> · {formatDate(n.desde)} al {formatDate(n.hasta)} ({n.dias} {n.dias === 1 ? "día" : "días"})
                            {n.nota && <span className="block text-xs text-muted-foreground">{n.nota}</span>}
                          </span>
                          <Si permiso="empleados.editar">
                            <Button variant="ghost" size="icon-sm" aria-label={`Borrar ${n.tipo.toLowerCase()} del ${formatDate(n.desde)}`} onClick={() => hacer(`/empleados/${e.id}/novedades/${n.id}`, undefined, "Novedad borrada", "DELETE")}>
                              <Trash2 className="size-4" />
                            </Button>
                          </Si>
                        </li>
                      ))}
                    </ul>
                  )}
                </CardContent>
              </Card>

              <Card className="gap-0 pb-0 shadow-none lg:row-span-2">
                <CardHeader className="pb-3">
                  <CardTitle>Pagos</CardTitle>
                </CardHeader>
                {e.pagos.length === 0 ? (
                  <CardContent className="pb-6 text-sm text-muted-foreground">Todavía no hay pagos.</CardContent>
                ) : (
                  <ul className="max-h-[32rem] divide-y overflow-y-auto border-t" data-testid="pagos-empleado">
                    {e.pagos.map((p) => (
                      <li key={p.id}>
                        <Link to={`/empleados/pagos/${p.id}`} className="flex items-center justify-between gap-2 px-6 py-2.5 text-sm hover:bg-muted/40">
                          <span className="min-w-0">
                            <b>{p.tipo}</b> · {nombreMes(p.periodo)}
                            <span className="block text-xs text-muted-foreground">
                              N° {p.numero} · {formatDate(p.fecha)} · {p.medio}
                            </span>
                          </span>
                          <span className="flex shrink-0 flex-col items-end gap-0.5">
                            <span className="tabular font-medium">{formatMoney(p.total)}</span>
                            {p.estado === "Anulado" && <StatusBadge status="Anulado" />}
                          </span>
                        </Link>
                      </li>
                    ))}
                  </ul>
                )}
              </Card>
            </div>

            {pago && <PagoDialog empleado={e} tipo={pago} open onOpenChange={(o) => !o && setPago(null)} onPagado={(p) => navigate(`/empleados/pagos/${p.id}`)} />}
            <EmpleadoFormDialog open={editar} onOpenChange={setEditar} empleado={e} />
            <NovedadDialog open={novedad} onOpenChange={setNovedad} alGuardar={(body) => hacer(`/empleados/${e.id}/novedades`, body, "Novedad registrada")} />
            <BajaDialog open={baja} onOpenChange={setBaja} alConfirmar={(body) => hacer(`/empleados/${e.id}/baja`, body, "Empleado dado de baja")} />
          </div>
        )}
      </QueryState>
    </>
  );
}

function Dato({ k, children }: { k: string; children: ReactNode }) {
  return (
    <div className="flex flex-wrap justify-between gap-x-3">
      <span className="text-muted-foreground">{k}</span>
      <span className="text-right [overflow-wrap:anywhere]">{children}</span>
    </div>
  );
}

function Numero({ label, valor }: { label: string; valor: number }) {
  return (
    <div className="rounded-lg border p-2">
      <div className="text-xl font-semibold">{valor}</div>
      <div className="text-[11px] text-muted-foreground">{label}</div>
    </div>
  );
}

function NovedadDialog({ open, onOpenChange, alGuardar }: { open: boolean; onOpenChange: (o: boolean) => void; alGuardar: (body: object) => Promise<boolean> }) {
  const [tipo, setTipo] = useState<string>("Vacaciones");
  const [desde, setDesde] = useState(hoy());
  const [hasta, setHasta] = useState(hoy());
  const [nota, setNota] = useState("");
  const [guardando, setGuardando] = useState(false);
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Vacaciones, licencia o ausencia</DialogTitle>
          <DialogDescription>Se cuentan días corridos, del primero al último inclusive.</DialogDescription>
        </DialogHeader>
        <div className="grid gap-4">
          <div className="grid gap-1.5">
            <Label htmlFor="nov-tipo">Tipo</Label>
            <Select value={tipo} onValueChange={setTipo}>
              <SelectTrigger id="nov-tipo" className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {TIPOS_NOVEDAD.map((t) => (
                  <SelectItem key={t} value={t}>
                    {t}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="grid gap-1.5">
              <Label htmlFor="nov-desde">Desde</Label>
              <Input id="nov-desde" type="date" value={desde} onChange={(e) => setDesde(e.target.value)} />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="nov-hasta">Hasta</Label>
              <Input id="nov-hasta" type="date" value={hasta} onChange={(e) => setHasta(e.target.value)} />
            </div>
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="nov-nota">Nota (opcional)</Label>
            <Input id="nov-nota" value={nota} onChange={(e) => setNota(e.target.value)} placeholder="Ej.: certificado médico presentado" />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          <Button
            disabled={guardando}
            onClick={async () => {
              setGuardando(true);
              if (await alGuardar({ tipo, desde, hasta, nota: nota || undefined })) {
                onOpenChange(false);
                setNota("");
              }
              setGuardando(false);
            }}
          >
            {guardando && <Loader2 className="size-4 animate-spin" />}
            Registrar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function BajaDialog({ open, onOpenChange, alConfirmar }: { open: boolean; onOpenChange: (o: boolean) => void; alConfirmar: (body: object) => Promise<boolean> }) {
  const [fecha, setFecha] = useState(hoy());
  const [motivo, setMotivo] = useState("");
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Dar de baja</DialogTitle>
          <DialogDescription>Queda en el historial con todos sus pagos. Si vuelve, se puede reactivar.</DialogDescription>
        </DialogHeader>
        <div className="grid gap-4">
          <div className="grid gap-1.5">
            <Label htmlFor="baja-fecha">Último día</Label>
            <Input id="baja-fecha" type="date" value={fecha} onChange={(e) => setFecha(e.target.value)} />
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="baja-motivo">Motivo</Label>
            <Input id="baja-motivo" value={motivo} onChange={(e) => setMotivo(e.target.value)} placeholder="Ej.: renuncia" />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          <Button variant="destructive" onClick={async () => (await alConfirmar({ fecha, motivo })) && onOpenChange(false)}>
            <FileText className="size-4" /> Confirmar baja
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
