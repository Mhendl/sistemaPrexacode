import { useMemo, useState, type ReactNode } from "react";
import { ArrowDown, ArrowUp, ArrowUpDown, ChevronLeft, ChevronRight, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { cn } from "@/lib/utils";

export interface Column<T> {
  key: string;
  header: string;
  cell: (row: T) => ReactNode;
  /** Valor para ordenar; si falta, la columna no es ordenable */
  sortValue?: (row: T) => string | number;
  align?: "left" | "right";
  /** Ocultar en pantallas chicas */
  hideBelow?: "sm" | "md" | "lg";
  className?: string;
}

export interface Filter<T> {
  key: string;
  label: string;
  options: string[];
  value: (row: T) => string;
}

interface DataTableProps<T> {
  data: T[];
  columns: Column<T>[];
  rowKey: (row: T) => string;
  searchText: (row: T) => string;
  searchPlaceholder?: string;
  filters?: Filter<T>[];
  toolbar?: ReactNode;
  onRowClick?: (row: T) => void;
  rowClassName?: (row: T) => string | undefined;
  pageSize?: number;
  emptyText?: string;
  /** Selección con casillas para cambios masivos: la casilla del encabezado elige todas las filas filtradas */
  seleccion?: { elegidos: Set<string>; cambiar: (s: Set<string>) => void; acciones: ReactNode };
}

const hideClass = { sm: "hidden sm:table-cell", md: "hidden md:table-cell", lg: "hidden lg:table-cell" };

const normalize = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

const TODOS = "__todos";

export function DataTable<T>({
  data,
  columns,
  rowKey,
  searchText,
  searchPlaceholder = "Buscar…",
  filters = [],
  toolbar,
  onRowClick,
  rowClassName,
  pageSize = 10,
  emptyText = "No hay resultados con esos filtros.",
  seleccion,
}: DataTableProps<T>) {
  const [query, setQuery] = useState("");
  const [filterValues, setFilterValues] = useState<Record<string, string>>({});
  const [sort, setSort] = useState<{ key: string; dir: "asc" | "desc" } | null>(null);
  const [page, setPage] = useState(0);

  const rows = useMemo(() => {
    const q = normalize(query.trim());
    let out = data.filter((row) => {
      if (q && !normalize(searchText(row)).includes(q)) return false;
      return filters.every((f) => {
        const v = filterValues[f.key];
        return !v || v === TODOS || f.value(row) === v;
      });
    });
    if (sort) {
      const col = columns.find((c) => c.key === sort.key);
      if (col?.sortValue) {
        const get = col.sortValue;
        out = [...out].sort((a, b) => {
          const va = get(a);
          const vb = get(b);
          const r = typeof va === "number" && typeof vb === "number" ? va - vb : String(va).localeCompare(String(vb), "es");
          return sort.dir === "asc" ? r : -r;
        });
      }
    }
    return out;
  }, [data, query, filterValues, sort, columns, filters, searchText]);

  const pageCount = Math.max(1, Math.ceil(rows.length / pageSize));
  const current = Math.min(page, pageCount - 1);
  const visible = rows.slice(current * pageSize, current * pageSize + pageSize);

  const clavesFiltradas = rows.map(rowKey);
  const todasElegidas = !!seleccion && clavesFiltradas.length > 0 && clavesFiltradas.every((k) => seleccion.elegidos.has(k));
  const algunaElegida = !!seleccion && clavesFiltradas.some((k) => seleccion.elegidos.has(k));
  const alternar = (k: string) => {
    if (!seleccion) return;
    const n = new Set(seleccion.elegidos);
    if (n.has(k)) n.delete(k);
    else n.add(k);
    seleccion.cambiar(n);
  };

  const toggleSort = (key: string) => {
    setSort((s) => (s?.key !== key ? { key, dir: "asc" } : s.dir === "asc" ? { key, dir: "desc" } : null));
  };

  return (
    <Card className="gap-0 overflow-hidden p-0 shadow-none">
      <div className="flex flex-col gap-2 border-b p-3 sm:flex-row sm:flex-wrap sm:items-center">
        <div className="relative w-full sm:w-72">
          <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setPage(0);
            }}
            placeholder={searchPlaceholder}
            className="h-9 pl-9"
          />
        </div>
        {filters.map((f) => (
          <Select
            key={f.key}
            value={filterValues[f.key] ?? TODOS}
            onValueChange={(v) => {
              setFilterValues((s) => ({ ...s, [f.key]: v }));
              setPage(0);
            }}
          >
            <SelectTrigger className="h-9 w-full sm:w-auto sm:min-w-40">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={TODOS}>{f.label}: todos</SelectItem>
              {f.options.map((o) => (
                <SelectItem key={o} value={o}>
                  {o}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        ))}
        {toolbar && <div className="flex gap-2 sm:ml-auto">{toolbar}</div>}
      </div>

      {seleccion && seleccion.elegidos.size > 0 && (
        <div className="flex flex-wrap items-center gap-2 border-b bg-primary/5 px-3 py-2 text-sm" data-testid="barra-seleccion">
          <b>
            {seleccion.elegidos.size} {seleccion.elegidos.size === 1 ? "elegido" : "elegidos"}
          </b>
          {seleccion.acciones}
          <Button variant="ghost" size="sm" className="ml-auto" onClick={() => seleccion.cambiar(new Set())}>
            Quitar selección
          </Button>
        </div>
      )}
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b bg-muted/40 text-left text-xs text-muted-foreground">
              {seleccion && (
                <th className="w-10 px-4 py-2.5">
                  <Checkbox
                    aria-label="Elegir todos los de la lista"
                    checked={todasElegidas ? true : algunaElegida ? "indeterminate" : false}
                    onCheckedChange={() => seleccion.cambiar(todasElegidas ? new Set([...seleccion.elegidos].filter((k) => !clavesFiltradas.includes(k))) : new Set([...seleccion.elegidos, ...clavesFiltradas]))}
                  />
                </th>
              )}
              {columns.map((c) => (
                <th
                  key={c.key}
                  className={cn(
                    "px-4 py-2.5 font-medium whitespace-nowrap",
                    c.align === "right" && "text-right",
                    c.hideBelow && hideClass[c.hideBelow],
                  )}
                >
                  {c.sortValue ? (
                    <button
                      type="button"
                      onClick={() => toggleSort(c.key)}
                      className={cn("inline-flex items-center gap-1 hover:text-foreground", c.align === "right" && "flex-row-reverse")}
                    >
                      {c.header}
                      {sort?.key === c.key ? (
                        sort.dir === "asc" ? <ArrowUp className="size-3.5" /> : <ArrowDown className="size-3.5" />
                      ) : (
                        <ArrowUpDown className="size-3.5 opacity-40" />
                      )}
                    </button>
                  ) : (
                    c.header
                  )}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {visible.length === 0 ? (
              <tr>
                <td colSpan={columns.length + (seleccion ? 1 : 0)} className="px-4 py-12 text-center text-muted-foreground">
                  {emptyText}
                </td>
              </tr>
            ) : (
              visible.map((row) => (
                <tr
                  key={rowKey(row)}
                  onClick={onRowClick ? () => onRowClick(row) : undefined}
                  className={cn(
                    "border-b last:border-b-0 hover:bg-muted/40",
                    onRowClick && "cursor-pointer",
                    rowClassName?.(row),
                  )}
                >
                  {seleccion && (
                    <td className="w-10 px-4 py-3" onClick={(e) => e.stopPropagation()}>
                      <Checkbox aria-label="Elegir" checked={seleccion.elegidos.has(rowKey(row))} onCheckedChange={() => alternar(rowKey(row))} />
                    </td>
                  )}
                  {columns.map((c) => (
                    <td
                      key={c.key}
                      className={cn(
                        "px-4 py-3",
                        c.align === "right" && "text-right",
                        c.hideBelow && hideClass[c.hideBelow],
                        c.className,
                      )}
                    >
                      {c.cell(row)}
                    </td>
                  ))}
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      <div className="flex items-center justify-between gap-2 border-t px-4 py-2.5 text-xs text-muted-foreground">
        <span>
          {rows.length === 0
            ? "0 resultados"
            : `${current * pageSize + 1}–${Math.min(rows.length, (current + 1) * pageSize)} de ${rows.length}`}
        </span>
        <div className="flex items-center gap-1">
          <Button variant="ghost" size="icon-sm" disabled={current === 0} onClick={() => setPage(current - 1)} aria-label="Página anterior">
            <ChevronLeft className="size-4" />
          </Button>
          <span className="tabular px-1">
            {current + 1} / {pageCount}
          </span>
          <Button variant="ghost" size="icon-sm" disabled={current >= pageCount - 1} onClick={() => setPage(current + 1)} aria-label="Página siguiente">
            <ChevronRight className="size-4" />
          </Button>
        </div>
      </div>
    </Card>
  );
}
