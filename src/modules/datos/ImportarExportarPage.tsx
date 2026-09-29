import { useState } from "react";
import { Boxes, Download, FileDown, FileUp, Users } from "lucide-react";
import { toast } from "sonner";
import { useClientes, useProductos } from "@/api/hooks";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { PageHeader } from "@/components/shared/PageHeader";
import { useRole } from "@/context/AuthProvider";
import { descargarPlantilla, exportar, type Entidad } from "@/lib/planillas";
import { ImportarDialog } from "./ImportarDialog";

/** Quién puede importar y exportar cada cosa (igual que los permisos de edición de cada módulo) */
const permisos: Record<Entidad, { ver: string; importar: string }> = {
  clientes: { ver: "clientes.ver", importar: "importar.clientes" },
  productos: { ver: "productos.ver", importar: "importar.productos" },
};

export function ImportarExportarPage() {
  const { puede } = useRole();
  const [importando, setImportando] = useState<Entidad | null>(null);
  const clientes = useClientes(puede(permisos.clientes.ver));
  const productos = useProductos();

  const bajar = async (entidad: Entidad, formato: "xlsx" | "csv") => {
    const datos = entidad === "clientes" ? clientes.data : productos.data;
    if (!datos) return;
    try {
      await exportar(entidad, datos, formato);
    } catch {
      toast.error("No se pudo generar el archivo");
    }
  };

  const tarjetas: { entidad: Entidad; titulo: string; icon: typeof Users; cantidad?: number; ayuda: string }[] = [
    { entidad: "clientes", titulo: "Clientes", icon: Users, cantidad: clientes.data?.length, ayuda: "Se identifican por CUIT." },
    { entidad: "productos", titulo: "Productos y stock", icon: Boxes, cantidad: productos.data?.length, ayuda: "Se identifican por código. Si el archivo trae stock distinto al actual, queda registrado como ajuste." },
  ];

  return (
    <>
      <PageHeader
        title="Importar y exportar"
        description="Traé tus datos desde otro sistema o una planilla, o descargalos cuando quieras. El archivo exportado se puede editar en Excel y volver a importar."
      />
      <div className="grid gap-6 lg:grid-cols-2">
        {tarjetas
          .filter((t) => puede(permisos[t.entidad].ver))
          .map((t) => (
            <Card key={t.entidad} className="gap-4 p-6 shadow-none" data-testid={`tarjeta-${t.entidad}`}>
              <div className="flex items-start gap-3">
                <div className="flex size-10 items-center justify-center rounded-lg bg-primary/10 text-primary">
                  <t.icon className="size-5" />
                </div>
                <div>
                  <h2 className="text-lg font-semibold">{t.titulo}</h2>
                  <p className="text-sm text-muted-foreground">
                    {t.cantidad ?? "…"} cargados · {t.ayuda}
                  </p>
                </div>
              </div>
              <div className="grid gap-2 sm:grid-cols-2">
                <Button variant="outline" onClick={() => bajar(t.entidad, "xlsx")} disabled={!t.cantidad}>
                  <FileDown className="size-4" /> Exportar a Excel
                </Button>
                <Button variant="outline" onClick={() => bajar(t.entidad, "csv")} disabled={!t.cantidad}>
                  <FileDown className="size-4" /> Exportar a CSV
                </Button>
              </div>
              {puede(permisos[t.entidad].importar) && (
                <div className="grid gap-2 border-t pt-4 sm:grid-cols-2">
                  <Button variant="ghost" onClick={() => descargarPlantilla(t.entidad)}>
                    <Download className="size-4" /> Descargar plantilla
                  </Button>
                  <Button onClick={() => setImportando(t.entidad)}>
                    <FileUp className="size-4" /> Importar {t.titulo.toLowerCase()}
                  </Button>
                </div>
              )}
            </Card>
          ))}
      </div>
      {importando && <ImportarDialog entidad={importando} open onOpenChange={(o) => !o && setImportando(null)} />}
    </>
  );
}
