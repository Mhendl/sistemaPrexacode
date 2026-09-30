import { useEffect, useRef, useState } from "react";
import { FileImage, FileText, Loader2, Lock, Trash2, Upload } from "lucide-react";
import { toast } from "sonner";
import { ApiError } from "@/api/client";
import { QueryState } from "@/components/shared/QueryState";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { useRole } from "@/context/AuthProvider";
import { formatDate } from "@/lib/format";
import { TIPOS_ARCHIVO, urlDeArchivo, useArchivos, useBorrarArchivo, useEvoluciones, useNuevaEvolucion, useSubirArchivo, type ArchivoApi } from "./api";

const hoyLocal = () => {
  const d = new Date();
  return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
};

/** Evoluciones: una por consulta, con autor y fecha. No se editan ni se borran (Ley 26.529). */
export function Evoluciones({ pacienteId }: { pacienteId: string }) {
  const { puede } = useRole();
  const evoluciones = useEvoluciones(pacienteId);
  const nueva = useNuevaEvolucion(pacienteId);
  const [texto, setTexto] = useState("");
  const [fecha, setFecha] = useState(hoyLocal());

  const guardar = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await nueva.mutateAsync({ texto, fecha });
      setTexto("");
      setFecha(hoyLocal());
      toast.success("Evolución guardada");
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "No se pudo guardar");
    }
  };

  return (
    <div className="grid gap-4">
      {puede("historia.editar") && (
        <Card className="gap-3 p-4 shadow-none">
          <form onSubmit={guardar} className="grid gap-3" noValidate>
            <Label htmlFor="evo-texto">Nueva evolución</Label>
            <Textarea id="evo-texto" rows={4} value={texto} onChange={(e) => setTexto(e.target.value)} placeholder="Motivo de consulta, hallazgos, lo que se hizo y las indicaciones…" maxLength={10000} />
            <div className="flex flex-wrap items-end justify-between gap-3">
              <div className="grid gap-1.5">
                <Label htmlFor="evo-fecha">Fecha de la consulta</Label>
                <Input id="evo-fecha" type="date" value={fecha} max={hoyLocal()} onChange={(e) => setFecha(e.target.value)} className="w-44" />
              </div>
              <div className="flex items-center gap-3">
                <span className="hidden items-center gap-1.5 text-xs text-muted-foreground sm:flex">
                  <Lock className="size-3.5" /> Una vez guardada no se puede modificar
                </span>
                <Button type="submit" disabled={texto.trim().length < 3 || nueva.isPending}>
                  {nueva.isPending && <Loader2 className="size-4 animate-spin" />}
                  Guardar evolución
                </Button>
              </div>
            </div>
          </form>
        </Card>
      )}
      <QueryState isLoading={evoluciones.isLoading} error={evoluciones.error} onRetry={evoluciones.refetch}>
        {evoluciones.data?.length === 0 ? (
          <Card className="py-10 text-center text-sm text-muted-foreground shadow-none">Todavía no hay evoluciones cargadas.</Card>
        ) : (
          <ol className="grid gap-3" aria-label="Evoluciones">
            {evoluciones.data?.map((e) => (
              <li key={e.id} className="rounded-lg border bg-card p-4" data-testid="evolucion">
                <div className="mb-2 flex flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground">
                  <span className="font-semibold text-foreground">{formatDate(e.fecha)}</span>
                  <span>
                    {e.autor} · cargada el {new Date(e.createdAt).toLocaleString("es-AR", { dateStyle: "short", timeStyle: "short" })}
                  </span>
                </div>
                <p className="text-sm whitespace-pre-wrap">{e.texto}</p>
              </li>
            ))}
          </ol>
        )}
      </QueryState>
    </div>
  );
}

const leerBase64 = (f: File) =>
  new Promise<string>((ok, mal) => {
    const r = new FileReader();
    r.onload = () => ok(String(r.result));
    r.onerror = () => mal(new Error("No se pudo leer el archivo"));
    r.readAsDataURL(f);
  });

function Miniatura({ pacienteId, a, onAbrir }: { pacienteId: string; a: ArchivoApi; onAbrir: () => void }) {
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    if (!a.mime.startsWith("image/")) return;
    let vivo = true;
    let creada: string | null = null;
    urlDeArchivo(pacienteId, a.id)
      .then((u) => {
        creada = u;
        if (vivo) setUrl(u);
        else URL.revokeObjectURL(u);
      })
      .catch(() => undefined);
    return () => {
      vivo = false;
      if (creada) URL.revokeObjectURL(creada);
    };
  }, [pacienteId, a.id, a.mime]);
  return (
    <button type="button" onClick={onAbrir} className="flex aspect-[4/3] w-full items-center justify-center overflow-hidden rounded-md bg-muted" aria-label={`Abrir ${a.nombreArchivo}`}>
      {url ? <img src={url} alt={a.descripcion ?? a.nombreArchivo} className="size-full object-cover" /> : a.mime === "application/pdf" ? <FileText className="size-8 text-muted-foreground" /> : <FileImage className="size-8 text-muted-foreground" />}
    </button>
  );
}

