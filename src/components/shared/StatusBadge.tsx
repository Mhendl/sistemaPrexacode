import { cn } from "@/lib/utils";

type Tone = "neutral" | "info" | "success" | "warning" | "danger" | "brand";

/** Color de cada estado en todo el sistema */
const statusTone: Record<string, Tone> = {
  // generales
  Activo: "success",
  Inactivo: "neutral",
  Invitado: "info",
  Suspendido: "danger",
  Pendiente: "warning",
  Confirmado: "info",
  Realizado: "success",
  Cancelado: "neutral",
  Ausente: "danger",
  // ARCA
  Autorizado: "success",
  Rechazado: "danger",
  // cobro
  Pagada: "success",
  Parcial: "info",
  Emitido: "success",
  Enviado: "success",
  Simulado: "info",
  Impaga: "warning",
  Vencida: "danger",
  Anulada: "neutral",
  // oportunidades
  Nuevo: "neutral",
  Contactado: "info",
  Propuesta: "brand",
  Negociación: "warning",
  Ganada: "success",
  Perdida: "neutral",
  // suscripción
  "Prueba gratis": "info",
  Activa: "success",
  "Vencida (en gracia)": "warning",
  "Solo lectura": "danger",
  Aprobado: "success",
  "Baja pedida": "danger",
  // empleados
  Pagado: "success",
  Baja: "neutral",
  // soporte
  Abierto: "warning",
  Respondido: "info",
  Cerrado: "neutral",
  Resuelta: "success",
  // presupuestos
  Aceptado: "info",
  Vencido: "danger",
  Facturado: "success",
  // stock
  OK: "success",
  Bajo: "warning",
  "Sin stock": "danger",
  Servicio: "neutral",
  // integraciones
  Conectado: "success",
  Verificado: "success",
  "Sin configurar": "neutral",
  "Sin verificar": "warning",
  Aprobada: "success",
  "En revisión": "warning",
  Error: "danger",
};

const toneClass: Record<Tone, string> = {
  neutral: "bg-muted text-muted-foreground ring-border",
  info: "bg-info/12 text-info ring-info/25",
  success: "bg-success/12 text-success ring-success/25",
  warning: "bg-warning/15 text-warning-ink ring-warning/30",
  danger: "bg-destructive/10 text-destructive ring-destructive/25",
  brand: "bg-primary/10 text-primary ring-primary/25",
};

export function StatusBadge({ status, className }: { status: string; className?: string }) {
  const tone = statusTone[status] ?? "neutral";
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-xs font-medium whitespace-nowrap ring-1 ring-inset",
        toneClass[tone],
        className,
      )}
    >
      <span className="size-1.5 rounded-full bg-current" />
      {status}
    </span>
  );
}
