import { useState } from "react";
import { AlertTriangle, ArrowLeft, CalendarPlus, CreditCard, Mail, MapPin, Pencil, Phone, Trash2 } from "lucide-react";
import { Link, useNavigate, useParams, useSearchParams } from "react-router";
import { toast } from "sonner";
import { ApiError } from "@/api/client";
import { QueryState } from "@/components/shared/QueryState";
import { StatusBadge } from "@/components/shared/StatusBadge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Si, useRole } from "@/context/AuthProvider";
import { formatDate } from "@/lib/format";
import { nombreCompleto, useBorrarPaciente, usePaciente, useTurnosPaciente, type PacienteApi } from "./api";
import { Archivos, Evoluciones } from "./HistoriaClinica";
import { Odontograma } from "./Odontograma";
import { PacienteFormDialog } from "./PacienteFormDialog";
import { Consentimientos } from "@/modules/clinica/Consentimientos";
import { Periodontograma } from "@/modules/clinica/Periodontograma";
import { CuentaPaciente } from "@/modules/consultorio/CuentaPaciente";
import { PresupuestosPaciente } from "@/modules/consultorio/Presupuestos";
import { formatDni } from "./PacientesPage";

const SEXO = { F: "Femenino", M: "Masculino", X: "X" } as const;

function Dato({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="grid gap-0.5">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="text-sm whitespace-pre-wrap">{value || <span className="text-muted-foreground">—</span>}</div>
    </div>
  );
}

