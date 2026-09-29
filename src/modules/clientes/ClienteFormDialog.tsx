import { useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { useQueryClient } from "@tanstack/react-query";
import { manejarErrorGuardado } from "@/api/errores";
import { useGuardarCliente } from "@/api/hooks";
import type { ClienteApi, ClienteInput } from "@/api/types";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { formatCuit } from "@/lib/format";
import { cn } from "@/lib/utils";
import type { CondicionIva } from "@/types";

const condiciones: CondicionIva[] = ["Responsable Inscripto", "Monotributista", "Exento", "Consumidor Final"];

const vacio: ClienteInput = {
  razonSocial: "",
  cuit: "",
  condicionIva: "" as CondicionIva,
  contacto: "",
  email: "",
  telefono: "",
  domicilio: "",
  localidad: "",
  rubro: "",
  notas: "",
};

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Si viene, el formulario edita ese cliente */
  cliente?: ClienteApi;
  onSaved?: (c: ClienteApi) => void;
}

export function ClienteFormDialog({ open, onOpenChange, cliente, onSaved }: Props) {
  const [datos, setDatos] = useState<ClienteInput>(vacio);
  const [errores, setErrores] = useState<Record<string, string>>({});
  const guardar = useGuardarCliente();
  const qc = useQueryClient();

  useEffect(() => {
    if (!open) return;
    setErrores({});
    setDatos(cliente ? { ...cliente, cuit: formatCuit(cliente.cuit) } : vacio);
  }, [open, cliente]);

  const set = (campo: keyof ClienteInput) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
    setDatos((d) => ({ ...d, [campo]: e.target.value }));

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrores({});
    try {
      const c = await guardar.mutateAsync({ id: cliente?.id, datos });
      toast.success(cliente ? "Cliente actualizado" : "Cliente creado");
      onOpenChange(false);
      onSaved?.(c);
    } catch (err) {
      if (manejarErrorGuardado(err, { setErrores, qc, recargar: ["clientes"] })) onOpenChange(false);
    }
  };

  const campo = (id: keyof ClienteInput, label: string, props: React.ComponentProps<typeof Input> = {}, className?: string) => (
    <div className={cn("grid gap-1.5", className)}>
      <Label htmlFor={`cli-${id}`}>{label}</Label>
      <Input id={`cli-${id}`} value={(datos[id] as string) ?? ""} onChange={set(id)} aria-invalid={!!errores[id]} {...props} />
      {errores[id] && <p className="text-xs text-destructive">{errores[id]}</p>}
    </div>
  );

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[92svh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>{cliente ? "Editar cliente" : "Nuevo cliente"}</DialogTitle>
          <DialogDescription>Los datos fiscales se usan para facturar. El CUIT se valida con su dígito verificador.</DialogDescription>
        </DialogHeader>
        <form onSubmit={submit} className="grid gap-4 sm:grid-cols-2" noValidate>
          {campo("razonSocial", "Razón social / Nombre", { autoFocus: true }, "sm:col-span-2")}
          {campo("cuit", "CUIT / CUIL", { placeholder: "30-12345678-9", inputMode: "numeric" })}
          <div className="grid gap-1.5">
            <Label htmlFor="cli-condicionIva">Condición frente al IVA</Label>
            <Select value={datos.condicionIva} onValueChange={(v) => setDatos((d) => ({ ...d, condicionIva: v as CondicionIva }))}>
              <SelectTrigger id="cli-condicionIva" className="w-full" aria-invalid={!!errores.condicionIva}>
                <SelectValue placeholder="Seleccionar" />
              </SelectTrigger>
              <SelectContent>
                {condiciones.map((c) => (
                  <SelectItem key={c} value={c}>
                    {c}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {errores.condicionIva && <p className="text-xs text-destructive">{errores.condicionIva}</p>}
          </div>
          {campo("contacto", "Contacto", { placeholder: "Nombre y apellido" })}
          {campo("telefono", "Teléfono / WhatsApp", { placeholder: "+54 11 1234-5678" })}
          {campo("email", "Email para enviar comprobantes", { type: "email" }, "sm:col-span-2")}
          {campo("domicilio", "Domicilio")}
          {campo("localidad", "Localidad")}
          {campo("rubro", "Rubro", { placeholder: "Ej.: Comercio minorista" })}
          {cliente && (
            <div className="grid gap-1.5">
              <Label htmlFor="cli-estado">Estado</Label>
              <Select value={datos.estado ?? "Activo"} onValueChange={(v) => setDatos((d) => ({ ...d, estado: v as "Activo" | "Inactivo" }))}>
                <SelectTrigger id="cli-estado" className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="Activo">Activo</SelectItem>
                  <SelectItem value="Inactivo">Inactivo</SelectItem>
                </SelectContent>
              </Select>
            </div>
          )}
          <div className="grid gap-1.5 sm:col-span-2">
            <Label htmlFor="cli-notas">Notas</Label>
            <Textarea id="cli-notas" rows={2} value={datos.notas ?? ""} onChange={set("notas")} />
          </div>
          <DialogFooter className="sm:col-span-2">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancelar
            </Button>
            <Button type="submit" disabled={guardar.isPending}>
              {guardar.isPending && <Loader2 className="size-4 animate-spin" />}
              Guardar cliente
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