/** Radiografías, fotos y estudios del paciente */
export function Archivos({ pacienteId }: { pacienteId: string }) {
  const { puede } = useRole();
  const editable = puede("historia.editar");
  const archivos = useArchivos(pacienteId);
  const subir = useSubirArchivo(pacienteId);
  const borrar = useBorrarArchivo(pacienteId);
  const input = useRef<HTMLInputElement>(null);
  const [tipo, setTipo] = useState<(typeof TIPOS_ARCHIVO)[number]>("Radiografía");
  const [descripcion, setDescripcion] = useState("");
  const [viendo, setViendo] = useState<{ a: ArchivoApi; url: string } | null>(null);

  const elegir = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    e.target.value = "";
    if (!f) return;
    if (f.size > 8 * 1024 * 1024) return toast.error("El archivo no puede pesar más de 8 MB");
    try {
      await subir.mutateAsync({ datos: await leerBase64(f), nombreArchivo: f.name, tipo, descripcion: descripcion.trim() || null });
      setDescripcion("");
      toast.success(`${tipo} guardada`);
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "No se pudo subir");
    }
  };

  const abrir = async (a: ArchivoApi) => {
    try {
      const url = await urlDeArchivo(pacienteId, a.id);
      if (a.mime === "application/pdf") {
        window.open(url, "_blank", "noopener");
        setTimeout(() => URL.revokeObjectURL(url), 60_000);
      } else setViendo({ a, url });
    } catch {
      toast.error("No se pudo abrir el archivo");
    }
  };

  const quitar = async (a: ArchivoApi) => {
    if (!window.confirm(`¿Quitar "${a.nombreArchivo}"? Usalo solo si se subió por error (por ejemplo, a otro paciente).`)) return;
    try {
      await borrar.mutateAsync(a.id);
      toast.success("Archivo quitado");
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "No se pudo quitar");
    }
  };

  return (
    <div className="grid gap-4">
      {editable && (
        <Card className="gap-3 p-4 shadow-none">
          <div className="grid gap-3 sm:grid-cols-[180px_1fr_auto] sm:items-end">
            <div className="grid gap-1.5">
              <Label htmlFor="arch-tipo">Tipo</Label>
              <Select value={tipo} onValueChange={(v) => setTipo(v as typeof tipo)}>
                <SelectTrigger id="arch-tipo" className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {TIPOS_ARCHIVO.map((t) => (
                    <SelectItem key={t} value={t}>
                      {t}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="arch-desc">Descripción</Label>
              <Input id="arch-desc" value={descripcion} onChange={(e) => setDescripcion(e.target.value)} placeholder="Ej.: periapical 36" maxLength={300} />
            </div>
            <Button onClick={() => input.current?.click()} disabled={subir.isPending}>
              {subir.isPending ? <Loader2 className="size-4 animate-spin" /> : <Upload className="size-4" />} Subir archivo
            </Button>
          </div>
          <input ref={input} type="file" accept="image/png,image/jpeg,image/webp,application/pdf" className="hidden" onChange={elegir} data-testid="subir-archivo" />
          <p className="text-xs text-muted-foreground">Imágenes JPG, PNG o WEBP, o PDF, hasta 8 MB.</p>
        </Card>
      )}
      <QueryState isLoading={archivos.isLoading} error={archivos.error} onRetry={archivos.refetch}>
        {archivos.data?.length === 0 ? (
          <Card className="py-10 text-center text-sm text-muted-foreground shadow-none">Todavía no hay radiografías ni imágenes.</Card>
        ) : (
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
            {archivos.data?.map((a) => (
              <div key={a.id} className="grid gap-2 rounded-lg border bg-card p-2" data-testid="archivo">
                <Miniatura pacienteId={pacienteId} a={a} onAbrir={() => abrir(a)} />
                <div className="flex items-start justify-between gap-1 px-1">
                  <div className="min-w-0">
                    <div className="truncate text-sm font-medium">{a.descripcion || a.tipo}</div>
                    <div className="text-xs text-muted-foreground">
                      {a.tipo} · {formatDate(a.fecha)}
                    </div>
                  </div>
                  {editable && (
                    <Button size="icon-sm" variant="ghost" onClick={() => quitar(a)} aria-label={`Quitar ${a.nombreArchivo}`}>
                      <Trash2 className="size-4" />
                    </Button>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </QueryState>
      <Dialog
        open={!!viendo}
        onOpenChange={(o) => {
          if (!o && viendo) {
            URL.revokeObjectURL(viendo.url);
            setViendo(null);
          }
        }}
      >
        <DialogContent className="sm:max-w-4xl">
          <DialogHeader>
            <DialogTitle>{viendo?.a.descripcion || viendo?.a.tipo}</DialogTitle>
            <DialogDescription>
              {viendo?.a.tipo} del {viendo && formatDate(viendo.a.fecha)} · subida por {viendo?.a.autor}
            </DialogDescription>
          </DialogHeader>
          {viendo && <img src={viendo.url} alt={viendo.a.descripcion ?? viendo.a.nombreArchivo} className="max-h-[70svh] w-full rounded-md bg-black object-contain" />}
        </DialogContent>
      </Dialog>
    </div>
  );
}
