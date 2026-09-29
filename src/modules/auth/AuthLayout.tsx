import { LinksLegales } from "@/modules/legal/SolicitudLegalPage";
import type { ReactNode } from "react";
import { CheckCircle2 } from "lucide-react";
import { LogoMark } from "@/components/layout/Logo";
import { brand } from "@/config/brand";

const beneficios = ["Facturación electrónica ARCA", "Clientes, stock y agenda en un solo lugar", "Avisos por email y WhatsApp", "Sin instalar nada: funciona en la compu y el celular"];

export function AuthLayout({ title, subtitle, children }: { title: string; subtitle: string; children: ReactNode }) {
  return (
    <div className="grid min-h-svh lg:grid-cols-[1fr_1.1fr]">
      <div className="relative hidden flex-col justify-between overflow-hidden bg-sidebar p-10 text-white lg:flex">
        <div
          className="pointer-events-none absolute -top-40 -right-40 size-[520px] rounded-full opacity-40 blur-3xl"
          style={{ background: "radial-gradient(circle, var(--primary), transparent 65%)" }}
        />
        <div
          className="pointer-events-none absolute -bottom-48 -left-32 size-[480px] rounded-full opacity-30 blur-3xl"
          style={{ background: "radial-gradient(circle, var(--highlight), transparent 65%)" }}
        />
        <div className="relative flex items-center gap-3">
          <LogoMark className="size-10" />
          <span className="text-xl font-bold tracking-tight">{brand.nombre}</span>
        </div>
        <div className="relative max-w-md">
          <h2 className="text-3xl leading-tight font-semibold tracking-tight">La gestión de tu empresa, ordenada y en un solo lugar.</h2>
          <ul className="mt-8 grid gap-3">
            {beneficios.map((b) => (
              <li key={b} className="flex items-center gap-3 text-sidebar-foreground">
                <CheckCircle2 className="size-5 text-highlight" /> {b}
              </li>
            ))}
          </ul>
        </div>
        <div className="relative text-xs text-sidebar-muted">© {new Date().getFullYear()} {brand.nombre}</div>
      </div>

      <div className="flex items-center justify-center px-4 py-10 sm:px-8">
        <div className="w-full max-w-md">
          <div className="mb-8 flex items-center gap-2.5 lg:hidden">
            <LogoMark />
            <span className="text-lg font-bold tracking-tight">{brand.nombre}</span>
          </div>
          <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
          <p className="mt-1 text-sm text-muted-foreground">{subtitle}</p>
          <div className="mt-8">{children}</div>
          <LinksLegales className="mt-10 flex flex-wrap justify-center gap-x-2 gap-y-1 text-xs text-muted-foreground" />
        </div>
      </div>
    </div>
  );
}
