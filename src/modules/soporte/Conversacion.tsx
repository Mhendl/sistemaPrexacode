import { useState } from "react";
import { Loader2, Send } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import type { MensajeTicket } from "./api";

const fechaHora = (iso: string) => new Date(iso).toLocaleString("es-AR", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" });

/** Hilo de mensajes de un ticket. `yo` indica de qué lado está quien mira (sus mensajes van a la derecha). */
export function Conversacion({ mensajes, yo }: { mensajes: MensajeTicket[]; yo: "cliente" | "soporte" }) {
  return (
    <ol className="grid gap-3" data-testid="conversacion">
      {mensajes.map((m) => {
        const mio = m.autor === yo;
        return (
          <li key={m.id} className={cn("flex", mio ? "justify-end" : "justify-start")}>
            <div className={cn("max-w-[85%] rounded-xl px-4 py-3 text-sm sm:max-w-[75%]", mio ? "bg-primary text-primary-foreground" : "border bg-card", m.autor === "soporte" && !mio && "border-primary/30 bg-primary/5")}>
              <div className={cn("mb-1 text-xs", mio ? "text-primary-foreground/80" : "text-muted-foreground")}>
                <b>{m.nombre}</b> · {fechaHora(m.createdAt)}
              </div>
              <p className="whitespace-pre-wrap [overflow-wrap:anywhere]">{m.texto}</p>
            </div>
          </li>
        );
      })}
    </ol>
  );
}

/** Caja para escribir una respuesta */
export function Responder({ onEnviar, enviando, placeholder, extra }: { onEnviar: (texto: string) => Promise<boolean>; enviando: boolean; placeholder: string; extra?: (texto: string, limpiar: () => void) => React.ReactNode }) {
  const [texto, setTexto] = useState("");
  return (
    <form
      className="grid gap-2"
      onSubmit={async (e) => {
        e.preventDefault();
        if (await onEnviar(texto)) setTexto("");
      }}
    >
      <Textarea value={texto} onChange={(e) => setTexto(e.target.value)} placeholder={placeholder} aria-label="Tu mensaje" rows={4} />
      <div className="flex flex-wrap justify-end gap-2">
        {extra?.(texto, () => setTexto(""))}
        <Button type="submit" disabled={enviando || texto.trim().length < 2}>
          {enviando ? <Loader2 className="size-4 animate-spin" /> : <Send className="size-4" />} Enviar
        </Button>
      </div>
    </form>
  );
}
