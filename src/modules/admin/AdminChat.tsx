import { useEffect, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Check, Loader2, MessageCircle, Send } from "lucide-react";
import { toast } from "sonner";
import { ApiError } from "@/api/client";
import { PageHeader } from "@/components/shared/PageHeader";
import { QueryState } from "@/components/shared/QueryState";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import { apiAdmin } from "./api";
import { fechaHora, haceCuanto } from "./comun";

interface Conversacion {
  id: string;
  producto: "gestion" | "dental";
  email: string | null;
  nombre: string | null;
  origen: string | null;
  pendiente: boolean;
  ultimoMensajeEn: string;
  createdAt: string;
  mensajes: number;
  ultimo: string | null;
}
interface Mensaje {
  id: string;
  de: "visitante" | "equipo" | "auto";
  texto: string;
  createdAt: string;
}

export const useChatPendientes = () => useQuery({ queryKey: ["admin", "chat", "pendientes"], queryFn: () => apiAdmin<{ pendientes: number }>("/plataforma/chat/resumen/pendientes"), refetchInterval: 30_000 });
const mensaje = (e: unknown) => (e instanceof ApiError ? (Object.values(e.details)[0] ?? e.message) : "No se pudo");

/** Las consultas del chat de las páginas: las que esperan respuesta primero */
export function AdminChat() {
  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ["admin", "chat", "lista"],
    queryFn: () => apiAdmin<{ pendientes: number; conversaciones: Conversacion[] }>("/plataforma/chat"),
    refetchInterval: 10_000,
  });
  const [elegida, setElegida] = useState<string | null>(null);
  const actual = data?.conversaciones.find((c) => c.id === elegida) ?? null;
  return (
    <>
      <PageHeader title="Chat" description="Lo que preguntan en el chat de las páginas. Las preguntas típicas se responden solas; acá ves todo y respondés las que necesitan una persona." />
      <QueryState isLoading={isLoading} error={error} onRetry={refetch}>
        {data?.conversaciones.length === 0 ? (
          <Card className="items-center gap-2 py-14 text-center text-sm text-muted-foreground shadow-none">
            <MessageCircle className="size-6" />
            Todavía nadie escribió en el chat.
          </Card>
        ) : (
          <div className="grid gap-4 lg:grid-cols-[340px_1fr]">
            <Card className={cn("gap-0 overflow-hidden p-0 shadow-none", actual && "hidden lg:flex")} data-testid="chat-lista">
              <ul className="max-h-[70svh] divide-y overflow-y-auto">
                {data?.conversaciones.map((c) => (
                  <li key={c.id}>
                    <button type="button" onClick={() => setElegida(c.id)} className={cn("grid w-full gap-0.5 px-4 py-3 text-left text-sm hover:bg-muted/50", c.id === elegida && "bg-muted")} data-testid="chat-conversacion">
                      <span className="flex items-center justify-between gap-2">
                        <span className="truncate font-medium">{c.nombre || c.email || "Visitante"}</span>
                        <span className="shrink-0 text-xs text-muted-foreground">{haceCuanto(c.ultimoMensajeEn)}</span>
                      </span>
                      <span className="truncate text-muted-foreground">{c.ultimo ?? "—"}</span>
                      <span className="flex items-center gap-2 text-xs">
                        <span className={cn("rounded-full px-2 py-0.5 font-medium", c.producto === "dental" ? "bg-[#e3f5f8] text-[#0e8fae]" : "bg-primary/10 text-primary")}>{c.producto === "dental" ? "CoreDental" : "Prexacode"}</span>
                        {c.pendiente && <span className="rounded-full bg-warning/15 px-2 py-0.5 font-medium text-warning-ink">Espera respuesta</span>}
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            </Card>
            {actual ? (
              <Hilo c={actual} volver={() => setElegida(null)} />
            ) : (
              <Card className="hidden items-center justify-center py-14 text-sm text-muted-foreground shadow-none lg:flex">Elegí una conversación.</Card>
            )}
          </div>
        )}
      </QueryState>
    </>
  );
}

function Hilo({ c, volver }: { c: Conversacion; volver: () => void }) {
  const qc = useQueryClient();
  const { data } = useQuery({ queryKey: ["admin", "chat", c.id], queryFn: () => apiAdmin<{ mensajes: Mensaje[] }>(`/plataforma/chat/${c.id}`), refetchInterval: 6000 });
  const [texto, setTexto] = useState("");
  const [enviando, setEnviando] = useState(false);
  const fin = useRef<HTMLDivElement>(null);
  const n = data?.mensajes.length ?? 0;
  // (con llaves: en Chrome scrollIntoView devuelve una promesa, y un efecto no puede devolver eso)
  useEffect(() => {
    fin.current?.scrollIntoView({ block: "nearest" });
  }, [n]);

  const actualizar = () => qc.invalidateQueries({ queryKey: ["admin", "chat"] });
  const responder = async () => {
    if (!texto.trim()) return;
    setEnviando(true);
    try {
      const r = await apiAdmin<{ porEmail: boolean }>(`/plataforma/chat/${c.id}/responder`, { method: "POST", body: { texto } });
      setTexto("");
      if (r.porEmail) toast.success("Respuesta enviada: la ve en el chat y le llegó por email");
      else if (c.email) toast.warning("Respuesta enviada al chat, pero no se pudo mandar el email");
      else toast.success("Respuesta enviada: la ve en el chat si sigue en la página (no dejó su email)");
      await actualizar();
    } catch (e) {
      toast.error(mensaje(e));
    } finally {
      setEnviando(false);
    }
  };
  const resolver = async () => {
    await apiAdmin(`/plataforma/chat/${c.id}/pendiente`, { method: "POST", body: { pendiente: false } }).catch((e) => toast.error(mensaje(e)));
    await actualizar();
  };

  return (
    <Card className="gap-0 overflow-hidden p-0 shadow-none" data-testid="chat-hilo">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b p-4">
        <div className="min-w-0 text-sm">
          <Button variant="ghost" size="sm" className="-ml-2 mb-1 lg:hidden" onClick={volver}>
            ← Conversaciones
          </Button>
          <div className="font-semibold">{c.nombre || c.email || "Visitante"}</div>
          <div className="break-all text-xs text-muted-foreground">
            {c.email ? c.email : "No dejó su email"} · empezó {fechaHora(c.createdAt)}
            {c.origen && ` · desde ${c.origen.replace(/^https?:\/\//, "").split("?")[0]}`}
          </div>
        </div>
        {c.pendiente && (
          <Button size="sm" variant="outline" onClick={resolver}>
            <Check className="size-4" /> Ya está resuelta
          </Button>
        )}
      </div>
      <div className="grid max-h-[52svh] gap-2 overflow-y-auto bg-muted/30 p-4">
        {data?.mensajes.map((m) => (
          <div key={m.id} className={cn("max-w-[85%] whitespace-pre-wrap break-words rounded-xl px-3 py-2 text-sm", m.de === "visitante" ? "justify-self-start border bg-card" : m.de === "equipo" ? "justify-self-end bg-primary text-primary-foreground" : "justify-self-end border border-dashed bg-card text-muted-foreground")}>
            {m.de === "auto" && <div className="mb-0.5 text-[11px] font-medium uppercase tracking-wide">Respuesta automática</div>}
            {m.texto}
          </div>
        ))}
        <div ref={fin} />
      </div>
      <div className="grid gap-2 border-t p-4">
        <Textarea rows={3} value={texto} onChange={(e) => setTexto(e.target.value)} placeholder="Escribí tu respuesta…" aria-label="Tu respuesta" maxLength={2000} />
        <div className="flex items-center justify-between gap-2">
          <span className="text-xs text-muted-foreground">{c.email ? "Le llega al chat y a su email." : "Solo la ve si sigue en la página: no dejó su email."}</span>
          <Button onClick={responder} disabled={enviando || !texto.trim()}>
            {enviando ? <Loader2 className="size-4 animate-spin" /> : <Send className="size-4" />} Responder
          </Button>
        </div>
      </div>
    </Card>
  );
}