function Datos({ p }: { p: PacienteApi }) {
  return (
    <div className="grid gap-6 lg:grid-cols-2">
      <Card className="shadow-none">
        <CardHeader>
          <CardTitle>Datos personales y contacto</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-2">
          <Dato label="DNI" value={p.dni ? formatDni(p.dni) : null} />
          <Dato label="Fecha de nacimiento" value={p.fechaNacimiento ? `${formatDate(p.fechaNacimiento)} (${p.edad} años)` : null} />
          <Dato label="Sexo" value={p.sexo ? SEXO[p.sexo] : null} />
          <Dato label="Teléfono" value={p.telefono} />
          <Dato label="Email" value={p.email} />
          <Dato label="Domicilio" value={[p.domicilio, p.localidad].filter(Boolean).join(", ")} />
          {p.notas && (
            <div className="sm:col-span-2">
              <Dato label="Notas administrativas" value={p.notas} />
            </div>
          )}
        </CardContent>
      </Card>
      <div className="grid content-start gap-6">
        <Card className="shadow-none">
          <CardHeader>
            <CardTitle>Cobertura</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-4 sm:grid-cols-3">
            <Dato label="Obra social" value={p.obraSocial ?? "Particular"} />
            <Dato label="Plan" value={p.plan} />
            <Dato label="N° de afiliado" value={p.numeroAfiliado} />
          </CardContent>
        </Card>
        {p.veAntecedentes && (
          <Card className="shadow-none">
            <CardHeader>
              <CardTitle>Antecedentes de salud</CardTitle>
            </CardHeader>
            <CardContent className="grid gap-4 sm:grid-cols-2">
              <Dato label="Alergias" value={p.alergias} />
              <Dato label="Medicación habitual" value={p.medicacion} />
              <Dato label="Enfermedades y condiciones" value={p.antecedentes} />
              <Dato label="Intervenciones previas" value={p.intervenciones} />
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}

function Turnos({ pacienteId }: { pacienteId: string }) {
  const { data = [], isLoading, error, refetch } = useTurnosPaciente(pacienteId);
  return (
    <QueryState isLoading={isLoading} error={error} onRetry={refetch}>
      {data.length === 0 ? (
        <Card className="py-10 text-center text-sm text-muted-foreground shadow-none">Todavía no tuvo turnos.</Card>
      ) : (
        <Card className="overflow-hidden p-0 shadow-none">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Fecha</TableHead>
                <TableHead>Profesional</TableHead>
                <TableHead className="hidden sm:table-cell">Tipo</TableHead>
                <TableHead>Estado</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {data.map((t) => (
                <TableRow key={t.id}>
                  <TableCell>
                    <Link to={`/agenda?fecha=${t.fecha}&evento=${t.id}`} className="hover:underline">
                      {formatDate(t.fecha)} · {t.inicio}
                    </Link>
                  </TableCell>
                  <TableCell>{t.profesional}</TableCell>
                  <TableCell className="hidden sm:table-cell">{t.tipo ?? "—"}</TableCell>
                  <TableCell>
                    <StatusBadge status={t.estado} />
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Card>
      )}
    </QueryState>
  );
}

export function PacienteDetallePage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const { puede } = useRole();
  const { data: p, isLoading, error, refetch } = usePaciente(id);
  const borrar = useBorrarPaciente();
  const [editar, setEditar] = useState(false);
  const veHistoria = puede("historia.ver");
  const pestanas = ["datos", ...(veHistoria ? ["historia", "odontograma", "periodontograma", "consentimientos", "imagenes"] : []), ...(puede("presupuestos.ver") ? ["presupuestos"] : []), ...(puede("cobranzas.ver") ? ["cuenta"] : []), ...(puede("agenda.ver") ? ["turnos"] : [])];
  const tab = pestanas.includes(params.get("tab") ?? "") ? params.get("tab")! : veHistoria ? "historia" : "datos";

  const eliminar = async () => {
    if (!p || !window.confirm(`¿Borrar a ${nombreCompleto(p)}? Solo se puede si no tiene historia clínica ni turnos.`)) return;
    try {
      await borrar.mutateAsync(p.id);
      toast.success("Paciente borrado");
      navigate("/pacientes");
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : "No se pudo borrar", { duration: 8000 });
    }
  };

  return (
    <>
      <Button variant="ghost" size="sm" asChild className="mb-3 -ml-2 text-muted-foreground">
        <Link to="/pacientes">
          <ArrowLeft className="size-4" /> Pacientes
        </Link>
      </Button>
      <QueryState isLoading={isLoading} error={error} onRetry={refetch}>
        {p && (
          <>
            <div className="mb-5 flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
              <div className="flex items-start gap-4">
                <div className="flex size-14 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-primary to-highlight text-lg font-bold text-white">
                  {`${p.nombre[0] ?? ""}${p.apellido[0] ?? ""}`.toUpperCase()}
                </div>
                <div>
                  <h1 className="text-2xl font-semibold tracking-tight">{nombreCompleto(p)}</h1>
                  <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-muted-foreground">
                    {p.dni && <span className="tabular">DNI {formatDni(p.dni)}</span>}
                    {p.edad !== null && <span>{p.edad} años</span>}
                    <span className="flex items-center gap-1">
                      <CreditCard className="size-3.5" /> {p.obraSocial ? `${p.obraSocial}${p.plan ? ` ${p.plan}` : ""}` : "Particular"}
                    </span>
                    {p.telefono && (
                      <span className="flex items-center gap-1">
                        <Phone className="size-3.5" /> {p.telefono}
                      </span>
                    )}
                    {p.email && (
                      <span className="hidden items-center gap-1 md:flex">
                        <Mail className="size-3.5" /> {p.email}
                      </span>
                    )}
                    {p.localidad && (
                      <span className="hidden items-center gap-1 lg:flex">
                        <MapPin className="size-3.5" /> {p.localidad}
                      </span>
                    )}
                    <StatusBadge status={p.estado} />
                  </div>
                </div>
              </div>
              <div className="flex flex-wrap gap-2">
                <Si permiso="agenda.editar">
                  <Button variant="outline" asChild>
                    <Link to={`/agenda?paciente=${p.id}`}>
                      <CalendarPlus className="size-4" /> Dar turno
                    </Link>
                  </Button>
                </Si>
                <Si permiso="pacientes.editar">
                  <Button variant="outline" onClick={() => setEditar(true)}>
                    <Pencil className="size-4" /> Editar
                  </Button>
                  <Button variant="outline" size="icon" onClick={eliminar} aria-label="Borrar paciente">
                    <Trash2 className="size-4" />
                  </Button>
                </Si>
              </div>
            </div>

            {p.veAntecedentes && p.alergias && (
              <div className="mb-4 flex items-start gap-2 rounded-lg border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive" role="alert" data-testid="alerta-alergias">
                <AlertTriangle className="mt-0.5 size-4 shrink-0" />
                <span>
                  <b>Alergias:</b> {p.alergias}
                </span>
              </div>
            )}
            {p.datosPendientes && (
              <div className="mb-4 flex flex-wrap items-center justify-between gap-2 rounded-lg border border-warning/30 bg-warning/10 px-4 py-3 text-sm">
                <span>Se dio de alta rápido desde un turno: faltan el DNI y otros datos.</span>
                <Si permiso="pacientes.editar">
                  <Button size="sm" variant="outline" onClick={() => setEditar(true)}>
                    Completar datos
                  </Button>
                </Si>
              </div>
            )}

            <Tabs value={tab} onValueChange={(v) => setParams({ tab: v }, { replace: true })}>
              <TabsList className="mb-4 w-full justify-start overflow-x-auto sm:w-auto">
                {veHistoria && <TabsTrigger value="historia">Historia clínica</TabsTrigger>}
                {veHistoria && <TabsTrigger value="odontograma">Odontograma</TabsTrigger>}
                {veHistoria && <TabsTrigger value="periodontograma">Periodontograma</TabsTrigger>}
                {veHistoria && <TabsTrigger value="consentimientos">Consentimientos</TabsTrigger>}
                {veHistoria && <TabsTrigger value="imagenes">Imágenes</TabsTrigger>}
                {pestanas.includes("presupuestos") && <TabsTrigger value="presupuestos">Presupuestos</TabsTrigger>}
                {pestanas.includes("cuenta") && <TabsTrigger value="cuenta">Cuenta</TabsTrigger>}
                <TabsTrigger value="datos">Datos</TabsTrigger>
                {pestanas.includes("turnos") && <TabsTrigger value="turnos">Turnos</TabsTrigger>}
              </TabsList>
              <TabsContent value="datos">
                <Datos p={p} />
              </TabsContent>
              {veHistoria && (
                <>
                  <TabsContent value="historia">
                    <Evoluciones pacienteId={p.id} />
                  </TabsContent>
                  <TabsContent value="odontograma">
                    <Odontograma pacienteId={p.id} edad={p.edad} />
                  </TabsContent>
                  <TabsContent value="periodontograma">
                    <Periodontograma pacienteId={p.id} />
                  </TabsContent>
                  <TabsContent value="consentimientos">
                    <Consentimientos pacienteId={p.id} />
                  </TabsContent>
                  <TabsContent value="imagenes">
                    <Archivos pacienteId={p.id} />
                  </TabsContent>
                </>
              )}
              {pestanas.includes("presupuestos") && (
                <TabsContent value="presupuestos">
                  <PresupuestosPaciente paciente={p} />
                </TabsContent>
              )}
              {pestanas.includes("cuenta") && (
                <TabsContent value="cuenta">
                  <CuentaPaciente paciente={p} />
                </TabsContent>
              )}
              <TabsContent value="turnos">
                <Turnos pacienteId={p.id} />
              </TabsContent>
            </Tabs>
            <PacienteFormDialog open={editar} onOpenChange={setEditar} paciente={p} />
          </>
        )}
      </QueryState>
    </>
  );
}
