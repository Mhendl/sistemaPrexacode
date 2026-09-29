import { useState } from "react";
import { Loader2 } from "lucide-react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { api, ApiError } from "@/api/client";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

const SIN_CAMBIO = "__igual";

/** Cambiar rubro, localidad o estado a los clientes elegidos */
export function EditarClientesDialog({ open, onOpenChange, ids, alTerminar }: { open: boolean; onOpenChange: (o: boolean) => void; ids: string[]; alTerminar: () => void }) {
  const qc = useQueryClient();
  const [rubro, setRubro] = useState("");
  const [localidad, setLocalidad] = useState("");
  const [estado, setEstado] = useState(SIN_CAMBIO);
  const guardar = useMutation({
    mutationFn: (cambios: Record<string, unknown>) => api<{ actualizados: number }>("/clientes/masivo", { method: "POST", body: { ids, cambios } }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["clientes"] }),
  });
  const cambios: Record<string, unknown> = {};
  if (rubro.trim()) cambios.rubro = rubro.trim();
  if (localidad.trim()) cambios.localidad = localidad.trim();
  if (estado !== SIN_CAMBIO) cambios.estado = estado;
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Editar {ids.length} clientes</DialogTitle>
          <DialogDescription>Completá solo lo que quieras cambiar: el resto queda como está en cada cliente.</DialogDescription>
        </DialogHeader>
        <div className="grid gap-4">
          <div className="grid gap-1.5">
            <Label htmlFor="ec-rubro">Rubro</Label>
            <Input id="ec-rubro" value={rubro} onChange={(e) => setRubro(e.target.value)} placeholder="Sin cambios" />
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="ec-localidad">Localidad</Label>
            <Input id="ec-localidad" value={localidad} onChange={(e) => setLocalidad(e.target.value)} placeholder="Sin cambios" />
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="ec-estado">Estado</Label>
            <Select value={estado} onValueChange={setEstado}>
              <SelectTrigger id="ec-estado" className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={SIN_CAMBIO}>Sin cambios</SelectItem>
                <SelectItem value="Activo">Activos</SelectItem>
                <SelectItem value="Inactivo">Inactivos</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          <Button
            disabled={guardar.isPending || Object.keys(cambios).length === 0}
            onClick={async () => {
              try {
                const r = await guardar.mutateAsync(cambios);
                toast.success(`${r.actualizados} ${r.actualizados === 1 ? "cliente actualizado" : "clientes actualizados"}`);
                onOpenChange(false);
                alTerminar();
              } catch (e) {
                toast.error(e instanceof ApiError ? e.message : "No se pudo completar");
              }
            }}
          >
            {guardar.isPending && <Loader2 className="size-4 animate-spin" />}
            Aplicar a {ids.length}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
