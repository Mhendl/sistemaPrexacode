import { useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { ApiError } from "@/api/client";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { aNumero } from "@/lib/numeros";
import { MODALIDADES, useGuardarEmpleado, type EmpleadoApi } from "./api";

type Campos = Record<"nombre" | "apellido" | "cuil" | "puesto" | "fechaIngreso" | "sueldo" | "telefono" | "email" | "domicilio" | "cbu" | "obraSocial" | "notas", string>;

const vacio = (): Campos => ({ nombre: "", apellido: "", cuil: "", puesto: "", fechaIngreso: new Date().toISOString().slice(0, 10), sueldo: "", telefono: "", email: "", domicilio: "", cbu: "", obraSocial: "", notas: "" });

export function EmpleadoFormDialog({ open, onOpenChange, empleado, onGuardado }: { open: boolean; onOpenChange: (o: boolean) => void; empleado?: EmpleadoApi; onGuardado?: (e: EmpleadoApi) => void }) {
  const guardar = useGuardarEmpleado();
  const [d, setD] = useState<Campos>(vacio);
  const [modalidad, setModalidad] = useState<(typeof MODALIDADES)[number]>("Mensual");
  const [errores, setErrores] = useState<Record<string, string>>({});

  useEffect(() => {
    if (!open) return;
    setErrores({});
    if (empleado) {
      setD({
        nombre: empleado.nombre,
        apellido: empleado.apellido,
        cuil: empleado.cuil ?? "",
        puesto: empleado.puesto ?? "",
        fechaIngreso: empleado.fechaIngreso,
        sueldo: String(empleado.sueldo).replace(".", ","),
        telefono: empleado.telefono ?? "",
        email: empleado.email ?? "",
        domicilio: empleado.domicilio ?? "",
        cbu: empleado.cbu ?? "",
        obraSocial: empleado.obraSocial ?? "",
        notas: empleado.notas ?? "",
      });
      setModalidad(empleado.modalidad);
    } else {
      setD(vacio());
      setModalidad("Mensual");
    }
  }, [open, empleado]);

  const campo = (id: keyof Campos, label: string, extra: { type?: string; placeholder?: string; inputMode?: "decimal" | "numeric" } = {}) => (
    <div className="grid gap-1.5">
      <Label htmlFor={`emp-${id}`}>{label}</Label>
      <Input id={`emp-${id}`} value={d[id]} onChange={(e) => setD({ ...d, [id]: e.target.value })} aria-invalid={!!errores[id]} {...extra} />
      {errores[id] && <p className="text-xs text-destructive">{errores[id]}</p>}
    </div>
  );

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[92svh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>{empleado ? `Editar a ${empleado.nombre}` : "Nuevo empleado"}</DialogTitle>
          <DialogDescription>Solo nombre, apellido, ingreso y sueldo son obligatorios. El resto lo podés completar después.</DialogDescription>
        </DialogHeader>
        <form
          className="grid gap-4"
          noValidate
          onSubmit={async (e) => {
            e.preventDefault();
            setErrores({});
            const sueldo = aNumero(d.sueldo);
            if (!(sueldo >= 0)) return setErrores({ sueldo: "Poné el sueldo (solo números)" });
            try {
              const r = await guardar.mutateAsync({ ...d, sueldo, modalidad, id: empleado?.id, version: empleado?.version });
              toast.success(empleado ? "Datos actualizados" : "Empleado cargado");
              onOpenChange(false);
              onGuardado?.(r);
            } catch (err) {
              if (err instanceof ApiError) {
                setErrores(err.details ?? {});
                toast.error(err.message);
              } else throw err;
            }
          }}
        >
          <div className="grid gap-4 sm:grid-cols-2">
            {campo("nombre", "Nombre")}
            {campo("apellido", "Apellido")}
            {campo("cuil", "CUIL", { placeholder: "20-12345678-9" })}
            {campo("puesto", "Puesto", { placeholder: "Ej.: Vendedor, Cajera, Técnico" })}
            {campo("fechaIngreso", "Fecha de ingreso", { type: "date" })}
            <div className="grid gap-1.5">
              <Label htmlFor="emp-modalidad">Se le paga</Label>
              <Select value={modalidad} onValueChange={(v) => setModalidad(v as typeof modalidad)}>
                <SelectTrigger id="emp-modalidad" className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {MODALIDADES.map((m) => (
                    <SelectItem key={m} value={m}>
                      {m}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            {campo("sueldo", modalidad === "Por hora" ? "Valor de la hora" : "Sueldo básico", { inputMode: "decimal", placeholder: "Ej.: 850.000" })}
            {campo("cbu", "CBU o alias (para transferir)")}
            {campo("telefono", "Teléfono")}
            {campo("email", "Email", { type: "email" })}
            {campo("domicilio", "Domicilio")}
            {campo("obraSocial", "Obra social")}
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="emp-notas">Notas</Label>
            <Textarea id="emp-notas" rows={3} value={d.notas} onChange={(e) => setD({ ...d, notas: e.target.value })} placeholder="Ej.: talle de ropa, contacto de emergencia…" />
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancelar
            </Button>
            <Button type="submit" disabled={guardar.isPending}>
              {guardar.isPending && <Loader2 className="size-4 animate-spin" />}
              {empleado ? "Guardar" : "Cargar empleado"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
