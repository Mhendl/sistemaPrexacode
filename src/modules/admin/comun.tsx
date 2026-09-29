import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { StatusBadge } from "@/components/shared/StatusBadge";
import { formatEje } from "@/lib/format";
import type { EstadoSus } from "./api";

export const nombreEstado: Record<EstadoSus, string> = { Prueba: "Prueba gratis", Activa: "Activa", Gracia: "Vencida (en gracia)", SoloLectura: "Solo lectura" };
export const nombrePlan: Record<string, string> = { basico: "Básico", profesional: "Profesional", empresa: "Empresa" };
export const usd = (n: number) => `USD ${n.toLocaleString("es-AR", { maximumFractionDigits: 2 })}`;
export const fechaHora = (iso: string) => new Date(iso).toLocaleString("es-AR", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" });

export function EstadoEmpresa({ estado, suspendida, baja }: { estado: EstadoSus; suspendida?: boolean; baja?: boolean }) {
  return (
    <span className="inline-flex flex-wrap gap-1">
      <StatusBadge status={suspendida ? "Suspendido" : nombreEstado[estado]} />
      {baja && <StatusBadge status="Baja pedida" />}
    </span>
  );
}

/** Barras por mes (ingresos en pesos o cantidades) */
export function BarrasMes({ datos, dinero = false, alto = 220 }: { datos: { etiqueta: string; valor: number }[]; dinero?: boolean; alto?: number }) {
  return (
    <div style={{ height: alto }} className="w-full">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={datos} margin={{ top: 8, right: 4, left: 4, bottom: 0 }} barCategoryGap="28%">
          <CartesianGrid vertical={false} stroke="var(--border)" />
          <XAxis dataKey="etiqueta" tickLine={false} axisLine={false} tick={{ fill: "var(--muted-foreground)", fontSize: 11 }} interval="preserveStartEnd" />
          <YAxis
            width={dinero ? 72 : 32}
            tickLine={false}
            axisLine={false}
            allowDecimals={false}
            tick={{ fill: "var(--muted-foreground)", fontSize: 11 }}
            tickFormatter={(v: number) => (dinero ? (v === 0 ? "$ 0" : formatEje(v)) : String(v))}
          />
          <Tooltip
            cursor={{ fill: "var(--muted)" }}
            formatter={(v: number) => [dinero ? `$ ${v.toLocaleString("es-AR", { minimumFractionDigits: 2 })}` : v, dinero ? "Cobrado" : "Cantidad"]}
            contentStyle={{ background: "var(--popover)", border: "1px solid var(--border)", borderRadius: 8, fontSize: 12 }}
          />
          <Bar dataKey="valor" fill="var(--chart-1)" radius={[4, 4, 0, 0]} maxBarSize={32} isAnimationActive={false} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
export const usuariosTxt = (n: number) => `${n} usuario${n === 1 ? "" : "s"}`;
