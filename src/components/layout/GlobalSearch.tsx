import { useEffect, useMemo, useRef, useState } from "react";
import { Search } from "lucide-react";
import { useNavigate } from "react-router";
import { Input } from "@/components/ui/input";
import { useClientes, useComprobantes, useProductos } from "@/api/hooks";
import { useRole } from "@/context/AuthProvider";
import { formatCuit } from "@/lib/format";
import { canAccess, itemsDe, puede } from "@/lib/navigation";
import { numeroComprobante } from "@/lib/facturacion";
import { productoActivo } from "@/config/brand";
import { nombreCompleto, usePacientes } from "@/modules/pacientes/api";

const normalize = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

interface Resultado {
  tipo: string;
  titulo: string;
  detalle: string;
  path: string;
}

export function GlobalSearch() {
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const navigate = useNavigate();
  const { acceso } = useRole();
  const dental = productoActivo() === "dental";
  const { data: clientes = [] } = useClientes(!dental && canAccess(acceso, "/clientes"));
  const { data: productos = [] } = useProductos(!dental);
  const { data: pacientes = [] } = usePacientes(undefined, dental && canAccess(acceso, "/pacientes"));
  const { data: comprobantes = [] } = useComprobantes(undefined, canAccess(acceso, "/facturacion"));

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        inputRef.current?.focus();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const results = useMemo(() => {
    const q = normalize(query.trim());
    if (!q) return [];
    const modulos = itemsDe()
      .filter((i) => puede(acceso, ...i.permisos) && normalize(i.label).includes(q))
      .map((i) => ({ tipo: "Módulo", titulo: i.label, detalle: i.description, path: i.path }));
    const indice: Resultado[] = [
      ...pacientes.map((p) => ({ tipo: "Paciente", titulo: nombreCompleto(p), detalle: [p.dni && `DNI ${p.dni}`, p.telefono].filter(Boolean).join(" · "), path: `/pacientes/${p.id}` })),
      ...clientes.map((c) => ({ tipo: "Cliente", titulo: c.razonSocial, detalle: `CUIT ${formatCuit(c.cuit)}`, path: `/clientes/${c.id}` })),
      ...productos.map((p) => ({ tipo: "Producto", titulo: p.descripcion, detalle: p.codigo, path: `/productos/${p.id}` })),
      ...comprobantes.map((c) => ({ tipo: "Comprobante", titulo: `${c.tipo} ${numeroComprobante(c.puntoVenta, c.numero)}`, detalle: c.receptor.razonSocial, path: `/facturacion/${c.id}` })),
    ];
    const datos = indice.filter((r) => canAccess(acceso, r.path) && normalize(`${r.titulo} ${r.detalle}`).includes(q));
    return [...modulos, ...datos].slice(0, 8);
  }, [query, acceso, clientes, productos, comprobantes, pacientes]);

  const go = (path: string) => {
    navigate(path);
    setQuery("");
    setOpen(false);
    inputRef.current?.blur();
  };

  return (
    <div className="relative w-full max-w-md">
      <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
      <Input
        ref={inputRef}
        value={query}
        onChange={(e) => {
          setQuery(e.target.value);
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
        onBlur={() => setOpen(false)}
        onKeyDown={(e) => {
          if (e.key === "Enter" && results[0]) go(results[0].path);
          if (e.key === "Escape") inputRef.current?.blur();
        }}
        placeholder={dental ? "Buscar pacientes, comprobantes…" : "Buscar clientes, productos, comprobantes…"}
        className="h-9 bg-muted/60 pr-14 pl-9 shadow-none"
      />
      <kbd className="pointer-events-none absolute top-1/2 right-2.5 hidden -translate-y-1/2 rounded border bg-background px-1.5 text-[10px] text-muted-foreground sm:block">
        Ctrl K
      </kbd>

      {open && query.trim() && (
        <div className="absolute inset-x-0 top-full z-50 mt-1.5 overflow-hidden rounded-lg border bg-popover shadow-lg">
          {results.length === 0 ? (
            <div className="px-4 py-6 text-center text-sm text-muted-foreground">Sin resultados para “{query}”</div>
          ) : (
            <ul className="max-h-80 overflow-y-auto py-1">
              {results.map((r) => (
                <li key={`${r.tipo}-${r.path}-${r.titulo}`}>
                  <button
                    type="button"
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={() => go(r.path)}
                    className="flex w-full items-center gap-3 px-3 py-2 text-left hover:bg-accent"
                  >
                    <span className="w-24 shrink-0 text-[11px] font-medium tracking-wide text-muted-foreground uppercase">
                      {r.tipo}
                    </span>
                    <span className="min-w-0">
                      <span className="block truncate text-sm">{r.titulo}</span>
                      <span className="block truncate text-xs text-muted-foreground">{r.detalle}</span>
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
