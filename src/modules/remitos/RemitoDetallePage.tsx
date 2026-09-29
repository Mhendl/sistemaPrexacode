import { useState } from "react";
import { ArrowLeft, Ban, Loader2, Printer } from "lucide-react";
import { Link, useParams } from "react-router";
import { toast } from "sonner";
import { ApiError } from "@/api/client";
import { useAnularRemito, useRemito } from "@/api/hooks";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { PaperFit } from "@/components/shared/PaperFit";
import { QueryState } from "@/components/shared/QueryState";
import { StatusBadge } from "@/components/shared/StatusBadge";
import { useRole } from "@/context/AuthProvider";
import { canAccess } from "@/lib/navigation";
import { numeroRemito, RemitoHoja } from "./RemitoHoja";

export function RemitoDetallePage() {
  const { id } = useParams();
  const { empresa, acceso, puede } = useRole();
  const { data: r, isLoading, error, refetch } = useRemito(id);
  const anular = useAnularRemito();
  const [confirmar, setConfirmar] = useState(false);
  const [motivo, setMotivo] = useState("");
  const [errorMotivo, setErrorMotivo] = useState("");
  const puedeAnular = puede("remitos.anular");

  const confirmarAnulacion = async () => {
    setErrorMotivo("");
    try {
      await anular.mutateAsync({ id: r!.id, motivo });
      toast.success("Remito anulado. El stock se devolvió.");
      setConfirmar(false);
    } catch (e) {
      if (!(e instanceof ApiError)) throw e;
      setErrorMotivo(e.details.motivo ?? e.message);
    }
  };

  return (
    <>
      <Button variant="ghost" size="sm" asChild className="mb-3 -ml-2 text-muted-foreground">
        <Link to="/remitos">
          <ArrowLeft className="size-4" /> Remitos
        </Link>
      </Button>
      <QueryState isLoading={isLoading} error={error} onRetry={refetch}>
        {r && (
          <>
            <div className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <h1 className="flex items-center gap-3 text-2xl font-semibold tracking-tight">
                  Remito {numeroRemito(r)} <StatusBadge status={r.estado} />
                </h1>
                {canAccess(acceso, "/clientes") ? (
                  <Link to={`/clientes/${r.cliente.id}`} className="text-sm text-muted-foreground hover:underline">
                    {r.cliente.razonSocial}
                  </Link>
                ) : (
                  <span className="text-sm text-muted-foreground">{r.cliente.razonSocial}</span>
                )}
              </div>
              <div className="flex flex-wrap gap-2">
                {puedeAnular && r.estado === "Emitido" && (
                  <Button variant="outline" onClick={() => { setMotivo(""); setErrorMotivo(""); setConfirmar(true); }}>
                    <Ban className="size-4" /> Anular
                  </Button>
                )}
                <Button onClick={() => window.print()}>
                  <Printer className="size-4" /> Imprimir / PDF
                </Button>
              </div>
            </div>

            <div className="zona-impresion rounded-xl bg-muted p-3 sm:p-6">
              <PaperFit>
                <RemitoHoja remito={r} empresa={empresa} />
              </PaperFit>
            </div>

            <Dialog open={confirmar} onOpenChange={setConfirmar}>
              <DialogContent className="sm:max-w-md">
                <DialogHeader>
                  <DialogTitle>¿Anular el remito {numeroRemito(r)}?</DialogTitle>
                  <DialogDescription>La mercadería vuelve al stock. El remito queda en el sistema marcado como anulado.</DialogDescription>
                </DialogHeader>
                <div className="grid gap-1.5">
                  <Label htmlFor="anular-motivo">Motivo</Label>
                  <Input id="anular-motivo" value={motivo} onChange={(e) => setMotivo(e.target.value)} placeholder="Ej.: el cliente rechazó la entrega" autoFocus />
                  {errorMotivo && <p className="text-xs text-destructive">{errorMotivo}</p>}
                </div>
                <DialogFooter>
                  <Button variant="outline" onClick={() => setConfirmar(false)}>
                    Cancelar
                  </Button>
                  <Button variant="destructive" onClick={confirmarAnulacion} disabled={anular.isPending}>
                    {anular.isPending && <Loader2 className="size-4 animate-spin" />}
                    Anular remito
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
          </>
        )}
      </QueryState>
    </>
  );
}
