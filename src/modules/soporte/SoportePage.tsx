import { useState } from "react";
import { ArrowLeft, CheckCircle2, LifeBuoy, Loader2, MessageSquarePlus } from "lucide-react";
import { Link, useNavigate, useParams } from "react-router";
import { toast } from "sonner";
import { ApiError } from "@/api/client";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { PageHeader } from "@/components/shared/PageHeader";
import { QueryState } from "@/components/shared/QueryState";
import { StatusBadge } from "@/components/shared/StatusBadge";
import { CATEGORIAS_TICKET, useCerrarTicket, useCrearTicket, useResponderTicket, useTicket, useTickets } from "./api";
import { Conversacion, Responder } from "./Conversacion";

const fecha = (iso: string) => new Date(iso).toLocaleString("es-AR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });
const mensaje = (e: unknown, def: string) => (e instanceof ApiError ? e.message : def);

/** Soporte: pedidos de la empresa al equipo de Prexacode */
export function SoportePage() {
  const { data = [], isLoading, error, refetch } = useTickets();
  const [nuevo, setNuevo] = useState(false);
  const navigate = useNavigate();
  return (
    <>
      <PageHeader
        title="Soporte"
        description="¿Algo no anda o tenés una duda? Escribinos y te respondemos por acá (y por email)."
        actions={
          <Button onClick={() => setNuevo(true)}>
            <MessageSquarePlus className="size-4" /> Nuevo pedido
          </Button>
        }
      />
      <QueryState isLoading={isLoading} error={error} onRetry={refetch}>
        {data.length === 0 ? (
          <Card className="items-center gap-3 p-10 text-center shadow-none">
            <LifeBuoy className="size-8 text-primary" />
            <p className="text-sm text-muted-foreground">Todavía no hiciste ningún pedido. Si algo no funciona como esperás, contanos.</p>
            <Button variant="outline" onClick={() => setNuevo(true)}>
              Escribirnos
            </Button>
          </Card>
        ) : (
          <div className="grid gap-2" data-testid="lista-tickets">
            {data.map((t) => (
              <Link key={t.id} to={`/soporte/${t.id}`} className="block">
                <Card className="gap-1 p-4 shadow-none transition-colors hover:bg-muted/40" data-testid="ticket">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="flex min-w-0 flex-wrap items-center gap-2">
                      <span className="font-mono text-xs text-muted-foreground">#{t.numero}</span>
                      <span className="font-medium [overflow-wrap:anywhere]">{t.asunto}</span>
                      {t.sinLeerCliente && <span className="rounded-full bg-primary px-2 py-0.5 text-[11px] font-semibold text-primary-foreground">Nueva respuesta</span>}
                    </div>
                    <StatusBadge status={t.estado} />
                  </div>
                  <div className="text-xs text-muted-foreground">
                    {t.categoria} · {t.mensajes} {t.mensajes === 1 ? "mensaje" : "mensajes"}
                    {t.usuario && ` · ${t.usuario}`} · actualizado {fecha(t.updatedAt)}
                  </div>
                </Card>
              </Link>
            ))}
          </div>
        )}
      </QueryState>
      <NuevoTicket open={nuevo} onOpenChange={setNuevo} onCreado={(id) => navigate(`/soporte/${id}`)} />
    </>
  );
}

function NuevoTicket({ open, onOpenChange, onCreado }: { open: boolean; onOpenChange: (o: boolean) => void; onCreado: (id: string) => void }) {
  const crear = useCrearTicket();
  const vacio = { asunto: "", categoria: "Problema", mensaje: "" };
  const [d, setD] = useState(vacio);
  const [errores, setErrores] = useState<Record<string, string>>({});
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Nuevo pedido de ayuda</DialogTitle>
          <DialogDescription>Contanos qué pasa con el mayor detalle posible: en qué pantalla estabas, qué hiciste y qué esperabas que pasara.</DialogDescription>
        </DialogHeader>
        <form
          className="grid gap-4"
          noValidate
          onSubmit={async (e) => {
            e.preventDefault();
            setErrores({});
            try {
              const t = await crear.mutateAsync(d);
              toast.success(`Pedido #${t.numero} enviado`, { description: "Te avisamos cuando respondamos." });
              setD(vacio);
              onOpenChange(false);
              onCreado(t.id);
            } catch (err) {
              if (err instanceof ApiError) setErrores(err.details ?? {});
              toast.error(mensaje(err, "No se pudo enviar"));
            }
          }}
        >
          <div className="grid gap-1.5">
            <Label htmlFor="tk-tipo">Tipo</Label>
            <Select value={d.categoria} onValueChange={(v) => setD({ ...d, categoria: v })}>
              <SelectTrigger id="tk-tipo" className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {CATEGORIAS_TICKET.map((c) => (
                  <SelectItem key={c} value={c}>
                    {c}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="tk-asunto">Asunto</Label>
            <Input id="tk-asunto" value={d.asunto} onChange={(e) => setD({ ...d, asunto: e.target.value })} placeholder="Ej.: No me deja emitir una factura B" aria-invalid={!!errores.asunto} />
            {errores.asunto && <p className="text-xs text-destructive">{errores.asunto}</p>}
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="tk-mensaje">Contanos qué pasa</Label>
            <Textarea id="tk-mensaje" rows={6} value={d.mensaje} onChange={(e) => setD({ ...d, mensaje: e.target.value })} aria-invalid={!!errores.mensaje} />
            {errores.mensaje && <p className="text-xs text-destructive">{errores.mensaje}</p>}
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancelar
            </Button>
            <Button type="submit" disabled={crear.isPending}>
              {crear.isPending && <Loader2 className="size-4 animate-spin" />}
              Enviar pedido
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export function TicketPage() {
  const { id } = useParams();
  const { data: t, isLoading, error, refetch } = useTicket(id);
  const responder = useResponderTicket(id!);
  const cerrar = useCerrarTicket(id!);
  return (
    <>
      <Button variant="ghost" size="sm" asChild className="mb-3 -ml-2 text-muted-foreground">
        <Link to="/soporte">
          <ArrowLeft className="size-4" /> Soporte
        </Link>
      </Button>
      <QueryState isLoading={isLoading} error={error} onRetry={refetch}>
        {t && (
          <div className="mx-auto grid max-w-3xl gap-5">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="min-w-0">
                <h1 className="text-2xl font-semibold tracking-tight [overflow-wrap:anywhere]">
                  <span className="font-mono text-lg text-muted-foreground">#{t.numero}</span> {t.asunto}
                </h1>
                <p className="text-sm text-muted-foreground">{t.categoria}</p>
              </div>
              <StatusBadge status={t.estado} />
            </div>
            <Conversacion mensajes={t.mensajes} yo="cliente" />
            <Responder
              enviando={responder.isPending}
              placeholder={t.estado === "Cerrado" ? "Si volvió a pasar, escribinos y se reabre" : "Escribí tu respuesta"}
              onEnviar={async (texto) => {
                try {
                  await responder.mutateAsync(texto);
                  toast.success("Mensaje enviado");
                  return true;
                } catch (e) {
                  toast.error(mensaje(e, "No se pudo enviar"));
                  return false;
                }
              }}
              extra={() =>
                t.estado !== "Cerrado" && (
                  <Button
                    type="button"
                    variant="outline"
                    disabled={cerrar.isPending}
                    onClick={async () => {
                      try {
                        await cerrar.mutateAsync();
                        toast.success("Pedido cerrado. ¡Gracias!");
                      } catch (e) {
                        toast.error(mensaje(e, "No se pudo cerrar"));
                      }
                    }}
                  >
                    <CheckCircle2 className="size-4" /> Ya está resuelto
                  </Button>
                )
              }
            />
          </div>
        )}
      </QueryState>
    </>
  );
}
