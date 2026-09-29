import { AlertTriangle, Clock, Lock } from "lucide-react";
import { Link } from "react-router";
import { useSuscripcion } from "@/api/hooks";
import { useRole } from "@/context/AuthProvider";
import { formatDate } from "@/lib/format";
import { cn } from "@/lib/utils";

/** Aviso arriba de todo: fin de la prueba, vencimiento, gracia o solo lectura */
export function SuscripcionAviso() {
  const { esAdmin } = useRole();
  const { data: s } = useSuscripcion();
  if (!s || !s.avisar) return null;

  const admin = esAdmin;
  const accion = admin ? (
    <Link to="/configuracion?tab=plan" className="font-medium underline underline-offset-2">
      {s.estado === "Prueba" ? "Elegí tu plan" : "Renovar"}
    </Link>
  ) : (
    <span>Avisale a un administrador.</span>
  );

  let texto: string;
  if (s.estado === "Prueba") texto = s.diasRestantes <= 0 ? "Hoy termina tu prueba gratis." : `Te ${s.diasRestantes === 1 ? "queda 1 día" : `quedan ${s.diasRestantes} días`} de prueba gratis.`;
  else if (s.estado === "Activa") texto = `Tu suscripción vence el ${formatDate(s.vence)}.`;
  else if (s.estado === "Gracia") texto = `La suscripción venció. Podés seguir usando todo hasta el ${formatDate(s.graciaHasta)}.`;
  else texto = "La suscripción está vencida: podés ver y exportar tus datos, pero no cargar ni modificar.";

  const Icono = s.estado === "SoloLectura" ? Lock : s.estado === "Gracia" ? AlertTriangle : Clock;
  return (
    <div
      role="status"
      data-testid="aviso-suscripcion"
      className={cn(
        "flex items-center justify-center gap-2 px-4 py-2 text-center text-sm print:hidden",
        s.estado === "SoloLectura" ? "bg-destructive text-white" : s.estado === "Gracia" ? "bg-warning/20 text-warning-ink" : "bg-primary/10 text-foreground",
      )}
    >
      <Icono className="size-4 shrink-0" />
      <span>
        {texto} {accion}
      </span>
    </div>
  );
}
