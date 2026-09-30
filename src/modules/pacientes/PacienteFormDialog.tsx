import { useEffect, useState } from "react";
import { Loader2, Plus } from "lucide-react";
import { toast } from "sonner";
import { useQueryClient } from "@tanstack/react-query";
import { manejarErrorGuardado } from "@/api/errores";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { useRole } from "@/context/AuthProvider";
import { cn } from "@/lib/utils";
import { useCrearObraSocial, useGuardarPaciente, useObrasSociales, type PacienteApi, type PacienteInput } from "./api";

const PARTICULAR = "particular";

const vacio: PacienteInput = {
  nombre: "",
  apellido: "",
  dni: "",
  fechaNacimiento: "",
  sexo: null,
  telefono: "",
  email: "",
  domicilio: "",
  localidad: "",
  obraSocialId: null,
  plan: "",
  numeroAfiliado: "",
  alergias: "",
  medicacion: "",
  antecedentes: "",
  intervenciones: "",
  notas: "",
};

const Grupo = ({ titulo, children }: { titulo: string; children: React.ReactNode }) => (
  <fieldset className="grid gap-4 sm:col-span-2 sm:grid-cols-2">
    <legend className="mb-1 text-xs font-semibold tracking-wide text-muted-foreground uppercase">{titulo}</legend>
    {children}
  </fieldset>
);

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Si viene, edita ese paciente */
  paciente?: PacienteApi;
  /** Datos para empezar (por ejemplo, el nombre escrito en el turno) */
  inicial?: Partial<PacienteInput>;
  onSaved?: (p: PacienteApi) => void;
}

