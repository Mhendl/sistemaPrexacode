import type { LucideIcon } from "lucide-react";
import type { ReactNode } from "react";
import { Card } from "@/components/ui/card";
import { cn } from "@/lib/utils";

interface KpiCardProps {
  label: string;
  value: string;
  icon: LucideIcon;
  hint?: ReactNode;
  tone?: "default" | "highlight" | "warning" | "danger" | "success";
}

const iconTone = {
  default: "bg-primary/10 text-primary",
  highlight: "bg-highlight/15 text-highlight",
  success: "bg-success/12 text-success",
  warning: "bg-warning/15 text-warning-ink",
  danger: "bg-destructive/10 text-destructive",
};

export function KpiCard({ label, value, icon: Icon, hint, tone = "default" }: KpiCardProps) {
  return (
    <Card className="gap-0 p-4 shadow-none">
      <div className="flex items-start justify-between gap-3">
        <div className="text-sm text-muted-foreground">{label}</div>
        <div className={cn("flex size-9 shrink-0 items-center justify-center rounded-lg", iconTone[tone])}>
          <Icon className="size-[18px]" />
        </div>
      </div>
      <div className="tabular mt-1 text-2xl font-semibold tracking-tight">{value}</div>
      {hint && <div className="mt-1 text-xs text-muted-foreground">{hint}</div>}
    </Card>
  );
}
