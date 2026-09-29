import { CheckCircle2, Hammer } from "lucide-react";
import { Card } from "@/components/ui/card";
import { PageHeader } from "@/components/shared/PageHeader";
import type { NavItem } from "@/types";

/** Pantalla provisoria para los módulos que todavía no se construyeron */
export function ModulePlaceholder({ item }: { item: NavItem }) {
  return (
    <>
      <PageHeader title={item.label} description={item.description} />
      <Card className="overflow-hidden p-0 shadow-none">
        <div className="grid md:grid-cols-[1fr_1.2fr]">
          <div className="flex flex-col justify-center gap-3 border-b p-6 md:border-r md:border-b-0 md:p-8">
            <div className="flex size-11 items-center justify-center rounded-lg bg-primary/10 text-primary">
              <item.icon className="size-5" />
            </div>
            <div className="inline-flex w-fit items-center gap-1.5 rounded-full bg-muted px-2.5 py-1 text-xs font-medium text-muted-foreground">
              <Hammer className="size-3.5" /> Próximamente
            </div>
            <p className="text-sm text-muted-foreground">
              Este módulo está planificado. Estas son las funcionalidades previstas.
            </p>
          </div>
          <div className="p-6 md:p-8">
            <div className="mb-3 text-sm font-medium">Qué va a incluir</div>
            <ul className="flex flex-col gap-2.5">
              {item.features?.map((f) => (
                <li key={f} className="flex items-start gap-2.5 text-sm">
                  <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-success" />
                  {f}
                </li>
              ))}
            </ul>
          </div>
        </div>
      </Card>
    </>
  );
}