export function PacienteFormDialog({ open, onOpenChange, paciente, inicial, onSaved }: Props) {
  const { puede } = useRole();
  const cargaSalud = puede("historia.editar");
  const [datos, setDatos] = useState<PacienteInput>(vacio);
  const [errores, setErrores] = useState<Record<string, string>>({});
  const [otraObra, setOtraObra] = useState<string | null>(null);
  const guardar = useGuardarPaciente();
  const { data: obras = [] } = useObrasSociales();
  const crearObra = useCrearObraSocial();
  const qc = useQueryClient();

  useEffect(() => {
    if (!open) return;
    setErrores({});
    setOtraObra(null);
    setDatos(paciente ? { ...vacio, ...paciente } : { ...vacio, ...inicial });
  }, [open, paciente, inicial]);

  const set = (campo: keyof PacienteInput) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => setDatos((d) => ({ ...d, [campo]: e.target.value }));

  const agregarObra = async () => {
    if (!otraObra?.trim()) return;
    try {
      const o = await crearObra.mutateAsync(otraObra.trim());
      setDatos((d) => ({ ...d, obraSocialId: o.id }));
      setOtraObra(null);
    } catch (err) {
      manejarErrorGuardado(err, { setErrores, qc, recargar: ["obras-sociales"] });
    }
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrores({});
    try {
      const p = await guardar.mutateAsync({ id: paciente?.id, datos: { ...datos, ...(paciente ? { version: paciente.version } : {}) } });
      toast.success(paciente ? "Paciente actualizado" : "Paciente cargado");
      onOpenChange(false);
      onSaved?.(p);
    } catch (err) {
      if (manejarErrorGuardado(err, { setErrores, qc, recargar: ["pacientes"] })) onOpenChange(false);
    }
  };

  const campo = (id: keyof PacienteInput, label: string, props: React.ComponentProps<typeof Input> = {}, className?: string) => (
    <div className={cn("grid gap-1.5", className)}>
      <Label htmlFor={`pac-${id}`}>{label}</Label>
      <Input id={`pac-${id}`} value={(datos[id] as string) ?? ""} onChange={set(id)} aria-invalid={!!errores[id]} {...props} />
      {errores[id] && <p className="text-xs text-destructive">{errores[id]}</p>}
    </div>
  );
  const area = (id: keyof PacienteInput, label: string, placeholder: string) => (
    <div className="grid gap-1.5">
      <Label htmlFor={`pac-${id}`}>{label}</Label>
      <Textarea id={`pac-${id}`} rows={2} value={(datos[id] as string) ?? ""} onChange={set(id)} placeholder={placeholder} />
    </div>
  );

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[92svh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>{paciente ? "Editar paciente" : "Nuevo paciente"}</DialogTitle>
          <DialogDescription>Con nombre y apellido alcanza para darle un turno; el resto se puede completar después.</DialogDescription>
        </DialogHeader>
        <form onSubmit={submit} className="grid gap-6 sm:grid-cols-2" noValidate>
          <Grupo titulo="Datos personales">
            {campo("nombre", "Nombre", { autoFocus: true })}
            {campo("apellido", "Apellido")}
            {campo("dni", "DNI", { inputMode: "numeric", placeholder: "28.456.789" })}
            {campo("fechaNacimiento", "Fecha de nacimiento", { type: "date" })}
            <div className="grid gap-1.5">
              <Label htmlFor="pac-sexo">Sexo</Label>
              <Select value={datos.sexo ?? "sin"} onValueChange={(v) => setDatos((d) => ({ ...d, sexo: v === "sin" ? null : (v as "F" | "M" | "X") }))}>
                <SelectTrigger id="pac-sexo" className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="sin">Sin indicar</SelectItem>
                  <SelectItem value="F">Femenino</SelectItem>
                  <SelectItem value="M">Masculino</SelectItem>
                  <SelectItem value="X">X</SelectItem>
                </SelectContent>
              </Select>
            </div>
            {paciente && (
              <div className="grid gap-1.5">
                <Label htmlFor="pac-estado">Estado</Label>
                <Select value={datos.estado ?? "Activo"} onValueChange={(v) => setDatos((d) => ({ ...d, estado: v as "Activo" | "Inactivo" }))}>
                  <SelectTrigger id="pac-estado" className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="Activo">Activo</SelectItem>
                    <SelectItem value="Inactivo">Inactivo</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            )}
          </Grupo>

          <Grupo titulo="Contacto">
            {campo("telefono", "Teléfono / WhatsApp", { placeholder: "11 5555-1234" })}
            {campo("email", "Email", { type: "email" })}
            {campo("domicilio", "Domicilio")}
            {campo("localidad", "Localidad")}
          </Grupo>

          <Grupo titulo="Cobertura">
            <div className="grid gap-1.5 sm:col-span-2">
              <Label htmlFor="pac-obra">Obra social o prepaga</Label>
              {otraObra === null ? (
                <div className="flex gap-2">
                  <Select value={datos.obraSocialId ?? PARTICULAR} onValueChange={(v) => setDatos((d) => ({ ...d, obraSocialId: v === PARTICULAR ? null : v }))}>
                    <SelectTrigger id="pac-obra" className="w-full" aria-invalid={!!errores.obraSocialId}>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value={PARTICULAR}>Particular (sin obra social)</SelectItem>
                      {obras
                        .filter((o) => o.activa || o.id === datos.obraSocialId)
                        .map((o) => (
                          <SelectItem key={o.id} value={o.id}>
                            {o.nombre}
                          </SelectItem>
                        ))}
                    </SelectContent>
                  </Select>
                  <Button type="button" variant="outline" onClick={() => setOtraObra("")}>
                    <Plus className="size-4" /> Otra
                  </Button>
                </div>
              ) : (
                <div className="flex gap-2">
                  <Input
                    id="pac-obra"
                    autoFocus
                    placeholder="Nombre de la obra social"
                    value={otraObra}
                    onChange={(e) => setOtraObra(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        e.preventDefault();
                        void agregarObra();
                      }
                    }}
                  />
                  <Button type="button" onClick={agregarObra} disabled={crearObra.isPending || !otraObra.trim()}>
                    Agregar
                  </Button>
                  <Button type="button" variant="ghost" onClick={() => setOtraObra(null)}>
                    Cancelar
                  </Button>
                </div>
              )}
              {errores.obraSocialId && <p className="text-xs text-destructive">{errores.obraSocialId}</p>}
            </div>
            {campo("plan", "Plan", { placeholder: "Ej.: 310" })}
            {campo("numeroAfiliado", "Número de afiliado")}
          </Grupo>

          {cargaSalud && (
            <Grupo titulo="Antecedentes de salud">
              {area("alergias", "Alergias", "Ej.: penicilina, látex")}
              {area("medicacion", "Medicación habitual", "Ej.: anticoagulantes")}
              {area("antecedentes", "Enfermedades y condiciones", "Ej.: diabetes, hipertensión, embarazo")}
              {area("intervenciones", "Intervenciones previas", "Cirugías, tratamientos anteriores")}
            </Grupo>
          )}

          <div className="grid gap-1.5 sm:col-span-2">
            <Label htmlFor="pac-notas">Notas administrativas</Label>
            <Textarea id="pac-notas" rows={2} value={datos.notas ?? ""} onChange={set("notas")} placeholder="Ej.: prefiere turnos a la tarde" />
          </div>

          <DialogFooter className="sm:col-span-2">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancelar
            </Button>
            <Button type="submit" disabled={guardar.isPending}>
              {guardar.isPending && <Loader2 className="size-4 animate-spin" />}
              Guardar paciente
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
