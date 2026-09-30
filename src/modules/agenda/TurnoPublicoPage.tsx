import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { CalendarCheck, CalendarX2, Loader2, MapPin, Phone, Stethoscope } from "lucide-react";
import { useParams } from "react-router";
import { LogoMark } from "@/components/layout/Logo";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { brand } from "@/config/brand";
import { cn } from "@/lib/utils";

interface TurnoPublico {
  consultorio: string;
  direccion: string | null;
  telefono: string | null;
  paciente: string | null;
  profesional: string;
  cuando: string;
  estado: string;
  pasado: boolean;
}

async function pedir<T>(url: string, metodo = "GET"): Promise<T> {
  const r = await fetch(`/api/publico/turnos/${url}`, { method: metodo });
  const d = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(d.error ?? "No se pudo completar");
  return d as T;
}

/** El paciente confirma o cancela su turno desde el link del email o del WhatsApp (sin usuario) */
export function TurnoPublicoPage() {
  const { token = "" } = useParams();
  const qc = useQueryClient();
  const turno = useQuery({ queryKey: ["turno-publico", token], queryFn: () => pedir<TurnoPublico>(token), retry: false });
  const [enviando, setEnviando] = useState<"confirmar" | "cancelar" | null>(null);
  const [error, setError] = useState("");
  const [preguntaCancelar, setPreguntaCancelar] = useState(false);

  const responder = async (accion: "confirmar" | "cancelar") => {
    setEnviando(accion);
    setError("");
    try {
      await pedir(`${token}/${accion}`, "POST");
      await qc.invalidateQueries({ queryKey: ["turno-publico", token] });
      setPreguntaCancelar(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo completar");
    } finally {
      setEnviando(null);
    }
  };

  const t = turno.data;
  return (
    <div className="flex min-h-svh flex-col items-center justify-center bg-muted/40 px-4 py-10">
      <Card className="w-full max-w-md gap-5 p-6 shadow-sm">
        {turno.isLoading && (
          <div className="flex justify-center py-10 text-muted-foreground">
            <Loader2 className="size-5 animate-spin" />
          </div>
        )}
        {turno.error && (
          <div className="py-6 text-center" role="alert">
            <div className="text-lg font-semibold">No encontramos ese turno</div>
            <p className="mt-1 text-sm text-muted-foreground">El link no es válido o el turno ya no existe. Comunicate con el consultorio.</p>
          </div>
        )}
        {t && (
          <>
            <div>
              <div className="text-sm text-muted-foreground">{t.paciente ? `Hola ${t.paciente}, tu turno en` : "Tu turno en"}</div>
              <h1 className="text-xl font-semibold tracking-tight">{t.consultorio}</h1>
            </div>
            <div className="grid gap-2 rounded-lg bg-muted/60 p-4 text-sm">
              <div className="text-base font-semibold first-letter:uppercase" data-testid="turno-cuando">
                {t.cuando}
              </div>
              <div className="flex items-center gap-2 text-muted-foreground">
                <Stethoscope className="size-4" /> {t.profesional}
              </div>
              {t.direccion && (
                <div className="flex items-center gap-2 text-muted-foreground">
                  <MapPin className="size-4" /> {t.direccion}
                </div>
              )}
              {t.telefono && (
                <a href={`tel:${t.telefono}`} className="flex items-center gap-2 text-primary">
                  <Phone className="size-4" /> {t.telefono}
                </a>
              )}
            </div>

            <div data-testid="turno-estado" className={cn("rounded-lg px-4 py-3 text-center text-sm font-medium", t.estado === "Confirmado" && "bg-success/10 text-success", t.estado === "Cancelado" && "bg-destructive/10 text-destructive")}>
              {t.estado === "Confirmado" && "¡Listo! Tu turno está confirmado. Te esperamos."}
              {t.estado === "Cancelado" && "El turno está cancelado. Si querés otro, comunicate con el consultorio."}
              {t.estado === "Pendiente" && !t.pasado && "¿Venís a tu turno?"}
              {(t.estado === "Realizado" || t.estado === "Ausente" || (t.pasado && t.estado === "Pendiente")) && "Este turno ya pasó."}
            </div>

            {error && (
              <p className="text-center text-sm text-destructive" role="alert">
                {error}
              </p>
            )}

            {!t.pasado && (t.estado === "Pendiente" || t.estado === "Confirmado") && (
              <div className="grid gap-2">
                {t.estado === "Pendiente" && (
                  <Button size="lg" onClick={() => responder("confirmar")} disabled={!!enviando}>
                    {enviando === "confirmar" ? <Loader2 className="size-4 animate-spin" /> : <CalendarCheck className="size-4" />} Confirmo que voy
                  </Button>
                )}
                {preguntaCancelar ? (
                  <div className="grid gap-2 rounded-lg border border-destructive/30 p-3 text-center text-sm">
                    ¿Seguro que querés cancelar el turno?
                    <div className="flex justify-center gap-2">
                      <Button variant="destructive" onClick={() => responder("cancelar")} disabled={!!enviando}>
                        {enviando === "cancelar" && <Loader2 className="size-4 animate-spin" />}
                        Sí, cancelar
                      </Button>
                      <Button variant="outline" onClick={() => setPreguntaCancelar(false)}>
                        No
                      </Button>
                    </div>
                  </div>
                ) : (
                  <Button size="lg" variant="outline" onClick={() => setPreguntaCancelar(true)}>
                    <CalendarX2 className="size-4" /> No puedo ir, cancelar el turno
                  </Button>
                )}
              </div>
            )}
          </>
        )}
      </Card>
      <div className="mt-6 flex items-center gap-2 text-xs text-muted-foreground">
        <LogoMark className="size-5" /> Turnos con {brand.nombre}
      </div>
    </div>
  );
}
