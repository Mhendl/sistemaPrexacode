import { Bar, BarChart, CartesianGrid, Cell, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { formatEje, formatMoney } from "@/lib/format";

interface Point {
  mes: string;
  total: number;
}

function ChartTooltip({ active, payload }: { active?: boolean; payload?: { payload: Point }[] }) {
  if (!active || !payload?.length) return null;
  const p = payload[0].payload;
  return (
    <div className="rounded-md border bg-popover px-3 py-2 text-xs shadow-md">
      <div className="text-muted-foreground">{p.mes}</div>
      <div className="tabular mt-0.5 text-sm font-semibold text-foreground">{formatMoney(p.total)}</div>
    </div>
  );
}

/** Serie única: un color, sin leyenda; el mes en curso resaltado con el acento */
export function VentasChart({ data, resaltarUltimo = true }: { data: Point[]; resaltarUltimo?: boolean }) {
  const last = resaltarUltimo ? data.length - 1 : -1;
  return (
    <div className="h-72 w-full">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} margin={{ top: 8, right: 4, left: 4, bottom: 0 }} barCategoryGap="28%">
          <CartesianGrid vertical={false} stroke="var(--border)" />
          <XAxis dataKey="mes" tickLine={false} axisLine={false} tick={{ fill: "var(--muted-foreground)", fontSize: 12 }} />
          <YAxis
            width={78}
            tickLine={false}
            axisLine={false}
            tick={{ fill: "var(--muted-foreground)", fontSize: 12 }}
            tickFormatter={(v: number) => (v === 0 ? "$ 0" : formatEje(v))}
          />
          <Tooltip cursor={{ fill: "var(--muted)" }} content={<ChartTooltip />} />
          <Bar dataKey="total" radius={[4, 4, 0, 0]} maxBarSize={36} isAnimationActive={false}>
            {data.map((_, i) => (
              <Cell key={i} fill={i === last ? "var(--chart-2)" : "var(--chart-1)"} />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
