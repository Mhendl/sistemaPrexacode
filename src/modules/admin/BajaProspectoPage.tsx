import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Loader2 } from "lucide-react";
import { useParams } from "react-router";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { brand } from "@/config/brand";

/** Baja de los emails comerciales de Prexacode / CoreDental (link al pie de cada email de prospección) */
export function BajaProspectoPage() {
  const { token = "" } = useParams();
  const q = useQuery({
    queryKey: ["baja-prospecto", token],
    queryFn: async () => {
      const r = await fetch(`/api/publico/baja-prospecto/${token}`);
      const d = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(d.error ?? "El link no es válido");
      return d as { dadoDeBaja: boolean };
    },
    retry: false,
  });
  const [listo, setListo] = useState(false);
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState("");
  const baja = async () => {
    setEnviando(true);
    setError("");
    try {
      const r = await fetch(`/api/publico/baja-prospecto/${token}`, { method: "POST" });
      if (!r.ok) throw new Error();
      setListo(true);
    } catch {
      setError("No se pudo. Probá de nuevo o respondé el email con la palabra BAJA.");
    } finally {
      setEnviando(false);
    }
  };
  return (
    <div className="flex min-h-svh items-center justify-center bg-muted/40 px-4">
      <Card className="w-full max-w-md gap-4 p-6 text-center shadow-sm">
        {q.isLoading && <Loader2 className="mx-auto size-5 animate-spin text-muted-foreground" />}
        {q.error && <p className="text-sm text-muted-foreground">{q.error.message}</p>}
        {q.data &&
          (listo || q.data.dadoDeBaja ? (
            <div data-testid="baja-prospecto-lista">
              <p className="font-semibold">Listo, no te vamos a escribir más</p>
              <p className="mt-1 text-sm text-muted-foreground">Perdón por la molestia. Que tengas un buen día.</p>
            </div>
          ) : (
            <>
              <p className="font-semibold">¿No querés recibir más emails de {brand.nombre}?</p>
              <Button onClick={baja} disabled={enviando} className="mx-auto">
                {enviando && <Loader2 className="size-4 animate-spin" />}
                No quiero recibir más emails
              </Button>
              {error && <p className="text-sm text-destructive">{error}</p>}
            </>
          ))}
      </Card>
    </div>
  );
}
