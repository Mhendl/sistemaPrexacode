import { useEffect, useState } from "react";
import { Check, Copy, ExternalLink, Eye, Link2Off, Loader2, Mail, MessageCircle, Send } from "lucide-react";
import { Link } from "react-router";
import { toast } from "sonner";
import { ApiError } from "@/api/client";
import { useAnularEnlace, useCompartir, useEnviarDocumento } from "@/api/hooks";
import type { TipoDocumento } from "@/api/types";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { QueryState } from "@/components/shared/QueryState";
import { StatusBadge } from "@/components/shared/StatusBadge";
import { useRole } from "@/context/AuthProvider";
import { cn } from "@/lib/utils";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  tipo: TipoDocumento;
  id: string;
}

const fechaHora = (iso: string) => new Date(iso).toLocaleString("es-AR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });

/** Mandarle un documento al cliente: por email, por WhatsApp o copiando el link */
export function CompartirDialog({ open, onOpenChange, tipo, id }: Props) {
  const { puede } = useRole();
  const { data, isLoading, error, refetch } = useCompartir(tipo, id, open);
  const enviar = useEnviarDocumento();
  const anular = useAnularEnlace();
  const [para, setPara] = useState("");
  const [mensaje, setMensaje] = useState("");
  const [copiado, setCopiado] = useState(false);
  const [confirmarAnular, setConfirmarAnular] = useState(false);

  useEffect(() => {
    if (open && data) setPara((p) => p || data.email || "");
  }, [open, data]);
  useEffect(() => {
    if (!open) {
      setPara("");
      setMensaje("");
      setConfirmarAnular(false);
    }
  }, [open]);

  const copiar = async () => {
    try {
      await navigator.clipboard.writeText(data!.url);
      setCopiado(true);
      toast.success("Link copiado");
      setTimeout(() => setCopiado(false), 2000);
    } catch {
      toast.error("No se pudo copiar: seleccioná el link y copialo a mano");
    }
  };

  const mandar = async () => {
    try {
      const r = await enviar.mutateAsync({ tipo, id, para: para.trim(), mensaje: mensaje.trim() || null });
      if (r.estado === "Enviado") toast.success(`Enviado a ${para.trim()}`);
      else if (r.estado === "Simulado") toast.warning("Envío simulado", { description: "El servidor de correo de la plataforma todavía no está configurado. Podés usar tu propia casilla en Configuración → Email." });
      else toast.error("No se pudo enviar", { description: r.error ?? undefined, duration: 10_000 });
      if (r.estado !== "Error") setMensaje("");
    } catch (e) {
      toast.error(e instanceof ApiError ? (e.details?.para ?? e.message) : "No se pudo enviar");
    }
  };

  const anularLink = async () => {
    try {
      await anular.mutateAsync({ tipo, id });
      setConfirmarAnular(false);
      toast.success("Link anulado", { description: "El anterior ya no funciona. Este es uno nuevo." });
    } catch {
      toast.error("No se pudo anular el link");
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[92svh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Enviar al cliente</DialogTitle>
          <DialogDescription>{data ? `${data.titulo}. El cliente lo abre con el link, sin usuario, y lo puede guardar en PDF.` : "Preparando el link…"}</DialogDescription>
        </DialogHeader>
        <QueryState isLoading={isLoading} error={error} onRetry={refetch}>
          {data && (
            <div className="grid gap-5">
              <div className="grid gap-1.5">
                <Label htmlFor="comp-link">Link para el cliente</Label>
                <div className="flex gap-2">
                  <Input id="comp-link" readOnly value={data.url} onFocus={(e) => e.target.select()} className="font-mono text-xs" data-testid="link-publico" />
                  <Button type="button" variant="outline" size="icon" onClick={copiar} aria-label="Copiar link">
                    {copiado ? <Check className="size-4" /> : <Copy className="size-4" />}
                  </Button>
                  <Button type="button" variant="outline" size="icon" asChild>
                    <a href={data.url} target="_blank" rel="noopener noreferrer" aria-label="Abrir link">
                      <ExternalLink className="size-4" />
                    </a>
                  </Button>
                </div>
                <div className="flex items-center justify-between text-xs text-muted-foreground">
                  <span className="flex items-center gap-1" data-testid="vistas-link">
                    <Eye className="size-3.5" /> {data.vistas === 0 ? "Todavía no lo abrieron" : `Lo abrieron ${data.vistas} ${data.vistas === 1 ? "vez" : "veces"}`}
                  </span>
                  {confirmarAnular ? (
                    <span className="flex items-center gap-2">
                      ¿Anular el link?
                      <button type="button" className="font-medium text-destructive hover:underline" onClick={anularLink}>
                        Sí, anular
                      </button>
                      <button type="button" className="hover:underline" onClick={() => setConfirmarAnular(false)}>
                        No
                      </button>
                    </span>
                  ) : (
                    <button type="button" className="flex items-center gap-1 hover:text-destructive" onClick={() => setConfirmarAnular(true)}>
                      <Link2Off className="size-3.5" /> Anular link
                    </button>
                  )}
                </div>
              </div>

              <Button asChild className="bg-[#25D366] text-white hover:bg-[#1ebe5a]">
                <a href={data.whatsapp.url} target="_blank" rel="noopener noreferrer" data-testid="boton-whatsapp">
                  <MessageCircle className="size-4" /> Enviar por WhatsApp{data.whatsapp.telefono ? "" : " (elegís el contacto)"}
                </a>
              </Button>

              <form
                className="grid gap-3 rounded-lg border p-3"
                onSubmit={(e) => {
                  e.preventDefault();
                  mandar();
                }}
              >
                <div className="flex items-center gap-2 text-sm font-medium">
                  <Mail className="size-4 text-primary" /> Por email
                </div>
                <div className="grid gap-1.5">
                  <Label htmlFor="comp-para">Para</Label>
                  <Input id="comp-para" type="email" value={para} onChange={(e) => setPara(e.target.value)} placeholder="email@cliente.com" required />
                  {!data.email && <p className="text-xs text-muted-foreground">El cliente no tiene email cargado: si lo agregás en su ficha, aparece solo la próxima vez.</p>}
                </div>
                <div className="grid gap-1.5">
                  <Label htmlFor="comp-mensaje">Mensaje (opcional)</Label>
                  <Textarea id="comp-mensaje" rows={2} value={mensaje} onChange={(e) => setMensaje(e.target.value)} placeholder="Ej.: Cualquier consulta, estamos a disposición." />
                </div>
                <div className="flex items-center justify-between gap-2">
                  {puede("configuracion") ? (
                    <Link to="/configuracion?tab=email" className="text-xs text-muted-foreground hover:underline">
                      Configurar desde qué casilla sale
                    </Link>
                  ) : (
                    <span />
                  )}
                  <Button type="submit" disabled={enviar.isPending || !para.trim()}>
                    {enviar.isPending ? <Loader2 className="size-4 animate-spin" /> : <Send className="size-4" />}
                    Enviar email
                  </Button>
                </div>
              </form>

              {data.enviados.length > 0 && (
                <div className="grid gap-1.5" data-testid="historial-envios">
                  <div className="text-xs font-medium text-muted-foreground">Enviados</div>
                  <ul className="grid gap-1 text-xs">
                    {data.enviados.map((e) => (
                      <li key={e.id} className={cn("flex items-center justify-between gap-2 rounded-md bg-muted/50 px-2 py-1.5")}>
                        <span className="min-w-0 truncate">
                          {fechaHora(e.createdAt)} · {e.para}
                          {e.automatico && <span className="text-muted-foreground"> (automático)</span>}
                          {e.error && <span className="block truncate text-destructive">{e.error}</span>}
                        </span>
                        <StatusBadge status={e.estado} />
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          )}
        </QueryState>
      </DialogContent>
    </Dialog>
  );
}
