import { brand, productoActivo } from "@/config/brand";
import { cn } from "@/lib/utils";

/** Isotipo de CoreDental: un diente sobre degradé turquesa */
function LogoDental({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 32 32" className={cn("size-8 shrink-0", className)} aria-hidden>
      <defs>
        <linearGradient id="dental-grad" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="oklch(0.6 0.13 222)" />
          <stop offset="1" stopColor="oklch(0.74 0.13 175)" />
        </linearGradient>
      </defs>
      <rect width="32" height="32" rx="8" fill="url(#dental-grad)" />
      <path
        d="M16 10.2c-1.6-1.3-3.4-1.9-5-1.4-2.4.8-3.2 3.6-2.6 6.4.4 1.9 1.3 3.3 1.8 5.1.5 1.8.6 3.9 1.9 3.9 1.5 0 1.4-2.7 2-4.4.3-.9.9-1.4 1.9-1.4s1.6.5 1.9 1.4c.6 1.7.5 4.4 2 4.4 1.3 0 1.4-2.1 1.9-3.9.5-1.8 1.4-3.2 1.8-5.1.6-2.8-.2-5.6-2.6-6.4-1.6-.5-3.4.1-5 1.4Z"
        fill="none"
        stroke="white"
        strokeWidth="2"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export function LogoMark({ className }: { className?: string }) {
  if (productoActivo() === "dental") return <LogoDental className={className} />;
  return (
    <svg viewBox="0 0 32 32" className={cn("size-8 shrink-0", className)} aria-hidden>
      <defs>
        <linearGradient id="prexa-grad" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="oklch(0.6 0.24 285)" />
          <stop offset="1" stopColor="oklch(0.74 0.14 205)" />
        </linearGradient>
      </defs>
      <rect width="32" height="32" rx="8" fill="url(#prexa-grad)" />
      {/* "P" + corchete de código */}
      <path d="M11 23V9h6a4.5 4.5 0 0 1 0 9h-6" fill="none" stroke="white" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M21.5 20.5 24 23l-2.5 2.5" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" opacity=".85" />
    </svg>
  );
}

export function Logo({ collapsed = false }: { collapsed?: boolean }) {
  return (
    <div className="flex items-center gap-2.5">
      <LogoMark />
      <div className={cn("leading-tight", collapsed && "sr-only")}>
        <div className="text-[16px] font-bold tracking-tight text-white">{brand.nombre}</div>
        <div className="text-[11px] text-sidebar-muted">{brand.bajada}</div>
      </div>
    </div>
  );
}
