import { AlertCircle, Loader2 } from "lucide-react";
import type { ReactNode } from "react";
import { Button } from "@/components/ui/button";

/** Muestra carga o error de una consulta; si está todo bien, renderiza children */
export function QueryState({
  isLoading,
  error,
  onRetry,
  children,
}: {
  isLoading: boolean;
  error: Error | null;
  onRetry?: () => void;
  children: ReactNode;
}) {
  if (isLoading) {
    return (
      <div className="flex items-center justify-center gap-2 py-20 text-sm text-muted-foreground">
        <Loader2 className="size-4 animate-spin" /> Cargando…
      </div>
    );
  }
  if (error) {
    return (
      <div className="flex flex-col items-center justify-center gap-3 py-20 text-center text-sm">
        <AlertCircle className="size-6 text-destructive" />
        <p>{error.message}</p>
        {onRetry && (
          <Button variant="outline" size="sm" onClick={onRetry}>
            Reintentar
          </Button>
        )}
      </div>
    );
  }
  return <>{children}</>;
}
