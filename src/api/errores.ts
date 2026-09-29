import type { QueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { ApiError } from "./client";

/**
 * Manejo común de errores al guardar un formulario.
 * Devuelve true si el formulario debe cerrarse (otro usuario lo modificó: se recargan los datos).
 */
export function manejarErrorGuardado(err: unknown, opts: { setErrores: (e: Record<string, string>) => void; qc: QueryClient; recargar: unknown[] }): boolean {
  if (!(err instanceof ApiError)) throw err;
  if (err.code === "EDICION_CONCURRENTE") {
    toast.error(err.message, { duration: 8000 });
    opts.qc.invalidateQueries({ queryKey: opts.recargar });
    return true;
  }
  opts.setErrores(err.details);
  toast.error(err.message);
  return false;
}
