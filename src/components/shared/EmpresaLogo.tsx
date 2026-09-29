import type { EmpresaApi } from "@/api/types";
import { cn } from "@/lib/utils";

/** URL del logo (la versión evita que el navegador muestre uno viejo después de cambiarlo) */
export const urlLogo = (e: Pick<EmpresaApi, "id" | "logoActualizado">) =>
  e.logoActualizado ? `/api/empresas/${e.id}/logo?v=${encodeURIComponent(e.logoActualizado)}` : null;

/** Logo de la empresa; si no tiene, sus iniciales */
export function EmpresaLogo({ empresa, className }: { empresa: EmpresaApi; className?: string }) {
  const url = urlLogo(empresa);
  if (url) {
    return <img src={url} alt={`Logo de ${empresa.razonSocial}`} className={cn("size-9 shrink-0 rounded-md bg-white object-contain p-0.5", className)} />;
  }
  const iniciales = (empresa.nombreFantasia ?? empresa.razonSocial)
    .split(/\s+/)
    .filter((p) => /^[A-Za-zÁÉÍÓÚÑáéíóúñ]/.test(p))
    .slice(0, 2)
    .map((p) => p[0]!.toUpperCase())
    .join("");
  return (
    <div className={cn("flex size-9 shrink-0 items-center justify-center rounded-md bg-gradient-to-br from-primary to-highlight text-xs font-bold text-white", className)}>
      {iniciales}
    </div>
  );
}
