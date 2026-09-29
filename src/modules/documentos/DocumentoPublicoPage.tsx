import { useEffect } from "react";
import { FileX, Loader2, Printer } from "lucide-react";
import { useParams } from "react-router";
import { useDocumentoPublico } from "@/api/hooks";
import type { ComprobanteDetalleApi, EmpresaApi, PresupuestoDetalleApi } from "@/api/types";
import { Button } from "@/components/ui/button";
import { PaperFit } from "@/components/shared/PaperFit";
import { brand } from "@/config/brand";
import { numeroComprobante } from "@/lib/facturacion";
import { ComprobanteHoja } from "@/modules/facturacion/ComprobanteHoja";
import { numeroPresupuesto, PresupuestoHoja } from "@/modules/presupuestos/PresupuestoHoja";

/** Lo que ve el cliente al abrir el link: el documento, listo para imprimir o guardar en PDF */
export function DocumentoPublicoPage() {
  const { token } = useParams();
  const { data, isLoading, error } = useDocumentoPublico(token);

  const titulo = data
    ? data.tipo === "comprobante"
      ? `${(data.documento as ComprobanteDetalleApi).tipo} ${numeroComprobante((data.documento as ComprobanteDetalleApi).puntoVenta, (data.documento as ComprobanteDetalleApi).numero)}`
      : `Presupuesto ${numeroPresupuesto((data.documento as PresupuestoDetalleApi).numero)}`
    : null;
  const nombreEmpresa = data ? (data.empresa.nombreFantasia ?? data.empresa.razonSocial) : "";

  useEffect(() => {
    if (titulo) document.title = `${titulo} · ${nombreEmpresa}`;
  }, [titulo, nombreEmpresa]);

  if (isLoading) {
    return (
      <div className="flex min-h-svh items-center justify-center text-muted-foreground">
        <Loader2 className="size-5 animate-spin" />
      </div>
    );
  }
  if (error || !data) {
    return (
      <div className="flex min-h-svh flex-col items-center justify-center gap-3 px-6 text-center">
        <div className="flex size-12 items-center justify-center rounded-full bg-muted text-muted-foreground">
          <FileX className="size-6" />
        </div>
        <h1 className="text-lg font-semibold">Este link no está disponible</h1>
        <p className="max-w-sm text-sm text-muted-foreground">Puede que se haya anulado o que esté incompleto. Pedile a quien te lo mandó que te lo envíe de nuevo.</p>
      </div>
    );
  }

  // La hoja espera la empresa completa: estos son los datos que figuran en el documento
  const empresa = data.empresa as EmpresaApi;

  return (
    <div className="min-h-svh bg-muted">
      <header className="sticky top-0 z-10 border-b bg-background/95 backdrop-blur print:hidden">
        <div className="mx-auto flex max-w-4xl items-center justify-between gap-3 px-4 py-3">
          <div className="min-w-0">
            <div className="truncate text-sm font-semibold" data-testid="publico-titulo">
              {titulo}
            </div>
            <div className="truncate text-xs text-muted-foreground">{nombreEmpresa}</div>
          </div>
          <Button onClick={() => window.print()}>
            <Printer className="size-4" /> Imprimir o guardar PDF
          </Button>
        </div>
      </header>
      <main className="mx-auto max-w-4xl p-3 sm:p-6">
        <div className="zona-impresion">
          <PaperFit>
            {data.tipo === "comprobante" ? (
              <HojaFactura c={data.documento as ComprobanteDetalleApi} empresa={empresa} />
            ) : (
              <HojaPresupuesto p={data.documento as PresupuestoDetalleApi} empresa={empresa} />
            )}
          </PaperFit>
        </div>
        <p className="mt-4 text-center text-xs text-muted-foreground print:hidden">
          Documento enviado por {nombreEmpresa} con {brand.nombre}.
        </p>
      </main>
    </div>
  );
}

function HojaFactura({ c, empresa }: { c: ComprobanteDetalleApi; empresa: EmpresaApi }) {
  return <ComprobanteHoja empresa={empresa} c={{ ...c, asociado: c.asociado ? `${c.asociado.tipo} ${numeroComprobante(c.asociado.puntoVenta, c.asociado.numero)}` : null }} />;
}

function HojaPresupuesto({ p, empresa }: { p: PresupuestoDetalleApi; empresa: EmpresaApi }) {
  return <PresupuestoHoja empresa={empresa} p={{ ...p, cliente: { ...p.cliente, domicilio: [p.cliente.domicilio, p.cliente.localidad].filter(Boolean).join(", ") || null } }} />;
}
