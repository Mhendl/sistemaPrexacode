import { useState } from "react";
import { Loader2, Pencil, Pin, PinOff, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { ApiError } from "@/api/client";
import { useBorrarNota, useGuardarNota, useNotasCliente } from "@/api/hooks";
import type { NotaClienteApi } from "@/api/types";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { useRole } from "@/context/AuthProvider";
import { cn } from "@/lib/utils";

const cuando = (iso: string) => {
  const d = new Date(iso);
  const hoy = new Date();
  const mismoDia = d.toDateString() === hoy.toDateString();
  return mismoDia ? `hoy ${d.toLocaleTimeString("es-AR", { hour: "2-digit", minute: "2-digit" })}` : d.toLocaleDateString("es-AR", { day: "2-digit", month: "2-digit", year: "numeric" });
};

/** Bitácora del cliente: lo que conviene recordar cuando se lo atiende */
export function NotasCliente({ clienteId }: { clienteId: string }) {
  const { usuario, puede, esAdmin } = useRole();
  const { data: notas = [] } = useNotasCliente(clienteId);
  const guardar = useGuardarNota(clienteId);
  const borrar = useBorrarNota(clienteId);
  const [texto, setTexto] = useState("");
  const [fijar, setFijar] = useState(false);
  const [editando, setEditando] = useState<{ id: string; texto: string } | null>(null);
  const puedeEscribir = puede("clientes.editar");
  const puedeCambiar = (n: NotaClienteApi) => puedeEscribir && (esAdmin || n.usuarioId === usuario.id);

  const agregar = async () => {
    if (!texto.trim()) return;
    try {
      await guardar.mutateAsync({ texto, fijada: fijar });
      setTexto("");
      setFijar(false);
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : "No se pudo guardar la nota");
    }
  };

  const actualizar = async (n: NotaClienteApi, cambios: Partial<{ texto: string; fijada: boolean }>) => {
    try {
      await guardar.mutateAsync({ id: n.id, texto: cambios.texto ?? n.texto, fijada: cambios.fijada ?? n.fijada });
      setEditando(null);
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : "No se pudo guardar la nota");
    }
  };

  return (
    <Card className="gap-0 shadow-none" data-testid="notas-cliente">
      <CardHeader className="pb-3">
        <CardTitle>Notas</CardTitle>
        <CardDescription>Lo que conviene saber de este cliente: preferencias, acuerdos, reclamos…</CardDescription>
      </CardHeader>
      <CardContent className="grid gap-3">
        {puedeEscribir && (
          <form
            className="grid gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              agregar();
            }}
          >
            <Textarea
              value={texto}
              onChange={(e) => setTexto(e.target.value)}
              placeholder="Escribí una nota…"
              rows={2}
              aria-label="Nueva nota"
              onKeyDown={(e) => {
                if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) agregar();
              }}
            />
            <div className="flex items-center justify-between gap-2">
              <button type="button" onClick={() => setFijar((f) => !f)} aria-pressed={fijar} className={cn("flex items-center gap-1 text-xs", fijar ? "font-medium text-primary" : "text-muted-foreground hover:text-foreground")}>
                <Pin className="size-3.5" /> {fijar ? "Se va a fijar arriba" : "Fijar arriba"}
              </button>
              <Button type="submit" size="sm" disabled={!texto.trim() || guardar.isPending}>
                {guardar.isPending && !editando && <Loader2 className="size-4 animate-spin" />}
                Agregar nota
              </Button>
            </div>
          </form>
        )}

        {notas.length === 0 ? (
          <p className="text-sm text-muted-foreground">Todavía no hay notas.</p>
        ) : (
          <ul className="grid gap-2">
            {notas.map((n) => (
              <li key={n.id} className={cn("group rounded-lg border p-3 text-sm", n.fijada && "border-primary/40 bg-primary/5")} data-testid="nota-cliente">
                {editando?.id === n.id ? (
                  <div className="grid gap-2">
                    <Textarea value={editando.texto} onChange={(e) => setEditando({ id: n.id, texto: e.target.value })} rows={3} aria-label="Texto de la nota" autoFocus />
                    <div className="flex justify-end gap-2">
                      <Button size="sm" variant="ghost" onClick={() => setEditando(null)}>
                        Cancelar
                      </Button>
                      <Button size="sm" onClick={() => actualizar(n, { texto: editando.texto })} disabled={!editando.texto.trim()}>
                        Guardar
                      </Button>
                    </div>
                  </div>
                ) : (
                  <>
                    <p className="whitespace-pre-line">{n.texto}</p>
                    <div className="mt-1.5 flex items-center justify-between gap-2 text-xs text-muted-foreground">
                      <span>
                        {n.fijada && <Pin className="mr-1 inline size-3 text-primary" />}
                        {n.autor ?? "Usuario eliminado"} · {cuando(n.createdAt)}
                        {n.updatedAt !== n.createdAt && new Date(n.updatedAt).getTime() - new Date(n.createdAt).getTime() > 1000 && " · editada"}
                      </span>
                      {puedeCambiar(n) && (
                        <span className="flex gap-0.5 opacity-60 group-hover:opacity-100">
                          <Button size="icon-sm" variant="ghost" className="size-7" onClick={() => actualizar(n, { fijada: !n.fijada })} aria-label={n.fijada ? "Desfijar nota" : "Fijar nota"}>
                            {n.fijada ? <PinOff className="size-3.5" /> : <Pin className="size-3.5" />}
                          </Button>
                          <Button size="icon-sm" variant="ghost" className="size-7" onClick={() => setEditando({ id: n.id, texto: n.texto })} aria-label="Editar nota">
                            <Pencil className="size-3.5" />
                          </Button>
                          <Button
                            size="icon-sm"
                            variant="ghost"
                            className="size-7 hover:text-destructive"
                            aria-label="Borrar nota"
                            onClick={async () => {
                              try {
                                await borrar.mutateAsync(n.id);
                                toast.success("Nota borrada");
                              } catch (e) {
                                toast.error(e instanceof ApiError ? e.message : "No se pudo borrar");
                              }
                            }}
                          >
                            <Trash2 className="size-3.5" />
                          </Button>
                        </span>
                      )}
                    </div>
                  </>
                )}
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
