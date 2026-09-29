import { useState } from "react";
import { AlertTriangle, Boxes, PackageX, Pencil, Percent, Plus } from "lucide-react";
import { useNavigate } from "react-router";
import { useProductos } from "@/api/hooks";
import type { ProductoApi } from "@/api/types";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { DataTable, type Column } from "@/components/shared/DataTable";
import { KpiCard } from "@/components/shared/KpiCard";
import { PageHeader } from "@/components/shared/PageHeader";
import { QueryState } from "@/components/shared/QueryState";
import { StatusBadge } from "@/components/shared/StatusBadge";
import { useRole } from "@/context/AuthProvider";
import { formatMoney, formatMoneyShort } from "@/lib/format";
import { cn } from "@/lib/utils";
import { ActualizarPreciosDialog, EditarProductosDialog } from "./CambiosMasivos";
import { ProductoFormDialog } from "./ProductoFormDialog";
import { estadoStock, formatCantidad } from "./stock";

const columns: Column<ProductoApi>[] = [
  { key: "codigo", header: "Código", sortValue: (p) => p.codigo, cell: (p) => <span className="tabular text-muted-foreground">{p.codigo}</span>, hideBelow: "sm" },
  {
    key: "desc",
    header: "Descripción",
    sortValue: (p) => p.descripcion,
    cell: (p) => (
      <div className={cn(!p.activo && "opacity-60")}>
        <div className="font-medium">{p.descripcion}</div>
        <div className="text-xs text-muted-foreground">
          {p.categoria ?? "Sin categoría"}
          {!p.activo && " · Inactivo"}
        </div>
      </div>
    ),
  },
  {
    key: "stock",
    header: "Stock",
    align: "right",
    sortValue: (p) => (p.controlaStock ? p.stock : -1),
    cell: (p) =>
      p.controlaStock ? (
        <span className={cn("tabular font-medium whitespace-nowrap", p.stock < p.stockMinimo && "text-destructive")}>
          {formatCantidad(p.stock)} {p.unidad}
        </span>
      ) : (
        <span className="text-muted-foreground">—</span>
      ),
  },
  { key: "min", header: "Mínimo", align: "right", cell: (p) => (p.controlaStock ? <span className="tabular text-muted-foreground">{formatCantidad(p.stockMinimo)}</span> : "—"), hideBelow: "md" },
  { key: "precio", header: "Precio s/IVA", align: "right", sortValue: (p) => p.precio, cell: (p) => <span className="tabular whitespace-nowrap">{formatMoney(p.precio)}</span> },
  { key: "iva", header: "IVA", align: "right", cell: (p) => `${p.alicuotaIva.toLocaleString("es-AR")} %`, hideBelow: "lg" },
  { key: "estado", header: "Estado", cell: (p) => <StatusBadge status={estadoStock(p)} />, hideBelow: "sm" },
];

export function ProductosPage() {
  const navigate = useNavigate();
  const { puede } = useRole();
  const puedeEditar = puede("productos.editar");
  const [nuevo, setNuevo] = useState(false);
  const [elegidos, setElegidos] = useState<Set<string>>(new Set());
  const [precios, setPrecios] = useState<"todos" | "elegidos" | null>(null);
  const [editar, setEditar] = useState(false);
  const { data, isLoading, error, refetch } = useProductos();

  const productos = data ?? [];
  const conStock = productos.filter((p) => p.controlaStock && p.activo);
  const valorizado = conStock.reduce((a, p) => a + Math.max(0, p.stock) * p.precio, 0);
  const bajos = conStock.filter((p) => estadoStock(p) === "Bajo").length;
  const sinStock = conStock.filter((p) => estadoStock(p) === "Sin stock").length;
  const categorias = [...new Set(productos.map((p) => p.categoria).filter((c): c is string => !!c))].sort();

  return (
    <>
      <PageHeader
        title="Productos y stock"
        description="Catálogo, precios y existencias. Los productos bajo el mínimo se resaltan."
        actions={
          puedeEditar && (
            <>
              <Button variant="outline" onClick={() => setPrecios("todos")} disabled={!productos.length}>
                <Percent className="size-4" /> Actualizar precios
              </Button>
              <Button onClick={() => setNuevo(true)}>
                <Plus className="size-4" /> Nuevo producto
              </Button>
            </>
          )
        }
      />

      <QueryState isLoading={isLoading} error={error} onRetry={refetch}>
        {productos.length === 0 ? (
          <Card className="items-center gap-3 py-16 text-center shadow-none">
            <div className="flex size-12 items-center justify-center rounded-full bg-primary/10 text-primary">
              <Boxes className="size-6" />
            </div>
            <div className="text-lg font-semibold">Todavía no hay productos</div>
            <p className="max-w-sm text-sm text-muted-foreground">Cargá lo que vendés: productos con stock o servicios (horas, abonos, envíos).</p>
            {puedeEditar && (
              <Button onClick={() => setNuevo(true)}>
                <Plus className="size-4" /> Cargar el primero
              </Button>
            )}
          </Card>
        ) : (
          <>
            <div className="mb-6 grid gap-4 sm:grid-cols-3">
              <KpiCard label="Stock valorizado a precio de lista" value={formatMoneyShort(valorizado)} icon={Boxes} hint={`${conStock.length} productos con stock`} />
              <KpiCard label="Bajo mínimo" value={String(bajos)} icon={AlertTriangle} tone="warning" hint="Conviene reponer" />
              <KpiCard label="Sin stock" value={String(sinStock)} icon={PackageX} tone="danger" />
            </div>
            <DataTable
              data={productos}
              columns={columns}
              rowKey={(p) => p.id}
              searchText={(p) => `${p.codigo} ${p.descripcion} ${p.categoria ?? ""}`}
              searchPlaceholder="Buscar por código o descripción…"
              filters={[
                ...(categorias.length > 0 ? [{ key: "cat", label: "Categoría", options: categorias, value: (p: ProductoApi) => p.categoria ?? "" }] : []),
                { key: "estado", label: "Stock", options: ["OK", "Bajo", "Sin stock", "Servicio"], value: (p) => estadoStock(p) },
              ]}
              rowClassName={(p) => (["Bajo", "Sin stock"].includes(estadoStock(p)) && p.activo ? "bg-destructive/[0.04]" : undefined)}
              onRowClick={(p) => navigate(`/productos/${p.id}`)}
              pageSize={15}
              seleccion={
                puedeEditar
                  ? {
                      elegidos,
                      cambiar: setElegidos,
                      acciones: (
                        <>
                          <Button size="sm" variant="outline" onClick={() => setPrecios("elegidos")}>
                            <Percent className="size-4" /> Cambiar precios
                          </Button>
                          <Button size="sm" variant="outline" onClick={() => setEditar(true)}>
                            <Pencil className="size-4" /> Editar datos
                          </Button>
                        </>
                      ),
                    }
                  : undefined
              }
            />
            <ActualizarPreciosDialog open={precios !== null} onOpenChange={(o) => !o && setPrecios(null)} ids={precios === "elegidos" ? [...elegidos] : undefined} categorias={categorias} />
            <EditarProductosDialog open={editar} onOpenChange={setEditar} ids={[...elegidos]} categorias={categorias} alTerminar={() => setElegidos(new Set())} />
          </>
        )}
      </QueryState>

      <ProductoFormDialog open={nuevo} onOpenChange={setNuevo} onSaved={(p) => navigate(`/productos/${p.id}`)} />
    </>
  );
}
