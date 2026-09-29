import { useState } from "react";
import { FileText, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { useAceptarTerminos, useLegalEstado } from "@/api/hooks";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { useRole } from "@/context/AuthProvider";
import { formatDate } from "@/lib/format";

/**
 * Cuando se publican Términos nuevos, un administrador de la empresa tiene que aceptarlos para seguir.
 * Queda registrado quién, cuándo, desde qué IP y qué versión.
 */
export function AceptarTerminos() {
  const { esAdmin } = useRole();
  const { data } = useLegalEstado(esAdmin);
  const aceptar = useAceptarTerminos();
  const [marcado, setMarcado] = useState(false);
  if (!esAdmin || !data || data.aceptada) return null;

  return (
    <Dialog open>
      <DialogContent className="sm:max-w-md [&>button]:hidden" onEscapeKeyDown={(e) => e.preventDefault()} onPointerDownOutside={(e) => e.preventDefault()} data-testid="aceptar-terminos">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FileText className="size-5 text-primary" /> Actualizamos los Términos y Condiciones
          </DialogTitle>
          <DialogDescription>
            Hay una versión nueva (vigente desde el {formatDate(data.version)}). Para seguir usando el sistema, como administrador tenés que leerla y aceptarla en nombre de tu empresa.
          </DialogDescription>
        </DialogHeader>
        <div className="flex flex-wrap gap-3 text-sm">
          <a href="/terminos" target="_blank" rel="noopener noreferrer" className="text-primary hover:underline">
            Leer los Términos y Condiciones
          </a>
          <a href="/privacidad" target="_blank" rel="noopener noreferrer" className="text-primary hover:underline">
            Leer la Política de Privacidad
          </a>
        </div>
        <div className="flex items-start gap-2">
          <Checkbox id="acepto-terminos" checked={marcado} onCheckedChange={(v) => setMarcado(v === true)} className="mt-0.5" />
          <Label htmlFor="acepto-terminos" className="leading-snug font-normal">
            Leí y acepto los Términos y Condiciones y la Política de Privacidad en nombre de la empresa.
          </Label>
        </div>
        <DialogFooter>
          <Button
            disabled={!marcado || aceptar.isPending}
            onClick={async () => {
              try {
                await aceptar.mutateAsync();
                toast.success("Gracias. Quedó registrada la aceptación.");
              } catch {
                toast.error("No se pudo registrar. Probá de nuevo.");
              }
            }}
          >
            {aceptar.isPending && <Loader2 className="size-4 animate-spin" />}
            Aceptar y continuar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
